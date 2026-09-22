import { EventEmitter } from 'node:events'
import { basename } from 'node:path'
import type { PlaybackState, TrackInfo } from '@shared/types'
import { MpvIpc } from './mpvIpc'
import { startMpv, type MpvProcess } from './mpvProcess'

const OBSERVED = [
  'time-pos',
  'duration',
  'pause',
  'volume',
  'mute',
  'speed',
  'sub-delay',
  'sid',
  'aid',
  'track-list'
] as const

/** Shape of one entry in mpv's `track-list` property. */
interface RawTrack {
  id: number
  type: string
  title?: string
  lang?: string
  codec?: string
  selected?: boolean
}

function emptyState(): PlaybackState {
  return {
    path: null,
    title: '',
    label: '',
    paused: true,
    positionSeconds: 0,
    durationSeconds: 0,
    volume: 100,
    muted: false,
    speed: 1,
    subtitleDelayMs: 0,
    fullscreen: false,
    tracks: [],
    subtitleTrackId: null,
    audioTrackId: null,
    hasNext: false,
    hasPrevious: false,
    loading: false
  }
}

export class MpvController extends EventEmitter {
  private proc: MpvProcess | null = null
  private ipc: MpvIpc | null = null
  private state: PlaybackState = emptyState()

  async start(hwnd: Buffer): Promise<void> {
    this.proc = await startMpv(hwnd)
    this.ipc = new MpvIpc(this.proc.socket)
    this.ipc.on('property', (name: string, value: unknown) => {
      this.onProperty(name, value)
    })
    this.ipc.on('event', (event: string) => {
      // mpv reaching the end of a file is how auto-advance is triggered.
      if (event === 'end-file') this.emit('end-file')
    })
    for (const name of OBSERVED) await this.ipc.observeProperty(name)
  }

  private onProperty(name: string, value: unknown): void {
    const n = typeof value === 'number' ? value : 0
    switch (name) {
      case 'time-pos':
        this.state.positionSeconds = n
        break
      case 'duration':
        this.state.durationSeconds = n
        break
      case 'pause':
        this.state.paused = value === true
        break
      case 'volume':
        this.state.volume = n
        break
      case 'mute':
        this.state.muted = value === true
        break
      case 'speed':
        this.state.speed = typeof value === 'number' ? value : 1
        break
      case 'sub-delay':
        this.state.subtitleDelayMs = Math.round(n * 1000)
        break
      case 'sid':
        this.state.subtitleTrackId = typeof value === 'number' ? value : null
        break
      case 'aid':
        this.state.audioTrackId = typeof value === 'number' ? value : null
        break
      case 'track-list':
        this.state.tracks = Array.isArray(value) ? mapTracks(value as RawTrack[]) : []
        break
      default:
        return
    }
    this.emit('state', this.getState())
  }

  private get required(): MpvIpc {
    if (!this.ipc) throw new Error('mpv has not been started')
    return this.ipc
  }

  /**
   * Commands run one at a time, in the order they were requested.
   *
   * mpv is driven over a single pipe and its command handling is not
   * reentrant: firing several seeks at once (a held-down arrow key) made it
   * stop replying altogether, which hung every later command behind it.
   * Serialising keeps rapid input correct and ordered.
   */
  private queue: Promise<unknown> = Promise.resolve()

  private send<T>(args: unknown[]): Promise<T> {
    const run = this.queue.then(
      () => this.required.command<T>(args),
      () => this.required.command<T>(args)
    )
    // Keep the chain alive even when a command rejects.
    this.queue = run.catch(() => undefined)
    return run
  }

