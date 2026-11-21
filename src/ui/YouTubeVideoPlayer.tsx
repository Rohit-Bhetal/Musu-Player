import type { JSX } from 'react'
import { useEffect, useRef, useState } from 'react'
import { player } from '../player'
import type { YouTubeVideo } from '../source/youtubeSearch'
import { useStore } from './store'
import { loadYouTubeIframeApi, type YouTubePlayer } from './youtubeIframeApi'

export function YouTubeVideoPlayer({ video }: { video: YouTubeVideo }): JSX.Element {
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const playerElement = useRef<HTMLDivElement>(null)
  const embeddedPlayer = useRef<YouTubePlayer | null>(null)
  const appPlaying = useStore(player.state).playing
  const appPlayingRef = useRef(appPlaying)

  useEffect(() => {
    appPlayingRef.current = appPlaying
    if (appPlaying) embeddedPlayer.current?.pauseVideo()
  }, [appPlaying])

  useEffect(() => {
    if (!playerElement.current) return

    let cancelled = false
    setLoading(true)
    setError(null)

    void loadYouTubeIframeApi()
      .then((api) => {
        if (cancelled || !playerElement.current) return

        const instance = new api.Player(playerElement.current, {
          width: '100%',
          height: '100%',
          videoId: video.videoId,
          playerVars: {
            controls: 1,
            playsinline: 1,
            rel: 0,
          },
          events: {
            onReady: (event) => {
              if (cancelled) return
              event.target.getIframe().title = `YouTube player: ${video.title}`
              setLoading(false)
              if (appPlayingRef.current) event.target.pauseVideo()
            },
            onStateChange: (event) => {
              if (event.data === api.PlayerState.PLAYING) player.pause()
            },
            onError: () => {
              if (cancelled) return
              setLoading(false)
              setError('YouTube could not play this video here. Try another result or open it on YouTube.')
            },
          },
        })

        embeddedPlayer.current = instance
      })
      .catch((caught: unknown) => {
        if (cancelled) return
        setLoading(false)
        setError(caught instanceof Error ? caught.message : 'Could not load the YouTube player.')
      })

    return () => {
      cancelled = true
      embeddedPlayer.current?.destroy()
      embeddedPlayer.current = null
    }
  }, [video.videoId, video.title])

  return (
    <section className="yt-result-player" aria-label="YouTube video player">
      <div className="yt-result-meta">
        <p className="yt-result-kicker">YOUTUBE</p>
        <h2>{video.title}</h2>
        <p className="yt-result-channel">{video.channelTitle}</p>
      </div>
      <div className="yt-result-frame">
        <div className="yt-result-mount" ref={playerElement} />
      </div>
      {loading ? <p className="yt-result-status" role="status">Loading YouTube player…</p> : null}
      {error ? <p className="yt-result-error" role="alert">{error}</p> : null}
    </section>
  )
}
