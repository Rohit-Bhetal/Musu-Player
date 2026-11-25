export interface BaseEnv {
  APP_ORIGIN?: string
}

export interface PagesContext<Env extends BaseEnv = BaseEnv> {
  request: Request
  env: Env
  // Always present at runtime (part of Cloudflare's EventContext); optional
  // here only so tests can construct a context without it.
  waitUntil?(promise: Promise<unknown>): void
}

// APP_ORIGIN can be a comma-separated list — dev often means more than one
// (localhost plus whatever a port-forward or a phone-on-LAN actually shows up
// as), and a single fixed value turned every one of those into a silent 403.
export function allowedOrigin(request: Request, env: BaseEnv): string | null {
  const configured = (env.APP_ORIGIN ?? '').split(',').map((o) => o.trim()).filter(Boolean)
  if (configured.length === 0) return null
  const requestOrigin = new URL(request.url).origin
  if (!configured.includes(requestOrigin)) return null
  const headerOrigin = request.headers.get('Origin')
  if (headerOrigin && !configured.includes(headerOrigin)) return null
  return requestOrigin
}

export function jsonResponse(body: unknown, status: number, origin: string, maxAge = 60, shared = false): Response {
  return Response.json(body, {
    status,
    headers: {
      'Access-Control-Allow-Origin': origin,
      // `shared` is for a response that is the same for every visitor (e.g. a
      // fixed-region chart) — Cloudflare's edge may then cache it once for
      // everyone instead of every listener re-paying the same upstream fan-out.
      'Cache-Control': shared ? `public, s-maxage=${maxAge}, max-age=60` : `private, max-age=${maxAge}`,
      Vary: 'Origin',
    },
  })
}

export function methodNotAllowed(): Response {
  return Response.json({ error: 'Method is not allowed.' }, { status: 405, headers: { Allow: 'GET' } })
}
