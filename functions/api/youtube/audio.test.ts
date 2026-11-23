import { afterEach, describe, expect, it, vi } from 'vitest'
import { onRequestGet } from './audio'

const env = {
  APP_ORIGIN: 'https://app.example',
  EXTRACTOR_URL: 'https://box.example/',
  EXTRACTOR_TOKEN: 'secret',
}

const audioRequest = (query = '?v=abcdefghijk', headers: Record<string, string> = {}): Request =>
  new Request(`https://app.example/api/youtube/audio${query}`, {
    headers: { Origin: env.APP_ORIGIN, ...headers },
  })

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

  it('says so plainly when no extractor is configured', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const response = await onRequestGet({ request: audioRequest(), env: { APP_ORIGIN: env.APP_ORIGIN } })

    expect(response.status).toBe(503)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('keeps the extractor token off the browser and forwards Range', async () => {
    const fetchSpy = vi.fn<typeof fetch>(
      async () =>
        new Response('bytes', {
          status: 206,
          headers: { 'Content-Type': 'audio/mp4', 'Content-Range': 'bytes 0-4/5' },
        }),
    )
    vi.stubGlobal('fetch', fetchSpy)

    const response = await onRequestGet({ request: audioRequest('?v=abcdefghijk', { Range: 'bytes=0-4' }), env })
    const [url, init] = fetchSpy.mock.calls[0] ?? []
    const sent = new Headers(init?.headers)

    expect(url).toBe('https://box.example/audio?v=abcdefghijk')
    expect(sent.get('Authorization')).toBe('Bearer secret')
    expect(sent.get('Range')).toBe('bytes=0-4')

    expect(response.status).toBe(206)
    expect(response.headers.get('Content-Type')).toBe('audio/mp4')
    expect(response.headers.get('Content-Range')).toBe('bytes 0-4/5')
    expect(response.headers.get('Accept-Ranges')).toBe('bytes')
    // the browser must never learn where the box is or how to talk to it
    expect(await response.text()).toBe('bytes')
  })

  it('reports an extractor failure instead of handing the player an empty body', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => new Response('nope', { status: 502 })))

    expect((await onRequestGet({ request: audioRequest(), env })).status).toBe(502)
  })

  it('accepts any origin in a comma-separated APP_ORIGIN list', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => new Response('bytes', { status: 200 })))

    const response = await onRequestGet({
      request: audioRequest('?v=abcdefghijk', { Origin: 'https://other.example' }),
      env: { ...env, APP_ORIGIN: `${env.APP_ORIGIN}, https://other.example` },
    })

    expect(response.status).toBe(200)
  })
})
