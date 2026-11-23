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

  it('accepts any origin in a comma-separated APP_ORIGIN list', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ items: [] })))

    const response = await onRequestGet({
      request: request('ambient jazz', 'https://other.example'),
      env: { ...env, APP_ORIGIN: `${env.APP_ORIGIN}, https://other.example` },
    })

    expect(response.status).toBe(200)
  })

  const chartRequest = (country?: string): Request => {
    const base = new Request(`${env.APP_ORIGIN}/api/youtube/search?chart=music`, {
      headers: { Origin: env.APP_ORIGIN },
    })
    return country ? Object.assign(base, { cf: { country } }) : base
  }

  /** videos.list returns a plain string id, unlike search.list's nested one. */
  const chartItems = vi.fn<typeof fetch>(async (input) =>
    Response.json({
      items: [
        {
          id: `video-${new URL(String(input)).searchParams.get('regionCode')}`,
          snippet: { title: 'Hit', channelTitle: 'Label' },
        },
      ],
    }),
  )

  const regionsOf = (spy: typeof chartItems): (string | null)[] =>
    spy.mock.calls.map((call) => new URL(String(call[0])).searchParams.get('regionCode'))

  it('browses one chart per country, the listener own first, at 1 quota unit each', async () => {
    const fetchSpy = vi.fn(chartItems)
    vi.stubGlobal('fetch', fetchSpy)

    const response = await onRequestGet({ request: chartRequest('IN'), env })
    const first = new URL(String(fetchSpy.mock.calls[0]?.[0]))

    expect(response.status).toBe(200)
    expect(first.pathname).toBe('/youtube/v3/videos')
    expect(first.searchParams.get('chart')).toBe('mostPopular')
    expect(first.searchParams.get('videoCategoryId')).toBe('10')
    expect(regionsOf(fetchSpy)).toEqual(['IN', 'US', 'GB', 'KR', 'BR'])

    const body = (await response.json()) as { sections: { region: string; items: unknown[] }[] }
    expect(body.sections.map((s) => s.region)).toEqual(['IN', 'US', 'GB', 'KR', 'BR'])
    expect(body.sections[0]?.items).toEqual([
      { videoId: 'video-IN', title: 'Hit', channelTitle: 'Label', thumbnailUrl: undefined },
    ])
  })

  it('never charts the same country twice when the listener is already a default', async () => {
    const fetchSpy = vi.fn(chartItems)
    vi.stubGlobal('fetch', fetchSpy)

    await onRequestGet({ request: chartRequest('GB'), env })

    expect(regionsOf(fetchSpy)).toEqual(['GB', 'US', 'KR', 'BR'])
  })

  it('takes CHART_REGIONS over the listener country, ignoring junk entries', async () => {
    const fetchSpy = vi.fn(chartItems)
    vi.stubGlobal('fetch', fetchSpy)

    await onRequestGet({
      request: chartRequest('IN'),
      env: { ...env, CHART_REGIONS: 'jp, kr ,,not-a-country,KR' },
    })

    expect(regionsOf(fetchSpy)).toEqual(['JP', 'KR'])
  })

  it('falls back to a region when Cloudflare does not say where the caller is', async () => {
    const fetchSpy = vi.fn(chartItems)
    vi.stubGlobal('fetch', fetchSpy)

    await onRequestGet({ request: chartRequest(), env })

    expect(regionsOf(fetchSpy)[0]).toBe('US')
  })

  it('keeps the countries that answered when one chart fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(async (input) =>
        new URL(String(input)).searchParams.get('regionCode') === 'US'
          ? new Response('nope', { status: 500 })
          : chartItems(input),
      ),
    )

    const body = (await onRequestGet({ request: chartRequest('IN'), env })).json() as Promise<{
      sections: { region: string }[]
    }>

    expect((await body).sections.map((s) => s.region)).toEqual(['IN', 'GB', 'KR', 'BR'])
  })

  it('reports an error rather than an empty Home when every chart fails', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => new Response('nope', { status: 500 })))

    expect((await onRequestGet({ request: chartRequest('IN'), env })).status).toBe(502)
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
