interface Env {
  APP_ORIGIN?: string
  YOUTUBE_API_KEY?: string
}

interface PagesContext {
  request: Request
  env: Env
}

interface YouTubeApiSearchItem {
  id?: {
    videoId?: string
  }
  snippet?: {
    title?: string
    channelTitle?: string
    thumbnails?: {
      high?: { url?: string }
      medium?: { url?: string }
      default?: { url?: string }
    }
  }
}

interface YouTubeApiSearchResponse {
  items?: YouTubeApiSearchItem[]
}

function jsonResponse(
  body: unknown,
  status: number,
  origin: string,
): Response {
  return Response.json(body, {
    status,
    headers: {
      'Access-Control-Allow-Origin': origin,
      'Cache-Control': 'private, max-age=60',
      Vary: 'Origin',
    },
  })
}

function getAllowedOrigin(request: Request, env: Env): string | null {
  const appOrigin = env.APP_ORIGIN
  if (!appOrigin) return null

  const requestOrigin = request.headers.get('Origin')
  if (new URL(request.url).origin !== appOrigin) return null
  if (requestOrigin && requestOrigin !== appOrigin) return null

  return appOrigin
}

export async function onRequestGet({ request, env }: PagesContext): Promise<Response> {
  const origin = getAllowedOrigin(request, env)
  if (!origin) return Response.json({ error: 'YouTube search is not configured for this origin.' }, { status: 403 })

  const query = new URL(request.url).searchParams.get('q')?.trim() ?? ''
  if (query.length < 2 || query.length > 100) {
    return jsonResponse({ error: 'Search text must be between 2 and 100 characters.' }, 400, origin)
  }
  if (!env.YOUTUBE_API_KEY) {
    return jsonResponse({ error: 'YouTube title search requires a server-side API key.' }, 503, origin)
  }

  const upstreamUrl = new URL('https://www.googleapis.com/youtube/v3/search')
  upstreamUrl.search = new URLSearchParams({
    part: 'snippet',
    type: 'video',
    videoEmbeddable: 'true',
    maxResults: '10',
    safeSearch: 'moderate',
    q: query,
    key: env.YOUTUBE_API_KEY,
  }).toString()

  let upstream: Response
  try {
    upstream = await fetch(upstreamUrl, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    })
  } catch {
    return jsonResponse({ error: 'YouTube search could not be reached.' }, 502, origin)
  }

  if (!upstream.ok) {
    return jsonResponse(
      { error: `YouTube search failed (${upstream.status}). Check the API key and quota.` },
      502,
      origin,
    )
  }

  let data: YouTubeApiSearchResponse
  try {
    data = (await upstream.json()) as YouTubeApiSearchResponse
  } catch {
    return jsonResponse({ error: 'YouTube returned an invalid search response.' }, 502, origin)
  }

  const items = (data.items ?? [])
    .map((item) => {
      const videoId = item.id?.videoId
      const title = item.snippet?.title
      const channelTitle = item.snippet?.channelTitle
      if (!videoId || !title || !channelTitle) return null

      return {
        videoId,
        title,
        channelTitle,
        thumbnailUrl:
          item.snippet?.thumbnails?.medium?.url ??
          item.snippet?.thumbnails?.high?.url ??
          item.snippet?.thumbnails?.default?.url,
      }
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)

  return jsonResponse({ items }, 200, origin)
}

export function onRequest(): Response {
  return Response.json({ error: 'Method is not allowed.' }, { status: 405, headers: { Allow: 'GET' } })
}
