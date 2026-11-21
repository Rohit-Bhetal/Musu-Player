import { afterEach, describe, expect, it, vi } from 'vitest'
import { onRequestPost } from './player'

const env = { APP_ORIGIN: 'https://app.example' }

function playerRequest(origin = env.APP_ORIGIN): Request {
  return new Request('https://app.example/api/youtubei/v1/player', {
    method: 'POST',
    headers: {
      Origin: origin,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      videoId: 'abcdefghijk',
      context: { client: { clientName: 'MWEB' } },
    }),
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('YTM Pages proxy', () => {
  it('only accepts the configured app origin', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const response = await onRequestPost({
      request: playerRequest('https://untrusted.example'),
      env,
    })

    expect(response.status).toBe(403)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('adds mobile-client headers and forwards the player payload', async () => {
    const fetchSpy = vi.fn<typeof fetch>(async () =>
      Response.json({ playabilityStatus: { status: 'OK' } }),
    )
    vi.stubGlobal('fetch', fetchSpy)

    const response = await onRequestPost({ request: playerRequest(), env })
    const [url, init] = fetchSpy.mock.calls[0] ?? []
    const headers = new Headers(init?.headers)

    expect(response.status).toBe(200)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(env.APP_ORIGIN)
    expect(url).toBe('https://music.youtube.com/youtubei/v1/player')
    expect(headers.get('User-Agent')).toContain('Android 12')
    expect(headers.get('X-Youtube-Client-Name')).toBe('15')
    expect(JSON.parse(String(init?.body))).toMatchObject({ videoId: 'abcdefghijk' })
  })
})
