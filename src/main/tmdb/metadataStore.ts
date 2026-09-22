import type { Library, MediaMetadata, EpisodeMetadata, MetadataSnapshot } from '@shared/types'
import { readJson, writeJsonAtomic } from '../state/atomicJson'
import { metadataFile } from '../state/paths'
import { TmdbClient } from './tmdbClient'

export interface EnrichProgress {
  done: number
  total: number
  current: string
}

/**
 * Titles, artwork and episode details, kept beside the library rather than
 * inside it.
 *
 * Separate on purpose: `library.json` is a pure scan of the disk and is thrown
 * away on every rescan, whereas this is expensive to fetch and should survive.
 * A pinned match also lives here, so correcting a wrong guess is permanent.
 */
export class MetadataStore {
  private data: MetadataSnapshot = { series: {}, movies: {}, episodes: {}, pinned: {} }

  async load(): Promise<void> {
    this.data = await readJson<MetadataSnapshot>(metadataFile(), {
      series: {},
      movies: {},
      episodes: {},
      pinned: {}
    })
  }

  snapshot(): MetadataSnapshot {
    return this.data
  }

  seriesMeta(id: string): MediaMetadata | null {
    return this.data.series[id] ?? null
  }

  movieMeta(id: string): MediaMetadata | null {
    return this.data.movies[id] ?? null
  }

  episodeMeta(key: string): EpisodeMetadata | null {
    return this.data.episodes[key] ?? null
  }

  /** Pins a match so a rescan or a re-run never overwrites a correction. */
  async pin(id: string, tmdbId: number): Promise<void> {
    this.data.pinned[id] = tmdbId
    await this.save()
  }

  private async save(): Promise<void> {
    await writeJsonAtomic(metadataFile(), this.data)
  }

  /**
   * Fills in anything missing. Existing entries are left alone unless `force`
   * is set, so a second run over a large library costs almost nothing.
   */
  async enrich(
    library: Library,
    client: TmdbClient,
    options: { force?: boolean; onProgress?: (p: EnrichProgress) => void } = {}
  ): Promise<number> {
    const { force = false, onProgress } = options
    const total = library.series.length + library.movies.length
    let done = 0
    let fetched = 0

    for (const series of library.series) {
      onProgress?.({ done, total, current: series.title })
      done++

      if (!force && this.data.series[series.id]) continue

      const match = await client.findSeries(series.title, series.year)
      if (!match) continue
      this.data.series[series.id] = match
      fetched++

      // One request per season covers every episode in it.
      for (const season of series.seasons) {
        if (season.season === 0) continue
        const episodes = await client.season(match.tmdbId, season.season)
        for (const entry of season.episodes) {
          const number = entry.episodes[0]
          if (number === undefined) continue
          const found = episodes.find((e) => e.episode === number)
          if (!found) continue
          this.data.episodes[entry.file.key] = {
            title: found.title,
            overview: found.overview,
            stillPath: found.stillPath,
            runtimeMinutes: found.runtimeMinutes,
            airDate: found.airDate
          }
        }
      }
    }

    for (const movie of library.movies) {
      onProgress?.({ done, total, current: movie.title })
      done++

      if (!force && this.data.movies[movie.id]) continue

      const match = await client.findMovie(movie.title, movie.year)
      if (!match) continue
      this.data.movies[movie.id] = match
      fetched++
    }

    await this.save()
    onProgress?.({ done: total, total, current: '' })
    return fetched
  }
}
