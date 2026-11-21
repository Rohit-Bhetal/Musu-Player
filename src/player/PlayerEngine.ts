import type { Track } from '../source/MusicSource'
import { createStore, type Store } from '../ui/store'
import { toast } from '../ui/toast'
import { logEvent } from '../diagnostics'
import { clearPlayerState, loadPlayerState, savePlayerState, saveTrack } from '../storage/db'
import { attachMediaSession, setMediaMetadata, setMediaPlaybackState, setMediaPosition } from './mediaSession'
import { identityOrder, nextPos, prevPos, shuffledOrder, type RepeatMode } from './queue'

export type { RepeatMode }

export interface PlayerState {
  queue: readonly Track[]
  /** Indices into `queue`, in play order. */
  order: readonly number[]
  /** Position within `order`; -1 when nothing is loaded. */
  index: number
  playing: boolean
  loading: boolean
  shuffle: boolean
  repeat: RepeatMode
}

export interface Progress {
  positionSec: number
  durationSec: number
}

/** `revoke` marks object URLs the engine must release on the next song change. */
export interface ResolvedUrl {
  url: string
  revoke: boolean
}

export interface PlayerDeps {
  resolveUrl: (track: Track) => Promise<ResolvedUrl>
  /** Better artwork than track.artworkUrl (a stored blob), or null to keep that. */
  resolveArtwork: (track: Track) => Promise<ResolvedUrl | null>
}

export function currentTrackOf(state: PlayerState): Track | null {
  const i = state.order[state.index]
  return i === undefined ? null : (state.queue[i] ?? null)
}

const SAVE_INTERVAL_MS = 5000
const POSITION_INTERVAL_MS = 1000
const PREV_RESTART_SEC = 3

const EMPTY: PlayerState = {
  queue: [],
  order: [],
  index: -1,
  playing: false,
  loading: false,
  shuffle: false,
  repeat: 'off',
}

export class PlayerEngine {
  /** One element for the life of the app — iOS loses the audio session otherwise. */
  readonly audio: HTMLAudioElement
  readonly state: Store<PlayerState> = createStore<PlayerState>(EMPTY)
  readonly progress: Store<Progress> = createStore<Progress>({ positionSec: 0, durationSec: 0 })

  private readonly deps: PlayerDeps
  private current: ResolvedUrl | null = null
  private prepared: { trackId: string; resolved: ResolvedUrl } | null = null
  private artwork: ResolvedUrl | null = null
  private pendingSeek: number | null = null
  private failures = 0

