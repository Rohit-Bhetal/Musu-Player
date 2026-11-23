import { describe, expect, it } from 'vitest'
import { groupDuplicates } from './groupDuplicates'
import type { Track } from '../source/MusicSource'

const track = (id: string, title: string, artist = 'Someone'): Track => ({ id, title, artist })

describe('groupDuplicates', () => {
  it('keeps unrelated songs in their own, single-track groups', () => {
    const tracks = [track('a', 'Song One'), track('b', 'Song Two')]

    const groups = groupDuplicates(tracks)

    expect(groups).toHaveLength(2)
    expect(groups.map((g) => g.primary.id)).toEqual(['a', 'b'])
    expect(groups.every((g) => g.alternates.length === 0)).toBe(true)
  })

  it('groups an official upload, a lyrics re-post, and a cover under the song they share', () => {
    const tracks = [
      track('official', 'Kalank Title Track - Lyrical | Alia Bhatt , Varun Dhawan | Arijit Singh | Pritam| Amitabh'),
      track('lyrics', 'Kalank Title Track (Lyrics)'),
      track('cover', 'Kalank Title Track (Cover)'),
      track('unrelated', 'A completely different song'),
    ]

    const groups = groupDuplicates(tracks)

    expect(groups).toHaveLength(2)
    expect(groups[0]?.primary.id).toBe('official')
    expect(groups[0]?.alternates.map((a) => a.track.id)).toEqual(['lyrics', 'cover'])
    expect(groups[1]?.primary.id).toBe('unrelated')
  })

  it('keeps the original index, not a group-local one, for onPlay', () => {
    const tracks = [track('a', 'Song'), track('b', 'Other'), track('c', 'Song')]

    const groups = groupDuplicates(tracks)

    expect(groups[0]?.primaryIndex).toBe(0)
    expect(groups[0]?.alternates).toEqual([{ track: tracks[2], index: 2 }])
    expect(groups[1]?.primaryIndex).toBe(1)
  })
})
