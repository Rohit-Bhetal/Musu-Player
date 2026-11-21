import { useCallback, useEffect, useState } from 'react'
import type { StreamInfo } from '../models'
import { getPlayerResponse } from '../services/YtmPlayerService'
import { resolveAllCiphersAsync } from '../utils/CipherResolver'

// Replace this placeholder once a JS signature decipherer is available.
async function decryptSignature(signature: string): Promise<string> {
  return signature
}

export interface UseYtmStreamResult {
  streamInfo: StreamInfo | null
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
}

export function useYtmStream(videoId: string | null): UseYtmStreamResult {
  const [streamInfo, setStreamInfo] = useState<StreamInfo | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchStream = useCallback(async () => {
    if (!videoId) {
      setStreamInfo(null)
      setError(null)
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    try {
      const response = await getPlayerResponse(videoId)
      const streamingData = response.streamingData
      if (!streamingData) throw new Error('Player response contains no streaming data.')

      const formats = [
        ...(streamingData.adaptiveFormats ?? []),
        ...(streamingData.formats ?? []),
      ]
      const resolvedFormats = await resolveAllCiphersAsync(formats, decryptSignature)

      const audioFormats = resolvedFormats.filter(
        (format) =>
          format.mimeType.includes('audio/') &&
          Boolean(format.url) &&
          !format.url?.includes('.m3u8'),
      )
      const bestAudio = [...audioFormats].sort((a, b) => b.bitrate - a.bitrate)[0]
      if (!bestAudio?.url) throw new Error('No suitable audio format found.')

      const details = response.videoDetails
      const thumbnails =
        details?.thumbnail?.thumbnails
          .map((thumbnail) => thumbnail.url)
          .filter((url): url is string => Boolean(url)) ?? []

      setStreamInfo({
        videoId,
        title: details?.title || 'Unknown Title',
        artist: details?.channelTitle || 'Unknown Artist',
        album: null,
        thumbnails,
        formats: [bestAudio],
        expiresInSeconds: Number.parseInt(streamingData.expiresInSeconds ?? '0', 10),
      })
    } catch (caught) {
      setStreamInfo(null)
      setError(caught instanceof Error ? caught.message : 'An unknown error occurred')
    } finally {
      setLoading(false)
    }
  }, [videoId])

  useEffect(() => {
    void fetchStream()
  }, [fetchStream])

  return { streamInfo, loading, error, refetch: fetchStream }
}
