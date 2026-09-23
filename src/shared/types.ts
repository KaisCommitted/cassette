export type MediaKind = 'series' | 'movie'

/** Output of parsing a single filename. Pure data, no I/O involved. */
export interface ParsedMedia {
  title: string
  year: number | null
  season: number | null
  /** A list, because files like `S03E23E24` cover two episodes. */
  episodes: number[]
  kind: MediaKind
  /** Junk tokens stripped from the title, kept for debugging bad parses. */
  tags: string[]
}

/** A parsed file plus the filesystem facts we need. */
export interface MediaFile extends ParsedMedia {
  path: string
  sizeBytes: number
  /** sha1(sizeBytes + ':' + normalisedBasename), first 16 hex chars. */
  key: string
}

export interface EpisodeEntry {
  file: MediaFile
  season: number
  episodes: number[]
  /** Display label, e.g. "S03E16" or "S03E23-E24". */
  label: string
}

export interface SeasonEntry {
  season: number
  episodes: EpisodeEntry[]
}

export interface SeriesEntry {
  kind: 'series'
  /** Normalised title, used as a stable identity across rescans. */
  id: string
  title: string
  year: number | null
  seasons: SeasonEntry[]
}

export interface MovieEntry {
  kind: 'movie'
  id: string
  title: string
  year: number | null
  file: MediaFile
}

export interface Library {
  series: SeriesEntry[]
  movies: MovieEntry[]
  scannedAt: string
}

export interface ProgressRecord {
  key: string
  positionSeconds: number
  durationSeconds: number
  lastWatched: string
  finished: boolean
}

export interface SubtitleStyle {
  /** Multiplier on mpv's default subtitle size. */
  scale: number
  color: string
  outlineColor: string
  outlineSize: number
  /** 0 = no box behind the text, 1 = solid. */
  backgroundOpacity: number
  /** Lifts subtitles off the bottom edge, in percent of video height. */
  marginPercent: number
  /**
   * Restyle embedded ASS/SSA subtitles instead of honouring their own styling.
   * Off by default: signs and karaoke in styled subtitles look wrong when
   * forced into a single font.
   */
  overrideEmbeddedStyles: boolean
}

export interface Settings {
  libraryRoots: string[]
  tmdbApiKey: string | null
  openSubtitlesApiKey: string | null
  /**
   * SubDL key, which is the one that makes subtitle search actually usable.
   *
   * OpenSubtitles allows a handful of downloads a day on a free account, so
   * scanning a season exhausts it immediately. SubDL's free tier is a couple of
   * thousand requests a day, and it is tried first whenever both are set.
   */
  subdlApiKey: string | null
  /**
   * Fetch a subtitle in every preferred language rather than only the first.
   *
   * With it on, a file ends up with one track per language you listed and you
   * pick between them in the player.
   */
  downloadEveryPreferredLanguage: boolean
  /** Roll into the next episode when one finishes. */
  autoplayNext: boolean
  /** Language codes in order of preference, e.g. ['eng', 'fre']. */
  preferredSubtitleLanguages: string[]
  preferredAudioLanguages: string[]
  /** Turn subtitles on automatically when a matching track exists. */
  autoEnableSubtitles: boolean
  subtitleStyle: SubtitleStyle
  /** Even out loud and quiet passages — for watching at low volume. */
  nightAudio: boolean
  /**
   * While a sleep timer runs, warm the picture and dim it over ten minutes.
   * Cancelling the timer, or anything else that ends it early, undoes it.
   */
  sleepNightLight: boolean
  /**
   * Shortest file worth listing, in minutes.
   *
   * Libraries collect trailers, samples, featurettes and stray clips that are
   * noise in a list of things to watch. Set to 0 to keep everything.
   */
  minimumDurationMinutes: number
}

export const DEFAULT_SUBTITLE_STYLE: SubtitleStyle = {
  scale: 1,
  color: '#FFFFFF',
  outlineColor: '#000000',
  outlineSize: 2,
  backgroundOpacity: 0,
  marginPercent: 0,
  overrideEmbeddedStyles: false
}

export interface TrackInfo {
  id: number
  type: 'video' | 'audio' | 'sub'
  title: string | null
  lang: string | null
  codec: string | null
  selected: boolean
  /**
   * Path this track was loaded from, for tracks that live outside the video.
   *
   * It is what tells an external subtitle apart from an embedded one, both to
   * label it in the menu and to avoid adding the same file twice.
   */
  externalFilename: string | null
}

