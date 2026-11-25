import { allowedOrigin, methodNotAllowed, type BaseEnv, type PagesContext } from '../_shared'

type Env = BaseEnv

// Public instances rot constantly (TeamPiped/Piped#3760) — these are only a
// last-resort fallback for when the live list below can't be fetched at all.
const FALLBACK_PIPED_INSTANCES = ['https://api.piped.private.coffee', 'https://pipedapi.ducks.party']

// Bounds worst-case latency: without this, a long run of dead instances in
// the live list could mean minutes of sequential timeouts before giving up.
const MAX_ATTEMPTS = 8

// The `cf` request option (Workers-only edge-cache hints) isn't part of the
// ambient RequestInit this project types against — not pulling in
// @cloudflare/workers-types for one field.
type WorkerRequestInit = RequestInit & { cf?: { cacheTtl?: number; cacheEverything?: boolean } }

// Fetches the current live instance list (edge-cached for 10 minutes, so this
// isn't a round trip to kavin.rocks on every request), falling back to a
// couple of instances confirmed working if that fetch fails too.
async function candidateInstances(): Promise<string[]> {
  try {
    const init: WorkerRequestInit = { cf: { cacheTtl: 600, cacheEverything: true }, signal: AbortSignal.timeout(5000) }
    const res = await fetch('https://piped-instances.kavin.rocks/', init)
    if (!res.ok) throw new Error(String(res.status))
    const list = (await res.json()) as Array<{ api_url?: string }>
    const urls = list.map((i) => i.api_url).filter((u): u is string => !!u)
    if (urls.length > 0) return [...new Set([...urls, ...FALLBACK_PIPED_INSTANCES])]
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
// Piped's own client doesn't always have either. A muxed progressive
// (non-HLS) stream is the fallback that still works.
function pickStream(data: { audioStreams?: PipedStream[]; videoStreams?: PipedStream[] }): PipedStream | undefined {
  return data.audioStreams?.[0] ?? data.videoStreams?.find((s) => s.format === 'MPEG_4')
}

// Tries instances in order — rotating because the public list is unreliable
// by nature, not just as a fallback for one dead host — until one actually
// resolves and serves the track. Returns the already-fetched media response
// so a Piped instance that returns an unproxied, header-pinned googlevideo
// URL (and 403s on the direct fetch) just moves on to the next candidate
// rather than being treated as "resolved."
async function resolveViaPiped(videoId: string, rangeHeader: string | null, signal: AbortSignal): Promise<Response | null> {
  const candidates = (await candidateInstances()).slice(0, MAX_ATTEMPTS)

  for (const base of candidates) {
    try {
      const streams = await fetch(`${base.replace(/\/$/, '')}/streams/${videoId}`, {
        signal: AbortSignal.any([signal, AbortSignal.timeout(6000)]),
      })
      if (!streams.ok) continue
      const data = (await streams.json()) as { audioStreams?: PipedStream[]; videoStreams?: PipedStream[] }
      const stream = pickStream(data)
      if (!stream?.url) continue

      const mediaHeaders = new Headers()
      if (rangeHeader) mediaHeaders.set('Range', rangeHeader)
      const media = await fetch(stream.url, {
        headers: mediaHeaders,
        signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]),
      })
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
 * Resolves by rotating through public Piped instances (docs.piped.video)
 * until one serves the track — the public list rots constantly, so a dead
 * or 403ing instance just moves on to the next rather than failing the
 * request. No server-side cache: for personal use, replaying a track you
 * care about is what the app's own offline download feature is for.
 */
export async function onRequestGet({ request, env }: PagesContext<Env>): Promise<Response> {
  const origin = allowedOrigin(request, env)
  if (!origin) return Response.json({ error: 'YouTube audio is not configured for this origin.' }, { status: 403 })

  const videoId = new URL(request.url).searchParams.get('v') ?? ''
  if (!/^[\w-]{11}$/.test(videoId)) {
    return Response.json({ error: 'A YouTube video id is required.' }, { status: 400 })
  }

  const upstream = await resolveViaPiped(videoId, request.headers.get('Range'), request.signal)
  if (!upstream) {
    return Response.json({ error: 'No Piped instance could resolve this track right now.' }, { status: 502 })
  }

  const out = new Headers({
    'Access-Control-Allow-Origin': origin,
    'Cache-Control': 'private, max-age=3600',
    'Accept-Ranges': 'bytes',
    Vary: 'Origin',
  })
  for (const name of ['Content-Type', 'Content-Length', 'Content-Range']) {
    const value = upstream.headers.get(name)
    if (value) out.set(name, value)
  }

  return new Response(upstream.body, { status: upstream.status, headers: out })
}

export const onRequest = methodNotAllowed