  constructor(deps: PlayerDeps) {
    this.deps = deps
    this.audio = new Audio()
    this.audio.preload = 'auto'

    const a = this.audio
    a.addEventListener('loadedmetadata', this.onLoadedMetadata)
    a.addEventListener('timeupdate', this.onTimeUpdate)
    a.addEventListener('playing', this.onPlaying)
    a.addEventListener('pause', () => this.setPlaying(false))
    a.addEventListener('waiting', () => this.patch({ loading: true }))
    a.addEventListener('ended', this.onEnded)
    a.addEventListener('error', this.onError)
    a.addEventListener('seeked', this.pushPosition)
    a.addEventListener('ratechange', this.pushPosition)

    attachMediaSession({
      play: () => void this.play(),
      pause: () => this.pause(),
      next: () => void this.next(),
      prev: () => void this.prev(),
      seekTo: (sec) => this.seekTo(sec),
    })

    window.setInterval(() => {
      if (this.state.get().playing) this.pushPosition()
    }, POSITION_INTERVAL_MS)
    window.setInterval(() => void this.save(), SAVE_INTERVAL_MS)
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) void this.save()
    })
    window.addEventListener('pagehide', () => void this.save())
  }

  /* ------------------------------------------------------------ public -- */

  get currentTrack(): Track | null {
    return currentTrackOf(this.state.get())
  }

  /** Must be called straight from a tap — iOS only unlocks audio inside a gesture. */
  async playQueue(tracks: readonly Track[], startIndex: number): Promise<void> {
    if (tracks.length === 0) return
    const queue = [...tracks]
    const s = this.state.get()
    const start = Math.max(0, Math.min(startIndex, queue.length - 1))
    this.discardPrepared()
    this.pendingSeek = null
    this.failures = 0
    this.state.set({
      ...s,
      queue,
      order: s.shuffle ? shuffledOrder(queue.length, start) : identityOrder(queue.length),
      index: s.shuffle ? 0 : start,
    })
    await this.goTo(this.state.get().index, true)
  }

  async play(): Promise<void> {
    const s = this.state.get()
    if (!this.audio.src && s.index >= 0) {
      await this.goTo(s.index, true)
      return
    }
    await this.tryPlay()
  }

  pause(): void {
    this.audio.pause()
  }

  toggle(): void {
    if (this.state.get().playing) this.pause()
    else void this.play()
  }

  async next(): Promise<void> {
    const s = this.state.get()
    const pos = nextPos(s.index, s.order.length, s.repeat !== 'off')
    if (pos === null) {
      this.pause()
      return
    }
    await this.goTo(pos, true)
  }

  async prev(): Promise<void> {
    if (this.audio.currentTime > PREV_RESTART_SEC) {
      this.seekTo(0)
      return
    }
    const s = this.state.get()
    const pos = prevPos(s.index, s.order.length, s.repeat !== 'off')
    if (pos === null) {
      this.seekTo(0)
      return
    }
    await this.goTo(pos, true)
  }

  seekTo(sec: number): void {
    const duration = this.audio.duration
    if (!Number.isFinite(duration) || duration <= 0) return
    this.audio.currentTime = Math.max(0, Math.min(sec, duration))
    this.pushPosition()
  }

  setShuffle(on: boolean): void {
    const s = this.state.get()
    if (s.shuffle === on) return
    const trackIndex = s.order[s.index] ?? -1
    this.state.set({
      ...s,
      shuffle: on,
      order: on ? shuffledOrder(s.queue.length, trackIndex) : identityOrder(s.queue.length),
      index: trackIndex < 0 ? -1 : on ? 0 : trackIndex,
    })
    this.discardPrepared()
    this.prepareNext()
    void this.save()
  }

  setRepeat(repeat: RepeatMode): void {
    this.patch({ repeat })
    this.prepareNext()
    void this.save()
  }

  /** Restores the saved queue and position, always paused. */
  async restore(): Promise<void> {
    const saved = await loadPlayerState().catch(() => undefined)
    if (!saved || saved.queue.length === 0 || saved.order.length === 0) return
    const index = Math.min(Math.max(0, saved.index), saved.order.length - 1)
    const first = saved.queue[saved.order[index] ?? -1]
    if (!first) return

    // A queue saved under a different MusicSource holds ids this one cannot
    // resolve. Drop it once here, instead of cascading a skip-error toast per
    // track on every single launch. Keeping the resolved URL means goTo below
    // reuses it rather than fetching twice.
    try {
      this.prepared = { trackId: first.id, resolved: await this.deps.resolveUrl(first) }
    } catch {
      await clearPlayerState().catch(() => undefined)
      logEvent('player:restore-dropped', first.id)
      return
    }

    this.state.set({
      queue: saved.queue,
      order: saved.order,
      index,
      playing: false,
      loading: false,
      shuffle: saved.shuffle,
      repeat: saved.repeat,
    })
    this.pendingSeek = saved.positionSec
    await this.goTo(index, false)
    logEvent('player:restored', `${saved.queue.length} tracks @ ${Math.round(saved.positionSec)}s`)
  }

  /* --------------------------------------------------------- internals -- */

  private patch(partial: Partial<PlayerState>): void {
    this.state.set({ ...this.state.get(), ...partial })
  }

  private async tryPlay(): Promise<void> {
    try {
      await this.audio.play()
    } catch (error) {
      logEvent('audio:play-rejected', error instanceof Error ? error.message : String(error))
    }
  }

  private async goTo(pos: number, autoplay: boolean): Promise<void> {
    const s = this.state.get()
    const track = s.queue[s.order[pos] ?? -1]
    if (!track) return
    this.patch({ index: pos, loading: true })
    let resolved: ResolvedUrl
    try {
      resolved = await this.resolveFor(track)
    } catch (error) {
      this.patch({ loading: false })
      this.fail(track, error)
      return
    }
    this.swapSrc(resolved, autoplay)
    void this.afterTrackChange(track)
  }

  private async resolveFor(track: Track): Promise<ResolvedUrl> {
    const prepared = this.prepared
    if (prepared?.trackId === track.id) {
      this.prepared = null
      return prepared.resolved
    }
    this.discardPrepared()
    return this.deps.resolveUrl(track)
  }

  /** Synchronous on purpose: the 'ended' handler must not await before play(). */
  private swapSrc(resolved: ResolvedUrl, autoplay: boolean): void {
    const previous = this.current
    this.current = resolved
    this.audio.src = resolved.url
    if (autoplay) void this.tryPlay()
    if (previous?.revoke) URL.revokeObjectURL(previous.url)
  }

  private async afterTrackChange(track: Track): Promise<void> {
    this.progress.set({ positionSec: this.pendingSeek ?? 0, durationSec: track.durationSec ?? 0 })
    logEvent('player:track', `${track.title} — ${track.artist}`)
    void saveTrack(track).catch(() => undefined)
    await this.applyArtwork(track)
    this.prepareNext()
    void this.save()
  }

  private async applyArtwork(track: Track): Promise<void> {
    // show something on the Lock Screen immediately, then upgrade if a stored
    // blob turns out to be available
    setMediaMetadata(track, track.artworkUrl ?? null)
    const previous = this.artwork
    this.artwork = null
    if (previous?.revoke) URL.revokeObjectURL(previous.url)

    const art = await this.deps.resolveArtwork(track).catch(() => null)
    if (!art) return
    if (this.currentTrack?.id !== track.id) {
      if (art.revoke) URL.revokeObjectURL(art.url)
      return
    }
    this.artwork = art
    setMediaMetadata(track, art.url)
  }

  /** Resolves the next song's URL early so 'ended' can switch with no awaits. */
  private prepareNext(): void {
    const s = this.state.get()
    const pos = nextPos(s.index, s.order.length, s.repeat !== 'off')
    if (pos === null) {
      this.discardPrepared()
      return
    }
    const track = s.queue[s.order[pos] ?? -1]
    if (!track || this.prepared?.trackId === track.id) return
    this.discardPrepared()
    const id = track.id
    void this.deps.resolveUrl(track).then(
      (resolved) => {
        if (this.prepared !== null || this.currentTrack?.id === id) {
          if (resolved.revoke) URL.revokeObjectURL(resolved.url)
          return
        }
        this.prepared = { trackId: id, resolved }
      },
      () => undefined, // the slow path will retry and surface the error
    )
  }

  private discardPrepared(): void {
    if (this.prepared?.resolved.revoke) URL.revokeObjectURL(this.prepared.resolved.url)
    this.prepared = null
  }

  private setPlaying(playing: boolean): void {
    if (this.state.get().playing === playing) return
    this.patch({ playing })
    setMediaPlaybackState(playing ? 'playing' : 'paused')
    logEvent(playing ? 'audio:playing' : 'audio:paused')
  }

  private onPlaying = (): void => {
    this.failures = 0
    this.patch({ loading: false })
    this.setPlaying(true)
  }

  private onLoadedMetadata = (): void => {
    const duration = this.audio.duration
    if (this.pendingSeek !== null) {
      const seek = this.pendingSeek
      this.pendingSeek = null
      if (Number.isFinite(duration) && seek > 0 && seek < duration) {
        try {
          this.audio.currentTime = seek
        } catch {
          logEvent('audio:seek-refused', String(seek))
        }
      }
    }
    this.onTimeUpdate()
    this.pushPosition()
    logEvent('audio:loadedmetadata', Number.isFinite(duration) ? `${duration.toFixed(1)}s` : 'unknown length')
  }

  private onTimeUpdate = (): void => {
    const duration = this.audio.duration
    this.progress.set({
      positionSec: this.audio.currentTime,
      durationSec: Number.isFinite(duration) ? duration : 0,
    })
  }

  private pushPosition = (): void => {
    setMediaPosition(this.audio.duration, this.audio.currentTime, this.audio.playbackRate)
  }

  private onEnded = (): void => {
    const s = this.state.get()
    logEvent('audio:ended')
    if (s.repeat === 'one') {
      this.audio.currentTime = 0
      void this.tryPlay()
      return
    }
    const pos = nextPos(s.index, s.order.length, s.repeat === 'all')
    if (pos === null) {
      this.setPlaying(false)
      void this.save()
      return
    }
    const track = s.queue[s.order[pos] ?? -1]
    const prepared = this.prepared
    if (track && prepared?.trackId === track.id) {
      // the whole point of prepareNext: src + play() with nothing awaited in
      // between, so iOS keeps playing with the screen locked
      this.prepared = null
      this.swapSrc(prepared.resolved, true) // src + play() before anything else
      this.patch({ index: pos })
      void this.afterTrackChange(track)
      return
    }
    void this.goTo(pos, true)
  }

  private onError = (): void => {
    if (!this.audio.src) return
    const code = this.audio.error?.code
    this.fail(this.currentTrack, new Error(`media error ${code ?? '?'}`))
  }

  private fail(track: Track | null, error: unknown): void {
    const message = error instanceof Error ? error.message : String(error)
    logEvent('audio:error', `${track?.title ?? '?'}: ${message}`)
    this.patch({ loading: false })
    this.failures += 1
    const s = this.state.get()
    if (this.failures >= Math.max(1, s.order.length)) {
      this.failures = 0
      this.setPlaying(false)
      toast(`Cannot play ${track?.title ?? 'this song'}.`)
      return
    }
    toast(`Skipping ${track?.title ?? 'a song'} — it would not play.`)
    const pos = nextPos(s.index, s.order.length, s.repeat !== 'off')
    if (pos === null) {
      this.setPlaying(false)
      return
    }
    void this.goTo(pos, true)
  }

  private async save(): Promise<void> {
    const s = this.state.get()
    if (s.queue.length === 0 || s.index < 0) return
    try {
      await savePlayerState({
        queue: [...s.queue],
        order: [...s.order],
        index: s.index,
        positionSec: this.audio.currentTime,
        shuffle: s.shuffle,
        repeat: s.repeat,
      })
    } catch (error) {
      logEvent('player:save-failed', error instanceof Error ? error.message : String(error))
    }
  }
}