/** Playback state pushed from main to the overlay as mpv reports changes. */
export interface PlaybackState {
  path: string | null
  title: string
  /** Human label for the current item, e.g. "The Mentalist — S03E16". */
  label: string
  paused: boolean
  positionSeconds: number
  durationSeconds: number
  volume: number
  muted: boolean
  speed: number
  subtitleDelayMs: number
  fullscreen: boolean
  tracks: TrackInfo[]
  subtitleTrackId: number | null
  audioTrackId: number | null
  hasNext: boolean
  hasPrevious: boolean
  /** Seconds until playback pauses itself, or null when no timer is set. */
  sleepRemainingSeconds: number | null
  /** Pause once the current episode ends rather than after a fixed time. */
  sleepAfterEpisode: boolean
  /**
   * How far the sleep timer's night light has got, each from 0 to 1, or null
   * when the picture is untouched. The overlay draws the dimming; the warmth
   * is applied inside mpv.
   */
  nightLight: { warmth: number; dim: number } | null
  autoplayNext: boolean
  chapterCount: number
  /** True while mpv is loading a file, so the UI can show a spinner. */
  loading: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  libraryRoots: [],
  tmdbApiKey: null,
  openSubtitlesApiKey: null,
  subdlApiKey: null,
  downloadEveryPreferredLanguage: true,
  autoplayNext: true,
  preferredSubtitleLanguages: ['eng', 'en'],
  preferredAudioLanguages: ['eng', 'en'],
  autoEnableSubtitles: true,
  subtitleStyle: DEFAULT_SUBTITLE_STYLE,
  nightAudio: false,
  sleepNightLight: false,
  minimumDurationMinutes: 15
}

export const MEDIA_EXTENSIONS = [
  '.mkv',
  '.mp4',
  '.avi',
  '.m4v',
  '.mov',
  '.webm'
] as const

/** Fraction of duration past which an item counts as watched. */
export const FINISHED_THRESHOLD = 0.9

export interface CassetteApi {
  chooseFolder: () => Promise<string | null>
  getSettings: () => Promise<Settings>
  /** Which API keys this build already carries, so none need entering. */
  getBundledKeys: () => Promise<BundledKeyAvailability>
  setRoots: (roots: string[]) => Promise<Library>
  getLibrary: () => Promise<Library | null>
  rescan: () => Promise<Library>
  /** Stops a scan in progress; resolves with the library as it was. */
  cancelScan: () => Promise<Library | null>
  /** Fires as a scan works through the files it found. */
  onScanProgress: (cb: (p: ScanProgressInfo) => void) => () => void
  getProgress: () => Promise<ProgressRecord[]>

  play: (path: string, key: string) => Promise<void>
  stop: () => Promise<void>
  togglePause: () => Promise<void>
  seekAbsolute: (seconds: number) => Promise<void>
  seekRelative: (seconds: number) => Promise<void>
  setVolume: (volume: number) => Promise<void>
  toggleMute: () => Promise<void>
  setSpeed: (speed: number) => Promise<void>
  setSubtitleTrack: (id: number | null) => Promise<void>
  setAudioTrack: (id: number) => Promise<void>
  setSubtitleDelay: (ms: number) => Promise<void>
  nextEpisode: () => Promise<void>
  previousEpisode: () => Promise<void>
  toggleFullscreen: () => Promise<void>

  /** Lets the click-through overlay accept clicks while over its controls. */
  setOverlayInteractive: (interactive: boolean) => void
  onPlaybackState: (cb: (s: PlaybackState) => void) => () => void
  /** Runs whatever action a mouse descriptor is bound to. */
  updateSettings: (changes: Partial<Settings>) => Promise<Settings>
  getMetadata: () => Promise<MetadataSnapshot>
  refreshMetadata: (force?: boolean) => Promise<MetadataSnapshot>
  markWatched: (key: string, watched: boolean) => Promise<void>
  resumeSeries: (seriesId: string) => Promise<void>
  scanSubtitles: (
    scope: SubtitleScanScope,
    options?: SubtitleSearchOptions
  ) => Promise<SubtitleScanResult[]>
  /** Searches online for the file playing right now and loads what it finds. */
  findSubtitlesNow: (options?: SubtitleSearchOptions) => Promise<SubtitleScanResult | null>
  listLocalSubtitles: () => Promise<LocalSubtitle[]>
  useSubtitleFile: (path: string) => Promise<void>
  setSleepTimer: (seconds: number | null) => Promise<void>
  setSleepAfterEpisode: () => Promise<void>
  nextChapter: () => Promise<void>
  previousChapter: () => Promise<void>
  startUpdateDownload: () => void
  installUpdate: () => void
  onUpdateAvailable: (cb: (info: { version: string }) => void) => () => void
  onUpdateProgress: (cb: (info: { percent: number }) => void) => () => void
  onUpdateReady: (cb: (info: { version: string }) => void) => () => void
  runInput: (descriptor: string) => void
  getBindings: () => Promise<KeyBindings>
  assignBinding: (descriptor: string, actionId: string) => Promise<KeyBindings>
  /** Removes one binding; a default removed this way stays removed. */
  unassignBinding: (descriptor: string) => Promise<KeyBindings>
  resetBindings: () => Promise<KeyBindings>
  /**
   * Tells the main process a text box has focus, so no binding can take a
   * keystroke meant for it.
   */
  setTyping: (typing: boolean) => void

