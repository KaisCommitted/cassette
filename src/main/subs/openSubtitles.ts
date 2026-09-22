import { createHash } from 'node:crypto'
import { open, writeFile } from 'node:fs/promises'
import { dirname, extname, join, basename } from 'node:path'
import type { ParsedMedia } from '@shared/types'

const API = 'https://api.opensubtitles.com/api/v1'

export interface SubtitleCandidate {
  id: string
  fileId: number
  language: string
  release: string
  downloads: number
  fromTrusted: boolean
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
      'User-Agent': this.config.userAgent ?? 'Mininetflix v0.1'
    }
  }

  async search(
    parsed: ParsedMedia,
    videoPath: string,
    languages: string[]
  ): Promise<SubtitleCandidate[]> {
    const params = new URLSearchParams()
    params.set('query', parsed.title)
    if (parsed.year) params.set('year', String(parsed.year))
    if (parsed.season !== null) params.set('season_number', String(parsed.season))
    if (parsed.episodes[0] !== undefined) {
      params.set('episode_number', String(parsed.episodes[0]))
    }
    params.set('languages', languages.join(','))

    // The file hash lets OpenSubtitles return subtitles already known to be in
    // sync with this exact release, which beats matching on title alone.
    const hash = await moviehash(videoPath).catch(() => null)
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
          files?: Array<{ file_id?: number }>
        }
      }>
    }

    return (body.data ?? [])
      .map((item) => ({
        id: item.id,
        fileId: item.attributes?.files?.[0]?.file_id ?? 0,
        language: item.attributes?.language ?? 'unknown',
        release: item.attributes?.release ?? '',
        downloads: item.attributes?.download_count ?? 0,
        fromTrusted: item.attributes?.from_trusted === true
      }))
      .filter((c) => c.fileId > 0)
      .sort(rankCandidates)
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
    const body = (await response.json()) as { link?: string }
    if (!body.link) throw new Error('OpenSubtitles returned no download link')

    const file = await fetch(body.link)
    if (!file.ok) throw new Error(`Subtitle fetch failed: ${file.status}`)
    const text = await file.text()

    const stem = basename(videoPath, extname(videoPath))
    const target = join(dirname(videoPath), `${stem}.${candidate.language}.srt`)
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
