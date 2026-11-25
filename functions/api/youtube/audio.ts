import { allowedOrigin, methodNotAllowed, type BaseEnv, type PagesContext } from '../_shared'

// Just the R2 surface this file actually uses — not pulling in
// @cloudflare/workers-types for a package this app otherwise has no need of.
interface R2Range {
  offset: number
  length?: number
}
interface R2ObjectBody {
  size: number
  httpMetadata?: { contentType?: string }
  body: ReadableStream<Uint8Array>
}
interface AudioCache {
  get(key: string, options?: { range?: R2Range }): Promise<R2ObjectBody | null>
  put(key: string, value: ReadableStream<Uint8Array>, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown>
}

interface Env extends BaseEnv {
  // Optional, same pattern as the old EXTRACTOR_URL: unset just means no
  // caching, not a broken deploy. Serves every replay of a track from here
  // instead of re-resolving it through Piped every time.
  AUDIO_CACHE?: AudioCache
}

// Public instances rot constantly (TeamPiped/Piped#3760) — these are only a
// last-resort fallback for when the live list below can't be fetched at all.
const FALLBACK_PIPED_INSTANCES = ['https://api.piped.private.coffee', 'https://pipedapi.ducks.party']

// "bytes=X-Y" or "bytes=X-" — the same shape the app's own Range headers use.
function toR2Range(rangeHeader: string | null): R2Range | undefined {
  const match = rangeHeader ? /^bytes=(\d+)-(\d*)$/.exec(rangeHeader) : null
  if (!match) return undefined
  const offset = Number(match[1])
  return match[2] ? { offset, length: Number(match[2]) - offset + 1 } : { offset }
}

function fromCache(cached: R2ObjectBody, range: R2Range | undefined, origin: string): Response {
  const total = cached.size
  const start = range?.offset ?? 0
  const length = range?.length ?? total - start
  const end = Math.min(total, start + length) - 1

  const headers = new Headers({
    'Access-Control-Allow-Origin': origin,
    'Cache-Control': 'private, max-age=3600',
    'Accept-Ranges': 'bytes',
    'Content-Length': String(end - start + 1),
    Vary: 'Origin',
  })
  if (cached.httpMetadata?.contentType) headers.set('Content-Type', cached.httpMetadata.contentType)
  if (range) headers.set('Content-Range', `bytes ${start}-${end}/${total}`)

  return new Response(cached.body, { status: range ? 206 : 200, headers })
}

// Fetches the current live instance list (edge-cached for 10 minutes, so this
// isn't a round trip to kavin.rocks on every cold-cache request), falling
// back to a couple of instances confirmed working if that fetch fails too.
// The `cf` request option (Workers-only edge-cache hints) isn't part of the
// ambient RequestInit this project types against — not pulling in
// @cloudflare/workers-types for one field.
type WorkerRequestInit = RequestInit & { cf?: { cacheTtl?: number; cacheEverything?: boolean } }

async function candidateInstances(): Promise<string[]> {
  try {
    const init: WorkerRequestInit = { cf: { cacheTtl: 600, cacheEverything: true }, signal: AbortSignal.timeout(5000) }
    const res = await fetch('https://piped-instances.kavin.rocks/', init)
    if (!res.ok) throw new Error(String(res.status))
    const list = (await res.json()) as Array<{ api_url?: string }>
    const urls = list.map((i) => i.api_url).filter((u): u is string => !!u)
    if (urls.length > 0) return [...urls, ...FALLBACK_PIPED_INSTANCES]
  } catch {
    // best-effort; the hardcoded fallback covers the live list being down too
  }
  return FALLBACK_PIPED_INSTANCES
}

interface PipedStream {
  url?: string
  mimeType?: string
  format?: string
}

// YouTube's SABR rollout has locked most audio-only formats behind a PO token
// Piped's own client doesn't always have either — the same wall we hit
// ourselves. A muxed progressive (non-HLS) stream is what still works.
function pickStream(data: { audioStreams?: PipedStream[]; videoStreams?: PipedStream[] }): PipedStream | undefined {
  return data.audioStreams?.[0] ?? data.videoStreams?.find((s) => s.format === 'MPEG_4')
}

// Tries instances in order — rotating because the public list is unreliable
// by nature, not just as a fallback for one dead host — until one actually
// resolves and serves the track. Returns the already-fetched media response
// so a Piped instance that returns an unproxied, header-pinned googlevideo
// URL (and 403s on the direct fetch) just moves on to the next candidate
// rather than being treated as "resolved."
async function resolveViaPiped(videoId: string, signal: AbortSignal): Promise<Response | null> {
  for (const base of await candidateInstances()) {
    try {
      const streams = await fetch(`${base.replace(/\/$/, '')}/streams/${videoId}`, {
        signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]),
      })
      if (!streams.ok) continue
      const data = (await streams.json()) as { audioStreams?: PipedStream[]; videoStreams?: PipedStream[] }
      const stream = pickStream(data)
      if (!stream?.url) continue

      const media = await fetch(stream.url, { signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]) })
      if (media.ok && media.body) return media
    } catch {
      continue
    }
  }
  return null
}

