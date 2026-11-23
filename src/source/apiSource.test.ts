import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiSource, searchRadioStations } from './apiSource'

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, status: ok ? 200 : 500, json: async () => body } as Response
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('apiSource.search', () => {
  it('returns empty, and never calls Piped, when Audius has no results', async () => {
    const urls: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        urls.push(url)
        return jsonResponse({ data: [] })
      }),
    )

    expect(await apiSource.search('some song')).toEqual([])
    expect(urls.some((u) => u.includes('pipedapi'))).toBe(false)
  })

  it('returns Audius results directly', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({ data: [{ id: 'xyz', title: 'Song', user: { name: 'Artist' }, duration: 200 }] }),
      ),
    )

    expect(await apiSource.search('some song')).toEqual([
      { id: 'audius:xyz', title: 'Song', artist: 'Artist', durationSec: 200, artworkUrl: undefined },
    ])
  })

  it('returns nothing for an empty query, with no network call at all', async () => {
    // Browsing "everything" is Home's job (homeRows), which needs the
    // per-country chart rows a flat Track[] can't carry. search('') used to
    // silently re-run that whole fan-out — 6 YouTube quota units — every time
    // Search opened, duplicating work Home had already paid for.
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    expect(await apiSource.search('')).toEqual([])
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('ranks every YouTube result ahead of every Audius one', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url.startsWith('/api/youtube/search')
          ? jsonResponse({
              items: [
                { videoId: 'yt1', title: 'Yt song one', channelTitle: 'Chan' },
                { videoId: 'yt2', title: 'Yt song two', channelTitle: 'Chan' },
              ],
            })
          : jsonResponse({
              data: [
                { id: 'a1', title: 'Song one', user: { name: 'Artist' }, duration: 200 },
                { id: 'a2', title: 'Song two', user: { name: 'Artist' }, duration: 200 },
              ],
            }),
      ),
    )

    expect((await apiSource.search('some song')).map((t) => t.id)).toEqual([
      'youtube:yt1',
      'youtube:yt2',
      'audius:a1',
      'audius:a2',
    ])
  })

  it('reorders YouTube results so a cover drops behind the original, without otherwise reshuffling relevance order', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url.startsWith('/api/youtube/search')
          ? jsonResponse({
              items: [
                { videoId: 'cover1', title: 'Perfect (Acoustic Cover)', channelTitle: 'Random Covers Channel' },
                { videoId: 'unrelated', title: 'Perfect Day', channelTitle: 'Some Channel' },
                { videoId: 'official1', title: 'Perfect', channelTitle: 'Ed SheeranVEVO' },
              ],
            })
          : jsonResponse({ data: [] }),
      ),
    )

    expect((await apiSource.search('perfect ed sheeran')).map((t) => t.id)).toEqual([
      'youtube:official1',
      'youtube:unrelated',
      'youtube:cover1',
    ])
  })

  it('does not mistake "coverage" or "recovery" in a title for a cover', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url.startsWith('/api/youtube/search')
          ? jsonResponse({
              items: [
                { videoId: 'a', title: 'News coverage of the concert', channelTitle: 'News Co' },
                { videoId: 'b', title: 'A song about recovery', channelTitle: 'Some Artist' },
              ],
            })
          : jsonResponse({ data: [] }),
      ),
    )

    expect((await apiSource.search('whatever')).map((t) => t.id)).toEqual(['youtube:a', 'youtube:b'])
  })

  it('gives an "Official Video"/"Official Audio" title top priority, even over an otherwise-authoritative channel', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url.startsWith('/api/youtube/search')
          ? jsonResponse({
              items: [
                { videoId: 'topic', title: 'Counting Stars', channelTitle: 'OneRepublic - Topic' },
                { videoId: 'official', title: 'OneRepublic - Counting Stars (Official Music Video)', channelTitle: 'OneRepublic' },
              ],
            })
          : jsonResponse({ data: [] }),
      ),
    )

    expect((await apiSource.search('counting stars')).map((t) => t.id)).toEqual([
      'youtube:official',
      'youtube:topic',
    ])
  })

  it('pushes a "remix"/"edit" tag down, same as a cover', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url.startsWith('/api/youtube/search')
          ? jsonResponse({
              items: [
                { videoId: 'remix', title: 'Counting Stars (DJ Remix Edit)', channelTitle: 'Some DJ' },
                { videoId: 'plain', title: 'Counting Stars', channelTitle: 'A Fan Channel' },
              ],
            })
          : jsonResponse({ data: [] }),
      ),
    )

    expect((await apiSource.search('counting stars')).map((t) => t.id)).toEqual(['youtube:plain', 'youtube:remix'])
  })

  it('breaks a tie between two same-tier results in favor of the one echoing more of the typed words', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url.startsWith('/api/youtube/search')
          ? jsonResponse({
              items: [
                { videoId: 'loose', title: 'A completely different song', channelTitle: 'Channel A' },
                { videoId: 'close', title: 'Kalank Title Track', channelTitle: 'Channel B' },
              ],
            })
          : jsonResponse({ data: [] }),
      ),
    )

    expect((await apiSource.search('kalank title song')).map((t) => t.id)).toEqual(['youtube:close', 'youtube:loose'])
  })
})

