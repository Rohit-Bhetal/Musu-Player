import type { JSX } from 'react'
import { useState } from 'react'
import { source } from '../source'
import type { Track } from '../source/MusicSource'
import { isStandalone, online } from '../pwa/pwa'
import { player } from '../player'
import { currentTrackOf } from '../player/PlayerEngine'
import { useStore } from './store'
import { useAsync } from './useAsync'
import { Artwork } from './Artwork'
import { sections } from './home'

function greeting(): string {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

function Tile({ track, active, onSelect }: { track: Track; active: boolean; onSelect: () => void }): JSX.Element {
  return (
    <button
      type="button"
      className="tile"
      onClick={onSelect}
      aria-label={`Play ${track.title} by ${track.artist}`}
    >
      <Artwork src={track.artworkUrl} size="100%" alt="" radius={10} />
      <span className="tile-title" style={active ? { color: 'var(--accent)' } : undefined}>
        {track.title}
      </span>
      <span className="tile-sub">{track.artist}</span>
    </button>
  )
}

export function Library({ onPlay }: { onPlay: (queue: Track[], index: number) => void }): JSX.Element {
  const isOnline = useStore(online)
  const playingId = currentTrackOf(useStore(player.state))?.id
  const [dismissed, setDismissed] = useState(false)
  const { data, error, loading } = useAsync(() => source.search(''), [isOnline])
  const rows = sections(data ?? [])

  return (
    <>
      <h1>{greeting()}</h1>

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
        <div className="strip" aria-hidden="true">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="tile">
              <div className="skeleton" style={{ width: '100%', aspectRatio: '1 / 1' }} />
            </div>
          ))}
        </div>
      ) : error ? (
        <p className="empty">Could not load the catalogue. {isOnline ? 'Pull down to retry.' : 'You are offline.'}</p>
      ) : rows.length === 0 ? (
        <p className="empty">Nothing to play yet.</p>
      ) : (
        rows.map(([title, tracks]) => (
          <section key={title}>
            <h2>{title}</h2>
            <div className="strip">
              {tracks.map((track, i) => (
                <Tile
                  key={track.id}
                  track={track}
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
