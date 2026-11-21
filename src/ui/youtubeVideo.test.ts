import { describe, expect, it } from 'vitest'
import { parseYouTubeVideoId } from './youtubeVideo'

describe('parseYouTubeVideoId', () => {
  it('accepts a video ID and common YouTube link shapes', () => {
    expect(parseYouTubeVideoId('abcdefghijk')).toBe('abcdefghijk')
    expect(parseYouTubeVideoId('https://music.youtube.com/watch?v=abcdefghijk&list=PL123')).toBe('abcdefghijk')
    expect(parseYouTubeVideoId('youtu.be/abcdefghijk')).toBe('abcdefghijk')
    expect(parseYouTubeVideoId('https://www.youtube.com/shorts/abcdefghijk')).toBe('abcdefghijk')
  })

  it('rejects non-YouTube hosts and malformed IDs', () => {
    expect(parseYouTubeVideoId('https://youtube.example/watch?v=abcdefghijk')).toBeNull()
    expect(parseYouTubeVideoId('https://youtube.com/watch?v=short')).toBeNull()
    expect(parseYouTubeVideoId('not a video')).toBeNull()
  })
})
