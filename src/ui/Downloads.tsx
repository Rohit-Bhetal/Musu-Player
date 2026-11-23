import type { JSX } from 'react'
import { useEffect, useState } from 'react'
import type { Track } from '../source/MusicSource'
import { player } from '../player'
import { currentTrackOf } from '../player/PlayerEngine'
import { downloads, downloadedTracks, formatBytes, removeAll } from '../storage/downloads'
import { online } from '../pwa/pwa'
import { useStore } from './store'
import { RowSkeleton, TrackRow } from './TrackRow'
import { DownloadButton } from './DownloadButton'

export function Downloads({ onPlay }: { onPlay: (queue: Track[], index: number) => void }): JSX.Element {
  const records = useStore(downloads)
  const isOnline = useStore(online)
  const playingId = currentTrackOf(useStore(player.state))?.id
  const [tracks, setTracks] = useState<Track[] | null>(null)

  const done = records.filter((r) => r.status === 'done')
  const pending = records.filter((r) => r.status !== 'done')
  // Only the set of *finished* ids, not the whole records array: a download
  // in progress calls downloads.set() on every network chunk, and depending
  // on `records` directly re-read the entire tracks store from IndexedDB on
  // every one of those — once per download tick instead of once per finish.
  const doneKey = done.map((r) => r.trackId).join(',')

  // The records store holds ids; the tracks themselves come from IndexedDB.
  useEffect(() => {
    let live = true
    void downloadedTracks().then((list) => live && setTracks(list))
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doneKey])
  const bytes = done.reduce((total, r) => total + r.bytesTotal, 0)
  const queue = tracks ?? []

  return (
    <>
      <h1>Downloads</h1>

      {pending.length > 0 ? (
        <div className="banner">
          Downloading {pending.length} {pending.length === 1 ? 'song' : 'songs'}. Keep the app open — iOS stops
          downloads when it is in the background.
        </div>
      ) : null}

      {!isOnline ? <div className="banner">Offline — these play from this device.</div> : null}

      {records.length === 0 ? (
        <p className="empty">
          Nothing downloaded yet. Tap <b>⋯</b> beside a song, then <b>Download</b>, to keep it on this device.
        </p>
      ) : (
        <>
          <div className="card">
            <div className="card-row">
              <span>
                {done.length} {done.length === 1 ? 'song' : 'songs'} on this device
              </span>
              <span className="value">{formatBytes(bytes)}</span>
            </div>
            {done.length > 0 ? (
              <div className="card-row">
                <span>Free up space</span>
                <button
                  type="button"
                  className="chip"
                  onClick={() => {
                    if (confirm('Delete every downloaded song from this device?')) void removeAll()
                  }}
                >
                  Delete all
                </button>
              </div>
            ) : null}
          </div>

          <div className="rows" style={{ marginTop: 12 }}>
            {tracks === null
              ? Array.from({ length: Math.min(4, records.length) }, (_, i) => <RowSkeleton key={i} />)
              : queue.map((track, i) => (
                  <TrackRow
                    key={track.id}
                    track={track}
                    active={track.id === playingId}
                    onSelect={() => onPlay(queue, i)}
                    right={<DownloadButton track={track} />}
                  />
                ))}
            {/* queued, running and failed ones have no playable row yet */}
            {pending.map((record) => (
              <PendingRow key={record.trackId} trackId={record.trackId} />
            ))}
          </div>
        </>
      )}
    </>
  )
}

function PendingRow({ trackId }: { trackId: string }): JSX.Element | null {
  const records = useStore(downloads)
  const record = records.find((r) => r.trackId === trackId)
  const [track, setTrack] = useState<Track | null>(null)

  useEffect(() => {
    let live = true
    void import('../storage/db').then(({ getTrack }) =>
      getTrack(trackId).then((found) => live && setTrack(found ?? null)),
    )
    return () => {
      live = false
    }
  }, [trackId])

  if (!record || !track) return null
  return (
    <TrackRow
      track={track}
      disabled
      subtitle={
        record.status === 'error'
          ? `Failed — ${record.error ?? 'tap to retry'}`
          : record.status === 'queued'
            ? 'Waiting…'
            : `${formatBytes(record.bytesDone)}${record.bytesTotal ? ` of ${formatBytes(record.bytesTotal)}` : ''}`
      }
      right={<DownloadButton track={track} />}
    />
  )
}
