import type { MusicSource } from './MusicSource'
import { mockSource } from './mockSource'

/** Swap for apiSource once a real backend is wired up (see docs/MUSIC_SOURCE.md). */
export const source: MusicSource = mockSource
