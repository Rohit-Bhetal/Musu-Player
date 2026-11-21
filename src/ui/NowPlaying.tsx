import type { CSSProperties, JSX } from 'react'
import { useState } from 'react'
import { player } from '../player'
import { currentTrackOf } from '../player/PlayerEngine'
import type { RepeatMode } from '../player/queue'
import { useStore } from './store'
import { Artwork } from './Artwork'
import { Icon } from './Icon'
import { formatTime } from './TrackRow'

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
        <span>{formatTime(max)}</span>
      </div>
    </div>
  )
}

export function NowPlaying({ onClose }: { onClose: () => void }): JSX.Element | null {
  const state = useStore(player.state)
  const track = currentTrackOf(state)
  if (!track) return null

  return (
    <div className="nowplaying" role="dialog" aria-modal="true" aria-label="Now playing">
      <div className="np-head">
        <button type="button" className="np-close" onClick={onClose} aria-label="Close player">
          <Icon name="chevron" size={26} />
        </button>
        <span className="muted" style={{ fontSize: 12, fontWeight: 600 }}>
          {track.album ?? 'Now playing'}
        </span>
        <span style={{ width: 44 }} />
      </div>

      <div className="np-art">
        <Artwork src={track.artworkUrl} size="100%" alt={`Cover of ${track.title}`} radius={16} />
      </div>

      <div className="np-meta">
        <h2 style={{ margin: 0, fontSize: 22 }}>{track.title}</h2>
        <p className="muted" style={{ margin: '4px 0 0' }}>
          {track.artist}
        </p>
      </div>

      <Scrubber />

      <div className="np-controls">
        <button
          type="button"
          aria-label={state.shuffle ? 'Shuffle on' : 'Shuffle off'}
          aria-pressed={state.shuffle}
          className={state.shuffle ? 'np-toggle on' : 'np-toggle'}
          onClick={() => player.setShuffle(!state.shuffle)}
        >
          <Icon name="shuffle" size={22} />
        </button>

        <button type="button" aria-label="Previous song" onClick={() => void player.prev()}>
          <Icon name="prev" size={32} />
        </button>

        <button
          type="button"
          className="np-play"
          aria-label={state.playing ? 'Pause' : 'Play'}
          onClick={() => player.toggle()}
        >
          <Icon name={state.playing ? 'pause' : 'play'} size={30} />
        </button>

        <button type="button" aria-label="Next song" onClick={() => void player.next()}>
          <Icon name="next" size={32} />
        </button>

        <button
          type="button"
          aria-label={REPEAT_LABEL[state.repeat]}
          aria-pressed={state.repeat !== 'off'}
          className={state.repeat === 'off' ? 'np-toggle' : 'np-toggle on'}
          onClick={() => player.setRepeat(NEXT_REPEAT[state.repeat])}
        >
          <Icon name={state.repeat === 'one' ? 'repeat-1' : 'repeat'} size={22} />
        </button>
      </div>
    </div>
  )
}
