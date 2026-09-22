import type { Library, MovieEntry, ProgressRecord, SeriesEntry } from '@shared/types'

export interface ResumeItem {
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
      key: movie.file.key,
      path: movie.file.path,
      title: movie.title,
      detail: movie.year ? String(movie.year) : 'Film',
      fraction: record.positionSeconds / record.durationSeconds,
      remainingSeconds: record.durationSeconds - record.positionSeconds,
      lastWatched: record.lastWatched
    })
  }

  return items
    .sort((a, b) => b.lastWatched.localeCompare(a.lastWatched))
    .slice(0, limit)
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
