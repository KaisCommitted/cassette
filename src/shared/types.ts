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

export interface Settings {
  libraryRoots: string[]
  tmdbApiKey: string | null
}

/** Playback state pushed from main to the overlay as mpv reports changes. */
export interface PlaybackState {
  path: string | null
  title: string
  paused: boolean
  positionSeconds: number
  durationSeconds: number
  volume: number
  subtitleDelayMs: number
}

export const DEFAULT_SETTINGS: Settings = {
  libraryRoots: [],
  tmdbApiKey: null
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

export interface MininetflixApi {
  chooseFolder: () => Promise<string | null>
  getSettings: () => Promise<Settings>
  setRoots: (roots: string[]) => Promise<Library>
  getLibrary: () => Promise<Library | null>
  rescan: () => Promise<Library>
  getProgress: () => Promise<ProgressRecord[]>
  play: (path: string, key: string) => Promise<void>
  stop: () => Promise<void>
  onPlaybackState: (cb: (s: PlaybackState) => void) => () => void
}

declare global {
  interface Window {
    mininetflix: MininetflixApi
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
  playbackState: 'player:state'
} as const
