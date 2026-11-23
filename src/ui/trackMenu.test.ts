import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Track } from '../source/MusicSource'
import type { PlayerState } from '../player/PlayerEngine'

vi.mock('../source', () => ({
  source: { getStreamUrl: async () => '', getLyrics: async () => null },
}))

const EMPTY_STATE: PlayerState = {
  queue: [],
  order: [],
  index: -1,
  playing: false,
  loading: false,
  shuffle: false,
  repeat: 'off',
}

// The real module instantiates PlayerEngine, which needs `new Audio()` — not
// available outside a browser, so trackMenu's own behavior is tested against
// a stand-in with no current track, same shape as a freshly loaded app.
vi.mock('../player', () => ({
  player: {
    state: { get: vi.fn((): PlayerState => EMPTY_STATE) },
    playNext: vi.fn(),
    addToQueue: vi.fn(),
  },
}))

const { actionsFor, shareTrack } = await import('./TrackMenu')
const { downloads } = await import('../storage/downloads')
const { playlists } = await import('../storage/playlists')
const { player } = await import('../player')

const track = (id = 'audius:1'): Track => ({ id, title: 'song', artist: 'artist' })

const labels = (t: Track, inPlaylistId?: string): string[] =>
  actionsFor(t, inPlaylistId).map((a) => a.label)

beforeEach(() => {
  downloads.set([])
  playlists.set([])
  vi.mocked(player.state.get).mockReturnValue(EMPTY_STATE)
})

describe('actionsFor', () => {
  it('offers a download, queuing, a playlist and sharing', () => {
    expect(labels(track())).toEqual(['Download', 'Play next', 'Add to queue', 'Add to playlist', 'Share'])
  })

  it('offers to cancel while queued or running, with progress', () => {
    downloads.set([{ trackId: 'audius:1', status: 'queued', bytesDone: 0, bytesTotal: 0 }])
    expect(actionsFor(track())).toMatchObject([
      { label: 'Cancel download', note: 'Waiting…' },
      { label: 'Play next' },
      { label: 'Add to queue' },
      { label: 'Add to playlist' },
      { label: 'Share' },
    ])

    downloads.set([{ trackId: 'audius:1', status: 'downloading', bytesDone: 1_048_576, bytesTotal: 4_194_304 }])
    expect(actionsFor(track())).toMatchObject([
      { label: 'Cancel download', note: '1.0 MB of 4.0 MB' },
      { label: 'Play next' },
      { label: 'Add to queue' },
      { label: 'Add to playlist' },
      { label: 'Share' },
    ])
  })

  it('offers removal once downloaded, showing what it costs', () => {
    downloads.set([{ trackId: 'audius:1', status: 'done', bytesDone: 3_145_728, bytesTotal: 3_145_728 }])
    expect(actionsFor(track())).toMatchObject([
      { label: 'Remove download', note: '3.0 MB', danger: true },
      { label: 'Play next' },
      { label: 'Add to queue' },
      { label: 'Add to playlist' },
      { label: 'Share' },
    ])
  })

  it('offers retry and removal after a failure, naming the reason', () => {
    downloads.set([
      { trackId: 'audius:1', status: 'error', bytesDone: 0, bytesTotal: 0, error: 'stream 500' },
    ])
    expect(actionsFor(track())).toMatchObject([
      { label: 'Retry download', note: 'stream 500' },
      { label: 'Remove', danger: true },
      { label: 'Play next' },
      { label: 'Add to queue' },
      { label: 'Add to playlist' },
      { label: 'Share' },
    ])
  })

  it('offers only queuing, a playlist and sharing for live radio — a stream has no end to download', () => {
    expect(labels(track('radio:1'))).toEqual(['Play next', 'Add to queue', 'Add to playlist', 'Share'])
  })

  it('reads the download record for this track only', () => {
    downloads.set([{ trackId: 'audius:other', status: 'done', bytesDone: 1, bytesTotal: 1 }])
    expect(labels(track())).toEqual(['Download', 'Play next', 'Add to queue', 'Add to playlist', 'Share'])
  })

  it('offers "remove from this playlist" when opened from inside one', () => {
    expect(labels(track(), 'list-1')).toEqual([
      'Download',
      'Play next',
      'Add to queue',
      'Remove from this playlist',
      'Add to playlist',
      'Share',
    ])
  })

  it('hides "Play next"/"Add to queue" for the track already playing — queuing it is a no-op', () => {
    vi.mocked(player.state.get).mockReturnValue({
      ...EMPTY_STATE,
      queue: [track()],
      order: [0],
      index: 0,
    })
    expect(labels(track())).toEqual(['Download', 'Add to playlist', 'Share'])
  })
})

describe('shareTrack', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('uses the Web Share API when available', async () => {
    const share = vi.fn(async () => undefined)
    vi.stubGlobal('navigator', { share })

    await shareTrack(track())

    expect(share).toHaveBeenCalledWith({ title: 'song', text: 'song — artist' })
  })

  it('falls back to the clipboard when there is no Web Share API', async () => {
    const writeText = vi.fn(async () => undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })

    await shareTrack(track())

    expect(writeText).toHaveBeenCalledWith('song — artist')
  })

  it('falls back to the clipboard when sharing fails for a reason other than the user cancelling', async () => {
    const share = vi.fn(async () => {
      throw new Error('share sheet unavailable')
    })
    const writeText = vi.fn(async () => undefined)
    vi.stubGlobal('navigator', { share, clipboard: { writeText } })

    await shareTrack(track())

    expect(writeText).toHaveBeenCalledWith('song — artist')
  })

  it('does nothing further when the user cancels the share sheet', async () => {
    const share = vi.fn(async () => {
      throw Object.assign(new Error('cancelled'), { name: 'AbortError' })
    })
    const writeText = vi.fn(async () => undefined)
    vi.stubGlobal('navigator', { share, clipboard: { writeText } })

    await shareTrack(track())

    expect(writeText).not.toHaveBeenCalled()
  })
})
