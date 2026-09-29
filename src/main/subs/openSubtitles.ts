import { createHash } from 'node:crypto'
import { open, writeFile } from 'node:fs/promises'
import { dirname, extname, basename } from 'node:path'
import type { MediaFile, ParsedMedia } from '@shared/types'
import { normaliseLanguage } from './language'
import { freeName, releaseHint, toSubdlLanguage } from './subdl'
import { identifySubtitle, identifyVideo, scoreMatch } from './subtitleMatch'

const API = 'https://api.opensubtitles.com/api/v1'

export interface SubtitleCandidate {
  id: string
  fileId: number
  language: string
  release: string
  /** The subtitle file's own name, when the upload gives one. */
  fileName: string
  downloads: number
  fromTrusted: boolean
  /** Found by the video's hash: made for this very release. */
  hashMatch: boolean
  hearingImpaired: boolean
  /** Only the foreign-language lines, not a full subtitle. */
  forced: boolean
  season: number | null
  episode: number | null
}

export interface OpenSubtitlesConfig {
  apiKey: string
  userAgent?: string
}

/**
 * Subtitle search and download through OpenSubtitles.
 *
 * Requires a personal API key, which the user supplies in settings — there is
 * no usable anonymous access. Everything here no-ops without one, so the rest
 * of the app works untouched when it is not configured.
 */
export class OpenSubtitlesClient {
  constructor(private readonly config: OpenSubtitlesConfig) {}

  private headers(): Record<string, string> {
    return {
      'Api-Key': this.config.apiKey,
      'Content-Type': 'application/json',
      // OpenSubtitles rejects requests without an identifying agent.
      'User-Agent': this.config.userAgent ?? 'Cassette v0.1'
    }
  }

  /**
   * Subtitles for a file, best first, with anything for another episode,
   * another film or only the foreign-language lines already left out
   * (rankOpenSubtitles).
   */
  async search(file: MediaFile, languages: string[]): Promise<SubtitleCandidate[]> {
    const params = new URLSearchParams()
    params.set('query', file.title)
    params.set('type', file.kind === 'series' ? 'episode' : 'movie')
    if (file.year) params.set('year', String(file.year))
    if (file.season !== null) params.set('season_number', String(file.season))
    if (file.episodes[0] !== undefined) {
      params.set('episode_number', String(file.episodes[0]))
    }
    // OpenSubtitles takes two-letter codes; `eng` found nothing at all.
    params.set('languages', languages.map((l) => toSubdlLanguage(l).toLowerCase()).join(','))

    // The file hash lets OpenSubtitles return subtitles already known to be in
    // sync with this exact release, which beats matching on title alone.
    const hash = await moviehash(file.path).catch(() => null)
    if (hash) params.set('moviehash', hash)

    const response = await fetch(`${API}/subtitles?${params.toString()}`, {
      headers: this.headers()
    })
    if (!response.ok) {
      throw new Error(`OpenSubtitles search failed: ${response.status}`)
    }

    const body = (await response.json()) as {
      data?: Array<{
        id: string
        attributes?: {
          language?: string
          release?: string
          download_count?: number
          from_trusted?: boolean
          moviehash_match?: boolean
          hearing_impaired?: boolean
          foreign_parts_only?: boolean
          feature_details?: { season_number?: number | null; episode_number?: number | null }
          files?: Array<{ file_id?: number; file_name?: string }>
        }
      }>
    }

    const candidates = (body.data ?? [])
      .map((item) => {
        const a = item.attributes
        return {
          id: item.id,
          fileId: a?.files?.[0]?.file_id ?? 0,
          language: a?.language ?? 'unknown',
          release: a?.release ?? '',
          fileName: a?.files?.[0]?.file_name ?? '',
          downloads: a?.download_count ?? 0,
          fromTrusted: a?.from_trusted === true,
          hashMatch: a?.moviehash_match === true,
          hearingImpaired: a?.hearing_impaired === true,
          forced: a?.foreign_parts_only === true,
          season: a?.feature_details?.season_number ?? null,
          episode: a?.feature_details?.episode_number ?? null
        }
      })
      .filter((c) => c.fileId > 0)
    return rankOpenSubtitles(candidates, file)
  }

