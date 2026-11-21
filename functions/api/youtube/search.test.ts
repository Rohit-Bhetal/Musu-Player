import { afterEach, describe, expect, it, vi } from 'vitest'
import { onRequestGet } from './search'

const env = {
  APP_ORIGIN: 'http://localhost:8788',
  YOUTUBE_API_KEY: 'server-secret',
}

function request(query = 'ambient jazz', origin = env.APP_ORIGIN): Request {
  return new Request(`${env.APP_ORIGIN}/api/youtube/search?q=${encodeURIComponent(query)}`, {
    headers: { Origin: origin },
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('YouTube search Pages Function', () => {
  it('uses the official embeddable-video search API without exposing the key', async () => {
    const fetchSpy = vi.fn<typeof fetch>(async () =>
      Response.json({
        items: [
          {
            id: { videoId: 'abcdefghijk' },
            snippet: {
              title: 'Ambient jazz',
              channelTitle: 'Example channel',
              thumbnails: { medium: { url: 'https://img.example/thumb.jpg' } },
            },
          },
        ],
      }),
    )
    vi.stubGlobal('fetch', fetchSpy)

    const response = await onRequestGet({ request: request(), env })
    const [url] = fetchSpy.mock.calls[0] ?? []
    const upstreamUrl = new URL(String(url))
    const result = await response.json()

    expect(response.status).toBe(200)
    expect(upstreamUrl.origin).toBe('https://www.googleapis.com')
    expect(upstreamUrl.searchParams.get('key')).toBe('server-secret')
    expect(upstreamUrl.searchParams.get('videoEmbeddable')).toBe('true')
    expect(result).toEqual({
      items: [
        {
          videoId: 'abcdefghijk',
          title: 'Ambient jazz',
          channelTitle: 'Example channel',
          thumbnailUrl: 'https://img.example/thumb.jpg',
        },
      ],
    })
  })

  it('rejects a different origin without making an upstream request', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const response = await onRequestGet({
      request: request('ambient jazz', 'https://other.example'),
      env,
    })

    expect(response.status).toBe(403)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('requires an API key and a bounded query', async () => {
    const noKeyResponse = await onRequestGet({
      request: request(),
      env: { APP_ORIGIN: env.APP_ORIGIN },
    })
    const shortQueryResponse = await onRequestGet({
      request: request('a'),
      env,
    })

    expect(noKeyResponse.status).toBe(503)
    expect(shortQueryResponse.status).toBe(400)
  })
})