  /** Resolves when mpv reports the named event, or after `timeoutMs`. */
  private waitForEvent(name: string, timeoutMs: number): Promise<boolean> {
    const ipc = this.required
    return new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        ipc.off('event', onEvent)
        resolve(false)
      }, timeoutMs)
      timer.unref?.()
      function onEvent(event: string): void {
        if (event !== name) return
        clearTimeout(timer)
        ipc.off('event', onEvent)
        resolve(true)
      }
      ipc.on('event', onEvent)
    })
  }

  /**
   * Load a file and, when resuming, seek to where the user stopped.
   *
   * The start position is applied with an explicit seek rather than
   * `loadfile`'s options argument: mpv 0.41 inserted an `index` parameter
   * before `options`, so the old four-argument form is rejected outright
   * with "invalid parameter". Seeking after `file-loaded` works on every
   * version and does not depend on argument positions at all.
   */
  async load(path: string, startSeconds: number, label: string): Promise<void> {
    this.state = {
      ...this.state,
      path,
      title: basename(path),
      label,
      paused: false,
      loading: true,
      positionSeconds: startSeconds,
      durationSeconds: 0,
      tracks: []
    }
    this.emit('state', this.getState())

    const loaded = this.waitForEvent('file-loaded', 20000)
    await this.send(['loadfile', path, 'replace'])
    await loaded
    if (startSeconds > 0) {
      await this.send(['seek', startSeconds, 'absolute'])
    }
    this.state.loading = false
    this.emit('state', this.getState())
  }

  async setPaused(paused: boolean): Promise<void> {
    await this.send(['set_property', 'pause', paused])
  }

  async togglePause(): Promise<void> {
    await this.setPaused(!this.state.paused)
  }

  async seekRelative(seconds: number): Promise<void> {
    await this.send(['seek', seconds, 'relative'])
  }

  async seekAbsolute(seconds: number): Promise<void> {
    const clamped = Math.max(0, Math.min(this.state.durationSeconds || seconds, seconds))
    await this.send(['seek', clamped, 'absolute'])
  }

  async setVolume(volume: number): Promise<void> {
    const clamped = Math.max(0, Math.min(130, volume))
    await this.send(['set_property', 'volume', clamped])
  }

  async toggleMute(): Promise<void> {
    await this.send(['cycle', 'mute'])
  }

  async setSpeed(speed: number): Promise<void> {
    const clamped = Math.max(0.25, Math.min(4, speed))
    await this.send(['set_property', 'speed', clamped])
  }

  async cycleSubtitleTrack(): Promise<void> {
    await this.send(['cycle', 'sid'])
  }

  async cycleAudioTrack(): Promise<void> {
    await this.send(['cycle', 'aid'])
  }

  /** `null` turns subtitles off. */
  async setSubtitleTrack(id: number | null): Promise<void> {
    await this.send(['set_property', 'sid', id === null ? 'no' : id])
  }

  async setAudioTrack(id: number): Promise<void> {
    await this.send(['set_property', 'aid', id])
  }

  async adjustSubtitleDelay(deltaMs: number): Promise<void> {
    await this.setSubtitleDelay(this.state.subtitleDelayMs + deltaMs)
  }

  async setSubtitleDelay(ms: number): Promise<void> {
    await this.send(['set_property', 'sub-delay', ms / 1000])
  }

  async stop(): Promise<void> {
    await this.send(['stop'])
    const volume = this.state.volume
    const muted = this.state.muted
    this.state = { ...emptyState(), volume, muted }
    this.emit('state', this.getState())
  }

  /** Set by the session layer so the UI can enable next/previous buttons. */
  setNeighbours(hasPrevious: boolean, hasNext: boolean): void {
    this.state.hasPrevious = hasPrevious
    this.state.hasNext = hasNext
    this.emit('state', this.getState())
  }

  setFullscreen(fullscreen: boolean): void {
    this.state.fullscreen = fullscreen
    this.emit('state', this.getState())
  }

  getState(): PlaybackState {
    return { ...this.state, tracks: [...this.state.tracks] }
  }

  dispose(): void {
    this.proc?.child.kill()
    this.proc = null
    this.ipc = null
  }
}

function mapTracks(raw: RawTrack[]): TrackInfo[] {
  return raw
    .filter((t) => t.type === 'video' || t.type === 'audio' || t.type === 'sub')
    .map((t) => ({
      id: t.id,
      type: t.type as TrackInfo['type'],
      title: t.title ?? null,
      lang: t.lang ?? null,
      codec: t.codec ?? null,
      selected: t.selected === true
    }))
}