  /**
   * Fires around a switch in or out of fullscreen: `out` just before the
   * window changes size, `in` once it has settled.
   */
  onScreenTransition: (cb: (phase: 'out' | 'in') => void) => () => void
  /** Fires when the cursor moves over the player, to reveal the controls. */
  onOverlayActivity: (cb: () => void) => () => void
  /** Fires as artwork arrives, and once more when it has all been fetched. */
  onMetadataReady: (cb: (m: MetadataSnapshot) => void) => () => void
  /** Fires as TMDB is asked about each title in turn. */
  onMetadataProgress: (cb: (p: MetadataProgressInfo) => void) => () => void
}

declare global {
  interface Window {
    cassette: CassetteApi
  }
}

export const IPC = {
  chooseFolder: 'app:chooseFolder',
  getSettings: 'app:getSettings',
  getBundledKeys: 'app:getBundledKeys',
  setRoots: 'app:setRoots',
  getLibrary: 'app:getLibrary',
  rescan: 'app:rescan',
  cancelScan: 'app:cancelScan',
  scanProgress: 'app:scanProgress',
  getProgress: 'app:getProgress',
  play: 'player:play',
  stop: 'player:stop',
  togglePause: 'player:togglePause',
  seekAbsolute: 'player:seekAbsolute',
  seekRelative: 'player:seekRelative',
  setVolume: 'player:setVolume',
  toggleMute: 'player:toggleMute',
  setSpeed: 'player:setSpeed',
  setSubtitleTrack: 'player:setSubtitleTrack',
  setAudioTrack: 'player:setAudioTrack',
  setSubtitleDelay: 'player:setSubtitleDelay',
  nextEpisode: 'player:next',
  previousEpisode: 'player:previous',
  toggleFullscreen: 'player:toggleFullscreen',
  screenTransition: 'player:screenTransition',
  setOverlayInteractive: 'overlay:setInteractive',
  overlayActivity: 'overlay:activity',
  updateSettings: 'app:updateSettings',
  getMetadata: 'tmdb:get',
  refreshMetadata: 'tmdb:refresh',
  metadataProgress: 'tmdb:progress',
  metadataReady: 'tmdb:ready',
  markWatched: 'app:markWatched',
  resumeSeries: 'player:resumeSeries',
  scanSubtitles: 'subs:scan',
  findSubtitlesNow: 'subs:findNow',
  listLocalSubtitles: 'subs:listLocal',
  useSubtitleFile: 'subs:use',
  setSleepTimer: 'player:setSleepTimer',
  setSleepAfterEpisode: 'player:setSleepAfterEpisode',
  nextChapter: 'player:nextChapter',
  previousChapter: 'player:previousChapter',
  subtitleScanProgress: 'subs:progress',
  updateAvailable: 'update:available',
  updateProgress: 'update:progress',
  updateReady: 'update:ready',
  updateError: 'update:error',
  startUpdateDownload: 'update:download',
  installUpdate: 'update:install',
  runInput: 'input:run',
  getBindings: 'input:getBindings',
  assignBinding: 'input:assignBinding',
  unassignBinding: 'input:unassignBinding',
  setTyping: 'input:typing',
  resetBindings: 'input:resetBindings',
  playbackState: 'player:state'
} as const

/** An input descriptor: `key:Ctrl+Left`, `mouse:button4`, `mouse:wheelUp`. */
export type InputDescriptor = string

/** Descriptor to action id. Several descriptors may map to one action. */
export type KeyBindings = Record<InputDescriptor, string>

export interface ActionDefinition {
  id: string
  label: string
  group: 'Playback' | 'Navigation' | 'Subtitles and audio' | 'Window'
}

