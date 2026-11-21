import { afterEach, describe, expect, it, vi } from 'vitest'
import { getPlayerResponse, YTM_PLAYER_PROXY_PATH } from './YtmPlayerService'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('getPlayerResponse', () => {
  it('sends the mobile context to the same-origin proxy without spoofing browser headers', async () => {
    const fetchSpy = vi.fn<typeof fetch>(async () =>
      Response.json({ playabilityStatus: { status: 'OK' } }),
    )
    vi.stubGlobal('fetch', fetchSpy)

    await getPlayerResponse('abcdefghijk', 'visitor-token')

    const [url, init] = fetchSpy.mock.calls[0] ?? []
    const payload = JSON.parse(String(init?.body))

    expect(url).toBe(YTM_PLAYER_PROXY_PATH)
    expect(new Headers(init?.headers).get('User-Agent')).toBeNull()
    expect(payload).toMatchObject({
      videoId: 'abcdefghijk',
      context: { client: { clientName: 'MWEB', visitorData: 'visitor-token' } },
    })
  })
})
