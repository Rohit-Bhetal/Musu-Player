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
  /** An empty query must list everything browsable — the Library screen browses with it. */
  search(query: string): Promise<Track[]>
  getTrack(id: string): Promise<Track>
  getStreamUrl(id: string): Promise<string>
  getArtworkUrl(id: string, size: number): Promise<string | null>
  getLyrics(id: string): Promise<Lyrics | null>
  listAlbum?(id: string): Promise<Track[]>
  listPlaylist?(id: string): Promise<Track[]>
}
