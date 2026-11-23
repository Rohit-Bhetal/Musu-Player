import type { JSX } from 'react'
import { player } from '../player'
import { currentTrackOf } from '../player/PlayerEngine'
import { useStore } from './store'
import { Artwork } from './Artwork'
import { Icon } from './Icon'
import { hideMiniWhenPaused } from './settings'

function MiniProgress(): JSX.Element {
  const { positionSec, durationSec } = useStore(player.progress)
  const pct = durationSec > 0 ? Math.min(100, (positionSec / durationSec) * 100) : 0
  return <div className="mini-progress" style={{ width: `${pct}%` }} aria-hidden="true" />
}

export function MiniPlayer({ onOpen }: { onOpen: () => void }): JSX.Element | null {
  const state = useStore(player.state)
  const hideWhenPaused = useStore(hideMiniWhenPaused)
  const track = currentTrackOf(state)
  if (!track) return null
  // Slides away rather than unmounting: an instant disappearance (and the tab
  // bar snapping up to fill the gap) was the actual complaint, not the hiding
  // itself. Staying mounted also means the dock's reserved height never has
  // to change — see App.tsx's hasMini.
  const tucked = hideWhenPaused && !state.playing

  return (
    <div className={tucked ? 'mini mini-tucked' : 'mini'} aria-hidden={tucked || undefined} inert={tucked || undefined}>
      <MiniProgress />
      <button type="button" className="mini-open" onClick={onOpen} aria-label={`Now playing: ${track.title}. Open full player`}>
        {/* Metrics.MiniPlayerArtworkSize = 38dp, ArtworkCorner = 8dp */}
        <Artwork src={track.artworkUrl} size={38} alt="" radius={8} />
        <span className="row-text">
          <span className="row-title">{track.title}</span>
          <span className="row-sub">{track.artist}</span>
        </span>
      </button>
      <button
        type="button"
        className="mini-btn"
        aria-label={state.playing ? 'Pause' : 'Play'}
        onClick={() => player.toggle()}
      >
        {/* Metrics.MiniPlayerPlayIconSize = 22dp / MiniPlayerIconSize = 18dp */}
        <Icon name={state.playing ? 'pause' : 'play'} size={22} />
      </button>
      <button type="button" className="mini-btn" aria-label="Next song" onClick={() => void player.next()}>
        <Icon name="next" size={18} />
      </button>
    </div>
  )
}
