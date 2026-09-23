import type { Library, MovieEntry, ProgressRecord, SeriesEntry } from '@shared/types'

export interface ResumeItem {
  /** Series this belongs to, or null for a film. */
  seriesId: string | null
  key: string
  path: string
  title: string
  detail: string
  /** 0–1 through the file. */
  fraction: number
  remainingSeconds: number
  lastWatched: string
}

/** Everything started but not finished, most recently watched first. */
export function continueWatching(
  library: Library,
  progress: Map<string, ProgressRecord>,
  limit = 12
): ResumeItem[] {
  const items: ResumeItem[] = []

  for (const series of library.series) {
    for (const season of series.seasons) {
      for (const episode of season.episodes) {
        const record = progress.get(episode.file.key)
        if (!usable(record)) continue
        items.push({
          seriesId: series.id,
          key: episode.file.key,
          path: episode.file.path,
          title: series.title,
          detail: episode.label,
          fraction: record.positionSeconds / record.durationSeconds,
          remainingSeconds: record.durationSeconds - record.positionSeconds,
          lastWatched: record.lastWatched
        })
      }
    }
  }

  for (const movie of library.movies) {
    const record = progress.get(movie.file.key)
    if (!usable(record)) continue
    items.push({
      seriesId: null,
      key: movie.file.key,
      path: movie.file.path,
      title: movie.title,
      detail: movie.year ? String(movie.year) : 'Film',
      fraction: record.positionSeconds / record.durationSeconds,
      remainingSeconds: record.durationSeconds - record.positionSeconds,
      lastWatched: record.lastWatched
    })
  }

  const newestFirst = items.sort((a, b) => b.lastWatched.localeCompare(a.lastWatched))

  // One row per series. Half a season of part-watched episodes should not
  // crowd out everything else — a series belongs in this row once, at the
  // point you actually stopped.
  const seen = new Set<string>()
  const collapsed: ResumeItem[] = []
  for (const item of newestFirst) {
    const group = item.seriesId ?? `film:${item.key}`
    if (seen.has(group)) continue
    seen.add(group)
    collapsed.push(item)
  }

  return collapsed.slice(0, limit)
}

function usable(record: ProgressRecord | undefined): record is ProgressRecord {
  // Ignore anything barely started: a few seconds in is usually a mis-click,
  // and it would push genuinely half-watched things off the row.
  return (
    record !== undefined &&
    !record.finished &&
    record.durationSeconds > 0 &&
    record.positionSeconds > 30
  )
}

export interface SeriesSummary {
  entry: SeriesEntry
  episodeCount: number
  seasonNumbers: number[]
  watchedCount: number
  /** Still to show on the card: the next unwatched episode, else the first. */
  thumbKey: string | null
}

export function summariseSeries(
  series: SeriesEntry,
  progress: Map<string, ProgressRecord>
): SeriesSummary {
  const episodes = series.seasons.flatMap((s) => s.episodes)
  const watched = episodes.filter((e) => progress.get(e.file.key)?.finished).length
  const next = episodes.find((e) => !progress.get(e.file.key)?.finished)
  return {
    entry: series,
    episodeCount: episodes.length,
    seasonNumbers: series.seasons.map((s) => s.season),
    watchedCount: watched,
    thumbKey: (next ?? episodes[0])?.file.key ?? null
  }
}

/** "seasons 3 to 5" / "season 4" / "seasons 1, 3 and 6" for gaps. */
export function describeSeasons(numbers: number[]): string {
  if (numbers.length === 0) return 'no seasons'
  if (numbers.length === 1) return `season ${numbers[0]}`
  const contiguous = numbers.every((n, i) => i === 0 || n === numbers[i - 1]! + 1)
  if (contiguous) return `seasons ${numbers[0]} to ${numbers[numbers.length - 1]}`
  const head = numbers.slice(0, -1).join(', ')
  return `seasons ${head} and ${numbers[numbers.length - 1]}`
}

export function matchesQuery(text: string, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (q === '') return true
  return text.toLowerCase().includes(q)
}

export function filterLibrary(
  library: Library,
  query: string
): { series: SeriesEntry[]; movies: MovieEntry[] } {
  return {
    series: library.series.filter((s) => matchesQuery(s.title, query)),
    movies: library.movies.filter((m) =>
      matchesQuery(`${m.title} ${m.year ?? ''}`, query)
    )
  }
}

