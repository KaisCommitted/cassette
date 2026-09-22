import type {
  EpisodeEntry,
  Library,
  MediaFile,
  MovieEntry,
  SeasonEntry,
  SeriesEntry
} from '@shared/types'

/** Stable identity for a title across rescans and naming variations. */
export function normaliseId(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function labelFor(season: number, episodes: number[]): string {
  if (episodes.length === 0) return `S${pad2(season)}`
  const first = `S${pad2(season)}E${pad2(episodes[0]!)}`
  if (episodes.length === 1) return first
  return `${first}-E${pad2(episodes[episodes.length - 1]!)}`
}

export function groupIntoLibrary(files: MediaFile[]): Library {
  const seriesById = new Map<string, SeriesEntry>()
  const movies: MovieEntry[] = []

  for (const file of files) {
    if (file.kind === 'movie') {
      movies.push({
        kind: 'movie',
        id: normaliseId(file.title),
        title: file.title,
        year: file.year,
        file
      })
      continue
    }

    const id = normaliseId(file.title)
    let series = seriesById.get(id)
    if (!series) {
      series = { kind: 'series', id, title: file.title, year: file.year, seasons: [] }
      seriesById.set(id, series)
    }
    // A series file with no SxxEyy still belongs somewhere; season 0 is the
    // conventional "unsorted / specials" bucket.
    const seasonNumber = file.season ?? 0
    let season: SeasonEntry | undefined = series.seasons.find(
      (s) => s.season === seasonNumber
    )
    if (!season) {
      season = { season: seasonNumber, episodes: [] }
      series.seasons.push(season)
    }
    const entry: EpisodeEntry = {
      file,
      season: seasonNumber,
      episodes: file.episodes,
      label: labelFor(seasonNumber, file.episodes)
    }
    season.episodes.push(entry)
  }

  const series = [...seriesById.values()]
  for (const s of series) {
    s.seasons.sort((a, b) => a.season - b.season)
    for (const season of s.seasons) {
      season.episodes.sort((a, b) => (a.episodes[0] ?? 0) - (b.episodes[0] ?? 0))
    }
  }
  series.sort((a, b) => a.title.localeCompare(b.title))
  movies.sort((a, b) => a.title.localeCompare(b.title))

  return { series, movies, scannedAt: new Date().toISOString() }
}
