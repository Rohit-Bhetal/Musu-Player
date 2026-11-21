import { afterEach, describe, expect, it, vi } from 'vitest'
import { searchYouTubeVideos } from './youtubeSearch'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('searchYouTubeVideos', () => {
  it('calls the same-origin search endpoint and returns its videos', async () => {
    const fetchSpy = vi.fn<typeof fetch>(async () =>
      Response.json({
        items: [{ videoId: 'abcdefghijk', title: 'Ambient jazz', channelTitle: 'Example' }],
      }),
    )
    vi.stubGlobal('fetch', fetchSpy)

    const results = await searchYouTubeVideos('ambient jazz')

    expect(fetchSpy.mock.calls[0]?.[0]).toBe('/api/youtube/search?q=ambient%20jazz')
    expect(results).toEqual([
      { videoId: 'abcdefghijk', title: 'Ambient jazz', channelTitle: 'Example' },
    ])
  })
})
