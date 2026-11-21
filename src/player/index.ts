import { source } from '../source'
import { PlayerEngine } from './PlayerEngine'

export const player = new PlayerEngine({
  resolveUrl: async (track) => ({ url: await source.getStreamUrl(track.id), revoke: false }),
  // P3 replaces this with the downloaded 512x512 artwork blob
  resolveArtwork: async () => null,
})

// at module scope, not in an effect: StrictMode would otherwise restore twice
void player.restore()
