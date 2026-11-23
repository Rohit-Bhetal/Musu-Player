import type { JSX } from 'react'
import { player } from '../player'
import { upcomingOf } from '../player/PlayerEngine'
import { useStore } from './store'
import { TrackRow } from './TrackRow'
import { Icon } from './Icon'

/** "Up Next" — everything still ahead of the playhead, reorderable and
 * removable in place (same up/down/remove pattern Playlists already uses),
 * and tappable to jump straight there without discarding the rest of the queue. */
export function Queue(): JSX.Element {
  const state = useStore(player.state)
  const upcoming = upcomingOf(state)

  if (upcoming.length === 0) {
    return <p className="lyrics-note">Nothing queued next — add a song with “Play next” or “Add to queue”.</p>
  }

  return (
    <div className="rows queue-list">
      {upcoming.map(({ track, orderPos }, i) => (
        <TrackRow
          key={`${track.id}-${orderPos}`}
          track={track}
          onSelect={() => void player.playFromQueue(orderPos)}
          right={
            <>
              <button
                type="button"
                className="row-action"
                disabled={i === 0}
                aria-label={`Move ${track.title} up`}
                onClick={() => player.moveInQueue(orderPos, orderPos - 1)}
              >
                <span style={{ display: 'inline-flex', transform: 'rotate(180deg)' }}>
                  <Icon name="chevron" size={18} />
                </span>
              </button>
              <button
                type="button"
                className="row-action"
                disabled={i === upcoming.length - 1}
                aria-label={`Move ${track.title} down`}
                onClick={() => player.moveInQueue(orderPos, orderPos + 1)}
              >
                <Icon name="chevron" size={18} />
              </button>
              <button
                type="button"
                className="row-action"
                aria-label={`Remove ${track.title} from queue`}
                onClick={() => player.removeFromQueue(orderPos)}
              >
                <Icon name="close" size={18} />
              </button>
            </>
          }
        />
      ))}
    </div>
  )
}
