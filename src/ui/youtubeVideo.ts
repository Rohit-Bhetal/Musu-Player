const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/
const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtu.be',
  'www.youtu.be',
])

export function parseYouTubeVideoId(value: string): string | null {
  const input = value.trim()
  if (VIDEO_ID_PATTERN.test(input)) return input

  let url: URL
  try {
    url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(input) ? input : `https://${input}`)
  } catch {
    return null
  }

  if (!YOUTUBE_HOSTS.has(url.hostname.toLowerCase())) return null

  let videoId: string | null = null
  if (url.hostname.toLowerCase().endsWith('youtu.be')) {
    videoId = url.pathname.split('/').filter(Boolean)[0] ?? null
  } else if (url.pathname === '/watch') {
    videoId = url.searchParams.get('v')
  } else {
    videoId = url.pathname.match(/^\/(?:embed|shorts|live)\/([^/]+)/)?.[1] ?? null
  }

  return videoId && VIDEO_ID_PATTERN.test(videoId) ? videoId : null
}
