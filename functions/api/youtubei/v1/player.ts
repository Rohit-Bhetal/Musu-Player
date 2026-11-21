interface Env {
  APP_ORIGIN?: string
}

interface PagesContext {
  request: Request
  env: Env
}

const YTM_PLAYER_URL = 'https://music.youtube.com/youtubei/v1/player'
const MOBILE_USER_AGENT =
  'Mozilla/5.0 (Linux; Android 12; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.120 Mobile Safari/537.36'
const MAX_BODY_BYTES = 16_384

function corsHeaders(origin: string): Headers {
  return new Headers({
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  })
}

function allowedOrigin(request: Request, env: Env): string | Response {
  const configuredOrigin = env.APP_ORIGIN
  const requestOrigin = request.headers.get('Origin')

  if (!configuredOrigin) {
    return Response.json({ error: 'YTM proxy is not configured.' }, { status: 503 })
  }
  if (requestOrigin !== configuredOrigin) {
    return Response.json({ error: 'Origin is not allowed.' }, { status: 403 })
  }

  return configuredOrigin
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export async function onRequestPost({ request, env }: PagesContext): Promise<Response> {
  const origin = allowedOrigin(request, env)
  if (origin instanceof Response) return origin

  const contentLength = Number(request.headers.get('Content-Length'))
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return Response.json({ error: 'Request body is too large.' }, { status: 413 })
  }

  const body = await request.text()
  if (new TextEncoder().encode(body).byteLength > MAX_BODY_BYTES) {
    return Response.json({ error: 'Request body is too large.' }, { status: 413 })
  }

  let payload: unknown
  try {
    payload = JSON.parse(body)
  } catch {
    return Response.json({ error: 'Request body must be valid JSON.' }, { status: 400 })
  }
  if (
    !isRecord(payload) ||
    typeof payload.videoId !== 'string' ||
    !/^[\w-]{11}$/.test(payload.videoId) ||
    !isRecord(payload.context) ||
    !isRecord(payload.context.client)
  ) {
    return Response.json({ error: 'A valid player request is required.' }, { status: 400 })
  }

  const headers = new Headers({
    'Content-Type': 'application/json',
    'User-Agent': MOBILE_USER_AGENT,
    'X-Youtube-Client-Name': '15',
    'X-Youtube-Client-Version': '2.20210608.01.00',
    Origin: 'https://music.youtube.com',
    Referer: `https://music.youtube.com/watch?v=${encodeURIComponent(payload.videoId)}`,
  })

  let upstream: Response
  try {
    upstream = await fetch(YTM_PLAYER_URL, {
      method: 'POST',
      headers,
      body,
      signal: AbortSignal.timeout(15_000),
    })
  } catch {
    return Response.json(
      { error: 'Could not reach the YouTube Music player service.' },
      { status: 502, headers: corsHeaders(origin) },
    )
  }

  const responseHeaders = corsHeaders(origin)
  responseHeaders.set('Cache-Control', 'no-store')
  responseHeaders.set(
    'Content-Type',
    upstream.headers.get('Content-Type') ?? 'application/json; charset=utf-8',
  )

  return new Response(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  })
}

export function onRequestOptions({ request, env }: PagesContext): Response {
  const origin = allowedOrigin(request, env)
  if (origin instanceof Response) return origin

  const requestedMethod = request.headers.get('Access-Control-Request-Method')
  if (requestedMethod && requestedMethod !== 'POST') {
    return Response.json({ error: 'Method is not allowed.' }, { status: 405 })
  }

  return new Response(null, { status: 204, headers: corsHeaders(origin) })
}

export function onRequest(): Response {
  return Response.json({ error: 'Method is not allowed.' }, { status: 405, headers: { Allow: 'POST, OPTIONS' } })
}
