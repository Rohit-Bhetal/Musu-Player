interface Env {
  APP_ORIGIN?: string
  /** A self-hosted Lyrica instance (github.com/Wilooper/Lyrica) — optional.
   * Unset means this route always 503s and apiSource falls back to LRCLIB. */
  LYRICA_URL?: string
}

interface PagesContext {
  request: Request
  env: Env
}

interface LyricaTimedLine {
  text?: string
  start_time?: number
}

interface LyricaResponse {
  status?: string
  data?: {
    hasTimestamps?: boolean
    lyrics?: string
    timed_lyrics?: LyricaTimedLine[]
  }
}

// APP_ORIGIN can be a comma-separated list — dev often means more than one
// (localhost plus whatever a port-forward or a phone-on-LAN actually shows up
// as), and a single fixed value turned every one of those into a silent 403.
function getAllowedOrigin(request: Request, env: Env): string | null {
  const configured = (env.APP_ORIGIN ?? '').split(',').map((o) => o.trim()).filter(Boolean)
  if (configured.length === 0) return null
  const requestOrigin = new URL(request.url).origin
  if (!configured.includes(requestOrigin)) return null
  const headerOrigin = request.headers.get('Origin')
  if (headerOrigin && !configured.includes(headerOrigin)) return null
  return requestOrigin
}

function jsonResponse(body: unknown, status: number, origin: string): Response {
  return Response.json(body, {
    status,
    headers: { 'Access-Control-Allow-Origin': origin, 'Cache-Control': 'private, max-age=3600', Vary: 'Origin' },
  })
}

/** ms -> LRC's [mm:ss.xx], so the existing client-side LRC parser needs no
 * second format to understand — Lyrica is just another source of LRC text. */
function lrcStamp(ms: number): string {
  const totalCentis = Math.max(0, Math.round(ms / 10))
  const minutes = Math.floor(totalCentis / 6000)
  const seconds = Math.floor((totalCentis % 6000) / 100)
  const centis = totalCentis % 100
  return `[${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(centis).padStart(2, '0')}]`
}

export async function onRequestGet({ request, env }: PagesContext): Promise<Response> {
  const origin = getAllowedOrigin(request, env)
  if (!origin) return Response.json({ error: 'Lyrics are not configured for this origin.' }, { status: 403 })

  if (!env.LYRICA_URL) {
    // Not an error the user needs to see: apiSource treats this the same as
    // any other failure and falls back to LRCLIB.
    return jsonResponse({ error: 'No Lyrica instance is configured.' }, 503, origin)
  }

  const params = new URL(request.url).searchParams
  const artist = params.get('artist')?.trim() ?? ''
  const song = params.get('song')?.trim() ?? ''
  if (!artist || !song) {
    return jsonResponse({ error: 'An artist and a song title are required.' }, 400, origin)
  }

  const upstream = new URL(`${env.LYRICA_URL.replace(/\/$/, '')}/lyrics/`)
  upstream.search = new URLSearchParams({ artist, song, timestamps: 'true' }).toString()

  let response: Response
  try {
    response = await fetch(upstream, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10_000) })
  } catch {
    return jsonResponse({ error: 'Could not reach the Lyrica instance.' }, 502, origin)
  }
  if (!response.ok) return jsonResponse({ error: `Lyrica responded ${response.status}.` }, 502, origin)

  let data: LyricaResponse
  try {
    data = (await response.json()) as LyricaResponse
  } catch {
    return jsonResponse({ error: 'Lyrica returned an invalid response.' }, 502, origin)
  }

  const timed = data.data?.timed_lyrics
  if (data.data?.hasTimestamps && timed && timed.length > 0) {
    const text = timed
      .filter((line): line is Required<LyricaTimedLine> => typeof line.text === 'string' && typeof line.start_time === 'number')
      .map((line) => `${lrcStamp(line.start_time)}${line.text}`)
      .join('\n')
    if (text) return jsonResponse({ kind: 'lrc', text }, 200, origin)
  }

  const plain = data.data?.lyrics
  if (plain) return jsonResponse({ kind: 'plain', text: plain }, 200, origin)

  return jsonResponse({ error: 'No lyrics found.' }, 404, origin)
}

export function onRequest(): Response {
  return Response.json({ error: 'Method is not allowed.' }, { status: 405, headers: { Allow: 'GET' } })
}
