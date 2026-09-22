import type { Library, MediaFile, Settings } from '@shared/types'
import { parseFilename } from '../library/parseFilename'
import { findLocalSubtitles } from './localSubtitles'
import { describeEmbedded, probeEmbeddedSubtitles } from './embeddedSubtitles'
import { OpenSubtitlesClient } from './openSubtitles'

export type ScanScope =
  | { kind: 'episode'; key: string }
  | { kind: 'season'; seriesId: string; season: number }
  | { kind: 'series'; seriesId: string }
  | { kind: 'movie'; key: string }

export interface ScanResultItem {
  key: string
  label: string
  status: 'has-embedded' | 'already-had-one' | 'downloaded' | 'nothing-found' | 'failed'
  detail?: string
}

export interface ScanProgress {
  done: number
  total: number
  current: string
}

/** Every file a scope covers, with a readable label for reporting. */
export function filesInScope(
  library: Library,
  scope: ScanScope
): Array<{ file: MediaFile; label: string }> {
  const out: Array<{ file: MediaFile; label: string }> = []

  for (const series of library.series) {
    for (const season of series.seasons) {
      for (const episode of season.episodes) {
        const matches =
          (scope.kind === 'episode' && scope.key === episode.file.key) ||
          (scope.kind === 'series' && scope.seriesId === series.id) ||
          (scope.kind === 'season' &&
            scope.seriesId === series.id &&
            scope.season === season.season)
        if (matches) {
          out.push({ file: episode.file, label: `${series.title} ${episode.label}` })
        }
      }
    }
  }

  for (const movie of library.movies) {
    const matches =
      (scope.kind === 'movie' || scope.kind === 'episode') && scope.key === movie.file.key
    if (matches) out.push({ file: movie.file, label: movie.title })
  }

  return out
}

/**
 * Finds subtitles for one episode, a season, a whole series or a film.
 *
 * Local files are checked first and cost nothing, so a scan over a series that
 * already has subtitles on disk does no network work at all. Downloading needs
 * an OpenSubtitles key; without one the scan still reports what is already
 * present rather than failing.
 */
export async function scanForSubtitles(
  library: Library,
  scope: ScanScope,
  settings: Settings,
  onProgress?: (progress: ScanProgress) => void
): Promise<ScanResultItem[]> {
  const targets = filesInScope(library, scope)
  const client = settings.openSubtitlesApiKey
    ? new OpenSubtitlesClient({ apiKey: settings.openSubtitlesApiKey })
    : null

  const results: ScanResultItem[] = []

  for (const [index, target] of targets.entries()) {
    onProgress?.({ done: index, total: targets.length, current: target.label })

    // Inside the container first. Most files already carry subtitles, and
    // downloading for those would be both wrong and a waste of a quota that
    // is only a handful of files a day.
    const embedded = await probeEmbeddedSubtitles(target.file.path)
    if (embedded.length > 0) {
      results.push({
        key: target.file.key,
        label: target.label,
        status: 'has-embedded',
        detail: describeEmbedded(embedded)
      })
      continue
    }

    const existing = await findLocalSubtitles(target.file.path)
    if (existing.length > 0) {
      results.push({
        key: target.file.key,
        label: target.label,
        status: 'already-had-one',
        detail: existing.map((s) => s.label).join(', ')
      })
      continue
    }

    if (!client) {
      results.push({
        key: target.file.key,
        label: target.label,
        status: 'nothing-found',
        detail: 'Nothing embedded, nothing on disk, and no OpenSubtitles key is set'
      })
      continue
    }

    try {
      const parsed = parseFilename(target.file.path)
      const candidates = await client.search(
        parsed,
        target.file.path,
        settings.preferredSubtitleLanguages
      )
      const best = candidates[0]
      if (!best) {
        results.push({ key: target.file.key, label: target.label, status: 'nothing-found' })
        continue
      }
      const written = await client.download(best, target.file.path)
      results.push({
        key: target.file.key,
        label: target.label,
        status: 'downloaded',
        detail: written
      })
    } catch (error) {
      results.push({
        key: target.file.key,
        label: target.label,
        status: 'failed',
        detail: error instanceof Error ? error.message : String(error)
      })
    }
  }

  onProgress?.({ done: targets.length, total: targets.length, current: '' })
  return results
}
