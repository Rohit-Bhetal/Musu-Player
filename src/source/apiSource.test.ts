import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiSource } from './apiSource'

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, status: ok ? 200 : 500, json: async () => body } as Response
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('apiSource.search', () => {
  it('falls back to Piped when Audius has no results', async () => {
    const urls: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        urls.push(url)
        if (url.includes('api.audius.co')) return jsonResponse({ data: [] })
        return jsonResponse({
          items: [
            {
              url: '/watch?v=abc123',
              title: 'Song',
              uploaderName: 'Artist',
              thumbnail: 'art.jpg',
              duration: 200,
              type: 'stream',
            },
          ],
        })
      }),
    )

    const results = await apiSource.search('some song')

    expect(results).toEqual([
      { id: 'piped:abc123', title: 'Song', artist: 'Artist', durationSec: 200, artworkUrl: 'art.jpg' },
    ])
    expect(urls.some((u) => u.includes('api.audius.co'))).toBe(true)
    expect(urls.some((u) => u.includes('pipedapi.kavin.rocks'))).toBe(true)
  })

  it('skips Piped when Audius already has a match', async () => {
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
})
