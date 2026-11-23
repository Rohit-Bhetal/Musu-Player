import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const downloadedIds = new Set<string>()
vi.mock('./downloads', () => ({ isDownloaded: (id: string) => downloadedIds.has(id) }))

const {
  addToPlaylist,
  createPlaylist,
  deletePlaylist,
  initPlaylists,
  isInPlaylist,
  moveInPlaylist,
  playlistOf,
  playlistOfflineStatus,
  playlists,
  removeFromPlaylist,
  renamePlaylist,
} = await import('./playlists')
const { idbClear, idbGetAll } = await import('./db')

beforeEach(() => {
  playlists.set([])
  downloadedIds.clear()
})

afterEach(async () => {
  // fake-indexeddb persists across `it` blocks in one file; without this, a
  // later test's "what's in storage" assertion sees every earlier test's rows.
  await idbClear('playlists')
})

describe('createPlaylist', () => {
  it('starts empty and is persisted, not just held in memory', async () => {
    const playlist = await createPlaylist('Road trip')

    expect(playlist.trackIds).toEqual([])
    expect(playlistOf(playlist.id)?.name).toBe('Road trip')
    expect(await idbGetAll('playlists')).toEqual([playlist])
  })

  it('gives every playlist a distinct id', async () => {
    const a = await createPlaylist('A')
    const b = await createPlaylist('A') // same name is fine, ids still differ
    expect(a.id).not.toBe(b.id)
  })
})

describe('addToPlaylist / removeFromPlaylist', () => {
  it('adds a track once, in order, regardless of which backend it came from', async () => {
    const { id } = await createPlaylist('Mix')
    await addToPlaylist(id, 'audius:1')
    await addToPlaylist(id, 'youtube:2')
    await addToPlaylist(id, 'audius:1') // no duplicate

    expect(playlistOf(id)?.trackIds).toEqual(['audius:1', 'youtube:2'])
    expect(isInPlaylist(id, 'audius:1')).toBe(true)
    expect(isInPlaylist(id, 'radio:3')).toBe(false)
  })

  it('removes a track and persists the change', async () => {
    const { id } = await createPlaylist('Mix')
    await addToPlaylist(id, 'audius:1')
    await addToPlaylist(id, 'audius:2')

    await removeFromPlaylist(id, 'audius:1')

    expect(playlistOf(id)?.trackIds).toEqual(['audius:2'])
    const saved = await idbGetAll<{ id: string; trackIds: string[] }>('playlists')
    expect(saved.find((p) => p.id === id)?.trackIds).toEqual(['audius:2'])
  })

  it('does nothing for a playlist that does not exist', async () => {
    await expect(addToPlaylist('missing', 'audius:1')).resolves.toBeUndefined()
    await expect(removeFromPlaylist('missing', 'audius:1')).resolves.toBeUndefined()
  })
})

describe('moveInPlaylist', () => {
  it('reorders without losing or duplicating a track', async () => {
    const { id } = await createPlaylist('Order')
    await addToPlaylist(id, 'a')
    await addToPlaylist(id, 'b')
    await addToPlaylist(id, 'c')

    moveInPlaylist(id, 0, 2) // move 'a' to the end

    expect(playlistOf(id)?.trackIds).toEqual(['b', 'c', 'a'])
  })

  it('ignores an out-of-range move instead of corrupting the list', async () => {
    const { id } = await createPlaylist('Order')
    await addToPlaylist(id, 'a')

    moveInPlaylist(id, 5, 0)

    expect(playlistOf(id)?.trackIds).toEqual(['a'])
  })
})

describe('renamePlaylist / deletePlaylist', () => {
  it('renames in place, keeping its tracks', async () => {
    const { id } = await createPlaylist('Old name')
    await addToPlaylist(id, 'a')

    await renamePlaylist(id, 'New name')

    expect(playlistOf(id)).toMatchObject({ name: 'New name', trackIds: ['a'] })
  })

  it('deletes it from memory and from storage', async () => {
    const { id } = await createPlaylist('Gone soon')

    await deletePlaylist(id)

    expect(playlistOf(id)).toBeUndefined()
    expect(await idbGetAll('playlists')).toEqual([])
  })
})

describe('playlistOfflineStatus', () => {
  it('counts how many member tracks are already downloaded', async () => {
    const playlist = await createPlaylist('Mix')
    await addToPlaylist(playlist.id, 'audius:1')
    await addToPlaylist(playlist.id, 'audius:2')
    await addToPlaylist(playlist.id, 'youtube:3')
    downloadedIds.add('audius:1')

    expect(playlistOfflineStatus(playlistOf(playlist.id)!)).toEqual({ downloaded: 1, total: 3 })
  })

  it('is 0 of 0 for an empty playlist, not NaN or a crash', async () => {
    const playlist = await createPlaylist('Empty')
    expect(playlistOfflineStatus(playlist)).toEqual({ downloaded: 0, total: 0 })
  })
})

describe('initPlaylists', () => {
  it('loads whatever was saved from a previous session', async () => {
    const { id } = await createPlaylist('Saved')
    await addToPlaylist(id, 'a')
    playlists.set([]) // simulate a fresh reload before the store repopulates

    await initPlaylists()

    expect(playlistOf(id)?.trackIds).toEqual(['a'])
  })
})
