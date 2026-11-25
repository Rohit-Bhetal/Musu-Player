import { afterEach, describe, expect, it, vi } from 'vitest'
import { onRequestGet } from './audio'

const env = { APP_ORIGIN: 'https://app.example' }

const audioRequest = (query = '?v=abcdefghijk', headers: Record<string, string> = {}): Request =>
  new Request(`https://app.example/api/youtube/audio${query}`, {
    headers: { Origin: env.APP_ORIGIN, ...headers },
  })

const urlOf = (input: RequestInfo | URL): string =>
  typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url

// Routes a fetch call by substring match against the request URL — lets each
// test describe only the hosts it cares about without assuming call order.
function fetchRouter(routes: Record<string, (init?: RequestInit) => Response | Promise<Response>>) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = urlOf(input)
    const route = Object.entries(routes).find(([pattern]) => url.includes(pattern))
    if (!route) throw new Error(`unmocked fetch: ${url}`)
    return route[1](init)
  })
}

const streamsOk = (body: { audioStreams?: object[]; videoStreams?: object[] }) =>
  async () => Response.json(body)

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('the audio route', () => {
  it('refuses anything that is not an 11-character video id', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    expect((await onRequestGet({ request: audioRequest('?v=../etc'), env })).status).toBe(400)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('resolves via Piped and forwards Range straight through to the media fetch', async () => {
    vi.stubGlobal(
      'fetch',
      fetchRouter({
        'piped-instances.kavin.rocks': async () => Response.json([{ api_url: 'https://inst.example' }]),
        'inst.example/streams/abcdefghijk': streamsOk({ videoStreams: [{ url: 'https://media.example/v.mp4', format: 'MPEG_4' }] }),
        'media.example/v.mp4': async (init) => {
          expect(new Headers(init?.headers).get('Range')).toBe('bytes=0-4')
          return new Response('bytes', {
            status: 206,
            headers: { 'Content-Type': 'video/mp4', 'Content-Range': 'bytes 0-4/5' },
          })
        },
      }),
    )

    const response = await onRequestGet({ request: audioRequest('?v=abcdefghijk', { Range: 'bytes=0-4' }), env })

    expect(response.status).toBe(206)
    expect(response.headers.get('Content-Range')).toBe('bytes 0-4/5')
    expect(await response.text()).toBe('bytes')
  })

  it('prefers an audio-only stream over a muxed video one when both are offered', async () => {
    vi.stubGlobal(
      'fetch',
      fetchRouter({
        'piped-instances.kavin.rocks': async () => Response.json([{ api_url: 'https://inst.example' }]),
        'inst.example/streams/abcdefghijk': streamsOk({
          audioStreams: [{ url: 'https://media.example/audio.m4a' }],
          videoStreams: [{ url: 'https://media.example/v.mp4', format: 'MPEG_4' }],
        }),
        'media.example/audio.m4a': async () => new Response('bytes', { status: 200, headers: { 'Content-Type': 'audio/mp4' } }),
      }),
    )

    const response = await onRequestGet({ request: audioRequest(), env })

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('audio/mp4')
  })

  it('moves on to the next instance when one fails to resolve the track', async () => {
    vi.stubGlobal(
      'fetch',
      fetchRouter({
        'piped-instances.kavin.rocks': async () => Response.json([{ api_url: 'https://dead.example' }, { api_url: 'https://inst.example' }]),
        'dead.example/streams/abcdefghijk': async () => new Response('nope', { status: 502 }),
        'inst.example/streams/abcdefghijk': streamsOk({ videoStreams: [{ url: 'https://media.example/v.mp4', format: 'MPEG_4' }] }),
        'media.example/v.mp4': async () => new Response('bytes', { status: 200, headers: { 'Content-Type': 'video/mp4' } }),
      }),
    )

    const response = await onRequestGet({ request: audioRequest(), env })

    expect(response.status).toBe(200)
    expect(await response.text()).toBe('bytes')
  })

  it('only tries up to MAX_ATTEMPTS instances before giving up', async () => {
    const attempted = new Set<string>()
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = urlOf(input)
        if (url.includes('piped-instances.kavin.rocks')) {
          return Response.json(Array.from({ length: 20 }, (_, i) => ({ api_url: `https://inst${i}.example` })))
        }
        attempted.add(new URL(url).host)
        return new Response('nope', { status: 502 })
      }),
    )

    const response = await onRequestGet({ request: audioRequest(), env })

    expect(response.status).toBe(502)
    expect(attempted.size).toBeLessThanOrEqual(8)
  })

  it('falls back to the hardcoded instance list when the live list cannot be fetched at all', async () => {
    vi.stubGlobal(
      'fetch',
      fetchRouter({
        'piped-instances.kavin.rocks': async () => {
          throw new Error('network down')
        },
        '/streams/abcdefghijk': streamsOk({ videoStreams: [{ url: 'https://media.example/v.mp4', format: 'MPEG_4' }] }),
        'media.example/v.mp4': async () => new Response('bytes', { status: 200, headers: { 'Content-Type': 'video/mp4' } }),
      }),
    )

    const response = await onRequestGet({ request: audioRequest(), env })

    expect(response.status).toBe(200)
  })

  it('reports it plainly when no instance can resolve the track', async () => {
    vi.stubGlobal(
      'fetch',
      fetchRouter({
        'piped-instances.kavin.rocks': async () => Response.json([{ api_url: 'https://dead.example' }]),
        '/streams/': async () => new Response('nope', { status: 502 }),
      }),
    )

    const response = await onRequestGet({ request: audioRequest(), env })

    expect(response.status).toBe(502)
  })

  it('accepts any origin in a comma-separated APP_ORIGIN list', async () => {
    vi.stubGlobal(
      'fetch',
      fetchRouter({
        'piped-instances.kavin.rocks': async () => Response.json([{ api_url: 'https://inst.example' }]),
        'inst.example/streams/abcdefghijk': streamsOk({ videoStreams: [{ url: 'https://media.example/v.mp4', format: 'MPEG_4' }] }),
        'media.example/v.mp4': async () => new Response('bytes', { status: 200 }),
      }),
    )

    const response = await onRequestGet({
      request: audioRequest('?v=abcdefghijk', { Origin: 'https://other.example' }),
      env: { APP_ORIGIN: `${env.APP_ORIGIN}, https://other.example` },
    })

    expect(response.status).toBe(200)
  })
})
