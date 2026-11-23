import { allowedOrigin, jsonResponse, methodNotAllowed, type BaseEnv } from '../_shared'

interface Env extends BaseEnv {
  YOUTUBE_API_KEY?: string
  /** Comma-separated countries for Home's chart rows, e.g. "IN,US,GB,KR".
   * Unset means the listener's own country followed by CHART_REGION_DEFAULTS. */
  CHART_REGIONS?: string
}

interface PagesContext {
  /** Cloudflare attaches the caller's country; absent under `wrangler pages dev`. */
  request: Request & { cf?: { country?: string } }
  env: Env
}

/** Music. YouTube's category ids are global, so this one does not vary by region. */
const MUSIC_CATEGORY = '10'
const CHART_REGION_FALLBACK = 'US'
/** Big, musically distinct markets, so Home is not four rows of the same songs. */
const CHART_REGION_DEFAULTS = ['US', 'GB', 'KR', 'BR']
/** One quota unit each, and four rows is already more than a thumb scrolls. */
const MAX_CHART_REGIONS = 6
const CHART_SIZE = '20'

/** Which countries Home shows, the listener's own first and never twice. */
function chartRegions(request: PagesContext['request'], env: Env): string[] {
  const configured = env.CHART_REGIONS?.split(',')
    .map((region) => region.trim().toUpperCase())
    .filter((region) => /^[A-Z]{2}$/.test(region))

  const wanted = configured?.length
    ? configured
    : [request.cf?.country ?? CHART_REGION_FALLBACK, ...CHART_REGION_DEFAULTS]

  return [...new Set(wanted)].slice(0, MAX_CHART_REGIONS)
}

interface YouTubeApiSearchItem {
  /** search.list nests the id; videos.list (the chart) returns it as a string. */
  id?: string | { videoId?: string }
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

interface YouTubeVideo {
  videoId: string
  title: string
  channelTitle: string
  thumbnailUrl?: string
}

/** Charts move once a day, so Home costs nothing to revisit. */
const CHART_MAX_AGE = 1800

function toVideos(data: YouTubeApiSearchResponse): YouTubeVideo[] {
  return (data.items ?? [])
    .map((item): YouTubeVideo | null => {
      const videoId = typeof item.id === 'string' ? item.id : item.id?.videoId
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
    .filter((item): item is YouTubeVideo => item !== null)
}

async function youtubeGet(url: URL): Promise<YouTubeApiSearchResponse> {
  const upstream = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(10_000),
  })
  if (!upstream.ok) throw new Error(`YouTube responded ${upstream.status}`)
  return (await upstream.json()) as YouTubeApiSearchResponse
}

function chartUrl(region: string, key: string): URL {
  const url = new URL('https://www.googleapis.com/youtube/v3/videos')
  url.search = new URLSearchParams({
    part: 'snippet',
    chart: 'mostPopular',
    videoCategoryId: MUSIC_CATEGORY,
    regionCode: region,
    maxResults: CHART_SIZE,
    key,
  }).toString()
  return url
}

export async function onRequestGet({ request, env }: PagesContext): Promise<Response> {
  const origin = allowedOrigin(request, env)
  if (!origin) return Response.json({ error: 'YouTube search is not configured for this origin.' }, { status: 403 })

  const params = new URL(request.url).searchParams
  const wantsChart = params.get('chart') === 'music'
  const query = params.get('q')?.trim() ?? ''
  if (!wantsChart && (query.length < 2 || query.length > 100)) {
    return jsonResponse({ error: 'Search text must be between 2 and 100 characters.' }, 400, origin)
  }
  if (!env.YOUTUBE_API_KEY) {
    return jsonResponse({ error: 'YouTube needs a server-side API key.' }, 503, origin)
  }

  // Home browses the charts: one request from the phone, fanned out here, at
  // 1 quota unit per country against search.list's 100 for a single search.
  if (wantsChart) {
    const key = env.YOUTUBE_API_KEY
    const settled = await Promise.allSettled(
      chartRegions(request, env).map(async (region) => ({
        region,
        items: toVideos(await youtubeGet(chartUrl(region, key))),
      })),
    )
    // One country being unavailable is not a reason to show an empty Home.
    const sections = settled
      .filter((result) => result.status === 'fulfilled')
      .map((result) => result.value)
      .filter((section) => section.items.length > 0)

    if (sections.length === 0) {
      return jsonResponse({ error: 'YouTube charts are unavailable. Check the API key and quota.' }, 502, origin)
    }
    // Edge-shareable only when CHART_REGIONS is fixed: otherwise the region
    // list follows each visitor's own country, and a cached response would
    // serve one visitor's chart to everyone else behind the same cache.
    const fixedRegions = Boolean(env.CHART_REGIONS?.trim())
    return jsonResponse({ sections }, 200, origin, CHART_MAX_AGE, fixedRegions)
  }

  const searchUrl = new URL('https://www.googleapis.com/youtube/v3/search')
  searchUrl.search = new URLSearchParams({
    part: 'snippet',
    type: 'video',
    videoEmbeddable: 'true',
    maxResults: '10',
    safeSearch: 'moderate',
    q: query,
    key: env.YOUTUBE_API_KEY,
  }).toString()

  try {
    return jsonResponse({ items: toVideos(await youtubeGet(searchUrl)) }, 200, origin)
  } catch {
    return jsonResponse({ error: 'YouTube search failed. Check the API key and quota.' }, 502, origin)
  }
}

export const onRequest = methodNotAllowed
