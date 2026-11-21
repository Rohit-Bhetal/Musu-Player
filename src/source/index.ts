import type { MusicSource } from './MusicSource'
import { mockSource } from './mockSource'

/**
 * mockSource until the catalogue question in docs/MUSIC_SOURCE.md is answered.
 *
 * apiSource (Audius + Piped) is written and tested, and switching is this one
 * line — but do NOT flip it without deciding two things first:
 *
 *  1. Piped resolves to googlevideo URLs that send no CORS headers. They play
 *     as <audio src>, but cannot be fetch()ed into a Blob, so songs from that
 *     path can never be downloaded for offline use — the whole point of the app.
 *  2. The Piped path carries YouTube-ToS risk on a public deployment.
 *
 * P3-P5 are also meant to be built against this source: generated tones, no
 * network, deterministic, so the download pipeline can be tested offline.
 */
export const source: MusicSource = mockSource
