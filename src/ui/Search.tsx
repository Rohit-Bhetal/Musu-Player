import type { JSX } from 'react'
import { useEffect, useState } from 'react'
import { source } from '../source'
import type { Track } from '../source/MusicSource'
import { useAsync } from './useAsync'
import { RowSkeleton, TrackRow } from './TrackRow'

export function Search({ onPlay }: { onPlay: (queue: Track[], index: number) => void }): JSX.Element {
  const [query, setQuery] = useState('')
  // query now hits real APIs, not a free in-memory filter — debounce so typing doesn't fire a request per keystroke.
  const [debounced, setDebounced] = useState('')
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 300)
    return () => clearTimeout(t)
  }, [query])
  const { data, loading } = useAsync(() => source.search(debounced), [debounced])
  const results = data ?? []

  return (
    <>
      <h1>Search</h1>
      <input
        className="search-field"
        type="search"
        inputMode="search"
        placeholder="Songs, artists, albums"
        aria-label="Search songs, artists and albums"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {loading && results.length === 0 ? (
        <div className="rows" style={{ marginTop: 12 }}>
          {Array.from({ length: 4 }, (_, i) => (
            <RowSkeleton key={i} />
          ))}
        </div>
      ) : results.length === 0 ? (
        <p className="empty">{query ? `Nothing matches “${query}”.` : 'Type to search.'}</p>
      ) : (
        <div className="rows" style={{ marginTop: 12 }}>
          {results.map((track, i) => (
            <TrackRow key={track.id} track={track} onSelect={() => onPlay(results, i)} />
          ))}
        </div>
      )}
    </>
  )
}
