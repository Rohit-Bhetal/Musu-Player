import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Track } from '../source/MusicSource'

const streamUrl = vi.fn(async (id: string) => `https://audio.example/${id}`)
const getLyrics = vi.fn(async (_id: string) => null as { kind: 'lrc' | 'plain'; text: string } | null)

vi.mock('../source', () => ({
  source: {
    getStreamUrl: (id: string) => streamUrl(id),
    getLyrics: (id: string) => getLyrics(id),
  },
}))

const {
  canDownload,
  downloadOf,
  downloads,
  enqueue,
  initDownloads,
  isDownloaded,
  downloadedAudioUrl,
  remove,
  removeAll,
} = await import('./downloads')
const { getBlob, audioKey, getLyrics: storedLyrics } = await import('./db')

const track = (id: string): Track => ({ id, title: `song ${id}`, artist: 'artist' })

/** Resolves once the record reaches a settled status, or throws on timeout. */
async function settled(trackId: string): Promise<string> {
  for (let i = 0; i < 200; i += 1) {
    const status = downloadOf(trackId)?.status
    if (status === 'done' || status === 'error') return status
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error(`${trackId} never settled (${downloadOf(trackId)?.status})`)
}

function audioResponse(body = 'audio-bytes', type = 'audio/mp4'): Response {
  return new Response(body, { status: 200, headers: { 'Content-Type': type } })
}

beforeEach(async () => {
  downloads.set([])
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:fake', revokeObjectURL: () => undefined }))
  await initDownloads()
})

afterEach(async () => {
  await removeAll()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('canDownload', () => {
  it('refuses a radio stream, which has no end', () => {
    expect(canDownload(track('radio:abc'))).toBe(false)
    expect(canDownload(track('audius:abc'))).toBe(true)
    expect(canDownload(track('youtube:abc'))).toBe(true)
  })
})

describe('enqueue', () => {
  it('stores the audio and marks the track downloaded', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => audioResponse()))

    await enqueue(track('audius:1'))
    expect(await settled('audius:1')).toBe('done')

    expect(isDownloaded('audius:1')).toBe(true)
    const blob = await getBlob(audioKey('audius:1'))
    expect(blob?.type).toBe('audio/mp4') // Safari will not play a blob without it
    expect(await blob?.text()).toBe('audio-bytes')
  })

  it('saves lyrics alongside, when the source has them', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => audioResponse()))
    getLyrics.mockResolvedValueOnce({ kind: 'lrc', text: '[00:01.00]hi' })

    await enqueue(track('audius:2'))
    await settled('audius:2')

    expect(await storedLyrics('audius:2')).toMatchObject({ kind: 'lrc', text: '[00:01.00]hi' })
  })

  it('still finishes when lyrics and artwork are unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => audioResponse()))
    getLyrics.mockRejectedValueOnce(new Error('no lyrics anywhere'))

    await enqueue(track('audius:3'))
    expect(await settled('audius:3')).toBe('done')
  })

  it('keeps no half a song when the audio fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 500 })))

    await enqueue(track('audius:4'))
    expect(await settled('audius:4')).toBe('error')

    expect(isDownloaded('audius:4')).toBe(false)
    expect(await getBlob(audioKey('audius:4'))).toBeUndefined()
    expect(downloadOf('audius:4')?.error).toContain('500')
  })

  it('does not queue the same track twice', async () => {
    const fetchSpy = vi.fn(async () => audioResponse())
    vi.stubGlobal('fetch', fetchSpy)

    await enqueue(track('audius:5'))
    await enqueue(track('audius:5'))
    await settled('audius:5')
    await enqueue(track('audius:5')) // already done

    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('never queues a radio station', async () => {
    const fetchSpy = vi.fn(async () => audioResponse())
    vi.stubGlobal('fetch', fetchSpy)

    await enqueue(track('radio:1'))

    expect(downloads.get()).toHaveLength(0)
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe('remove', () => {
  it('takes the audio, the lyrics and the record with it', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => audioResponse()))
    getLyrics.mockResolvedValueOnce({ kind: 'plain', text: 'words' })
    await enqueue(track('audius:6'))
    await settled('audius:6')

    await remove('audius:6')

    expect(downloadOf('audius:6')).toBeUndefined()
    expect(await getBlob(audioKey('audius:6'))).toBeUndefined()
    expect(await storedLyrics('audius:6')).toBeUndefined()
  })
})

describe('downloadedAudioUrl', () => {
  it('is null for a track that is not downloaded, so playback falls back to streaming', async () => {
    expect(await downloadedAudioUrl('audius:missing')).toBeNull()
  })

  it('is an object URL once downloaded', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => audioResponse()))
    await enqueue(track('audius:7'))
    await settled('audius:7')

    expect(await downloadedAudioUrl('audius:7')).toBe('blob:fake')
  })
})

describe('enqueue failure', () => {
  it('toasts instead of an unhandled rejection when the write fails', async () => {
    const db = await import('./db')
    const { toasts } = await import('../ui/toast')
    const before = toasts.get().length
    const saveSpy = vi.spyOn(db, 'saveTrack').mockRejectedValueOnce(new Error('boom'))

    // every call site does `void enqueue(track)` — nothing awaits this promise,
    // so a thrown error here would otherwise surface as a silent console warning
    await enqueue(track('audius:9'))

    expect(downloadOf('audius:9')).toBeUndefined() // never queued, not stuck
    expect(toasts.get().length).toBe(before + 1)
    expect(toasts.get().at(-1)?.message).toContain('Could not queue')
    saveSpy.mockRestore()
  })
})

describe('initDownloads', () => {
  it('requeues anything a reload caught mid-download', async () => {
    const { saveDownload } = await import('./db')
    await saveDownload({ trackId: 'audius:8', status: 'downloading', bytesDone: 10, bytesTotal: 99 })
    vi.stubGlobal('fetch', vi.fn(async () => audioResponse()))

    await initDownloads()

    // it resumes rather than sitting at a progress bar that never moves
    expect(['queued', 'downloading', 'done']).toContain(downloadOf('audius:8')?.status)
  })
})
