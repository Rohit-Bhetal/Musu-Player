import type { CSSProperties, JSX } from 'react'
import { useEffect, useState } from 'react'
import { player } from '../player'
import { currentTrackOf } from '../player/PlayerEngine'
import type { RepeatMode } from '../player/queue'
import { useStore } from './store'
import { Artwork } from './Artwork'
import { Icon } from './Icon'
import { formatTime } from './TrackRow'
import { Lyrics } from './Lyrics'
import { Queue } from './Queue'
import { TrackMenu } from './TrackMenu'
import { tintFor, type Tint } from './artworkTint'
import { CHARACTER_IMAGES } from '../characters'

const CAMEO_FRAME_MS = 3200

/** The header's balancing spacer becomes this while a song is playing — one
 * frame at a time from the character pics and gifs. */
function CharacterCameo(): JSX.Element {
  const [frame, setFrame] = useState(0)

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const id = window.setInterval(() => setFrame((f) => (f + 1) % CHARACTER_IMAGES.length), CAMEO_FRAME_MS)
    return () => window.clearInterval(id)
  }, [])

  return (
    <span className="np-cameo" aria-hidden="true">
      <img key={frame} className="np-cameo-frame" src={CHARACTER_IMAGES[frame]} alt="" />
    </span>
  )
}

const NEXT_REPEAT: Record<RepeatMode, RepeatMode> = { off: 'all', all: 'one', one: 'off' }
const REPEAT_LABEL: Record<RepeatMode, string> = {
  off: 'Repeat off',
  all: 'Repeat queue',
  one: 'Repeat this song',
}

function Scrubber(): JSX.Element {
  const { positionSec, durationSec } = useStore(player.progress)
  const [drag, setDrag] = useState<number | null>(null)
  const value = drag ?? positionSec
  const max = durationSec > 0 ? durationSec : 0
  const commit = (): void => {
    if (drag === null) return
    player.seekTo(drag)
    setDrag(null)
  }

  return (
    // --p drives the filled part of the track: a styled range loses the free `accent-color` fill
    <div className="scrub" style={{ '--p': max > 0 ? Math.min(value, max) / max : 0 } as CSSProperties}>
      <input
        type="range"
        min={0}
        max={max || 1}
        step={0.1}
        value={Math.min(value, max || 1)}
        disabled={max === 0}
        aria-label="Seek"
        aria-valuetext={`${formatTime(value)} of ${formatTime(max)}`}
        onChange={(e) => setDrag(Number(e.target.value))}
        onPointerUp={commit}
        onTouchEnd={commit}
        onKeyUp={commit}
        onBlur={commit}
      />
      <div className="scrub-times">
        <span>{formatTime(value)}</span>
        {/* Convx centres a format badge between the two stamps; ours says where
            the audio is coming from, which is the thing this app is about. */}
        <span className="scrub-badge">{max === 0 ? 'Live' : 'Lossless'}</span>
        {/* the right stamp counts down, as in the reference player */}
        <span>{max > 0 ? `-${formatTime(Math.max(0, max - value))}` : formatTime(max)}</span>
      </div>
    </div>
  )
}

function Volume(): JSX.Element | null {
  const level = useStore(player.volume)
  // Hidden rather than dead: iOS gives volume to the hardware buttons only.
  if (!player.canSetVolume) return null

  return (
    <div className="np-volume" style={{ '--v': level } as CSSProperties}>
      <Icon name="volume-low" size={16} />
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={level}
        aria-label="Volume"
        aria-valuetext={`${Math.round(level * 100)}%`}
        onChange={(e) => player.setVolume(Number(e.target.value))}
      />
      <Icon name="volume-high" size={20} />
    </div>
  )
}

/**
 * The cover's own colours, for the screen that is mostly cover. Null until the
 * extraction finishes, and permanently null for a cross-origin image that
 * taints the canvas — in both cases the sheet keeps the theme palette.
 */
function useArtworkTint(artworkUrl: string | null | undefined): Tint | null {
  const [tint, setTint] = useState<Tint | null>(null)
  useEffect(() => {
    let live = true
    setTint(null)
    void tintFor(artworkUrl).then((found) => live && setTint(found))
    return () => {
      live = false
    }
  }, [artworkUrl])
  return tint
}

type NowPlayingView = 'art' | 'lyrics' | 'queue'

