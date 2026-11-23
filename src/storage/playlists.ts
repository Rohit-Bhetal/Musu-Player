import type { Track } from '../source/MusicSource'
import { createStore, type Store } from '../ui/store'
import { getTracksByIds, idbDelete, idbGetAll, idbPut, type Playlist } from './db'
import { isDownloaded } from './downloads'

export type { Playlist }

export const playlists: Store<readonly Playlist[]> = createStore<readonly Playlist[]>([])

function put(playlist: Playlist): void {
  const rest = playlists.get().filter((p) => p.id !== playlist.id)
  playlists.set([...rest, playlist])
}

type PlaylistListener = (playlist: Playlist | null, id: string) => void
const changeListeners = new Set<PlaylistListener>()

/** Fires after every persisted change — create, rename, a track added, removed
 * or moved, or a delete (`playlist` is then null). Lets cloud sync mirror
 * writes to Firestore without storage/ needing to know sync exists. */
export function onPlaylistChange(fn: PlaylistListener): () => void {
  changeListeners.add(fn)
  return () => void changeListeners.delete(fn)
}

function notify(id: string, playlist: Playlist | null): void {
  for (const fn of changeListeners) fn(playlist, id)
}

/** A fixed id, unlike createPlaylist's random one, so the heart button always
 * finds the same playlist back — never deleted, never recreated once it
 * exists (see initPlaylists). */
export const LIKED_SONGS_ID = 'liked-songs'

export async function initPlaylists(): Promise<void> {
  const saved = await idbGetAll<Playlist>('playlists').catch((): Playlist[] => [])
  if (!saved.some((p) => p.id === LIKED_SONGS_ID)) {
    const liked: Playlist = { id: LIKED_SONGS_ID, name: 'Liked Songs', trackIds: [], updatedAt: Date.now() }
    await idbPut('playlists', liked).catch(() => undefined)
    saved.push(liked)
  }
  playlists.set(saved)
}

export const playlistOf = (id: string): Playlist | undefined => playlists.get().find((p) => p.id === id)

/** A track can live in any playlist regardless of which backend streams it —
 * a playlist is just an ordered list of ids, same as PlayerEngine's queue. */
export async function createPlaylist(name: string): Promise<Playlist> {
  const playlist: Playlist = { id: crypto.randomUUID(), name, trackIds: [], updatedAt: Date.now() }
  put(playlist)
  await idbPut('playlists', playlist)
  notify(playlist.id, playlist)
  return playlist
}

export async function renamePlaylist(id: string, name: string): Promise<void> {
  const playlist = playlistOf(id)
  if (!playlist) return
  const next = { ...playlist, name, updatedAt: Date.now() }
  put(next)
  await idbPut('playlists', next)
  notify(id, next)
}

export async function deletePlaylist(id: string): Promise<void> {
  if (id === LIKED_SONGS_ID) return // always exists — see initPlaylists
  playlists.set(playlists.get().filter((p) => p.id !== id))
  await idbDelete('playlists', id)
  notify(id, null)
}

export const isInPlaylist = (id: string, trackId: string): boolean =>
  playlistOf(id)?.trackIds.includes(trackId) ?? false

export async function addToPlaylist(id: string, trackId: string): Promise<void> {
  const playlist = playlistOf(id)
  if (!playlist || playlist.trackIds.includes(trackId)) return
  const next = { ...playlist, trackIds: [...playlist.trackIds, trackId], updatedAt: Date.now() }
  put(next)
  await idbPut('playlists', next)
  notify(id, next)
}

export async function removeFromPlaylist(id: string, trackId: string): Promise<void> {
  const playlist = playlistOf(id)
  if (!playlist) return
  const next = { ...playlist, trackIds: playlist.trackIds.filter((t) => t !== trackId), updatedAt: Date.now() }
  put(next)
  await idbPut('playlists', next)
  notify(id, next)
}

export function moveInPlaylist(id: string, from: number, to: number): void {
  const playlist = playlistOf(id)
  if (!playlist || from === to || from < 0 || to < 0 || from >= playlist.trackIds.length) return
  const trackIds = [...playlist.trackIds]
  const [moved] = trackIds.splice(from, 1)
  if (moved === undefined) return
  trackIds.splice(to, 0, moved)
  const next = { ...playlist, trackIds, updatedAt: Date.now() }
  put(next) // in-memory only until the caller settles; persisted by the caller
  void idbPut('playlists', next).then(() => notify(id, next))
}

/** Merges cloud playlists into the local store — cloud only wins where it is
 * newer (by updatedAt), so an offline edit made before this pull never loses
 * to a stale cloud copy. A playlist missing locally is simply added. */
export function importPlaylists(remote: readonly Playlist[]): void {
  const byId = new Map(playlists.get().map((p) => [p.id, p]))
  const changed: Playlist[] = []
  for (const incoming of remote) {
    const existing = byId.get(incoming.id)
    if (!existing || (incoming.updatedAt ?? 0) > (existing.updatedAt ?? 0)) {
      byId.set(incoming.id, incoming)
      changed.push(incoming)
    }
  }
  if (changed.length === 0) return
  playlists.set([...byId.values()])
  for (const p of changed) void idbPut('playlists', p)
}

/** A playlist holds ids, not tracks; this resolves them from the local `tracks`
 * store, which `saveTrack` fills in whenever something is played or added to a
 * playlist. A track never locally seen (added to a playlist, then that save
 * failed, say) is silently dropped rather than shown as a broken row. */
export const resolvedPlaylistTracks = (playlist: Playlist): Promise<Track[]> => getTracksByIds(playlist.trackIds)

/** How much of a playlist is already on the device — the basis for the
 * "offline" half of "make a playlist online and offline": nothing to toggle,
 * just whichever of its tracks you have downloaded versus still streamed. */
export function playlistOfflineStatus(playlist: Playlist): { downloaded: number; total: number } {
  return {
    downloaded: playlist.trackIds.filter(isDownloaded).length,
    total: playlist.trackIds.length,
  }
}
