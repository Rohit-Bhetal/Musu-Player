import type { Track } from '../source/MusicSource'
import { createStore, type Store } from '../ui/store'
import { idbDelete, idbGetAll, idbPut, type Playlist } from './db'
import { isDownloaded } from './downloads'

export type { Playlist }

export const playlists: Store<readonly Playlist[]> = createStore<readonly Playlist[]>([])

function put(playlist: Playlist): void {
  const rest = playlists.get().filter((p) => p.id !== playlist.id)
  playlists.set([...rest, playlist])
}

export async function initPlaylists(): Promise<void> {
  const saved = await idbGetAll<Playlist>('playlists').catch(() => [])
  playlists.set(saved)
}

export const playlistOf = (id: string): Playlist | undefined => playlists.get().find((p) => p.id === id)

/** A track can live in any playlist regardless of which backend streams it —
 * a playlist is just an ordered list of ids, same as PlayerEngine's queue. */
export async function createPlaylist(name: string): Promise<Playlist> {
  const playlist: Playlist = { id: crypto.randomUUID(), name, trackIds: [] }
  put(playlist)
  await idbPut('playlists', playlist)
  return playlist
}

export async function renamePlaylist(id: string, name: string): Promise<void> {
  const playlist = playlistOf(id)
  if (!playlist) return
  const next = { ...playlist, name }
  put(next)
  await idbPut('playlists', next)
}

export async function deletePlaylist(id: string): Promise<void> {
  playlists.set(playlists.get().filter((p) => p.id !== id))
  await idbDelete('playlists', id)
}

export const isInPlaylist = (id: string, trackId: string): boolean =>
  playlistOf(id)?.trackIds.includes(trackId) ?? false

export async function addToPlaylist(id: string, trackId: string): Promise<void> {
  const playlist = playlistOf(id)
  if (!playlist || playlist.trackIds.includes(trackId)) return
  const next = { ...playlist, trackIds: [...playlist.trackIds, trackId] }
  put(next)
  await idbPut('playlists', next)
}

export async function removeFromPlaylist(id: string, trackId: string): Promise<void> {
  const playlist = playlistOf(id)
  if (!playlist) return
  const next = { ...playlist, trackIds: playlist.trackIds.filter((t) => t !== trackId) }
  put(next)
  await idbPut('playlists', next)
}

export function moveInPlaylist(id: string, from: number, to: number): void {
  const playlist = playlistOf(id)
  if (!playlist || from === to || from < 0 || to < 0 || from >= playlist.trackIds.length) return
  const trackIds = [...playlist.trackIds]
  const [moved] = trackIds.splice(from, 1)
  if (moved === undefined) return
  trackIds.splice(to, 0, moved)
  const next = { ...playlist, trackIds }
  put(next) // in-memory only until the caller settles; persisted by the caller
  void idbPut('playlists', next)
}

/** A playlist holds ids, not tracks; this resolves them from the local `tracks`
 * store, which `saveTrack` fills in whenever something is played or added to a
 * playlist. One transaction over the whole store, not one lookup per track —
 * same reasoning as `downloadedTracks()` in storage/downloads.ts. A track
 * never locally seen (added to a playlist, then that save failed, say) is
 * silently dropped rather than shown as a broken row. */
export async function resolvedPlaylistTracks(playlist: Playlist): Promise<Track[]> {
  if (playlist.trackIds.length === 0) return []
  const all = await idbGetAll<Track>('tracks').catch(() => [])
  const byId = new Map(all.map((t) => [t.id, t]))
  return playlist.trackIds.map((id) => byId.get(id)).filter((t): t is Track => Boolean(t))
}

/** How much of a playlist is already on the device — the basis for the
 * "offline" half of "make a playlist online and offline": nothing to toggle,
 * just whichever of its tracks you have downloaded versus still streamed. */
export function playlistOfflineStatus(playlist: Playlist): { downloaded: number; total: number } {
  return {
    downloaded: playlist.trackIds.filter(isDownloaded).length,
    total: playlist.trackIds.length,
  }
}
