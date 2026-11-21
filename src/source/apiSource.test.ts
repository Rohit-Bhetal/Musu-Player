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
