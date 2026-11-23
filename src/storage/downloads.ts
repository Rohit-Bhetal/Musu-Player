import type { Track } from '../source/MusicSource'
import { source } from '../source'
import { createStore, type Store } from '../ui/store'
import { toast } from '../ui/toast'
import { logEvent } from '../diagnostics'
import {
  artworkKey,
  audioKey,
  deleteBlob,
  deleteDownload,
  deleteLyrics,
  getBlob,
  getTrack,
  getTracksByIds,
  listDownloads,
  putBlob,
  saveDownload,
  saveLyrics,
  saveTrack,
  type DownloadRecord,
} from './db'

/** iOS does not download in the background, so two at a time is already
 * optimistic — it only progresses while the app is on screen. */
const MAX_PARALLEL = 2

export const downloads: Store<readonly DownloadRecord[]> = createStore<readonly DownloadRecord[]>([])

const inFlight = new Map<string, AbortController>()
let askedToPersist = false

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB'
  const mb = bytes / 1024 / 1024
  return mb < 1 ? `${Math.round(bytes / 1024)} KB` : `${mb.toFixed(1)} MB`
}

export const downloadOf = (trackId: string): DownloadRecord | undefined =>
  downloads.get().find((record) => record.trackId === trackId)

export const isDownloaded = (trackId: string): boolean => downloadOf(trackId)?.status === 'done'

/** A live stream has no end, so there is nothing to put on the device. */
export const canDownload = (track: Track): boolean => !track.id.startsWith('radio:')

function put(record: DownloadRecord): void {
  const rest = downloads.get().filter((r) => r.trackId !== record.trackId)
  downloads.set([...rest, record])
}

/** The store drives the UI every chunk; IndexedDB only needs the turning points. */
async function commit(record: DownloadRecord): Promise<void> {
  put(record)
  await saveDownload(record).catch((e: unknown) => logEvent('download:save-failed', String(e)))
}

export async function initDownloads(): Promise<void> {
  const saved = await listDownloads().catch(() => [])
  // Anything caught mid-flight by a reload never finished its blob.
  downloads.set(saved.map((r) => (r.status === 'downloading' ? { ...r, status: 'queued' as const } : r)))
  for (const record of downloads.get()) {
    if (record.status === 'queued') void saveDownload(record)
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) pump()
    })
  }
  pump()
}

export async function enqueue(track: Track): Promise<void> {
  if (!canDownload(track)) return
  const existing = downloadOf(track.id)
  if (existing && existing.status !== 'error') return // already queued, running or done

  // Must be asked for from inside the tap that started the first download.
  if (!askedToPersist && navigator.storage?.persist) {
    askedToPersist = true
    void navigator.storage
      .persist()
      .then((granted) => logEvent('storage:persist', granted ? 'granted' : 'denied'))
      .catch(() => undefined)
  }

  try {
    await saveTrack(track)
    await commit({ trackId: track.id, status: 'queued', bytesDone: 0, bytesTotal: 0 })
  } catch (error) {
    // Every call site does `void enqueue(track)` — without this, a write
    // failure here (private browsing, quota) was a silent unhandled
    // rejection with no sign anything was wrong, for every caller at once.
    logEvent('download:enqueue-failed', error instanceof Error ? error.message : String(error))
    toast(`Could not queue ${track.title}.`)
    return
  }
  pump()
}

export function cancel(trackId: string): void {
  inFlight.get(trackId)?.abort()
  inFlight.delete(trackId)
  void remove(trackId)
}

export async function remove(trackId: string): Promise<void> {
  inFlight.get(trackId)?.abort()
  inFlight.delete(trackId)
  await Promise.all([
    deleteBlob(audioKey(trackId)).catch(() => undefined),
    deleteBlob(artworkKey(trackId)).catch(() => undefined),
    deleteLyrics(trackId).catch(() => undefined),
    deleteDownload(trackId).catch(() => undefined),
  ])
  downloads.set(downloads.get().filter((r) => r.trackId !== trackId))
  pump()
}

export async function removeAll(): Promise<void> {
  await Promise.all(downloads.get().map((record) => remove(record.trackId)))
}

export const retry = (trackId: string): void => void (downloadOf(trackId) && start(trackId))

function pump(): void {
  // iOS suspends a hidden page; starting work there just produces failures.
  if (typeof document !== 'undefined' && document.hidden) return
  const running = downloads.get().filter((r) => r.status === 'downloading').length
  const waiting = downloads.get().filter((r) => r.status === 'queued')
  for (const record of waiting.slice(0, Math.max(0, MAX_PARALLEL - running))) void start(record.trackId)
}

