import type {
  EpisodeEntry,
  Library,
  MediaFile,
  MovieEntry,
  SeasonEntry,
  SeriesEntry
} from '@shared/types'
import { gatherSignals, identityOf, type FileSignals } from './signals'

export interface ScannedFile {
  path: string
  sizeBytes: number
  key: string
}

interface Candidate extends ScannedFile {
  signals: FileSignals
  identity: string
}

/**
 * Works out what a folder of files actually contains.
 *
 * A filename on its own is often not enough. `Show - 03.mkv` is an episode
 * when twenty siblings look the same and a film when it stands alone, and
 * plenty of films have numbers in their titles. So the decision is made per
 * *title*, using every file that shares it as evidence, rather than per file.
 *
 * That also means the folder layout barely matters: episodes are grouped by
 * what they are, so a series split across subfolders, dumped flat in one
 * directory, or mixed in with films all come out the same.
 */
export function categorize(files: ScannedFile[]): Library {
  const candidates: Candidate[] = files.map((file) => {
    const signals = gatherSignals(file.path)
    return { ...file, signals, identity: identityOf(signals) }
  })

  const groups = new Map<string, Candidate[]>()
  for (const candidate of candidates) {
    const list = groups.get(candidate.identity)
    if (list) list.push(candidate)
    else groups.set(candidate.identity, [candidate])
  }

  const series: SeriesEntry[] = []
  const movies: MovieEntry[] = []

  for (const [identity, group] of groups) {
    if (identity === '') {
      for (const candidate of group) movies.push(toMovie(candidate))
      continue
    }
    if (looksLikeSeries(group)) series.push(toSeries(identity, group))
    else for (const candidate of group) movies.push(toMovie(candidate))
  }

  for (const entry of series) {
    entry.seasons.sort((a, b) => a.season - b.season)
    for (const season of entry.seasons) {
      season.episodes.sort((a, b) => (a.episodes[0] ?? 0) - (b.episodes[0] ?? 0))
    }
  }
  series.sort((a, b) => a.title.localeCompare(b.title))
  movies.sort((a, b) => a.title.localeCompare(b.title))

  return { series, movies, scannedAt: new Date().toISOString() }
}

/**
 * Whether a set of files sharing a title is a series.
 *
 * Any outright episode marker settles it immediately. Failing that, several
 * files under one title with different numbers is the signature of absolute
 * numbering — which is how most anime and plenty of older rips are named —
 * whereas a lone numbered file is far more likely to be a film with a number
 * in its name.
 */
export function looksLikeSeries(group: Candidate[]): boolean {
  if (group.some((c) => c.signals.episodes.length > 0)) return true
  if (group.some((c) => c.signals.airDate !== null)) return true

  // A folder that says "Season 3" is stating the case outright.
  if (group.some((c) => c.signals.folderSeason !== null)) return true

  if (group.length < 2) return false

  const numbers = new Set(
    group.map((c) => c.signals.looseNumber).filter((n): n is number => n !== null)
  )
  return numbers.size >= 2
}

/**
 * Season and episode for one file, once the group is known to be a series.
 *
 * Three-digit numbers under absolute numbering are usually packed season and
 * episode — 305 meaning season 3 episode 5 — so they are unpacked when the
 * whole group agrees. Anything else without a stated season is season 1,
 * which is what absolute-numbered shows mean.
 */
function placeEpisode(
  signals: FileSignals,
  packed: boolean
): { season: number; episodes: number[] } {
  if (signals.episodes.length > 0) {
    return {
      season: signals.season ?? signals.folderSeason ?? 1,
      episodes: signals.episodes
    }
  }

  if (signals.airDate) {
    const [year, month, day] = signals.airDate.split('-').map(Number)
    // Daily shows read naturally as one season per year, ordered by date.
    return { season: year!, episodes: [month! * 100 + day!] }
  }

  if (signals.looseNumber !== null) {
    if (packed && signals.looseNumber >= 100) {
      return {
        season: Math.floor(signals.looseNumber / 100),
        episodes: [signals.looseNumber % 100]
      }
    }
    return { season: signals.folderSeason ?? 1, episodes: [signals.looseNumber] }
  }

  return { season: signals.folderSeason ?? 1, episodes: [] }
}

function toSeries(identity: string, group: Candidate[]): SeriesEntry {
  // Packed numbering only when every loose number looks like one, or a single
  // three-digit film number would be misread as season 1 episode 23.
  const loose = group
    .map((c) => c.signals.looseNumber)
    .filter((n): n is number => n !== null)
  const packed =
    loose.length >= 2 && loose.every((n) => n >= 100 && n % 100 !== 0 && n % 100 <= 40)

  const seasons = new Map<number, EpisodeEntry[]>()

  for (const candidate of group) {
    const { season, episodes } = placeEpisode(candidate.signals, packed)
    const file: MediaFile = {
      path: candidate.path,
      sizeBytes: candidate.sizeBytes,
      key: candidate.key,
      title: bestTitle(group),
      year: bestYear(group),
      season,
      episodes,
      kind: 'series',
      tags: []
    }
    const entry: EpisodeEntry = {
      file,
      season,
      episodes,
      label: labelFor(season, episodes)
    }
    const list = seasons.get(season)
    if (list) list.push(entry)
    else seasons.set(season, [entry])
  }

  const seasonEntries: SeasonEntry[] = [...seasons.entries()].map(
    ([season, episodes]) => ({ season, episodes })
  )

  return {
    kind: 'series',
    id: identity,
    title: bestTitle(group),
    year: bestYear(group),
    seasons: seasonEntries
  }
}

function toMovie(candidate: Candidate): MovieEntry {
  // A film keeps the number in its name; only episodes have it stripped.
  const title =
    candidate.signals.titleWithNumber ||
    candidate.signals.titleGuess ||
    candidate.signals.folderTitle ||
    'Unknown'
  const file: MediaFile = {
    path: candidate.path,
    sizeBytes: candidate.sizeBytes,
    key: candidate.key,
    title,
    year: candidate.signals.year,
    season: null,
    episodes: [],
    kind: 'movie',
    tags: []
  }
  return {
    kind: 'movie',
    id: candidate.identity || candidate.key,
    title,
    year: candidate.signals.year,
    file
  }
}

/**
 * The most agreed-upon spelling in a group.
 *
 * Scattered files often disagree slightly — one says "The Office", another
 * "the.office" — and the commonest reading is a better label than whichever
 * file happened to sort first.
 */
function bestTitle(group: Candidate[]): string {
  const counts = new Map<string, number>()
  for (const candidate of group) {
    const title = candidate.signals.titleGuess || candidate.signals.folderTitle
    if (!title) continue
    counts.set(title, (counts.get(title) ?? 0) + 1)
  }
  let best = ''
  let bestCount = -1
  for (const [title, count] of counts) {
    // Ties go to the longer spelling, which usually carries more of the name.
    if (count > bestCount || (count === bestCount && title.length > best.length)) {
      best = title
      bestCount = count
    }
  }
  return best || 'Unknown'
}

function bestYear(group: Candidate[]): number | null {
  for (const candidate of group) {
    if (candidate.signals.year !== null) return candidate.signals.year
  }
  return null
}

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

function labelFor(season: number, episodes: number[]): string {
  if (episodes.length === 0) return `S${pad2(season)}`
  const first = `S${pad2(season)}E${pad2(episodes[0]!)}`
  if (episodes.length === 1) return first
  return `${first}-E${pad2(episodes[episodes.length - 1]!)}`
}
