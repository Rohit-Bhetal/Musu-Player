import type { JSX } from 'react'
import type { Track } from '../source/MusicSource'
import { saveTrack } from '../storage/db'
import { addToPlaylist, isInPlaylist, LIKED_SONGS_ID, playlists, removeFromPlaylist } from '../storage/playlists'
import { useStore } from './store'
import { Icon } from './Icon'

/** One-tap shortcut for "toggle membership in the always-there Liked Songs
 * playlist" — the same thing TrackMenu's full picker can do, without the
 * picker, for the one playlist common enough to deserve its own button. */
export function LikeButton({ track }: { track: Track }): JSX.Element {
  useStore(playlists) // re-render as Liked Songs' membership changes
  const liked = isInPlaylist(LIKED_SONGS_ID, track.id)

  async function toggle(): Promise<void> {
    if (liked) {
      await removeFromPlaylist(LIKED_SONGS_ID, track.id)
    } else {
      await saveTrack(track) // so Liked Songs can show this track with no network later
      await addToPlaylist(LIKED_SONGS_ID, track.id)
    }
  }

  return (
    <button
      type="button"
      className="np-round"
      aria-label={liked ? `Unlike ${track.title}` : `Like ${track.title}`}
      aria-pressed={liked}
      onClick={() => void toggle()}
    >
      <Icon name={liked ? 'heart-filled' : 'heart'} size={22} className={liked ? 'liked' : undefined} />
    </button>
  )
}
