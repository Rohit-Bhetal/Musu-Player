import type { JSX } from 'react'
import { useEffect, useState } from 'react'
import { searchRadioStations } from '../source/apiSource'
import type { Track } from '../source/MusicSource'
import { useAsync } from './useAsync'
import { RowSkeleton, TrackRow } from './TrackRow'
import { Icon } from './Icon'

export function Radio({ onPlay }: { onPlay: (queue: Track[], index: number) => void }): JSX.Element {
  const [query, setQuery] = useState('')
  // same reasoning as Search: real network call per keystroke needs debouncing
  const [debounced, setDebounced] = useState('')
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 300)
    return () => clearTimeout(t)
  }, [query])
  const { data, error, loading } = useAsync(() => searchRadioStations(debounced), [debounced])
  const stations = data ?? []

  return (
    <>
      <h1>Radio</h1>
      {/* same pill as Search, so the two screens do not drift apart */}
      <div className="search-field">
        <Icon name="search" size={18} />
        <input
          type="search"
          inputMode="search"
          autoCorrect="off"
          autoCapitalize="none"
          placeholder="Genre, station name, or country"
          aria-label="Search radio stations"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query ? (
          <button type="button" className="search-clear" aria-label="Clear search" onClick={() => setQuery('')}>
            <Icon name="close" size={16} />
          </button>
        ) : null}
      </div>
      {loading && stations.length === 0 ? (
        <div className="rows" style={{ marginTop: 12 }}>
          {Array.from({ length: 4 }, (_, i) => (
            <RowSkeleton key={i} />
          ))}
        </div>
      ) : error ? (
        <p className="empty">Could not load stations. Pull down to retry.</p>
      ) : stations.length === 0 ? (
        <p className="empty">{query ? `No stations match “${query}”.` : 'No stations found.'}</p>
      ) : (
        <div className="rows" style={{ marginTop: 12 }}>
          {stations.map((station, i) => (
            <TrackRow key={station.id} track={station} onSelect={() => onPlay(stations, i)} />
          ))}
        </div>
      )}
    </>
  )
}