describe('apiSource.getTrack with a malformed id', () => {
  it('rejects an id with no backend prefix instead of silently misreading it', async () => {
    // Regression: indexOf(':') returning -1 for a colon-less id used to fall
    // through to slice(0, -1) ("drop the last char", not "not found"), so
    // "audiusX" read as backend "audius" with the whole string as its raw id.
    await expect(apiSource.getTrack('audiusX')).rejects.toThrow('unknown track id audiusX')
  })
})

describe('apiSource.getStreamUrl', () => {
  it('returns the direct Audius stream endpoint with no network call', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    expect(await apiSource.getStreamUrl('audius:abc123')).toBe(
      'https://api.audius.co/v1/tracks/abc123/stream?app_name=spothub',
    )
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('picks the highest-bitrate Piped audio stream', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          title: 't',
          uploader: 'u',
          thumbnailUrl: 'th',
          duration: 1,
          audioStreams: [
            { url: 'low', bitrate: 64000 },
            { url: 'high', bitrate: 160000 },
          ],
        }),
      ),
    )

    expect(await apiSource.getStreamUrl('piped:abc123')).toBe('high')
  })

  it('streams YouTube through our own route, with no lookup from the browser', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    expect(await apiSource.getStreamUrl('youtube:abcdefghijk')).toBe('/api/youtube/audio?v=abcdefghijk')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('resolves a radio station by looking it up again', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse([
          {
            stationuuid: 'uuid-1',
            name: 'Test FM',
            url_resolved: 'https://stream.example/live',
            tags: 'pop',
            country: 'Testland',
            favicon: '',
          },
        ]),
      ),
    )

    expect(await apiSource.getStreamUrl('radio:uuid-1')).toBe('https://stream.example/live')
  })
})

describe('searchRadioStations', () => {
  it('drops http:// stations — mixed content fails silently from an https app', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse([
          { stationuuid: 'a', name: 'Secure', url_resolved: 'https://ok.example/', tags: '', country: '', favicon: '' },
          { stationuuid: 'b', name: 'Insecure', url_resolved: 'http://bad.example/', tags: '', country: '', favicon: '' },
        ]),
      ),
    )

    const results = await searchRadioStations('')

    expect(results).toHaveLength(1)
    expect(results[0]?.id).toBe('radio:a')
  })

  it('searches by name when a query is given, browses top stations otherwise', async () => {
    const urls: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        urls.push(url)
        return jsonResponse([])
      }),
    )

    await searchRadioStations('jazz')
    await searchRadioStations('')

    expect(urls[0]).toContain('/stations/search?name=jazz')
    expect(urls[1]).toContain('/stations/topclick/30')
  })
})

