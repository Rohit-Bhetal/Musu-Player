import type { JSX } from 'react'
import { player } from '../player'
import { currentTrackOf } from '../player/PlayerEngine'
import { useStore } from './store'
import { Artwork } from './Artwork'
import { Icon } from './Icon'

function MiniProgress(): JSX.Element {
  const { positionSec, durationSec } = useStore(player.progress)
  const pct = durationSec > 0 ? Math.min(100, (positionSec / durationSec) * 100) : 0
  return <div className="mini-progress" style={{ width: `${pct}%` }} aria-hidden="true" />
}

export function MiniPlayer({ onOpen }: { onOpen: () => void }): JSX.Element | null {
  const state = useStore(player.state)
  const track = currentTrackOf(state)
  if (!track) return null

  return (
    <div className="mini">
      <MiniProgress />
      <button type="button" className="mini-open" onClick={onOpen} aria-label={`Now playing: ${track.title}. Open full player`}>
        <Artwork src={track.artworkUrl} size={40} alt="" />
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
        <Icon name={state.playing ? 'pause' : 'play'} size={26} />
      </button>
      <button type="button" className="mini-btn" aria-label="Next song" onClick={() => void player.next()}>
        <Icon name="next" size={22} />
      </button>
    </div>
  )
}
