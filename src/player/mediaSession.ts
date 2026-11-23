import type { Track } from '../source/MusicSource'
import { logEvent } from '../diagnostics'

export interface MediaSessionHost {
  play(): void
  pause(): void
  next(): void
  prev(): void
  seekTo(sec: number): void
}

const available = (): boolean => 'mediaSession' in navigator

function setHandler(action: MediaSessionAction, handler: MediaSessionActionHandler | null): void {
  try {
    navigator.mediaSession.setActionHandler(action, handler)
  } catch {
    logEvent('media:handler-unsupported', action)
  }
}

export function attachMediaSession(host: MediaSessionHost): void {
  if (!available()) {
    logEvent('media:unavailable')
    return
  }
  // 'seekbackward' / 'seekforward' are deliberately NOT registered: on iOS they
  // can take the place of the previous/next buttons on the Lock Screen.
  setHandler('play', () => {
    logEvent('media:play')
    host.play()
  })
  setHandler('pause', () => {
    logEvent('media:pause')
    host.pause()
  })
  setHandler('previoustrack', () => {
    logEvent('media:previoustrack')
    host.prev()
  })
  setHandler('nexttrack', () => {
    logEvent('media:nexttrack')
    host.next()
  })
  setHandler('seekto', (details) => {
    const seekTime = (details as MediaSessionActionDetails).seekTime
    if (typeof seekTime !== 'number' || !Number.isFinite(seekTime)) return
    logEvent('media:seekto', seekTime.toFixed(1))
    host.seekTo(seekTime)
  })
}

export function setMediaMetadata(track: Track | null, artworkSrc: string | null): void {
  if (!available()) return
  try {
    if (!track) {
      navigator.mediaSession.metadata = null
      return
    }
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: track.artist,
      album: track.album ?? '',
      // sizes/type are both optional, and were never accurate anyway — the
      // raw "show something immediately" source is whatever the backend
      // handed back (a YouTube thumbnail is 320x180 JPEG, not 512x512), and
      // the composited upgrade is PNG. Omitted, the OS sniffs the real thing.
      artwork: artworkSrc ? [{ src: artworkSrc }] : [],
    })
    logEvent('media:metadata', `${track.title} — ${artworkSrc ? artworkSrc.slice(0, 24) : 'no artwork'}`)
  } catch {
    logEvent('media:metadata-failed', track?.title)
  }
}

export function setMediaPlaybackState(state: MediaSessionPlaybackState): void {
  if (!available()) return
  try {
    navigator.mediaSession.playbackState = state
  } catch {
    /* older WebKit */
  }
}

export function setMediaPosition(duration: number, position: number, playbackRate: number): void {
  if (!available() || typeof navigator.mediaSession.setPositionState !== 'function') return
  // Safari throws if duration is NaN/Infinity or position runs past it.
  if (!Number.isFinite(duration) || duration <= 0) return
  try {
    navigator.mediaSession.setPositionState({
      duration,
      playbackRate: playbackRate > 0 ? playbackRate : 1,
      position: Math.max(0, Math.min(position, duration)),
    })
  } catch {
    logEvent('media:position-failed')
  }
}