describe('apiSource.getLyrics', () => {
  function stubFetch(handlers: { oembed?: unknown; get?: Response | null; search?: unknown[] }): void {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('oembed')) return jsonResponse(handlers.oembed ?? { title: 'Song', author_name: 'Artist' })
        if (url.includes('/lyrics')) return jsonResponse({ error: 'not configured' }, false)
        if (url.includes('/api/get')) {
          if (handlers.get === null) return jsonResponse({}, false) // 404
          return handlers.get ?? jsonResponse({})
        }
        if (url.includes('/api/search')) return jsonResponse(handlers.search ?? [])
        throw new Error(`unexpected fetch ${url}`)
      }),
    )
  }

  it('uses the exact LRCLIB match when the title is clean, with no fuzzy search', async () => {
    const fetchSpy = vi.fn(async (url: string) => {
      if (url.includes('oembed')) return jsonResponse({ title: 'Song', author_name: 'Artist' })
      if (url.includes('/api/get')) return jsonResponse({ syncedLyrics: '[00:01.00]hi' })
      throw new Error(`unexpected fetch ${url}`)
    })
    vi.stubGlobal('fetch', fetchSpy)

    expect(await apiSource.getLyrics('youtube:abcdefghijk')).toEqual({ kind: 'lrc', text: '[00:01.00]hi' })
    expect(fetchSpy.mock.calls.filter((c) => String(c[0]).includes('lrclib')).map((c) => c[0])).toHaveLength(1)
  })

  it('falls back to a fuzzy search when the messy YouTube title has no exact match', async () => {
    // this is the real shape of a youtube: track's resolved title/artist
    stubFetch({
      oembed: { title: 'Daft Punk - Instant Crush (Official Video) ft. Julian Casablancas', author_name: 'DaftPunkVEVO' },
      get: null, // LRCLIB /get 404s on a title this messy
      search: [{ plainLyrics: 'line one\nline two' }],
    })

    expect(await apiSource.getLyrics('youtube:abcdefghijk')).toEqual({ kind: 'plain', text: 'line one\nline two' })
  })

  it('strips bracketed/ft. noise and a VEVO suffix before querying LRCLIB', async () => {
    const getUrls: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('oembed')) {
          return jsonResponse({
            title: 'Daft Punk - Instant Crush (Official Video) ft. Julian Casablancas',
            author_name: 'DaftPunkVEVO',
          })
        }
        if (url.includes('/lyrics')) return jsonResponse({ error: 'not configured' }, false)
        if (url.includes('/api/get')) {
          getUrls.push(url)
          return jsonResponse({ syncedLyrics: '[00:01.00]hi' })
        }
        throw new Error(`unexpected fetch ${url}`)
      }),
    )

    await apiSource.getLyrics('youtube:abcdefghijk')

    const params = new URL(getUrls[0]!).searchParams
    expect(params.get('track_name')).toBe('Daft Punk - Instant Crush')
    expect(params.get('artist_name')).toBe('DaftPunk')
  })

  it('never reassigns title/artist from a dash, so a non-bracketed suffix cannot swap them', async () => {
    // a past version tried to split "Artist - Title"; a title shaped like
    // this made it swap them instead — it must now never even attempt that.
    const getUrls: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('oembed')) return jsonResponse({ title: 'Shape of You - Official Video', author_name: 'Ed Sheeran' })
        if (url.includes('/lyrics')) return jsonResponse({ error: 'not configured' }, false)
        if (url.includes('/api/get')) {
          getUrls.push(url)
          return jsonResponse({}, false)
        }
        if (url.includes('/api/search')) return jsonResponse([])
        throw new Error(`unexpected fetch ${url}`)
      }),
    )

    await apiSource.getLyrics('youtube:abcdefghijk')

    const params = new URL(getUrls[0]!).searchParams
    expect(params.get('artist_name')).toBe('Ed Sheeran')
    expect(params.get('track_name')).toBe('Shape of You - Official Video')
  })

  it('retries the fuzzy search with just the song name when the full credits-laden title finds nothing', async () => {
    // the real shape of a Bollywood channel's title — "Song - Tag | Cast |
    // Singer | Composer" — verified live against LRCLIB: the full string
    // (title + all those credits) returns zero results; "Kalank Title Track"
    // alone finds the song immediately.
    const searchQueries: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('oembed')) {
          return jsonResponse({
            title: 'Kalank Title Track - Lyrical | Alia Bhatt , Varun Dhawan | Arijit Singh | Pritam| Amitabh',
            author_name: 'Zee Music Company',
          })
        }
        if (url.includes('/lyrics')) return jsonResponse({ error: 'not configured' }, false)
        if (url.includes('/api/get')) return jsonResponse({}, false)
        if (url.includes('/api/search')) {
          const q = new URL(url).searchParams.get('q') ?? ''
          searchQueries.push(q)
          return jsonResponse(q === 'Kalank Title Track' ? [{ plainLyrics: 'kalank lyrics' }] : [])
        }
        throw new Error(`unexpected fetch ${url}`)
      }),
    )

    const result = await apiSource.getLyrics('youtube:abcdefghijk')

    expect(result).toEqual({ kind: 'plain', text: 'kalank lyrics' })
    expect(searchQueries).toHaveLength(2)
    expect(searchQueries[0]).toContain('Alia Bhatt')
    expect(searchQueries[1]).toBe('Kalank Title Track')
  })

  it('returns null, not a throw, when neither LRCLIB path has anything', async () => {
    stubFetch({ get: null, search: [] })

    expect(await apiSource.getLyrics('youtube:abcdefghijk')).toBeNull()
  })
})
