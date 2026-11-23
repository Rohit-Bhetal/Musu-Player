export interface Track {
  id: string
  title: string
  artist: string
  album?: string
  durationSec?: number
  artworkUrl?: string
}

export interface Lyrics {
  kind: 'lrc' | 'plain'
  text: string
}

export interface MusicSource {
  /** An empty query may return nothing — `mockSource` lists everything browsable
   * with it, but `apiSource` leaves browsing to Home (src/ui/home.ts:homeRows),
   * which needs the per-country chart structure a flat Track[] can't carry. */
  search(query: string): Promise<Track[]>
  getTrack(id: string): Promise<Track>
  getStreamUrl(id: string): Promise<string>
  getArtworkUrl(id: string, size: number): Promise<string | null>
  getLyrics(id: string): Promise<Lyrics | null>
  listAlbum?(id: string): Promise<Track[]>
  listPlaylist?(id: string): Promise<Track[]>
}
