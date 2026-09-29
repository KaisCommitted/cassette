import { EventEmitter } from 'node:events'
import { mkdir, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { app } from 'electron'
import {
  DEFAULT_SETTINGS,
  VOLUME_MAX,
  type NightLightState,
  type PlaybackState,
  type SubtitleStyle,
  type TrackInfo
} from '@shared/types'
import { MpvIpc } from './mpvIpc'
import { startMpv, type MpvProcess } from './mpvProcess'
import {
  coarseTint,
  parseAssStyles,
  subtitleCommands,
  subtitleLook,
  type AssStyleColours,
  type NightTint,
  type SubtitleLook
} from './subtitleTint'

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
  'chapter-list',
  // The picture's shape, for the picture-in-picture window to take on.
  'video-params/aspect'
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

function clampVolume(volume: number): number {
  return Math.max(0, Math.min(VOLUME_MAX, volume))
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
    pip: false,
    tracks: [],
    subtitleTrackId: null,
    audioTrackId: null,
    hasNext: false,
    hasPrevious: false,
    sleepRemainingSeconds: null,
    sleepAfterEpisode: false,
    nightLight: {
      on: false,
      intensity: DEFAULT_SETTINGS.nightLightIntensity,
      withTimer: false,
      look: null
    },
    autoplayNext: true,
    chapterCount: 0,
    loading: false
  }
}

/** The shortest gap between two retints of the subtitles by the night light. */
const SUBTITLE_TINT_GAP_MS = 300

export class MpvController extends EventEmitter {
  private proc: MpvProcess | null = null
  private ipc: MpvIpc | null = null
  private state: PlaybackState = emptyState()
  /** Path of the night light shader once written, and whether mpv has it loaded. */
  private warmShader: string | null = null
  private warmShaderLoaded = false
  private warmthApplied = ''
  /**
   * The subtitle appearance last asked for, and the night light's tint over
   * it: subtitles are coloured to match the picture rather than warmed by the
   * shader (see subtitleTint.ts). No appearance until the first file asks
   * for one, so nothing is sent from a made-up default in the meantime.
   */
  private subtitleStyle: SubtitleStyle | null = null
  private subtitleTint: NightTint | null = null
  /** What mpv was last told, once it said yes; null means tell it everything. */
  private subtitleApplied: SubtitleLook | null = null
  /** The styles of the styled track on screen, read once per track. */
  private assStyles: { track: string; styles: AssStyleColours[] | null } | null = null
  /** Width over height of the picture playing, or null before one is known. */
  private videoAspect: number | null = null

  async start(hwnd: Buffer, legacyCompositing = true): Promise<void> {
    const proc = await startMpv(hwnd, legacyCompositing)
    this.proc = proc
    // The process ending is another way for the connection to go.
    proc.child.on('exit', () => this.onGone())
    await this.attach(new MpvIpc(proc.socket))
  }

  /**
   * Drives mpv over a connection already made. Apart from start(), so tests
   * can hand in a pipe of their own.
   */
  async attach(ipc: MpvIpc): Promise<void> {
    this.ipc = ipc
    this.gone = false
    // A new mpv starts without the night light, whatever the last one had.
    this.warmShaderLoaded = false
    this.warmthApplied = ''
    this.subtitleApplied = null
    ipc.on('property', (name: string, value: unknown) => {
      this.onProperty(name, value)
    })
    ipc.on('event', (event: string, msg: Record<string, unknown>) => {
      // mpv reaching the end of a file is how auto-advance is triggered. The
      // reason says whether it really ran out ("eof") or was replaced or
      // stopped, which also ends the file.
      if (event === 'end-file') this.emit('end-file', msg['reason'] ?? null)
    })
    ipc.on('close', () => this.onGone())
    for (const name of OBSERVED) await ipc.observeProperty(name)
  }

  /** True once mpv has gone, or been let go, until another is attached. */
  private gone = false

