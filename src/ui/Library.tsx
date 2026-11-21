import type { JSX } from 'react'
import { useState } from 'react'
import { source } from '../source'
import type { Track } from '../source/MusicSource'
import { isStandalone, online } from '../pwa/pwa'
import { player } from '../player'
import { currentTrackOf } from '../player/PlayerEngine'
import { useStore } from './store'
import { useAsync } from './useAsync'
import { RowSkeleton, TrackRow } from './TrackRow'

function groupByAlbum(tracks: readonly Track[]): [string, Track[]][] {
  const groups = new Map<string, Track[]>()
  for (const t of tracks) {
    const key = t.album ?? 'Singles'
    const list = groups.get(key)
    if (list) list.push(t)
    else groups.set(key, [t])
  }
  return [...groups]
}

export function Library({ onPlay }: { onPlay: (queue: Track[], index: number) => void }): JSX.Element {
  const isOnline = useStore(online)
  const playingId = currentTrackOf(useStore(player.state))?.id
  const [dismissed, setDismissed] = useState(false)
  const { data, error, loading } = useAsync(() => source.search(''), [isOnline])

  return (
    <>
      <h1>Library</h1>

      {!isStandalone() && !dismissed ? (
        <div className="banner">
          <b>Add to Home Screen to install.</b> Tap Share, then Add to Home Screen. Downloads made in this Safari tab
          stay in Safari — the installed app starts with an empty library.
          <br />
          <button type="button" className="chip" style={{ marginTop: 10 }} onClick={() => setDismissed(true)}>
            Got it
          </button>
        </div>
      ) : null}

      {!isOnline ? <div className="banner">Offline — showing what is already on this device.</div> : null}

      {loading ? (
        <div className="rows">
          {Array.from({ length: 6 }, (_, i) => (
            <RowSkeleton key={i} />
          ))}
        </div>
      ) : error ? (
        <p className="empty">Could not load the catalogue. {isOnline ? 'Pull down to retry.' : 'You are offline.'}</p>
      ) : (
        groupByAlbum(data ?? []).map(([album, tracks]) => (
          <section key={album}>
            <h2>{album}</h2>
            <div className="rows">
              {tracks.map((track, i) => (
                <TrackRow
                  key={track.id}
                  track={track}
                  subtitle={track.artist}
                  active={track.id === playingId}
                  onSelect={() => onPlay(tracks, i)}
                />
              ))}
            </div>
          </section>
        ))
      )}
    </>
  )
}
