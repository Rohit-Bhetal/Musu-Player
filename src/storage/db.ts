import type { Lyrics, Track } from '../source/MusicSource'
import type { RepeatMode } from '../player/PlayerEngine'

export const DB_NAME = 'music-pwa'
export const DB_VERSION = 1

export type DownloadStatus = 'queued' | 'downloading' | 'done' | 'error'

export interface DownloadRecord {
  trackId: string
  status: DownloadStatus
  bytesDone: number
  bytesTotal: number
  audioKey?: string
  artworkKey?: string
  mime?: string
  downloadedAt?: number
  error?: string
}

export interface DownloadJob {
  jobId: string
  trackId: string
  createdAt: number
}

export interface Playlist {
  id: string
  name: string
  trackIds: string[]
}

export interface PersistedPlayerState {
  queue: Track[]
  /** Play order as indices into `queue`; differs from queue order while shuffled. */
  order: number[]
  index: number
  positionSec: number
  shuffle: boolean
  repeat: RepeatMode
}

export type StoreName = 'tracks' | 'downloads' | 'lyrics' | 'blobs' | 'playlists' | 'downloadQueue' | 'state'

/** keyPath per store; null means the key is passed in explicitly. */
const SCHEMA: Record<StoreName, string | null> = {
  tracks: 'id',
  downloads: 'trackId',
  lyrics: 'trackId',
  blobs: null,
  playlists: 'id',
  downloadQueue: 'jobId',
  state: null,
}

let dbPromise: Promise<IDBDatabase> | null = null

export function openDB(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION)
      request.onupgradeneeded = () => {
        const db = request.result
        // v1 creates everything; later versions add their stores below this block
        for (const [name, keyPath] of Object.entries(SCHEMA)) {
          if (!db.objectStoreNames.contains(name)) {
            db.createObjectStore(name, keyPath ? { keyPath } : undefined)
          }
        }
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error ?? new Error('indexedDB.open failed'))
      request.onblocked = () => reject(new Error('indexedDB upgrade blocked by another tab'))
    }).catch((e: unknown) => {
      dbPromise = null
      throw e
    })
  }
  return dbPromise
}

function run<T>(request: IDBRequest<T>, tx: IDBTransaction): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'))
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'))
  })
}

export async function idbGet<T>(store: StoreName, key: IDBValidKey): Promise<T | undefined> {
  const db = await openDB()
  const tx = db.transaction(store, 'readonly')
  return run<T | undefined>(tx.objectStore(store).get(key) as IDBRequest<T | undefined>, tx)
}

export async function idbGetAll<T>(store: StoreName): Promise<T[]> {
  const db = await openDB()
  const tx = db.transaction(store, 'readonly')
  return run<T[]>(tx.objectStore(store).getAll() as IDBRequest<T[]>, tx)
}

export async function idbPut(store: StoreName, value: unknown, key?: IDBValidKey): Promise<void> {
  const db = await openDB()
  const tx = db.transaction(store, 'readwrite')
  await run(key === undefined ? tx.objectStore(store).put(value) : tx.objectStore(store).put(value, key), tx)
}

export async function idbDelete(store: StoreName, key: IDBValidKey): Promise<void> {
  const db = await openDB()
  const tx = db.transaction(store, 'readwrite')
  await run(tx.objectStore(store).delete(key), tx)
}

export async function idbClear(store: StoreName): Promise<void> {
  const db = await openDB()
  const tx = db.transaction(store, 'readwrite')
  await run(tx.objectStore(store).clear(), tx)
}

/* ------------------------------------------------------- typed helpers -- */

export const saveTrack = (track: Track): Promise<void> => idbPut('tracks', track)
export const getTrack = (id: string): Promise<Track | undefined> => idbGet<Track>('tracks', id)
export const getLyrics = (trackId: string): Promise<Lyrics | undefined> => idbGet<Lyrics>('lyrics', trackId)
export const saveLyrics = (trackId: string, lyrics: Lyrics): Promise<void> =>
  idbPut('lyrics', { trackId, ...lyrics })

export const PLAYER_STATE_KEY = 'player'
export const savePlayerState = (state: PersistedPlayerState): Promise<void> =>
  idbPut('state', state, PLAYER_STATE_KEY)
export const loadPlayerState = (): Promise<PersistedPlayerState | undefined> =>
  idbGet<PersistedPlayerState>('state', PLAYER_STATE_KEY)
export const clearPlayerState = (): Promise<void> => idbDelete('state', PLAYER_STATE_KEY)
