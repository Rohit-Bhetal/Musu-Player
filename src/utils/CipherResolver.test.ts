import { describe, expect, it } from 'vitest'
import { resolveAllCiphers, resolveCipher } from './CipherResolver'

describe('CipherResolver', () => {
  it('resolves a signature and defaults to the signature parameter', () => {
    expect(
      resolveCipher(
        'url=https%3A%2F%2Fvideo.example%2Faudio&sp=sig&s=abc',
        (signature) => `resolved-${signature}`,
      ),
    ).toBe('https://video.example/audio?sig=resolved-abc')
  })

  it('resolves all ciphered formats and preserves direct URLs', () => {
    const formats = [
      {
        mimeType: 'audio/mp4',
        bitrate: 128000,
        url: null,
        signatureCipher: 'url=https%3A%2F%2Fvideo.example%2Faudio&s=abc',
      },
      {
        mimeType: 'audio/webm',
        bitrate: 64000,
        url: 'https://video.example/direct',
      },
    ]

    const resolved = resolveAllCiphers(formats, (signature) => signature.toUpperCase())

    expect(resolved[0]?.url).toBe('https://video.example/audio?signature=ABC')
    expect(resolved[0]?.signatureCipher).toBeUndefined()
    expect(resolved[1]?.url).toBe('https://video.example/direct')
  })
})
