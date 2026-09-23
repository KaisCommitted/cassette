import type { Library, MediaFile } from '@shared/types'

export interface PlayableItem {
  key: string
  path: string
  /** Display label, e.g. "The Mentalist — S03E16" or "Another Round". */
  label: string
  /** Series id, or null for a movie. */
  seriesId: string | null
}

function fileItem(file: MediaFile, label: string, seriesId: string | null): PlayableItem {
  return { key: file.key, path: file.path, label, seriesId }
}

/**
 * Every playable item in library order: each series' episodes in season and
 * episode order, then movies alphabetically.
 */
export function flattenPlayable(library: Library): PlayableItem[] {
  const items: PlayableItem[] = []
  for (const series of library.series) {
    for (const season of series.seasons) {
      for (const episode of season.episodes) {
        items.push(fileItem(episode.file, `${series.title} — ${episode.label}`, series.id))
      }
    }
  }
  for (const movie of library.movies) {
    items.push(fileItem(movie.file, movie.title, null))
  }
  return items
}

export function findItem(library: Library, key: string): PlayableItem | null {
  return flattenPlayable(library).find((i) => i.key === key) ?? null
}

/**
 * The next item to play after `key`.
 *
 * Episodes advance only within their own series — running off the end of a
 * series does not roll into an unrelated show. Movies never have a next item.
 */
export function findNext(library: Library, key: string): PlayableItem | null {
  const items = flattenPlayable(library)
  const index = items.findIndex((i) => i.key === key)
  if (index === -1) return null
  const current = items[index]!
  if (current.seriesId === null) return null
  const next = items[index + 1]
  return next && next.seriesId === current.seriesId ? next : null
}

export function findPrevious(library: Library, key: string): PlayableItem | null {
  const items = flattenPlayable(library)
  const index = items.findIndex((i) => i.key === key)
  if (index <= 0) return null
  const current = items[index]!
  if (current.seriesId === null) return null
  const previous = items[index - 1]!
  return previous.seriesId === current.seriesId ? previous : null
}

/** Which series and season an episode belongs to, for things remembered per season. */
export function findSeasonOwner(
  library: Library,
  key: string
): { seriesId: string; season: number } | null {
  for (const series of library.series) {
    for (const season of series.seasons) {
      if (season.episodes.some((e) => e.file.key === key)) {
        return { seriesId: series.id, season: season.season }
      }
    }
  }
  return null
}