  /** Downloads a candidate next to the video and returns the written path. */
  async download(candidate: SubtitleCandidate, videoPath: string): Promise<string> {
    const response = await fetch(`${API}/download`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ file_id: candidate.fileId })
    })
    if (!response.ok) {
      throw new Error(`OpenSubtitles download failed: ${response.status}`)
    }
    const body = (await response.json()) as { link?: string; file_name?: string }
    if (!body.link) throw new Error('OpenSubtitles returned no download link')

    const file = await fetch(body.link)
    if (!file.ok) throw new Error(`Subtitle fetch failed: ${file.status}`)
    const text = await file.text()

    // Named the way SubDL downloads are, `.eng` rather than `.en`, and
    // numbered rather than written over a subtitle already there.
    const stem = basename(videoPath, extname(videoPath))
    const lang = normaliseLanguage(candidate.language)
    const suffix = candidate.hearingImpaired ? '.sdh' : ''
    const extension = /^\.(srt|ass|ssa|vtt)$/i.test(extname(body.file_name ?? ''))
      ? extname(body.file_name!).toLowerCase()
      : '.srt'
    const target = await freeName(dirname(videoPath), `${stem}.${lang}${suffix}`, extension)
    await writeFile(target, text, 'utf8')
    return target
  }
}

/** Trusted uploads and popular releases first; they are in sync more often. */
export function rankCandidates(a: SubtitleCandidate, b: SubtitleCandidate): number {
  if (a.fromTrusted !== b.fromTrusted) return a.fromTrusted ? -1 : 1
  return b.downloads - a.downloads
}

/**
 * Best first, and nothing that is for something else.
 *
 * The same checks as SubDL's: an episode OpenSubtitles files under another
 * season or episode, or whose file or release names another one outright,
 * is not this episode, and a film named for another year is another film.
 * Titles are not compared here — a release is often named only by its group
 * — only what the name says about episode and year. A subtitle found by the
 * video's own hash is made for this release, and goes first; then the
 * episode OpenSubtitles files it under; then how much of the release name
 * this file shares; then plain over hearing-impaired, trusted and popular.
 */
export function rankOpenSubtitles(
  candidates: SubtitleCandidate[],
  file: MediaFile
): SubtitleCandidate[] {
  const video = identifyVideo(file.path, file)
  const first = file.episodes[0]
  const hint = new Set(words(releaseHint(file.path)))
  const shared = (c: SubtitleCandidate): number => {
    const release = words(c.release)
    return release.length === 0 ? 0 : release.filter((w) => hint.has(w)).length / release.length
  }

  const fits = (c: SubtitleCandidate): boolean => {
    if (c.forced) return false
    if (file.kind === 'series') {
      if (c.season !== null && file.season !== null && c.season !== file.season) return false
      if (c.episode !== null && first !== undefined && c.episode !== first) return false
    }
    let namesEpisode = false
    for (const name of [c.fileName, c.release]) {
      if (!name) continue
      const identity = identifySubtitle(`${name.replace(/\.(srt|ass|ssa|vtt|sub)$/i, '')}.srt`)
      if (scoreMatch({ ...identity, words: [] }, video) === null) return false
      if (identity.readings.length > 0) namesEpisode = true
    }
    // For an episode, something has to say it is this one: OpenSubtitles'
    // own filing, the name, or the video's hash. A result that says nothing
    // at all could be any episode of the show.
    if (file.kind === 'series' && !c.hashMatch && c.episode === null && !namesEpisode) {
      return false
    }
    return true
  }

  return candidates.filter(fits).sort((a, b) => {
    if (a.hashMatch !== b.hashMatch) return a.hashMatch ? -1 : 1
    const aExact = a.episode !== null && a.episode === first
    const bExact = b.episode !== null && b.episode === first
    if (aExact !== bExact) return aExact ? -1 : 1
    const byRelease = shared(b) - shared(a)
    if (Math.abs(byRelease) > 0.001) return byRelease
    if (a.hearingImpaired !== b.hearingImpaired) return a.hearingImpaired ? 1 : -1
    return rankCandidates(a, b)
  })
}

function words(value: string): string[] {
  return value.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
}



/**
 * OpenSubtitles' hash: the file size plus the first and last 64 KiB, summed as
 * 64-bit little-endian integers. It identifies a release without uploading it.
 */
export async function moviehash(path: string): Promise<string> {
  const CHUNK = 65536
  const handle = await open(path, 'r')
  try {
    const { size } = await handle.stat()
    if (size < CHUNK * 2) throw new Error('file too small to hash')

    let hash = BigInt(size)
    const buffer = Buffer.alloc(CHUNK)

    for (const position of [0, size - CHUNK]) {
      await handle.read(buffer, 0, CHUNK, position)
      for (let offset = 0; offset < CHUNK; offset += 8) {
        hash = (hash + buffer.readBigUInt64LE(offset)) & 0xffffffffffffffffn
      }
    }
    return hash.toString(16).padStart(16, '0')
  } finally {
    await handle.close()
  }
}

/** Stable id for caching a search, so a repeated scan does not re-query. */
export function searchCacheKey(parsed: ParsedMedia, languages: string[]): string {
  return createHash('sha1')
    .update(
      [parsed.title, parsed.year, parsed.season, parsed.episodes.join('-'), ...languages].join(':')
    )
    .digest('hex')
    .slice(0, 16)
}
