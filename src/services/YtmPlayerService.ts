import type { PlayerResponse } from '../models'

export const YTM_PLAYER_PROXY_PATH = '/api/youtubei/v1/player'

export interface PlayerContext {
  client: {
    hl: string
    gl: string
    clientName: string
    clientVersion: string
    hmiDisabled?: boolean
    hmiDisabledRequestLayouts?: boolean
    androidSdkVersion?: number
    mainAppVer?: string
    deviceMake?: string
    deviceModel?: string
    buildVersion?: string
    osVersion?: string
    utcOffsetMinutes?: number
    platform?: string
    clientScreen?: string
    visitorData?: string
  }
  third_party?: {
    embedUrl: string
  }
  request?: {
    useSsl: boolean
    internalExperimentFlags: string[]
  }
}

export async function getPlayerResponse(
  videoId: string,
  visitorData?: string,
): Promise<PlayerResponse> {
  const payload = {
    context: {
      client: {
        hl: 'en',
        gl: 'US',
        clientName: 'MWEB',
        clientVersion: '2.20210608.01.00',
        hmiDisabled: true,
        hmiDisabledRequestLayouts: true,
        androidSdkVersion: 31,
        mainAppVer: '1.20.02',
        deviceMake: 'Google',
        deviceModel: 'Pixel 6',
        buildVersion: '31',
        osVersion: '12',
        utcOffsetMinutes: -300,
        platform: 'MOBILE',
        clientScreen: 'EMBEDDER',
        ...(visitorData ? { visitorData } : {}),
      },
      third_party: {
        embedUrl: `https://music.youtube.com/watch?v=${encodeURIComponent(videoId)}`,
      },
      request: {
        useSsl: true,
        internalExperimentFlags: [],
      },
    } satisfies PlayerContext,
    videoId,
    playbackContext: {
      visitUrl: `https://music.youtube.com/watch?v=${encodeURIComponent(videoId)}`,
      contentPlaybackContext: {
        vis: 0,
        watchEndpointSupportedMusicActions: true,
      },
    },
    contentCheckOk: true,
    racyCheckOk: true,
  }

  const response = await fetch(YTM_PLAYER_PROXY_PATH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch player response: ${response.status} ${response.statusText}`)
  }

  return (await response.json()) as PlayerResponse
}
