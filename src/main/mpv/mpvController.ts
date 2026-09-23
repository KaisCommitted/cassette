import { EventEmitter } from 'node:events'
import { mkdir, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { app } from 'electron'
import type { PlaybackState, SubtitleStyle, TrackInfo } from '@shared/types'
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
  'track-list',
  'chapter-list'
] as const

/** Shape of one entry in mpv's `track-list` property. */
interface RawTrack {
  id: number
  type: string
  title?: string
  lang?: string
  codec?: string
  selected?: boolean
  'external-filename'?: string
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
    sleepRemainingSeconds: null,
    sleepAfterEpisode: false,
    nightLight: null,
    autoplayNext: true,
    chapterCount: 0,
    loading: false
  }
}

export class MpvController extends EventEmitter {
  private proc: MpvProcess | null = null
  private ipc: MpvIpc | null = null
  private state: PlaybackState = emptyState()
  /** Path of the warmth shader once written, and whether mpv has it loaded. */
  private warmShader: string | null = null
  private warmShaderLoaded = false
  private warmthApplied = -1

  async start(hwnd: Buffer, legacyCompositing = true): Promise<void> {
    this.proc = await startMpv(hwnd, legacyCompositing)
    this.ipc = new MpvIpc(this.proc.socket)
    this.ipc.on('property', (name: string, value: unknown) => {
      this.onProperty(name, value)
    })
    this.ipc.on('event', (event: string, msg: Record<string, unknown>) => {
      // mpv reaching the end of a file is how auto-advance is triggered. The
      // reason says whether it really ran out ("eof") or was replaced or
      // stopped, which also ends the file.
      if (event === 'end-file') this.emit('end-file', msg['reason'] ?? null)
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
      case 'chapter-list':
        this.state.chapterCount = Array.isArray(value) ? value.length : 0
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
    const label = String(args[0]) + (args[1] !== undefined ? ' ' + String(args[1]) : '')
    const queuedAt = Date.now()
    if (process.env.CASSETTE_TRACE === '1') console.log(`[mpv] queued ${label}`)
    const run = this.queue.then(
      () => this.required.command<T>(args),
      () => this.required.command<T>(args)
    )
    if (process.env.CASSETTE_TRACE === '1') {
      void run.then(
        () => console.log(`[mpv] done ${label} after ${Date.now() - queuedAt}ms`),
        (e) => console.log(`[mpv] FAILED ${label} after ${Date.now() - queuedAt}ms: ${e.message}`)
      )
    }
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

  /**
   * Draws the current frame again, where it is.
   *
   * mpv only draws when it has a frame to show, and a paused picture has none
   * coming. When the window around it is resized — going fullscreen, leaving
   * it — the video window repaints its own black page over the child mpv
   * draws into, and the paused picture stays black until playback resumes.
   * An exact seek to where it already is makes mpv present that frame again.
   */
  async redraw(): Promise<void> {
    if (!this.state.path || this.state.loading) return
    await this.send(['seek', 0, 'relative+exact'])
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

  /**
   * Adds an external subtitle file as a track.
   *
   * `select` is deliberately optional and off by default. Adding several files
   * — one per language — with the default flag would leave whichever happened
   * to be added last switched on, throwing away the track that was chosen for
   * the user's preferred language a moment earlier.
   */
  async addSubtitleFile(
    path: string,
    title?: string,
    lang?: string | null,
    select = false
  ): Promise<void> {
    const args: unknown[] = ['sub-add', path, select ? 'select' : 'auto', title ?? basename(path)]
    if (lang) args.push(lang)
    await this.send(args)
  }

  /**
   * Re-reads the track list rather than waiting for mpv to announce it.
   *
   * Adding a subtitle file and immediately choosing between tracks would
   * otherwise race the property update and decide without the new track.
   */
  async refreshTracks(): Promise<TrackInfo[]> {
    const raw = await this.send<RawTrack[]>(['get_property', 'track-list'])
    this.state.tracks = Array.isArray(raw) ? mapTracks(raw) : this.state.tracks
    this.emit('state', this.getState())
    return this.getState().tracks
  }

  /** Subtitle files mpv has loaded from disk, by path, lowercased. */
  loadedSubtitlePaths(): Set<string> {
    return new Set(
      this.state.tracks
        .filter((t) => t.type === 'sub' && t.externalFilename)
        .map((t) => t.externalFilename!.toLowerCase())
    )
  }

  async nextChapter(): Promise<void> {
    await this.send(['add', 'chapter', 1])
  }

  async previousChapter(): Promise<void> {
    await this.send(['add', 'chapter', -1])
  }

  /**
   * Applies subtitle appearance.
   *
   * `sub-ass-override` is what decides whether this reaches embedded ASS
   * subtitles at all. Left alone, styled subtitles keep their own fonts and
   * positioning, which is usually what you want because signs and karaoke are
   * authored deliberately. Forcing the override restyles them like plain text.
   */
  async applySubtitleStyle(style: SubtitleStyle): Promise<void> {
    await this.send(['set_property', 'sub-scale', style.scale])
    await this.send(['set_property', 'sub-color', style.color])
    await this.send(['set_property', 'sub-border-color', style.outlineColor])
    await this.send(['set_property', 'sub-border-size', style.outlineSize])
    await this.send([
      'set_property',
      'sub-back-color',
      withAlpha(style.outlineColor === style.color ? '#000000' : '#000000', style.backgroundOpacity)
    ])
    // sub-pos counts from the top, so 100 sits on the bottom edge.
    await this.send(['set_property', 'sub-pos', 100 - Math.round(style.marginPercent)])
    await this.send([
      'set_property',
      'sub-ass-override',
      style.overrideEmbeddedStyles ? 'force' : 'no'
    ])
  }

  /**
   * Evens out loud and quiet passages.
   *
   * Dialogue you cannot hear followed by action that wakes the house is the
   * usual complaint when watching quietly at night.
   */
  async setNightAudio(enabled: boolean): Promise<void> {
    await this.send([
      'set_property',
      'af',
      enabled ? 'dynaudnorm=g=5:f=250:r=0.9:p=0.5' : ''
    ])
  }

  /** Mirrors timer and autoplay state into what the overlay renders. */
  setSessionFlags(flags: {
    sleepRemainingSeconds: number | null
    sleepAfterEpisode: boolean
    nightLight: PlaybackState['nightLight']
    autoplayNext: boolean
  }): void {
    this.state.sleepRemainingSeconds = flags.sleepRemainingSeconds
    this.state.sleepAfterEpisode = flags.sleepAfterEpisode
    this.state.nightLight = flags.nightLight
    this.state.autoplayNext = flags.autoplayNext
    this.emit('state', this.getState())
  }

  /**
   * Warms the picture, from 0 (untouched) to 1 (fully warm); null removes it.
   *
   * A shader rather than a filter: changing `vf` rebuilds the filter chain
   * and hitches playback, and a filter would need hardware-decoded frames
   * copied back from the GPU. The shader's strength is a parameter, so
   * ramping it up is a uniform changing, not a recompile. It is only loaded
   * while in use, so an ordinary evening pays nothing for it.
   */
  async setWarmth(warmth: number | null): Promise<void> {
    if (warmth === null) {
      if (!this.warmShaderLoaded || !this.warmShader) return
      this.warmShaderLoaded = false
      this.warmthApplied = -1
      await this.send(['change-list', 'glsl-shaders', 'remove', this.warmShader])
      return
    }
    const value = Math.round(Math.max(0, Math.min(1, warmth)) * 100) / 100
    if (value === this.warmthApplied && this.warmShaderLoaded) return
    this.warmthApplied = value
    // Set before loading, so the shader never shows a frame at its default.
    await this.send(['set_property', 'glsl-shader-opts', `warmth=${value.toFixed(2)}`])
    if (!this.warmShaderLoaded) {
      this.warmShader ??= await writeWarmShader()
      this.warmShaderLoaded = true
      await this.send(['change-list', 'glsl-shaders', 'append', this.warmShader])
    }
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
      selected: t.selected === true,
      externalFilename: t['external-filename'] ?? null
    }))
}

/**
 * mpv colour with an alpha channel, as `#AARRGGBB`.
 *
 * mpv treats alpha as opacity here, so a fully transparent background means
 * no box is drawn behind the text at all.
 */
function withAlpha(hex: string, opacity: number): string {
  const clamped = Math.max(0, Math.min(1, opacity))
  const alpha = Math.round(clamped * 255)
    .toString(16)
    .padStart(2, '0')
  return `#${alpha}${hex.replace('#', '')}`
}

/**
 * The night light: a gentle cut to green and a deeper one to blue, the way a
 * screen's own night mode shifts, scaled by `warmth`.
 *
 * It runs on the finished picture, before subtitles are drawn over it, so
 * subtitles keep their colour; the overlay's dimming covers them as well.
 */
const WARM_SHADER = `//!PARAM warmth
//!DESC How warm the picture is, 0 to 1
//!TYPE float
//!MINIMUM 0.0
//!MAXIMUM 1.0
0.0

//!HOOK OUTPUT
//!BIND HOOKED
//!DESC Cassette night light
vec4 hook() {
    vec4 color = HOOKED_tex(HOOKED_pos);
    color.rgb *= mix(vec3(1.0), vec3(1.0, 0.82, 0.58), warmth);
    return color;
}
`

async function writeWarmShader(): Promise<string> {
  const dir = join(app.getPath('userData'), 'shaders')
  await mkdir(dir, { recursive: true })
  const path = join(dir, 'night-light.glsl')
  await writeFile(path, WARM_SHADER, 'utf8')
  return path
}
