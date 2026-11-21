export interface YouTubeVideo {
  videoId: string
  title: string
  channelTitle: string
  thumbnailUrl?: string
}

interface YouTubeSearchResponse {
  items?: YouTubeVideo[]
  error?: string
}

export async function searchYouTubeVideos(query: string): Promise<YouTubeVideo[]> {
  const search = query.trim()
  if (!search) return []

  const response = await fetch(`/api/youtube/search?q=${encodeURIComponent(search)}`)
  const data = (await response.json()) as YouTubeSearchResponse

  if (!response.ok) {
    throw new Error(data.error ?? `YouTube search failed (${response.status}).`)
  }

  return data.items ?? []
}
