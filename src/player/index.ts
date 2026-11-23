import { source } from '../source'
import { downloadedArtworkUrl, downloadedAudioUrl, initDownloads } from '../storage/downloads'
import { PlayerEngine } from './PlayerEngine'

export const player = new PlayerEngine({
  // A downloaded copy wins: it plays with no network and costs no bandwidth.
  resolveUrl: async (track) => {
    const local = await downloadedAudioUrl(track.id)
    if (local) return { url: local, revoke: true }
    return { url: await source.getStreamUrl(track.id), revoke: false }
  },
  resolveArtwork: async (track) => {
    const local = await downloadedArtworkUrl(track.id)
    return local ? { url: local, revoke: true } : null
  },
})

// at module scope, not in an effect: StrictMode would otherwise restore twice.
// Downloads load first so restore() can find a downloaded track's blob.
void initDownloads().then(() => player.restore())
