import type { MusicSource } from './MusicSource'
import { apiSource } from './apiSource'

/**
 * One live source for every screen: Audius + YouTube + Radio Browser, told
 * apart by an id prefix — see docs/MUSIC_SOURCE.md. youtube: ids need the
 * extractor box behind /api/youtube/audio; the rest need nothing but network.
 *
 * P3-P5 (the download pipeline) may still be worth building/testing against
 * mockSource first — swap back to it here for that: deterministic, no network.
 */
export const source: MusicSource = apiSource
