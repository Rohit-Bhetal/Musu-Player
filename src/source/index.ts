import type { MusicSource } from './MusicSource'
import { apiSource } from './apiSource'

/**
 * apiSource is Audius-only, live — see docs/MUSIC_SOURCE.md. Its Piped
 * fallback is kept in the file but disabled: googlevideo sends no CORS
 * headers on the audio bytes, so nothing from that path can ever be
 * downloaded for offline use, which rules it out regardless of the
 * YouTube-ToS question.
 *
 * P3-P5 (the download pipeline) may still be worth building/testing against
 * mockSource first — swap back to it here for that: deterministic, no network.
 */
export const source: MusicSource = apiSource