/** Every bindable action, in the order the settings screen lists them. */
export const ACTIONS: ActionDefinition[] = [
  { id: 'playPause', label: 'Play or pause', group: 'Playback' },
  { id: 'seekShortBack', label: 'Back 10 seconds', group: 'Playback' },
  { id: 'seekShortForward', label: 'Forward 10 seconds', group: 'Playback' },
  { id: 'seekMediumBack', label: 'Back 1 minute', group: 'Playback' },
  { id: 'seekMediumForward', label: 'Forward 1 minute', group: 'Playback' },
  { id: 'speedDown', label: 'Slow down', group: 'Playback' },
  { id: 'speedUp', label: 'Speed up', group: 'Playback' },
  { id: 'volumeUp', label: 'Volume up', group: 'Playback' },
  { id: 'volumeDown', label: 'Volume down', group: 'Playback' },
  { id: 'mute', label: 'Mute', group: 'Playback' },
  { id: 'nextEpisode', label: 'Next episode', group: 'Navigation' },
  { id: 'previousEpisode', label: 'Previous episode', group: 'Navigation' },
  { id: 'stop', label: 'Close the player', group: 'Navigation' },
  // Escape is not in this list on purpose: it always means "back" — out of
  // fullscreen first, then out of the player — and is not rebindable.
  { id: 'cycleSubtitleTrack', label: 'Next subtitle track', group: 'Subtitles and audio' },
  { id: 'cycleAudioTrack', label: 'Next audio track', group: 'Subtitles and audio' },
  { id: 'subtitleDelayDown', label: 'Subtitles 50 ms earlier', group: 'Subtitles and audio' },
  { id: 'subtitleDelayUp', label: 'Subtitles 50 ms later', group: 'Subtitles and audio' },
  { id: 'toggleFullscreen', label: 'Fullscreen', group: 'Window' },
  { id: 'hideAndPause', label: 'Pause and hide (works anywhere)', group: 'Window' }
]

/**
 * What the app ships with: VLC's keys for the player, and the mouse left to
 * itself.
 *
 * Nothing is on the mouse by default except double click for fullscreen: a
 * single click or a scroll landing on the video is too easy to do by
 * accident. Episodes are moved between with the buttons, not N and P, and the
 * pause-and-hide key is left for you to choose, since whatever it is also
 * reaches every other app.
 */
export const DEFAULT_BINDINGS: KeyBindings = {
  'key:Space': 'playPause',
  'key:f': 'toggleFullscreen',
  'key:Left': 'seekShortBack',
  'key:Right': 'seekShortForward',
  'key:Ctrl+Left': 'seekMediumBack',
  'key:Ctrl+Right': 'seekMediumForward',
  'key:Up': 'volumeUp',
  'key:Down': 'volumeDown',
  'key:m': 'mute',
  'key:v': 'cycleSubtitleTrack',
  'key:b': 'cycleAudioTrack',
  'key:g': 'subtitleDelayDown',
  'key:h': 'subtitleDelayUp',
  'key:+': 'speedUp',
  'key:-': 'speedDown',
  'mouse:double': 'toggleFullscreen'
}


export type SubtitleScanScope =
  | { kind: 'episode'; key: string }
  | { kind: 'season'; seriesId: string; season: number }
  | { kind: 'series'; seriesId: string }
  | { kind: 'movie'; key: string }

export interface SubtitleScanResult {
  key: string
  label: string
  status: 'has-embedded' | 'already-had-one' | 'downloaded' | 'nothing-found' | 'failed'
  detail?: string
  /**
   * SubDL had nothing and an OpenSubtitles key is available, so it is worth
   * offering to try there. Never done automatically: its free quota is a
   * handful of downloads a day.
   */
  canTryOpenSubtitles?: boolean
}

export interface SubtitleSearchOptions {
  /** Search even when the file already carries subtitles in the language. */
  force?: boolean
  /** Where to look. SubDL unless OpenSubtitles is asked for by name. */
  provider?: 'subdl' | 'opensubtitles'
}

/** How far an artwork lookup has got; `done === total` means finished. */
export interface MetadataProgressInfo {
  done: number
  total: number
  /** The title being looked up, empty once finished. */
  current: string
}

/** How far a library scan has got. Both zero means it is not running. */
export interface ScanProgressInfo {
  done: number
  total: number
}

/** True where the build supplies a working key of its own. */
export interface BundledKeyAvailability {
  tmdb: boolean
  subdl: boolean
  openSubtitles: boolean
}

export interface LocalSubtitle {
  path: string
  lang: string | null
  label: string
}

export interface MediaMetadata {
  tmdbId: number
  title: string
  overview: string
  posterPath: string | null
  backdropPath: string | null
  year: number | null
  rating: number | null
}

export interface EpisodeMetadata {
  title: string
  overview: string
  stillPath: string | null
  runtimeMinutes: number | null
  airDate: string | null
}

export interface MetadataSnapshot {
  /** Keyed by series id. */
  series: Record<string, MediaMetadata>
  /** Keyed by movie id. */
  movies: Record<string, MediaMetadata>
  /** Keyed by media key, so it survives a rescan. */
  episodes: Record<string, EpisodeMetadata>
  /** Manual corrections, never overwritten by a refresh. */
  pinned: Record<string, number>
}
