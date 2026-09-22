import { inflateRawSync } from 'node:zlib'
import { access, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, join } from 'node:path'
import type { ParsedMedia } from '@shared/types'
import { normaliseLanguage } from './localSubtitles'

const API = 'https://api.subdl.com/api/v1/subtitles'
const DOWNLOAD_HOST = 'https://dl.subdl.com'

export interface SubdlCandidate {
  /** Path on the download host, e.g. `/subtitle/abc.zip`. */
  url: string
  language: string
  releaseName: string
  author: string
  hearingImpaired: boolean
}

/**
 * Subtitle search through SubDL.
 *
 * Chosen over OpenSubtitles because a free key allows a couple of thousand
 * requests a day rather than a handful of downloads, which is the difference
 * between "fetch subtitles for this series" working and not. It also accepts a
 * TMDB id directly, and we already hold those, so matching does not depend on
 * parsing a title correctly.
 */
export class SubdlClient {
  constructor(private readonly apiKey: string) {}

  async search(
    parsed: ParsedMedia,
    languages: string[],
    tmdbId?: number
  ): Promise<SubdlCandidate[]> {
    const params = new URLSearchParams({ api_key: this.apiKey, subs_per_page: '30' })

    // A TMDB id is exact; a title is a guess. Prefer the id when we have one.
    if (tmdbId) params.set('tmdb_id', String(tmdbId))
    else params.set('film_name', parsed.title)

    if (parsed.kind === 'series') {
      params.set('type', 'tv')
      if (parsed.season !== null) params.set('season_number', String(parsed.season))
      if (parsed.episodes[0] !== undefined) {
        params.set('episode_number', String(parsed.episodes[0]))
      }
    } else {
      params.set('type', 'movie')
      if (parsed.year) params.set('year', String(parsed.year))
    }

    if (languages.length > 0) {
      params.set('languages', languages.map(toSubdlLanguage).join(','))
    }

    const response = await fetch(`${API}?${params.toString()}`)
    if (!response.ok) throw new Error(`SubDL search failed: ${response.status}`)

    const body = (await response.json()) as {
      status?: boolean
      error?: string
      subtitles?: Array<{
        url?: string
        language?: string
        release_name?: string
        author?: string
        hi?: boolean
      }>
    }
    if (body.status === false) throw new Error(body.error ?? 'SubDL rejected the search')

    return (body.subtitles ?? [])
      .filter((s): s is { url: string } & typeof s => typeof s.url === 'string')
      .map((s) => ({
        url: s.url,
        language: normaliseLanguage(s.language ?? 'unknown'),
        releaseName: s.release_name ?? '',
        author: s.author ?? '',
        hearingImpaired: s.hi === true
      }))
  }

  /**
   * Downloads a candidate next to the video and returns the written path.
   *
   * SubDL serves zip archives, so the first subtitle inside is extracted. The
   * language goes in the filename: that is what mpv reads to label the track,
   * and what a later scan reads to see this language is already covered.
   */
  async download(candidate: SubdlCandidate, videoPath: string): Promise<string> {
    const response = await fetch(DOWNLOAD_HOST + candidate.url)
    if (!response.ok) throw new Error(`SubDL download failed: ${response.status}`)

    const archive = Buffer.from(await response.arrayBuffer())
    const entry = extractFirstSubtitle(archive)
    if (!entry) throw new Error('no subtitle found inside the archive')

    const stem = basename(videoPath, extname(videoPath))
    const lang = normaliseLanguage(candidate.language)
    const target = await freeName(
      dirname(videoPath),
      `${stem}.${lang}`,
      entry.extension
    )
    await writeFile(target, entry.contents)
    return target
  }
}

/**
 * A path that does not exist yet, numbering later ones `.2`, `.3` and so on.
 *
 * Two subtitles in the same language is a normal thing to want — one release
 * may be out of sync where another is fine — so a second download must not
 * quietly replace the first.
 */
async function freeName(folder: string, stem: string, extension: string): Promise<string> {
  for (let n = 1; n < 50; n++) {
    const candidate = join(folder, n === 1 ? `${stem}${extension}` : `${stem}.${n}${extension}`)
    try {
      await access(candidate)
    } catch {
      return candidate
    }
  }
  return join(folder, `${stem}.${Date.now()}${extension}`)
}

/** SubDL asks for two-letter codes in upper case. */
export function toSubdlLanguage(code: string): string {
  const codes: Record<string, string> = {
    eng: 'EN',
    fre: 'FR',
    ara: 'AR',
    spa: 'ES',
    ger: 'DE',
    ita: 'IT',
    por: 'PT',
    dut: 'NL',
    rus: 'RU'
  }
  const iso3 = normaliseLanguage(code)
  return codes[iso3] ?? iso3.slice(0, 2).toUpperCase()
}

