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
  autoplayNext: boolean
  chapterCount: number
  /** True while mpv is loading a file, so the UI can show a spinner. */
  loading: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  libraryRoots: [],
  tmdbApiKey: null,
  openSubtitlesApiKey: null,
  autoplayNext: true,
  preferredSubtitleLanguages: ['eng', 'en'],
  preferredAudioLanguages: ['eng', 'en'],
  autoEnableSubtitles: true,
  subtitleStyle: DEFAULT_SUBTITLE_STYLE,
  nightAudio: false
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
  setRoots: (roots: string[]) => Promise<Library>
  getLibrary: () => Promise<Library | null>
  rescan: () => Promise<Library>
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
  scanSubtitles: (scope: SubtitleScanScope) => Promise<SubtitleScanResult[]>
  listLocalSubtitles: () => Promise<LocalSubtitle[]>
  useSubtitleFile: (path: string) => Promise<void>
  setSleepTimer: (seconds: number | null) => Promise<void>
  setSleepAfterEpisode: () => Promise<void>
  nextChapter: () => Promise<void>
  previousChapter: () => Promise<void>
  runInput: (descriptor: string) => void
  getBindings: () => Promise<KeyBindings>
  assignBinding: (descriptor: string, actionId: string) => Promise<KeyBindings>
  resetBindings: () => Promise<KeyBindings>

  /** Fires when the cursor moves over the player, to reveal the controls. */
  onOverlayActivity: (cb: () => void) => () => void
  /** Fires when artwork finishes downloading after a scan. */
  onMetadataReady: (cb: (m: MetadataSnapshot) => void) => () => void
}

declare global {
  interface Window {
    cassette: CassetteApi
  }
}

export const IPC = {
  chooseFolder: 'app:chooseFolder',
  getSettings: 'app:getSettings',
  setRoots: 'app:setRoots',
  getLibrary: 'app:getLibrary',
  rescan: 'app:rescan',
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
  listLocalSubtitles: 'subs:listLocal',
  useSubtitleFile: 'subs:use',
  setSleepTimer: 'player:setSleepTimer',
  setSleepAfterEpisode: 'player:setSleepAfterEpisode',
  nextChapter: 'player:nextChapter',
  previousChapter: 'player:previousChapter',
  subtitleScanProgress: 'subs:progress',
  runInput: 'input:run',
  getBindings: 'input:getBindings',
  assignBinding: 'input:assignBinding',
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
  { id: 'cycleSubtitleTrack', label: 'Next subtitle track', group: 'Subtitles and audio' },
  { id: 'cycleAudioTrack', label: 'Next audio track', group: 'Subtitles and audio' },
  { id: 'subtitleDelayDown', label: 'Subtitles 50 ms earlier', group: 'Subtitles and audio' },
  { id: 'subtitleDelayUp', label: 'Subtitles 50 ms later', group: 'Subtitles and audio' },
  { id: 'toggleFullscreen', label: 'Fullscreen', group: 'Window' },
  { id: 'hideAndPause', label: 'Pause and hide (works anywhere)', group: 'Window' }
]

/** VLC's defaults, which is what the app ships with. */
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
  'key:n': 'nextEpisode',
  'key:p': 'previousEpisode',
  'key:+': 'speedUp',
  'key:-': 'speedDown',
  'key:Escape': 'stop',
  'mouse:left': 'playPause',
  'mouse:wheelUp': 'volumeUp',
  'mouse:wheelDown': 'volumeDown',
  'mouse:double': 'toggleFullscreen',
  'key:Ctrl+Alt+Space': 'hideAndPause'
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
