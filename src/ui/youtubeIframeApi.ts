export interface YouTubePlayer {
  destroy(): void
  getIframe(): HTMLIFrameElement
  pauseVideo(): void
}

export interface YouTubePlayerEvent {
  data: number
  target: YouTubePlayer
}

export interface YouTubeIframeApi {
  PlayerState: {
    PLAYING: number
  }
  Player: new (
    element: HTMLElement,
    options: {
      width: string
      height: string
      videoId: string
      playerVars: {
        controls: number
        playsinline: number
        rel: number
      }
      events: {
        onReady: (event: YouTubePlayerEvent) => void
        onStateChange: (event: YouTubePlayerEvent) => void
        onError: () => void
      }
    },
  ) => YouTubePlayer
}

declare global {
  interface Window {
    YT?: YouTubeIframeApi
    onYouTubeIframeAPIReady?: () => void
  }
}

let apiPromise: Promise<YouTubeIframeApi> | undefined

export function loadYouTubeIframeApi(): Promise<YouTubeIframeApi> {
  if (window.YT?.Player) return Promise.resolve(window.YT)
  if (apiPromise) return apiPromise

  apiPromise = new Promise((resolve, reject) => {
    const previousReady = window.onYouTubeIframeAPIReady
    const scriptUrl = 'https://www.youtube.com/iframe_api'
    const existingScript = document.querySelector<HTMLScriptElement>(`script[src="${scriptUrl}"]`)
    const script = existingScript ?? document.createElement('script')

    window.onYouTubeIframeAPIReady = () => {
      previousReady?.()
      if (window.YT?.Player) {
        resolve(window.YT)
      } else {
        apiPromise = undefined
        reject(new Error('YouTube player API did not initialize.'))
      }
    }

    script.addEventListener(
      'error',
      () => {
        apiPromise = undefined
        reject(new Error('Could not load the YouTube player API.'))
      },
      { once: true },
    )

    if (!existingScript) {
      script.src = scriptUrl
      script.async = true
      document.head.append(script)
    }
  })

  return apiPromise
}
