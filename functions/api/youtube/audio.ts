interface Env {
  APP_ORIGIN?: string
  EXTRACTOR_URL?: string
  EXTRACTOR_TOKEN?: string
}

interface PagesContext {
  request: Request
  env: Env
}

// APP_ORIGIN can be a comma-separated list — dev often means more than one
// (localhost plus whatever a port-forward or a phone-on-LAN actually shows up
// as), and a single fixed value turned every one of those into a silent 403.
function allowedOrigin(request: Request, env: Env): string | null {
  const configured = (env.APP_ORIGIN ?? '').split(',').map((o) => o.trim()).filter(Boolean)
  if (configured.length === 0) return null
  const requestOrigin = new URL(request.url).origin
  if (!configured.includes(requestOrigin)) return null
  const headerOrigin = request.headers.get('Origin')
  if (headerOrigin && !configured.includes(headerOrigin)) return null
  return requestOrigin
}

/**
 * Hands the phone YouTube audio from its own origin. The bytes come from the
 * extractor box (see extractor/, and docs/MUSIC_SOURCE.md for why one is
 * needed); this hop exists so the box's address and token never reach the
 * browser, and so the audio is same-origin — which is what lets the download
 * queue read it as a Blob.
 */
export async function onRequestGet({ request, env }: PagesContext): Promise<Response> {
  const origin = allowedOrigin(request, env)
  if (!origin) return Response.json({ error: 'YouTube audio is not configured for this origin.' }, { status: 403 })

  const extractor = env.EXTRACTOR_URL
  if (!extractor) {
    return Response.json({ error: 'No extractor is configured, so YouTube tracks cannot play.' }, { status: 503 })
  }

  const videoId = new URL(request.url).searchParams.get('v') ?? ''
  if (!/^[\w-]{11}$/.test(videoId)) {
    return Response.json({ error: 'A YouTube video id is required.' }, { status: 400 })
  }

  const headers = new Headers()
  if (env.EXTRACTOR_TOKEN) headers.set('Authorization', `Bearer ${env.EXTRACTOR_TOKEN}`)
  // Safari seeks by range; forward it so it never pulls a whole track to skip.
  const range = request.headers.get('Range')
  if (range) headers.set('Range', range)

  let upstream: Response
  try {
    // Forwarded explicitly: a skipped track should stop pulling from the
    // extractor (and from googlevideo behind it) the moment the phone does,
    // not whenever the connection happens to notice it was abandoned.
    upstream = await fetch(`${extractor.replace(/\/$/, '')}/audio?v=${videoId}`, { headers, signal: request.signal })
  } catch {
    return Response.json({ error: 'The extractor could not be reached.' }, { status: 502 })
  }

  if (!upstream.ok && upstream.status !== 206) {
    return Response.json({ error: `The extractor failed (${upstream.status}).` }, { status: 502 })
  }

  const out = new Headers({
    'Access-Control-Allow-Origin': origin,
    'Cache-Control': 'private, max-age=3600',
    'Accept-Ranges': 'bytes',
    Vary: 'Origin',
  })
  // Safari needs the real audio MIME type and the range headers to seek at all.
  for (const name of ['Content-Type', 'Content-Length', 'Content-Range']) {
    const value = upstream.headers.get(name)
    if (value) out.set(name, value)
  }

  return new Response(upstream.body, { status: upstream.status, headers: out })
}

export function onRequest(): Response {
  return Response.json({ error: 'Method is not allowed.' }, { status: 405, headers: { Allow: 'GET' } })
}
