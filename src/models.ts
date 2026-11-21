export interface StreamFormat {
  mimeType: string
  bitrate: number
  url: string | null
  cipher?: string
  signatureCipher?: string
  initRange?: string
  indexRange?: string
  averageBitrate?: number
  contentLength?: string
  quality?: 'tiny' | 'small' | 'medium' | 'large' | 'hd720' | 'hd1080' | 'highres' | 'audio'
  height?: number
  width?: number
  audioQuality?: 'AUDIO_QUALITY_LOW' | 'AUDIO_QUALITY_MEDIUM' | 'AUDIO_QUALITY_HIGH'
  lastModified?: string
  approxDurationMs?: string
}

export interface StreamInfo {
  videoId: string
  title: string
  artist: string
  album: string | null
  thumbnails: string[]
  formats: StreamFormat[]
  expiresInSeconds: number
}

export interface PlayerResponse {
  playabilityStatus: {
    status: string
    reason?: string
  }
  streamingData?: {
    expiresInSeconds?: string
    adaptiveFormats?: StreamFormat[]
    formats?: StreamFormat[]
  }
  videoDetails?: {
    videoId: string
    title: string
    lengthSeconds: string
    channelTitle: string
    thumbnail?: {
      thumbnails: { url: string }[]
    }
  }
  playbackTracking?: {
    baseUrl: string
  }
  trackingUrl?: string
}
