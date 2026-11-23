import type { FormEvent, JSX } from 'react'
import { Fragment, useRef, useState } from 'react'
import { source } from '../source'
import type { Track } from '../source/MusicSource'
import { useAsync } from './useAsync'
import { RowSkeleton, TrackRow } from './TrackRow'
import { TrackMenu } from './TrackMenu'
import { Icon } from './Icon'
import { parseYouTubeVideoId } from './youtubeVideo'
import { groupDuplicates } from './groupDuplicates'
import { recentSearches, recordSearch } from './recentSearches'
import { useStore } from './store'

/** A pasted YouTube link or id is one exact track, not a search. */
async function searchOrResolve(query: string): Promise<Track[]> {
  const videoId = parseYouTubeVideoId(query)
  if (videoId) return [await source.getTrack(`youtube:${videoId}`)]
  return source.search(query)
}

export function Search({ onPlay }: { onPlay: (queue: Track[], index: number) => void }): JSX.Element {
  const [query, setQuery] = useState('')
  const [submitted, setSubmitted] = useState('')
  // bumped on every submit so re-running the same query retries it
  const [attempt, setAttempt] = useState(0)
  const [expandedGroups, setExpandedGroups] = useState<ReadonlySet<string>>(new Set())
  const recent = useStore(recentSearches)
  const inputRef = useRef<HTMLInputElement>(null)
  // An empty query used to fall through to source.search(''), which is the
  // full YouTube-chart + Audius-trending fan-out Home already pays for — every
  // tab open was 6 YouTube quota units for a list nobody asked to see here.
  const { data, error, loading } = useAsync(
    () => (submitted ? searchOrResolve(submitted) : Promise.resolve([])),
    [submitted, attempt],
  )
  const tracks = data ?? []
  const groups = groupDuplicates(tracks)

  function runSearch(q: string): void {
    const trimmed = q.trim()
    setQuery(trimmed)
    setSubmitted(trimmed)
    setAttempt((n) => n + 1)
    recordSearch(trimmed)
  }

  function submitSearch(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    runSearch(query)
  }

  function toggleGroup(key: string): void {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  return (
    <>
      <h1>Search</h1>
      <form className="search-form" onSubmit={submitSearch} role="search">
        <div className="search-field">
          <Icon name="search" size={18} />
          <input
            ref={inputRef}
            type="search"
            inputMode="search"
            // so the on-screen keyboard offers "Search" rather than a newline
            enterKeyHint="search"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="Songs, artists, or a YouTube link"
            aria-label="Search music"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {query ? (
            <button
              type="button"
              className="search-clear"
              aria-label="Clear search"
              onClick={() => {
                setQuery('')
                inputRef.current?.focus()
              }}
            >
              <Icon name="close" size={16} />
            </button>
          ) : null}
        </div>
      </form>

      {loading && tracks.length === 0 ? (
        <div className="rows" style={{ marginTop: 12 }}>
          <p className="sr-only" role="status">
            Searching…
          </p>
          {/* enough to fill the screen, so the list does not grow into place */}
          {Array.from({ length: 7 }, (_, i) => (
            <RowSkeleton key={i} />
          ))}
        </div>
      ) : error ? (
        <p className="empty">Could not load that. Search again to retry.</p>
      ) : tracks.length === 0 && submitted ? (
        <p className="empty">No matches for “{submitted}”.</p>
      ) : tracks.length === 0 ? (
        <>
          <p className="empty">Search songs, artists, or paste a YouTube link.</p>
          {recent.length > 0 ? (
            <div className="chips" style={{ marginTop: 12 }}>
              {recent.map((q) => (
                <button key={q} type="button" className="chip" onClick={() => runSearch(q)}>
                  {q}
                </button>
              ))}
            </div>
          ) : null}
        </>
      ) : (
        <div className="rows" style={{ marginTop: 12 }}>
          {groups.map((group) => {
            const expanded = expandedGroups.has(group.primary.id)
            return (
              <Fragment key={group.primary.id}>
                <TrackRow
                  track={group.primary}
                  onSelect={() => onPlay(tracks, group.primaryIndex)}
                  right={<TrackMenu track={group.primary} />}
                />
                {group.alternates.length > 0 ? (
                  <button
                    type="button"
                    className="row-expand"
                    aria-expanded={expanded}
                    onClick={() => toggleGroup(group.primary.id)}
                  >
                    <Icon name="chevron" size={14} />
                    {expanded
                      ? 'Hide other versions'
                      : `${group.alternates.length} more version${group.alternates.length > 1 ? 's' : ''} found`}
                  </button>
                ) : null}
                {expanded
                  ? group.alternates.map(({ track, index }) => (
                      <TrackRow
                        key={track.id}
                        track={track}
                        onSelect={() => onPlay(tracks, index)}
                        right={<TrackMenu track={track} />}
                      />
                    ))
                  : null}
              </Fragment>
            )
          })}
        </div>
      )}
    </>
  )
}
