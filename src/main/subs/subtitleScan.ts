import type { Library, MediaFile, Settings } from '@shared/types'
import { parseFilename } from '../library/parseFilename'
import { MediaProbe } from '../library/mediaProbe'
import { findLocalSubtitles, languageName, normaliseLanguage } from './localSubtitles'
import { describeEmbedded, probeEmbeddedSubtitles } from './embeddedSubtitles'
import { OpenSubtitlesClient } from './openSubtitles'
import { rankSubdl, SubdlClient } from './subdl'

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
 * Which languages the user wants, in order, deduplicated.
 *
 * The list in settings is written by hand and routinely holds the same
 * language twice — `eng, en` is the shipped default — which would otherwise
 * mean downloading English twice.
 */
export function wantedLanguages(settings: Settings): string[] {
  const all = settings.preferredSubtitleLanguages.map(normaliseLanguage).filter(Boolean)
  const unique = [...new Set(all)]
  if (unique.length === 0) return ['eng']
  return settings.downloadEveryPreferredLanguage ? unique : unique.slice(0, 1)
}

/**
 * Finds subtitles for one episode, a season, a whole series or a film.
 *
 * What is already there is checked first and costs nothing, so a scan over a
 * series that already has subtitles does no network work at all. Anything
 * missing is then fetched per language, which is what leaves a file with
 * several subtitle tracks to choose between rather than one.
 *
 * SubDL is tried before OpenSubtitles when both keys are set: its free tier
 * allows a couple of thousand requests a day against OpenSubtitles' handful of
 * downloads, which is the difference between scanning a season and running out
 * part way through one.
 */
export async function scanForSubtitles(
  library: Library,
  scope: ScanScope,
  settings: Settings,
  onProgress?: (progress: ScanProgress) => void
): Promise<ScanResultItem[]> {
  const targets = filesInScope(library, scope)
  const probe = new MediaProbe()
  await probe.load()

  const results: ScanResultItem[] = []

  for (const [index, target] of targets.entries()) {
    onProgress?.({ done: index, total: targets.length, current: target.label })
    results.push(await scanOne(target.file, target.label, settings, probe))
  }

  // Anything probed here is worth keeping: the next scan, and the next library
  // rescan, both read the same cache.
  await probe.save()
  onProgress?.({ done: targets.length, total: targets.length, current: '' })
  return results
}

/** One file's worth of the scan, also used for the file playing right now. */
export async function scanOne(
  file: MediaFile,
  label: string,
  settings: Settings,
  probe: MediaProbe | null = null
): Promise<ScanResultItem> {
  const wanted = wantedLanguages(settings)

  // Inside the container first. Most files already carry subtitles, and
  // downloading a language that is already there is both wrong and a waste.
  const embeddedTracks = probe
    ? (await probe.probe(file.key, file.path)).subtitles
    : await probeEmbeddedSubtitles(file.path)

  const covered = new Set<string>()
  for (const track of embeddedTracks) {
    if (track.lang && track.lang !== 'und') covered.add(normaliseLanguage(track.lang))
  }

  const local = await findLocalSubtitles(file.path)
  for (const sub of local) {
    if (sub.lang) covered.add(normaliseLanguage(sub.lang))
  }

  const missing = wanted.filter((lang) => !covered.has(lang))

  if (missing.length === 0) {
    if (embeddedTracks.length > 0) {
      return {
        key: file.key,
        label,
        status: 'has-embedded',
        detail: describeEmbedded(embeddedTracks)
      }
    }
    return {
      key: file.key,
      label,
      status: 'already-had-one',
      detail: local.map((s) => s.label).join(', ')
    }
  }

  // An untagged track is still a subtitle. Treat a file that has one, and no
  // key configured, as served rather than reporting it as having nothing.
  const hasAny = embeddedTracks.length > 0 || local.length > 0

  if (!settings.subdlApiKey && !settings.openSubtitlesApiKey) {
    if (hasAny) {
      return {
        key: file.key,
        label,
        status: embeddedTracks.length > 0 ? 'has-embedded' : 'already-had-one',
        detail:
          embeddedTracks.length > 0
            ? describeEmbedded(embeddedTracks)
            : local.map((s) => s.label).join(', ')
      }
    }
    return {
      key: file.key,
      label,
      status: 'nothing-found',
      detail: 'Nothing embedded, nothing on disk, and no subtitle key is set'
    }
  }

  try {
    const written = await downloadMissing(file, missing, settings)
    if (written.length === 0) {
      return {
        key: file.key,
        label,
        status: hasAny ? 'already-had-one' : 'nothing-found',
        detail: `No ${missing.map(languageName).join(' or ')} subtitle was available`
      }
    }
    return {
      key: file.key,
      label,
      status: 'downloaded',
      detail: written.join(', ')
    }
  } catch (error) {
    return {
      key: file.key,
      label,
      status: 'failed',
      detail: error instanceof Error ? error.message : String(error)
    }
  }
}

/** Fetches one subtitle per still-missing language, best match first. */
async function downloadMissing(
  file: MediaFile,
  missing: string[],
  settings: Settings
): Promise<string[]> {
  const parsed = parseFilename(file.path)
  const written: string[] = []

  if (settings.subdlApiKey) {
    const client = new SubdlClient(settings.subdlApiKey)
    // One search covers every language, so a file costs a single request no
    // matter how many languages are being filled in.
    const candidates = rankSubdl(await client.search(parsed, missing), file.path)
    for (const language of missing) {
      const best = candidates.find((c) => c.language === language)
      if (!best) continue
      written.push(await client.download(best, file.path))
    }
    if (written.length > 0 || !settings.openSubtitlesApiKey) return written
  }

  if (!settings.openSubtitlesApiKey) return written

  // OpenSubtitles is the fallback, and its quota is small enough that it is
  // only worth spending on languages SubDL could not supply.
  const client = new OpenSubtitlesClient({ apiKey: settings.openSubtitlesApiKey })
  const candidates = await client.search(parsed, file.path, missing)
  for (const language of missing) {
    const best = candidates.find((c) => normaliseLanguage(c.language) === language)
    if (!best) continue
    written.push(await client.download(best, file.path))
  }
  return written
}
