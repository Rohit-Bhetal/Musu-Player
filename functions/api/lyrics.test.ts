import { afterEach, describe, expect, it, vi } from 'vitest'
import { onRequestGet } from './lyrics'

const env = { APP_ORIGIN: 'https://app.example', LYRICA_URL: 'http://box.example:9999' }

const lyricsRequest = (query = '?artist=Coldplay&song=Yellow'): Request =>
  new Request(`https://app.example/api/lyrics${query}`, { headers: { Origin: env.APP_ORIGIN } })

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('the lyrics route', () => {
  it('503s with no network call when no Lyrica instance is configured', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const response = await onRequestGet({ request: lyricsRequest(), env: { APP_ORIGIN: env.APP_ORIGIN } })

    expect(response.status).toBe(503)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('converts timed lyrics into LRC text the existing parser already understands', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          status: 'success',
          data: {
            hasTimestamps: true,
            timed_lyrics: [
              { text: 'first line', start_time: 1000 },
              { text: 'second line', start_time: 61_500 },
            ],
          },
        }),
      ),
    )

    const response = await onRequestGet({ request: lyricsRequest(), env })
    const body = (await response.json()) as { kind: string; text: string }

    expect(response.status).toBe(200)
    expect(body.kind).toBe('lrc')
    expect(body.text).toBe('[00:01.00]first line\n[01:01.50]second line')
  })

  it('falls back to plain text when the source has no timestamps', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({ status: 'success', data: { hasTimestamps: false, lyrics: 'a\nb' } }),
      ),
    )

    expect(await (await onRequestGet({ request: lyricsRequest(), env })).json()).toEqual({
      kind: 'plain',
      text: 'a\nb',
    })
  })

  it('reports 404 when Lyrica has nothing for this track', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ status: 'success', data: {} })))

    expect((await onRequestGet({ request: lyricsRequest(), env })).status).toBe(404)
  })

  it('requires both an artist and a song title', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    expect((await onRequestGet({ request: lyricsRequest('?artist=Coldplay'), env })).status).toBe(400)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('rejects a different origin', async () => {
    const response = await onRequestGet({
      request: new Request('https://app.example/api/lyrics?artist=a&song=b', {
        headers: { Origin: 'https://evil.example' },
      }),
      env,
    })
    expect(response.status).toBe(403)
  })

  it('accepts any origin in a comma-separated APP_ORIGIN list', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ status: 'success', data: { lyrics: 'a' } })))

    const response = await onRequestGet({
      request: new Request('https://app.example/api/lyrics?artist=a&song=b', {
        headers: { Origin: 'https://other.example' },
      }),
      env: { ...env, APP_ORIGIN: 'https://app.example, https://other.example' },
    })

    expect(response.status).toBe(200)
  })
})