/** Audio is required; artwork and lyrics are recorded as missing and skipped. */
async function start(trackId: string): Promise<void> {
  if (inFlight.has(trackId)) return
  const controller = new AbortController()
  inFlight.set(trackId, controller)
  await commit({ trackId, status: 'downloading', bytesDone: 0, bytesTotal: 0 })

  try {
    const track = await getTrack(trackId)
    if (!track) throw new Error('track is no longer known')

    const url = await source.getStreamUrl(trackId)
    const response = await fetch(url, { signal: controller.signal })
    if (!response.ok) throw new Error(`stream ${response.status}`)

    const mime = response.headers.get('Content-Type') ?? 'audio/mpeg'
    const bytesTotal = Number(response.headers.get('Content-Length')) || 0
    const blob = await readWithProgress(response, trackId, bytesTotal, controller.signal)

    // Safari will not play a blob without the right audio type on it.
    await putBlob(audioKey(trackId), blob.type ? blob : new Blob([blob], { type: mime }))

    const artworkStored = await storeArtwork(track, controller.signal)
    const lyricsStored = await storeLyrics(trackId)

    await commit({
      trackId,
      status: 'done',
      bytesDone: blob.size,
      bytesTotal: blob.size,
      mime,
      downloadedAt: Date.now(),
      audioKey: audioKey(trackId),
      ...(artworkStored ? { artworkKey: artworkKey(trackId) } : {}),
    })
    logEvent('download:done', `${track.title}${lyricsStored ? ' +lyrics' : ''}`)
  } catch (error) {
    await failed(trackId, error)
  } finally {
    inFlight.delete(trackId)
    pump()
  }
}

async function readWithProgress(
  response: Response,
  trackId: string,
  bytesTotal: number,
  signal: AbortSignal,
): Promise<Blob> {
  const reader = response.body?.getReader()
  if (!reader) return response.blob() // no streams: no progress, still a download

  const parts: BlobPart[] = []
  let bytesDone = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (signal.aborted) throw new DOMException('cancelled', 'AbortError')
    parts.push(value as BlobPart)
    bytesDone += value.byteLength
    put({ trackId, status: 'downloading', bytesDone, bytesTotal })
  }
  return new Blob(parts, { type: response.headers.get('Content-Type') ?? '' })
}

async function storeArtwork(track: Track, signal: AbortSignal): Promise<boolean> {
  // shortcut: stored at whatever size the source serves, not resized to 512px
  // JPEG; revisit if Lock Screen artwork or storage size disappoints.
  if (!track.artworkUrl) return false
  try {
    const response = await fetch(track.artworkUrl, { signal })
    if (!response.ok) return false
    await putBlob(artworkKey(track.id), await response.blob())
    return true
  } catch {
    return false // optional: a missing cover never fails a download
  }
}

async function storeLyrics(trackId: string): Promise<boolean> {
  try {
    const lyrics = await source.getLyrics(trackId)
    if (!lyrics) return false
    await saveLyrics(trackId, lyrics)
    return true
  } catch {
    return false
  }
}

async function failed(trackId: string, error: unknown): Promise<void> {
  await deleteBlob(audioKey(trackId)).catch(() => undefined) // never keep half a song
  if (error instanceof DOMException && error.name === 'AbortError') return // cancelled, record is gone

  const full = error instanceof DOMException && error.name === 'QuotaExceededError'
  const message = full ? 'Storage full' : error instanceof Error ? error.message : String(error)
  logEvent('download:failed', `${trackId}: ${message}`)
  toast(full ? 'Storage full — delete some downloads in Settings.' : `Download failed: ${message}`)
  await commit({ trackId, status: 'error', bytesDone: 0, bytesTotal: 0, error: message })
}

/* ------------------------------------------------------ reading it back -- */

async function objectUrl(key: string): Promise<string | null> {
  const blob = await getBlob(key).catch(() => undefined)
  return blob ? URL.createObjectURL(blob) : null
}

/** Caller owns the object URL and must revoke it — PlayerEngine does. */
export const downloadedAudioUrl = (trackId: string): Promise<string | null> =>
  isDownloaded(trackId) ? objectUrl(audioKey(trackId)) : Promise.resolve(null)

export const downloadedArtworkUrl = (trackId: string): Promise<string | null> =>
  downloadOf(trackId)?.artworkKey ? objectUrl(artworkKey(trackId)) : Promise.resolve(null)

export const downloadedTracks = (): Promise<Track[]> =>
  getTracksByIds(downloads.get().filter((r) => r.status === 'done').map((r) => r.trackId))
