import type { JSX } from 'react'
import { useEffect, useState } from 'react'
import type { Track } from '../source/MusicSource'
import { enqueue, isDownloaded } from '../storage/downloads'
import {
  createPlaylist,
  deletePlaylist,
  LIKED_SONGS_ID,
  moveInPlaylist,
  playlistOf,
  playlistOfflineStatus,
  playlists,
  resolvedPlaylistTracks,
  type Playlist,
} from '../storage/playlists'
import { online } from '../pwa/pwa'
import { useStore } from './store'
import { Icon } from './Icon'
import { placeholderGradient } from './Artwork'
import { ReorderButtons, RowSkeleton, TrackRow } from './TrackRow'
import { TrackMenu } from './TrackMenu'
import { NewPlaylistForm } from './NewPlaylistForm'

type OnPlay = (queue: Track[], index: number) => void

function PlaylistDetail({
  playlist,
  onPlay,
  onBack,
}: {
  playlist: Playlist
  onPlay: OnPlay
  onBack: () => void
}): JSX.Element {
  const isOnline = useStore(online)
  const [tracks, setTracks] = useState<Track[] | null>(null)
  const trackIdsKey = playlist.trackIds.join(',')

  useEffect(() => {
    let live = true
    void resolvedPlaylistTracks(playlist).then((list) => live && setTracks(list))
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackIdsKey])

  const list = tracks ?? []
  const { downloaded, total } = playlistOfflineStatus(playlist)
  // Offline, only what is already on the device can actually play; everything
  // else is shown greyed out rather than hidden, same as the rest of the app.
  const playable = isOnline ? list : list.filter((t) => isDownloaded(t.id))

  function play(track: Track): void {
    const index = playable.indexOf(track)
    if (index >= 0) onPlay(playable, index)
  }

  return (
    <>
      <div className="topbar">
        <button type="button" className="row-action" aria-label="Back to playlists" onClick={onBack}>
          <Icon name="chevron-left" size={22} />
        </button>
        <span className="brand-name">PLAYLIST</span>
      </div>
      <h1>{playlist.name}</h1>

      {!isOnline && downloaded < total ? (
        <div className="banner">
          Offline — {downloaded} of {total} songs here are playable; the rest need a connection.
        </div>
      ) : null}

      {total > 0 ? (
        <div className="card" style={{ marginBottom: 12 }}>
          <div className="card-row">
            <span>
              {total} {total === 1 ? 'song' : 'songs'} · {downloaded} downloaded
            </span>
            {downloaded < total ? (
              <button
                type="button"
                className="chip"
                onClick={() => list.filter((t) => !isDownloaded(t.id)).forEach((t) => void enqueue(t))}
              >
                Download all
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {tracks === null ? (
        <div className="rows">
          {Array.from({ length: Math.min(4, playlist.trackIds.length) }, (_, i) => (
            <RowSkeleton key={i} />
          ))}
        </div>
      ) : list.length === 0 ? (
        <p className="empty">
          Nothing in this playlist yet. Tap <b>⋯</b> on any song, then <b>Add to playlist</b>.
        </p>
      ) : (
        <div className="rows">
          {list.map((track) => {
            // Index within the playlist's own order, not within `list` — a
            // track this device has never seen is dropped from `list` by
            // resolvedPlaylistTracks, which would otherwise throw reordering
            // off by however many of those came before it.
            const order = playlist.trackIds.indexOf(track.id)
            return (
              <TrackRow
                key={track.id}
                track={track}
                disabled={!playable.includes(track)}
                onSelect={() => play(track)}
                right={
                  <>
                    <ReorderButtons
                      label={track.title}
                      disabledUp={order <= 0}
                      disabledDown={order < 0 || order >= playlist.trackIds.length - 1}
                      onUp={() => moveInPlaylist(playlist.id, order, order - 1)}
                      onDown={() => moveInPlaylist(playlist.id, order, order + 1)}
                    />
                    <TrackMenu track={track} inPlaylistId={playlist.id} />
                  </>
                }
              />
            )
          })}
        </div>
      )}
    </>
  )
}

export function Playlists({ onPlay }: { onPlay: OnPlay }): JSX.Element {
  const lists = useStore(playlists)
  const [openId, setOpenId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const open = openId ? playlistOf(openId) : undefined

  // Deleted or emptied out from under the detail view — fall back to the list
  // rather than showing a screen for a playlist that no longer exists.
  if (openId && !open) setOpenId(null)

  useEffect(() => {
    if (!creating) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setCreating(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [creating])

  async function makeNew(name: string): Promise<void> {
    const created = await createPlaylist(name)
    setCreating(false)
    setOpenId(created.id)
  }

  if (open) {
    return <PlaylistDetail playlist={open} onPlay={onPlay} onBack={() => setOpenId(null)} />
  }

  return (
    <>
      <h1>Playlists</h1>

      <button type="button" className="card" style={{ width: '100%', marginBottom: 12 }} onClick={() => setCreating(true)}>
        <div className="card-row">
          <span className="row-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Icon name="plus" size={20} />
            New playlist
          </span>
        </div>
      </button>

      {lists.length === 0 ? (
        <p className="empty">
          No playlists yet. Make one here, or tap <b>⋯</b> on any song and choose <b>Add to playlist</b>.
        </p>
      ) : (
        <div className="rows">
          {lists.map((playlist) => {
            const { downloaded, total } = playlistOfflineStatus(playlist)
            return (
              <div className="row" key={playlist.id}>
                <button type="button" className="row-main" onClick={() => setOpenId(playlist.id)}>
                  <span
                    className="art"
                    style={{
                      width: 48,
                      height: 48,
                      display: 'grid',
                      placeItems: 'center',
                      color: '#ffffffd9',
                      background: playlist.id === LIKED_SONGS_ID ? 'var(--accent)' : placeholderGradient(playlist.id),
                    }}
                  >
                    <Icon name={playlist.id === LIKED_SONGS_ID ? 'heart-filled' : 'playlist'} size={22} />
                  </span>
                  <span className="row-text">
                    <span className="row-title">{playlist.name}</span>
                    <span className="row-sub">
                      {total} {total === 1 ? 'song' : 'songs'}
                      {total > 0 ? ` · ${downloaded}/${total} offline` : ''}
                    </span>
                  </span>
                </button>
                {playlist.id !== LIKED_SONGS_ID ? (
                  <button
                    type="button"
                    className="row-action"
                    aria-label={`Delete playlist ${playlist.name}`}
                    onClick={() => {
                      if (confirm(`Delete “${playlist.name}”? This only removes the playlist, not any downloads.`)) {
                        void deletePlaylist(playlist.id)
                      }
                    }}
                  >
                    <Icon name="trash" size={20} />
                  </button>
                ) : null}
              </div>
            )
          })}
        </div>
      )}

      {creating ? (
        <div className="sheet-backdrop" onClick={() => setCreating(false)}>
          <div
            className="sheet"
            role="dialog"
            aria-modal="true"
            aria-label="New playlist"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="sheet-head">
              <span className="sheet-title">New playlist</span>
            </div>
            <NewPlaylistForm onCreate={(name) => void makeNew(name)} />
            <button type="button" className="sheet-cancel" onClick={() => setCreating(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </>
  )
}