  /**
   * mpv has gone: crashed, been killed, or closed its pipe. Whatever is still
   * queued fails straight away, and the session layer is told, so it can
   * close the player and start another mpv. Said once per mpv.
   */
  private onGone(): void {
    if (this.gone) return
    this.gone = true
    this.ipc = null
    this.proc = null
    this.emit('exit')
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
        this.onSubtitleTrackChanged()
        break
      case 'aid':
        this.state.audioTrackId = typeof value === 'number' ? value : null
        break
      case 'track-list':
        this.state.tracks = Array.isArray(value) ? mapTracks(value as RawTrack[]) : []
        this.onSubtitleTrackChanged()
        break
      case 'chapter-list':
        this.state.chapterCount = Array.isArray(value) ? value.length : 0
        break
      case 'video-params/aspect':
        // Not part of what the overlay draws, so it is told apart from the
        // state rather than resending all of it.
        this.videoAspect = typeof value === 'number' && value > 0 ? value : null
        this.emit('aspect', this.videoAspect)
        return
      default:
        return
    }
    this.emit('state', this.getState())
  }

  private get required(): MpvIpc {
    if (!this.ipc) throw new Error('mpv is not running')
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

  /**
   * Resolves when the file mpv was just asked for is ready, when mpv gives up
   * on it, or after `timeoutMs`.
   *
   * Giving up is an `end-file` whose reason is `error`. The `end-file` for
   * the file being replaced says `stop` and arrives first; it is not that.
   */
  private waitForLoad(timeoutMs: number): Promise<'loaded' | 'error' | 'timeout'> {
    const ipc = this.required
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        ipc.off('event', onEvent)
        resolve('timeout')
      }, timeoutMs)
      timer.unref?.()
      function onEvent(event: string, msg: Record<string, unknown>): void {
        let outcome: 'loaded' | 'error' | null = null
        if (event === 'file-loaded') outcome = 'loaded'
        else if (event === 'end-file' && msg['reason'] === 'error') outcome = 'error'
        if (!outcome) return
        clearTimeout(timer)
        ipc.off('event', onEvent)
        resolve(outcome)
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

    const loaded = this.waitForLoad(20000)
    await this.send(['loadfile', path, 'replace'])
    if ((await loaded) === 'error') {
      // mpv could not open it. Forget the file at once, rather than leave the
      // player waiting on a black screen for a picture that is not coming.
      this.forgetFile()
      throw new Error(`mpv could not open ${basename(path)}`)
    }
    if (startSeconds > 0) {
      await this.send(['seek', startSeconds, 'absolute'])
    }
    this.state.loading = false
    this.emit('state', this.getState())
  }

  /** Back to nothing playing, keeping only what belongs to the user. */
  private forgetFile(): void {
    // The night light too: the next file opening untouched for a moment,
    // until the next update came round, flashed the room.
    const { volume, muted, nightLight } = this.state
    this.state = { ...emptyState(), volume, muted, nightLight }
    this.emit('state', this.getState())
  }

  async setPaused(paused: boolean): Promise<void> {
    await this.send(['set_property', 'pause', paused])
  }

  async togglePause(): Promise<void> {
    await this.setPaused(!this.state.paused)
  }

  /**
   * Steps the position by a fixed amount — Back 10 seconds, Forward 1
   * minute — as opposed to dragging the seek bar to an arbitrary point.
   *
   * Emits `seekJump` with where this lands, clamped to the file's length,
   * for the overlay to show as a toast. It is the target computed here
   * rather than mpv's own answer: mpv reports the real position a moment
   * later over the same `time-pos` property that ticks every second of
   * ordinary playback, which is too late for a toast to feel like it
   * answered the key press, and has no way to tell a jump from a tick.
   */
  async seekRelative(seconds: number): Promise<void> {
    const target = this.state.durationSeconds > 0
      ? Math.max(0, Math.min(this.state.durationSeconds, this.state.positionSeconds + seconds))
      : Math.max(0, this.state.positionSeconds + seconds)
    this.emit('seekJump', target)
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

  /** Sets the volume outright: the slider in the control bar. */
  async setVolume(volume: number): Promise<void> {
    await this.send(['set_property', 'volume', clampVolume(volume)])
  }

  /**
   * What the volume and mute keys have asked mpv for that it has not yet
   * done. Commands wait their turn behind each other (see send), so with a
   * key held down mpv's own report lags a few presses behind; each press
   * builds on the last one asked for rather than on that report, or the
   * volume would keep landing on the same step.
   */
  private asked: { volume: number | null; muted: boolean | null } = { volume: null, muted: null }

  /**
   * Steps the volume up or down by a fixed amount — a key or the wheel — as
   * opposed to the slider, which shows where it is by itself.
   *
   * Emits `volumeStep` with the level this lands on and whether sound is
   * muted, for the overlay to show as a toast. As with seekRelative, it is
   * the level computed here rather than mpv's report, so the toast answers
   * the key press at once and keeps up while the key is held.
   */
  async stepVolume(delta: number): Promise<void> {
    const volume = clampVolume((this.asked.volume ?? this.state.volume) + delta)
    this.asked.volume = volume
    this.emit('volumeStep', { volume, muted: this.asked.muted ?? this.state.muted })
    try {
      await this.send(['set_property', 'volume', volume])
      // mpv has taken it, but its report of the new level can still be on
      // the way. Kept here too, a press landing in between builds on this
      // level rather than the old one and does not repeat a step.
      if (this.asked.volume === volume) this.state.volume = volume
    } finally {
      if (this.asked.volume === volume) this.asked.volume = null
    }
  }

  /**
   * Mutes or unmutes. `announce` is for the mute key, which emits
   * `volumeStep` the way stepVolume does; the button in the control bar
   * shows its own state and leaves it off.
   */
  async toggleMute(options: { announce?: boolean } = {}): Promise<void> {
    const muted = !(this.asked.muted ?? this.state.muted)
    this.asked.muted = muted
    if (options.announce) {
      this.emit('volumeStep', { volume: this.asked.volume ?? this.state.volume, muted })
    }
    try {
      await this.send(['set_property', 'mute', muted])
      // As with the volume: a second press before mpv reports the change
      // must toggle from this, not from the state it is leaving.
      if (this.asked.muted === muted) this.state.muted = muted
    } finally {
      if (this.asked.muted === muted) this.asked.muted = null
    }
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
   *
   * Colours, position, size and that override go through
   * refreshSubtitles, which lays the night light's tint over them.
   */
  async applySubtitleStyle(style: SubtitleStyle): Promise<void> {
    this.subtitleStyle = style
    await this.send(['set_property', 'sub-border-size', style.outlineSize])
    await this.send([
      'set_property',
      'sub-back-color',
      withAlpha(style.outlineColor === style.color ? '#000000' : '#000000', style.backgroundOpacity)
    ])
    await this.refreshSubtitles()
  }

  /**
   * Brings mpv's subtitle properties in line with the appearance settings,
   * the night light and the track on screen; see subtitleTint.ts.
   *
   * Asked for from several places at once (a fade, a track change, a new
   * file), so only one runs at a time, and whatever was asked for while it
   * ran is done once, afterwards, with everything as it then stands.
   */
  private refreshSubtitles(): Promise<void> {
    this.subtitlesWanted = true
    this.subtitlesRun ??= this.drainSubtitles().finally(() => {
      this.subtitlesRun = null
    })
    return this.subtitlesRun
  }

  private subtitlesWanted = false
  private subtitlesRun: Promise<void> | null = null

  private async drainSubtitles(): Promise<void> {
    let failure: unknown = null
    while (this.subtitlesWanted) {
      this.subtitlesWanted = false
      try {
        await this.applySubtitleLook()
      } catch (error) {
        failure = error
      }
    }
    if (failure) throw failure
  }

  private async applySubtitleLook(): Promise<void> {
    // Until a file has asked for its appearance there is nothing right to
    // send; the first applySubtitleStyle brings the tint in with it.
    if (!this.ipc || !this.subtitleStyle) return
    const tint = this.subtitleTint
    const styles = tint && !this.subtitleStyle.overrideEmbeddedStyles ? await this.currentAssStyles() : null
    const next = subtitleLook(this.subtitleStyle, tint, styles)
    for (const command of subtitleCommands(this.subtitleApplied, next)) {
      try {
        await this.send(command)
      } catch (error) {
        // Part of the way there: start from scratch next time.
        this.subtitleApplied = null
        throw error
      }
    }
    this.subtitleApplied = next
  }

  /** The styles of the track on screen when it is a styled one, else null. */
  private async currentAssStyles(): Promise<AssStyleColours[] | null> {
    const id = this.state.subtitleTrackId
    const track = this.state.tracks.find((t) => t.type === 'sub' && t.id === id)
    if (!track || (track.codec !== 'ass' && track.codec !== 'ssa')) return null
    const key = `${this.state.path}|${id}`
    if (this.assStyles?.track === key) return this.assStyles.styles
    const header = await this.send<unknown>(['get_property', 'sub-ass-extradata']).catch(() => null)
    // Not there yet (the track still opening): ask again next time.
    if (typeof header !== 'string') return null
    const styles = parseAssStyles(header)
    this.assStyles = { track: key, styles: styles.length > 0 ? styles : null }
    return this.assStyles.styles
  }

  /**
   * Another subtitle track, or file: while the night light is tinting, the
   * new track may need the other way of tinting, or none.
   */
  private onSubtitleTrackChanged(): void {
    if (!this.subtitleTint && this.subtitleApplied?.override !== 'yes') return
    void this.refreshSubtitles().catch((error: Error) => {
      console.error('[cassette] subtitle night light failed:', error.message)
    })
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
    nightLight: NightLightState
    autoplayNext: boolean
  }): void {
    this.state.sleepRemainingSeconds = flags.sleepRemainingSeconds
    this.state.sleepAfterEpisode = flags.sleepAfterEpisode
    this.state.nightLight = flags.nightLight
    this.state.autoplayNext = flags.autoplayNext
    this.emit('state', this.getState())
  }

  /**
   * Warms the picture, and the subtitles over it, by letting less green and
   * blue through, each 0 to 1; null puts both back.
   *
   * A shader rather than a filter: changing `vf` rebuilds the filter chain
   * and hitches playback, and a filter would need hardware-decoded frames
   * copied back from the GPU. The shader's strength is a parameter, so
   * fading it is a uniform changing, not a recompile. It is only loaded
   * while in use, so an ordinary evening pays nothing for it.
   *
   * mpv draws subtitles after the shader has run, so white text kept all its
   * blue over an amber picture. Blending them into the picture first
   * (`blend-subtitles`) does not help with this renderer: they are still
   * drawn after the shader, and are moved off the black bars besides. So
   * they are recoloured instead, by the same amounts; see subtitleTint.ts.
   */
  setNightLight(look: NightTint | null): Promise<void> {
    // Only the newest look matters. A fade sends one twenty times a second;
    // queueing them all behind a busy mpv (opening a file, say) left the
    // picture seconds behind and everything else waiting behind it.
    this.nightLightWanted = { look }
    this.nightLightRun ??= this.drainNightLight().finally(() => {
      this.nightLightRun = null
    })
    return this.nightLightRun
  }

  private nightLightWanted: { look: NightTint | null } | null = null
  private nightLightRun: Promise<void> | null = null

  private async drainNightLight(): Promise<void> {
    let failure: unknown = null
    while (this.nightLightWanted) {
      const { look } = this.nightLightWanted
      this.nightLightWanted = null
      try {
        await this.applyNightLight(look)
      } catch (error) {
        failure = error
      }
    }
    if (failure) throw failure
  }

  private async applyNightLight(look: NightTint | null): Promise<void> {
    // Before mpv is up there is nothing to apply it to; the first update
    // after it starts brings it in.
    if (!this.ipc) return
    // The shader follows every frame, which costs next to nothing. The
    // subtitles follow in coarse steps, at most a few a second, and always
    // end on the latest.
    const tint = coarseTint(look)
    if (
      tint?.green !== this.subtitleTintWanted?.green ||
      tint?.blue !== this.subtitleTintWanted?.blue ||
      !this.subtitleApplied
    ) {
      this.subtitleTintWanted = tint
      this.queueSubtitleTint()
    }
    await this.applyWarmShader(look)
  }

  /** The coarse tint the subtitles are heading for, and when they last changed. */
  private subtitleTintWanted: NightTint | null = null
  private subtitleTintAt = 0
  private subtitleTintTimer: ReturnType<typeof setTimeout> | null = null

  /**
   * Retints the subtitles now, or, if they changed moments ago, once the gap
   * is up, with whatever is wanted by then. Several steps crossed in quick
   * succession — a fade, a slider being dragged — become a few updates.
   */
  private queueSubtitleTint(): void {
    if (this.subtitleTintTimer) return
    const wait = Math.max(0, this.subtitleTintAt + SUBTITLE_TINT_GAP_MS - Date.now())
    this.subtitleTintTimer = setTimeout(() => {
      this.subtitleTintTimer = null
      this.subtitleTintAt = Date.now()
      this.subtitleTint = this.subtitleTintWanted
      void this.refreshSubtitles().catch((error: Error) => {
        console.error('[cassette] subtitle night light failed:', error.message)
        // Nothing may come along to ask again once the night light has
        // settled, so try again after the gap.
        if (this.ipc) this.queueSubtitleTint()
      })
    }, wait)
    this.subtitleTintTimer.unref?.()
  }

  /**
   * The picture's half of the night light. Each step is recorded only once
   * mpv has taken it, so one that failed is tried again with the next update
   * rather than taken as done.
   */
  private async applyWarmShader(look: NightTint | null): Promise<void> {
    if (look === null) {
      if (!this.warmShaderLoaded || !this.warmShader) return
      await this.send(['change-list', 'glsl-shaders', 'remove', this.warmShader])
      this.warmShaderLoaded = false
      this.warmthApplied = ''
      return
    }
    const channel = (v: number): string => Math.max(0, Math.min(1, v)).toFixed(3)
    const opts = `green=${channel(look.green)},blue=${channel(look.blue)}`
    if (opts === this.warmthApplied && this.warmShaderLoaded) return
    // Set before loading, so the shader never shows a frame at its default.
    await this.send(['set_property', 'glsl-shader-opts', opts])
    this.warmthApplied = opts
    if (!this.warmShaderLoaded) {
      this.warmShader ??= await writeWarmShader()
      await this.send(['change-list', 'glsl-shaders', 'append', this.warmShader])
      this.warmShaderLoaded = true
    }
  }

  async stop(): Promise<void> {
    try {
      await this.send(['stop'])
    } finally {
      // Whether or not mpv answered — it may be gone — the session is over.
      this.forgetFile()
    }
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

  setPip(pip: boolean): void {
    this.state.pip = pip
    this.emit('state', this.getState())
  }

  /** Width over height of the picture playing, or null before one is known. */
  get aspect(): number | null {
    return this.videoAspect
  }

  getState(): PlaybackState {
    return { ...this.state, tracks: [...this.state.tracks] }
  }

  dispose(): void {
    // Quitting is not mpv dying: nothing should try to bring it back.
    this.gone = true
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
 * The night light: a cut to green and a deeper one to blue, the way a
 * screen's own night mode shifts. At its strongest no blue gets through.
 *
 * It runs on the finished picture. Subtitles are drawn after it and are
 * recoloured to match instead (see setNightLight); the overlay's dimming
 * covers both.
 */
const WARM_SHADER = `//!PARAM green
//!DESC How much green light gets through, 0 to 1
//!TYPE float
//!MINIMUM 0.0
//!MAXIMUM 1.0
1.0

//!PARAM blue
//!DESC How much blue light gets through, 0 to 1
//!TYPE float
//!MINIMUM 0.0
//!MAXIMUM 1.0
1.0

//!HOOK OUTPUT
//!BIND HOOKED
//!DESC Cassette night light
vec4 hook() {
    vec4 color = HOOKED_tex(HOOKED_pos);
    color.rgb *= vec3(1.0, green, blue);
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
