import type { JSX } from 'react'
import { player } from '../player'
import { upcomingOf } from '../player/PlayerEngine'
import { useStore } from './store'
import { ReorderButtons, TrackRow } from './TrackRow'
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
              <ReorderButtons
                label={track.title}
                disabledUp={i === 0}
                disabledDown={i === upcoming.length - 1}
                onUp={() => player.moveInQueue(orderPos, orderPos - 1)}
                onDown={() => player.moveInQueue(orderPos, orderPos + 1)}
              />
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
