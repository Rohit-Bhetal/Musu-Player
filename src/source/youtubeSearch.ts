export interface YouTubeVideo {
  videoId: string
  title: string
  channelTitle: string
  thumbnailUrl?: string
}

export interface YouTubeChartSection {
  /** Two-letter country code; the UI turns it into a name. */
  region: string
  items: YouTubeVideo[]
}

interface YouTubeSearchResponse {
  items?: YouTubeVideo[]
  sections?: YouTubeChartSection[]
  error?: string
}

async function get(path: string): Promise<YouTubeSearchResponse> {
  const response = await fetch(path)
  const data = (await response.json()) as YouTubeSearchResponse

  if (!response.ok) {
    throw new Error(data.error ?? `YouTube request failed (${response.status}).`)
  }

  return data
}

export async function searchYouTubeVideos(query: string): Promise<YouTubeVideo[]> {
  const search = query.trim()
  if (!search) return []
  return (await get(`/api/youtube/search?q=${encodeURIComponent(search)}`)).items ?? []
}

/** Most popular music per country — one request, one row each, for Home. */
export async function fetchYouTubeCharts(): Promise<YouTubeChartSection[]> {
  return (await get('/api/youtube/search?chart=music')).sections ?? []
}
