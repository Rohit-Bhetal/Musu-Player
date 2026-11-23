import type { CSSProperties, JSX } from 'react'
import { useEffect, useRef, useState } from 'react'
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
import { LikeButton } from './LikeButton'
import { OutputDeviceSheet } from './OutputDeviceSheet'
import { useArtworkTint } from './artworkTint'
import { CHARACTER_IMAGES } from '../characters'
import { cameoSpot, type Box, type CameoSpot } from './cameo'

const CAMEO_INTERVAL_MS = 10_000

/** Both boxes in .nowplaying's own coordinates, which is also what top/left
 * mean for an absolutely positioned child of it: the containing block is its
 * padding box, and it has no border, so 0,0 is its border-box corner.
 *
 * The box to stay inside is the CONTENT box, not that border box: .nowplaying
 * is a full-viewport scrim and its padding is what holds the visible player
 * (on a wide screen, ~(100vw - 430px)/2 of empty scrim each side). Measuring
 * against the border box is what sent the badge "out of the player". */
function cameoBoxes(container: HTMLElement): { box: Box; art: Box } | null {
  const art = container.querySelector('.art')
  if (!art) return null
  const rect = container.getBoundingClientRect()
  const artRect = art.getBoundingClientRect()
  const cs = getComputedStyle(container)
  const top = parseFloat(cs.paddingTop)
  const left = parseFloat(cs.paddingLeft)

  return {
    box: {
      top,
      left,
      width: Math.max(0, rect.width - left - parseFloat(cs.paddingRight)),
      height: Math.max(0, rect.height - top - parseFloat(cs.paddingBottom)),
    },
    art: {
      top: artRect.top - rect.top,
      left: artRect.left - rect.left,
      width: artRect.width,
      height: artRect.height,
    },
  }
}

/** A little character hopping around the margin outside the cover art, never
 * over the art itself — a different random pick from CHARACTER_IMAGES every
 * 10s, so it never settles on the same character or the same place for long. */
function CharacterCameo(): JSX.Element {
  const wrapperRef = useRef<HTMLSpanElement>(null)
  const prevIndexRef = useRef<number | null>(null)
  const [spot, setSpot] = useState<CameoSpot | null>(null)

  useEffect(() => {
    const pick = (): void => {
      const container = wrapperRef.current?.parentElement
      if (!container) return
      const boxes = cameoBoxes(container)
      const next = boxes ? cameoSpot(boxes.box, boxes.art, prevIndexRef.current, CHARACTER_IMAGES.length) : null
      if (next) prevIndexRef.current = next.index
      setSpot(next)
    }
    pick()
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const id = window.setInterval(pick, CAMEO_INTERVAL_MS)
    return () => window.clearInterval(id)
  }, [])

  return (
    <span
      ref={wrapperRef}
      className="np-cameo"
      style={spot ? { top: `${spot.topPx}px`, left: `${spot.leftPx}px` } : { visibility: 'hidden' }}
      aria-hidden="true"
    >
      {spot ? (
        <img key={`${spot.index}-${spot.topPx}-${spot.leftPx}`} className="np-cameo-frame" src={CHARACTER_IMAGES[spot.index]} alt="" />
      ) : null}
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

type NowPlayingView = 'art' | 'lyrics' | 'queue'

export function NowPlaying({ onClose }: { onClose: () => void }): JSX.Element | null {
  const state = useStore(player.state)
  const [view, setView] = useState<NowPlayingView>('art')
  const [devicePicker, setDevicePicker] = useState(false)
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
        {/* balances the close button, keeping the album centred */}
        <span style={{ width: 44 }} aria-hidden="true" />
      </div>

      {view === 'lyrics' ? (
        <Lyrics track={track} />
      ) : view === 'queue' ? (
        <Queue />
      ) : (
        <div className="np-art">
          <Artwork src={track.artworkUrl} size="100%" alt={`Cover of ${track.title}`} radius={12} seed={track.id} />
        </div>
      )}

      {/* a sibling of .np-art, not nested in it — .np-art's own overflow:hidden
          would clip the cameo the moment it roams into the header or controls
          strip above/below the square, which is the point: only while there's
          a thumbnail to hop around (the art view), and only while playing. */}
      {view === 'art' && state.playing ? <CharacterCameo /> : null}

      {/* Title and artist on the left, the round glass actions on the right —
          the reference player's meta row. */}
      <div className="np-meta">
        <div className="np-meta-text">
          <h2>{track.title}</h2>
          <p>{track.artist}</p>
        </div>
        <LikeButton track={track} />
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

      {/* The player's bottom action row: lyrics, Up Next, shuffle, repeat, and
          the output-device switcher — Safari's native AirPlay picker where
          available (canPickOutputDevice), this app's own device sheet on
          Chrome/Android (canListOutputDevices) since there is no system
          picker to call there. Hidden rather than dead with neither, same as
          Volume. */}
      <div className="np-actions">
        {player.canPickOutputDevice || player.canListOutputDevices ? (
          <button
            type="button"
            className="np-toggle"
            aria-label="Choose playback device"
            onClick={() => (player.canPickOutputDevice ? player.showOutputPicker() : setDevicePicker(true))}
          >
            <Icon name="airplay" size={24} />
          </button>
        ) : null}

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

      {devicePicker ? <OutputDeviceSheet onClose={() => setDevicePicker(false)} /> : null}
    </div>
  )
}