/**
 * Hands the phone YouTube audio from its own origin — same-origin is what
 * lets the download queue read it as a Blob, and it keeps where the audio
 * actually comes from off the browser's network tab entirely.
 *
 * A track is only ever resolved once: the first request for a video id
 * rotates through public Piped instances (see docs.piped.video) until one
 * serves it, streams that straight to the phone *and* into AUDIO_CACHE in the
 * background, so every later play by anyone is a plain file read — no
 * extraction, no bot-check, nothing that can fail — instead of repeating the
 * same YouTube fight on every single play.
 */
export async function onRequestGet(context: PagesContext<Env>): Promise<Response> {
  const { request, env } = context
  const origin = allowedOrigin(request, env)
  if (!origin) return Response.json({ error: 'YouTube audio is not configured for this origin.' }, { status: 403 })

  const videoId = new URL(request.url).searchParams.get('v') ?? ''
  if (!/^[\w-]{11}$/.test(videoId)) {
    return Response.json({ error: 'A YouTube video id is required.' }, { status: 400 })
  }

  const range = toR2Range(request.headers.get('Range'))

  if (env.AUDIO_CACHE) {
    const cached = await env.AUDIO_CACHE.get(videoId, { range })
    if (cached) return fromCache(cached, range, origin)
  }

  // Cold cache: always resolves the whole track, even if this particular
  // request only asked for a range, so there's a complete file to cache.
  // shortcut: a seek into a never-played track gets the whole file as a 200
  // instead of a sliced 206 on this one first request — fine since a fresh
  // <audio> tag's first load is always a plain GET anyway; revisit if
  // resuming playback position on a brand-new track becomes a real complaint.
  const upstream = await resolveViaPiped(videoId, request.signal)
  if (!upstream) {
    return Response.json({ error: 'No Piped instance could resolve this track right now.' }, { status: 502 })
  }

  const out = new Headers({
    'Access-Control-Allow-Origin': origin,
    'Cache-Control': 'private, max-age=3600',
    'Accept-Ranges': 'bytes',
    Vary: 'Origin',
  })
  const contentType = upstream.headers.get('Content-Type')
  const length = upstream.headers.get('Content-Length')
  if (contentType) out.set('Content-Type', contentType)
  if (length) out.set('Content-Length', length)

  let body = upstream.body
  if (env.AUDIO_CACHE && body) {
    const [toClient, toCache] = body.tee()
    body = toClient
    const put = env.AUDIO_CACHE.put(videoId, toCache, { httpMetadata: { contentType: contentType ?? undefined } })
    if (context.waitUntil) context.waitUntil(put)
  }

  return new Response(body, { status: 200, headers: out })
}

export const onRequest = methodNotAllowed