/** "18 min left", "1 h 04 left", "under a minute left". */
export function formatRemaining(seconds: number): string {
  if (seconds < 60) return 'under a minute left'
  const mins = Math.round(seconds / 60)
  if (mins < 60) return `${mins} min left`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return `${h} h ${String(m).padStart(2, '0')} left`
}

/**
 * An episode label written out for reading rather than scanning.
 *
 * `S03E16` is how files name episodes; on a page it reads better as words,
 * and the short form drops the zero padding. Anything that does not look like
 * an episode label is passed through untouched.
 */
export function episodeLabel(label: string, form: 'long' | 'short'): string {
  const match = /^S(\d+)E(\d+)(?:-E(\d+))?$/i.exec(label)
  if (!match) return label
  const season = Number(match[1])
  const first = Number(match[2])
  const last = match[3] ? Number(match[3]) : null
  if (form === 'short') {
    return last === null ? `S${season} E${first}` : `S${season} E${first}–${last}`
  }
  return last === null
    ? `Season ${season}, episode ${first}`
    : `Season ${season}, episodes ${first}–${last}`
}

/** The library entry a playing file belongs to, by its path on disk. */
export function keyForPath(library: Library, path: string): string | null {
  for (const series of library.series) {
    for (const season of series.seasons) {
      for (const episode of season.episodes) {
        if (episode.file.path === path) return episode.file.key
      }
    }
  }
  return library.movies.find((m) => m.file.path === path)?.file.key ?? null
}

/**
 * Which of the four sleeve colours a title gets.
 *
 * Derived from the title so a tape keeps its colour between launches and
 * rescans, and neighbours on the shelf rarely match.
 */
export function sleeveTone(title: string): number {
  let hash = 0
  for (let i = 0; i < title.length; i++) hash = (hash * 31 + title.charCodeAt(i)) | 0
  return Math.abs(hash) % 4
}

/** "8 minutes ago", "3 hours ago", "2 days ago", or the date past a month. */
export function formatAgo(iso: string, now: Date = new Date()): string {
  const then = new Date(iso)
  if (Number.isNaN(then.getTime())) return 'at an unknown time'
  const minutes = Math.round((now.getTime() - then.getTime()) / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return minutes === 1 ? '1 minute ago' : `${minutes} minutes ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return hours === 1 ? '1 hour ago' : `${hours} hours ago`
  const days = Math.round(hours / 24)
  if (days < 31) return days === 1 ? 'yesterday' : `${days} days ago`
  return `on ${then.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}`
}

/** Release tags that mark the end of a title in a filename. */
const RELEASE_TAG =
  /\b(\d{3,4}p|[xh]\.?26[45]|hevc|web(-?dl|rip)?|blu-?ray|bdrip|brrip|hdtv|dvdrip|amzn|nf|dsnp|hmax|atvp|aac\d?|ddp?\d?|dts|10bit|proper|repack|internal)\b/i

/**
 * An episode's title as the file names it, for when TMDB has none.
 *
 * Release names usually carry it after the episode number —
 * "The Mentalist S06E01 The Desert Rose.mkv" — and it is a far better label
 * than "S6 E1". Release tags after it are cut off, and anything that is not
 * plainly words is ignored rather than shown.
 */
export function episodeTitleFromFile(path: string): string | null {
  const base = path.split(/[\\/]/).pop() ?? ''
  const name = base.replace(/\.[a-z0-9]{2,4}$/i, '')
  const match = /S\d{1,2}E\d{1,3}(?:-?E\d{1,3})?(.*)$/i.exec(name)
  if (!match) return null
  let rest = match[1]!.replace(/[._]+/g, ' ')
  const tag = RELEASE_TAG.exec(rest)
  if (tag) rest = rest.slice(0, tag.index)
  rest = rest
    .replace(/\[[^\]]*\]|\([^)]*\)/g, ' ')
    .replace(/^[\s\-–:]+|[\s\-–:]+$/g, '')
    .replace(/\s{2,}/g, ' ')
  return /\p{L}{2}/u.test(rest) ? rest : null
}