const SUBTITLE_EXTENSIONS = ['.srt', '.ass', '.ssa', '.vtt', '.sub']

export interface ArchiveEntry {
  name: string
  extension: string
  contents: Buffer
}

/**
 * Pulls the first subtitle out of a zip archive.
 *
 * Written against the zip format rather than pulling in a dependency: only two
 * of its compression methods are ever used in practice — stored and deflate —
 * and Node can already do both.
 *
 * Entries are found through the central directory at the end of the file, not
 * by walking local headers from the front. An archive written as a stream sets
 * a flag that leaves the sizes in every local header zeroed, filling them in
 * afterwards; reading those directly yields an empty subtitle and no way to
 * find where the next entry starts.
 */
export function extractFirstSubtitle(archive: Buffer): ArchiveEntry | null {
  for (const entry of listEntries(archive)) {
    const extension = SUBTITLE_EXTENSIONS.find((ext) => entry.name.toLowerCase().endsWith(ext))
    if (!extension) continue
    const contents = readEntry(archive, entry)
    // A corrupt entry should not stop us looking at the next one.
    if (contents && contents.length > 0) return { name: entry.name, extension, contents }
  }
  return null
}

interface CentralEntry {
  name: string
  method: number
  compressedSize: number
  localHeaderOffset: number
}

const END_OF_CENTRAL_DIRECTORY = 0x06054b50
const CENTRAL_FILE_HEADER = 0x02014b50

function listEntries(archive: Buffer): CentralEntry[] {
  // The end record is last, but a zip may carry a trailing comment, so it is
  // found by searching backwards rather than at a fixed offset.
  let end = -1
  for (let i = archive.length - 22; i >= 0; i--) {
    if (archive.readUInt32LE(i) === END_OF_CENTRAL_DIRECTORY) {
      end = i
      break
    }
  }
  if (end === -1) return []

  const count = archive.readUInt16LE(end + 10)
  let offset = archive.readUInt32LE(end + 16)
  const entries: CentralEntry[] = []

  for (let i = 0; i < count; i++) {
    if (offset + 46 > archive.length) break
    if (archive.readUInt32LE(offset) !== CENTRAL_FILE_HEADER) break

    const nameLength = archive.readUInt16LE(offset + 28)
    const extraLength = archive.readUInt16LE(offset + 30)
    const commentLength = archive.readUInt16LE(offset + 32)

    entries.push({
      name: archive.toString('utf8', offset + 46, offset + 46 + nameLength),
      method: archive.readUInt16LE(offset + 10),
      compressedSize: archive.readUInt32LE(offset + 20),
      localHeaderOffset: archive.readUInt32LE(offset + 42)
    })

    offset += 46 + nameLength + extraLength + commentLength
  }

  return entries
}

function readEntry(archive: Buffer, entry: CentralEntry): Buffer | null {
  const header = entry.localHeaderOffset
  if (header + 30 > archive.length) return null

  // The local header is still where the data lives; only its sizes are
  // unreliable, and those come from the central directory instead.
  const nameLength = archive.readUInt16LE(header + 26)
  const extraLength = archive.readUInt16LE(header + 28)
  const start = header + 30 + nameLength + extraLength
  const data = archive.subarray(start, start + entry.compressedSize)

  try {
    return entry.method === 0 ? Buffer.from(data) : inflateRawSync(data)
  } catch {
    return null
  }
}

/**
 * Best match for this file first.
 *
 * A subtitle cut for the same release is the one that will be in sync, so how
 * much of its release name appears in the filename decides the order. It is
 * scored by shared words rather than by containment: the same release is
 * written `AMZN.WEB-DL`, `AMZN WEBDL` and `Amzn.Web.Dl` depending on who
 * uploaded it, and none of those spellings contains the others.
 */
export function rankSubdl(
  candidates: SubdlCandidate[],
  releaseHint: string
): SubdlCandidate[] {
  const hint = new Set(tokenise(releaseHint))
  const score = (candidate: SubdlCandidate): number => {
    const words = tokenise(candidate.releaseName)
    // An upload with no release name tells us nothing, and must not outrank
    // one that names a release this file is not.
    if (words.length === 0) return 0
    return words.filter((word) => hint.has(word)).length / words.length
  }

  return [...candidates].sort((a, b) => {
    const byRelease = score(b) - score(a)
    if (Math.abs(byRelease) > 0.001) return byRelease
    // Hearing-impaired subtitles carry sound descriptions most people do not
    // want by default, so they rank below an equivalent plain track.
    if (a.hearingImpaired !== b.hearingImpaired) return a.hearingImpaired ? 1 : -1
    return 0
  })
}

/** Lowercase words, with the separators release names disagree about gone. */
function tokenise(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
}
