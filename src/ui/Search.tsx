import type { FormEvent, JSX } from 'react'
import { useState } from 'react'
import { source } from '../source'
import type { Track } from '../source/MusicSource'
import { searchYouTubeVideos, type YouTubeVideo } from '../source/youtubeSearch'
import { useAsync } from './useAsync'
import { RowSkeleton, TrackRow } from './TrackRow'
import { parseYouTubeVideoId } from './youtubeVideo'
import { YouTubeVideoPlayer } from './YouTubeVideoPlayer'

interface SearchData {
  query: string
  tracks: Track[]
  videos: YouTubeVideo[]
  musicError: string | null
  youtubeError: string | null
}

type SearchResult = { kind: 'music'; track: Track } | { kind: 'youtube'; video: YouTubeVideo }

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'Search failed.'
}

async function searchAll(query: string): Promise<SearchData> {
  const directVideoId = parseYouTubeVideoId(query)
  if (directVideoId) {
    return {
      query,
      tracks: [],
      videos: [],
      musicError: null,
      youtubeError: null,
    }
  }

  const musicSearch = source.search(query)
  const videoSearch =
    query.trim().length >= 2 ? searchYouTubeVideos(query) : Promise.resolve<YouTubeVideo[]>([])
  const [musicResult, videoResult] = await Promise.allSettled([musicSearch, videoSearch])

  return {
    query,
    tracks: musicResult.status === 'fulfilled' ? musicResult.value : [],
    videos: videoResult.status === 'fulfilled' ? videoResult.value : [],
    musicError: musicResult.status === 'rejected' ? messageOf(musicResult.reason) : null,
    youtubeError: videoResult.status === 'rejected' ? messageOf(videoResult.reason) : null,
  }
}

export function Search({ onPlay }: { onPlay: (queue: Track[], index: number) => void }): JSX.Element {
  const [query, setQuery] = useState('')
  const [submittedQuery, setSubmittedQuery] = useState('')
  const [searchVersion, setSearchVersion] = useState(0)
  const [selectedVideo, setSelectedVideo] = useState<YouTubeVideo | null>(null)
  const { data: searchData, loading } = useAsync(
    () => searchAll(submittedQuery),
    [submittedQuery, searchVersion],
  )
  const data = searchData?.query === submittedQuery ? searchData : null
  const directVideoId = parseYouTubeVideoId(submittedQuery)
  const activeVideo =
    selectedVideo ??
    (directVideoId
      ? { videoId: directVideoId, title: 'YouTube video', channelTitle: 'YouTube' }
      : null)
  const rows: SearchResult[] = []
  const tracks = data?.tracks ?? []
  const videos = data?.videos ?? []
  for (let index = 0; index < Math.max(tracks.length, videos.length); index += 1) {
    const video = videos[index]
    const track = tracks[index]
    if (video) rows.push({ kind: 'youtube', video })
    if (track) rows.push({ kind: 'music', track })
  }

  function submitSearch(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    setSubmittedQuery(query.trim())
    setSelectedVideo(null)
    setSearchVersion((version) => version + 1)
  }

  return (
    <>
      <h1>Search</h1>
      <form className="search-form" onSubmit={submitSearch}>
        <input
          className="search-field"
          type="search"
          inputMode="search"
          placeholder="Songs, artists, YouTube videos"
          aria-label="Search music and YouTube videos"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <button className="search-submit" type="submit">
          Search
        </button>
      </form>
      {activeVideo ? <YouTubeVideoPlayer video={activeVideo} /> : null}
      {data?.youtubeError ? (
        <p className="search-provider-error" role="status">
          YouTube results unavailable: {data.youtubeError}
        </p>
      ) : null}
      {data?.musicError ? (
        <p className="search-provider-error" role="status">
          Music results unavailable: {data.musicError}
        </p>
      ) : null}
      {loading && rows.length === 0 && !activeVideo ? (
        <div className="rows" style={{ marginTop: 12 }}>
          {Array.from({ length: 4 }, (_, i) => (
            <RowSkeleton key={i} />
          ))}
        </div>
      ) : rows.length === 0 && !activeVideo ? (
        <p className="empty">
          {submittedQuery
            ? `No matches for “${submittedQuery}”.`
            : 'Search songs, artists, or YouTube videos.'}
        </p>
      ) : (
        <div className="rows" style={{ marginTop: 12 }}>
          {rows.map((result) => {
            if (result.kind === 'youtube') {
              const { video } = result
              const track: Track = {
                id: `youtube:${video.videoId}`,
                title: video.title,
                artist: video.channelTitle,
                artworkUrl: video.thumbnailUrl,
              }
              return (
                <TrackRow
                  key={track.id}
                  track={track}
                  subtitle={`${video.channelTitle} · YouTube`}
                  onSelect={() => setSelectedVideo(video)}
                />
              )
            }

            const index = tracks.findIndex((track) => track.id === result.track.id)
            return (
              <TrackRow
                key={result.track.id}
                track={result.track}
                onSelect={() => onPlay(tracks, index)}
              />
            )
          })}
        </div>
      )}
    </>
  )
}