export function NowPlaying({ onClose }: { onClose: () => void }): JSX.Element | null {
  const state = useStore(player.state)
  const [view, setView] = useState<NowPlayingView>('art')
  const track = currentTrackOf(state)
  const tint = useArtworkTint(track?.artworkUrl)
  if (!track) return null

  const themed = tint
    ? ({ '--np-tint': tint.tint, '--np-ink': tint.ink, '--np-ink-2': tint.ink2 } as CSSProperties)
    : undefined

  return (
    <div className="nowplaying" role="dialog" aria-modal="true" aria-label="Now playing" style={themed}>
      {/* PlayerBackgroundStyle.BLUR: the cover again, blurred to fill the
          screen, under a flat black scrim. Same URL, so it is already cached. */}
      {track.artworkUrl ? (
        <div className="np-backdrop" aria-hidden="true">
          <img src={track.artworkUrl} alt="" decoding="async" />
        </div>
      ) : null}

      <div className="np-grab" aria-hidden="true" />

      <div className="np-head">
        <button type="button" className="np-close" onClick={onClose} aria-label="Close player">
          <Icon name="chevron" size={26} />
        </button>
        <span className="np-eyebrow">{track.album ?? 'Now playing'}</span>
        {/* balances the close button, keeping the album centred; becomes the
            character cameo while actually playing, an empty spacer otherwise */}
        {state.playing ? <CharacterCameo /> : <span style={{ width: 44 }} aria-hidden="true" />}
      </div>

      {view === 'lyrics' ? (
        <Lyrics track={track} />
      ) : view === 'queue' ? (
        <Queue />
      ) : (
        <div className="np-art">
          <Artwork src={track.artworkUrl} size="100%" alt={`Cover of ${track.title}`} radius={12} />
        </div>
      )}

      {/* Title and artist on the left, the round glass actions on the right —
          the reference player's meta row. */}
      <div className="np-meta">
        <div className="np-meta-text">
          <h2>{track.title}</h2>
          <p>{track.artist}</p>
        </div>
        <TrackMenu track={track} className="np-round" />
      </div>

      <Scrubber />

      {/* Flat glyph transport: prev / play / next, no filled accent circle. */}
      <div className="np-controls">
        <button type="button" aria-label="Previous song" onClick={() => void player.prev()}>
          <Icon name="prev" size={34} />
        </button>

        <button
          type="button"
          className="np-play"
          aria-label={state.playing ? 'Pause' : 'Play'}
          onClick={() => player.toggle()}
        >
          <Icon name={state.playing ? 'pause' : 'play'} size={44} />
        </button>

        <button type="button" aria-label="Next song" onClick={() => void player.next()}>
          <Icon name="next" size={34} />
        </button>
      </div>

      <Volume />

      {/* The player's bottom action row: lyrics, Up Next, shuffle, repeat. */}
      <div className="np-actions">
        <button
          type="button"
          className={view === 'lyrics' ? 'np-toggle on' : 'np-toggle'}
          aria-pressed={view === 'lyrics'}
          aria-label={view === 'lyrics' ? 'Hide lyrics' : 'Show lyrics'}
          onClick={() => setView((v) => (v === 'lyrics' ? 'art' : 'lyrics'))}
        >
          <Icon name="lyrics" size={26} />
        </button>

        <button
          type="button"
          className={view === 'queue' ? 'np-toggle on' : 'np-toggle'}
          aria-pressed={view === 'queue'}
          aria-label={view === 'queue' ? 'Hide up next' : 'Show up next'}
          onClick={() => setView((v) => (v === 'queue' ? 'art' : 'queue'))}
        >
          <Icon name="playlist" size={24} />
        </button>

        <button
          type="button"
          aria-label={state.shuffle ? 'Shuffle on' : 'Shuffle off'}
          aria-pressed={state.shuffle}
          className={state.shuffle ? 'np-toggle on' : 'np-toggle'}
          onClick={() => player.setShuffle(!state.shuffle)}
        >
          <Icon name="shuffle" size={24} />
        </button>

        <button
          type="button"
          aria-label={REPEAT_LABEL[state.repeat]}
          aria-pressed={state.repeat !== 'off'}
          className={state.repeat === 'off' ? 'np-toggle' : 'np-toggle on'}
          onClick={() => player.setRepeat(NEXT_REPEAT[state.repeat])}
        >
          <Icon name={state.repeat === 'one' ? 'repeat-1' : 'repeat'} size={24} />
        </button>
      </div>
    </div>
  )
}
