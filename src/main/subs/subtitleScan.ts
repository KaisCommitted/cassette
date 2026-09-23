import type { Library, MediaFile, Settings, SubtitleSearchOptions } from '@shared/types'
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
  canTryOpenSubtitles?: boolean
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
 * Searches go to SubDL. OpenSubtitles is never tried on its own: its free tier
 * allows a handful of downloads a day against SubDL's couple of thousand, so
 * spending it is left to a person, one episode at a time, and only after SubDL
 * came back empty — the result says when that is worth offering.
 */
export async function scanForSubtitles(
  library: Library,
  scope: ScanScope,
  settings: Settings,
  onProgress?: (progress: ScanProgress) => void,
  options: SubtitleSearchOptions = {}
): Promise<ScanResultItem[]> {
  const targets = filesInScope(library, scope)
  const probe = new MediaProbe()
  await probe.load()

  const results: ScanResultItem[] = []

  for (const [index, target] of targets.entries()) {
    onProgress?.({ done: index, total: targets.length, current: target.label })
    results.push(await scanOne(target.file, target.label, settings, probe, options))
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
  probe: MediaProbe | null = null,
  options: SubtitleSearchOptions = {}
): Promise<ScanResultItem> {
  const wanted = wantedLanguages(settings)
  const provider = options.provider ?? 'subdl'
  const where = provider === 'subdl' ? 'SubDL' : 'OpenSubtitles'
  const openSubtitlesNext = provider === 'subdl' && Boolean(settings.openSubtitlesApiKey)

  // Inside the container first. Most files already carry subtitles, and
  // downloading a language that is already there is both wrong and a waste.
  const embeddedTracks = probe
    ? (await probe.probe(file.key, file.path)).subtitles
    : await probeEmbeddedSubtitles(file.path)

  // Forced, what is inside the file does not count: the point is to get a
  // different subtitle from the one it came with. Files already downloaded
  // beside it still do, so asking twice does not fetch the same one twice.
  const covered = new Set<string>()
  if (!options.force) {
    for (const track of embeddedTracks) {
      if (track.lang && track.lang !== 'und') covered.add(normaliseLanguage(track.lang))
    }
  }

  const local = await findLocalSubtitles(file.path)
  for (const sub of local) {
    if (sub.lang) covered.add(normaliseLanguage(sub.lang))
  }

  const missing = wanted.filter((lang) => !covered.has(lang))

  if (missing.length === 0) {
    if (embeddedTracks.length > 0 && !options.force) {
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

  const key = provider === 'subdl' ? settings.subdlApiKey : settings.openSubtitlesApiKey
  if (!key) {
    // Asked to look regardless, having subtitles already is not an answer.
    if (hasAny && !options.force) {
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
      detail: options.force
        ? `No ${where} key is set`
        : `Nothing embedded, nothing on disk, and no ${where} key is set`,
      canTryOpenSubtitles: openSubtitlesNext
    }
  }

  try {
    const written =
      provider === 'subdl'
        ? await downloadFromSubdl(file, missing, key)
        : await downloadFromOpenSubtitles(file, missing, key)
    if (written.length === 0) {
      return {
        key: file.key,
        label,
        status: 'nothing-found',
        detail: `${where} had no ${missing.map(languageName).join(' or ')} subtitle for it`,
        canTryOpenSubtitles: openSubtitlesNext
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

/** Fetches one SubDL subtitle per still-missing language, best match first. */
async function downloadFromSubdl(file: MediaFile, missing: string[], key: string): Promise<string[]> {
  const parsed = parseFilename(file.path)
  const written: string[] = []
  const client = new SubdlClient(key)
  // One search covers every language, so a file costs a single request no
  // matter how many languages are being filled in.
  const candidates = rankSubdl(await client.search(parsed, missing), file.path)
  for (const language of missing) {
    const best = candidates.find((c) => c.language === language)
    if (!best) continue
    written.push(await client.download(best, file.path))
  }
  return written
}

/** The same from OpenSubtitles, only ever run when someone asks for it. */
async function downloadFromOpenSubtitles(
  file: MediaFile,
  missing: string[],
  key: string
): Promise<string[]> {
  const parsed = parseFilename(file.path)
  const written: string[] = []
  const client = new OpenSubtitlesClient({ apiKey: key })
  const candidates = await client.search(parsed, file.path, missing)
  for (const language of missing) {
    const best = candidates.find((c) => normaliseLanguage(c.language) === language)
    if (!best) continue
    written.push(await client.download(best, file.path))
  }
  return written
}
