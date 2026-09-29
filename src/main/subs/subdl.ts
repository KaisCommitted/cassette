import { inflateRawSync } from 'node:zlib'
import { access, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, join } from 'node:path'
import type { MediaFile, ParsedMedia } from '@shared/types'
import { gatherSignals } from '../library/signals'
import { parseFilename } from '../library/parseFilename'
import { normaliseLanguage } from './language'
import {
  identifySubtitle,
  identifyVideo,
  MATCH,
  scoreMatch,
  type Flavour,
  type SubtitleIdentity
} from './subtitleMatch'

const API = 'https://api.subdl.com/api/v1/subtitles'
const DOWNLOAD_HOST = 'https://dl.subdl.com'

export interface SubdlCandidate {
  /** Path on the download host, e.g. `/subtitle/abc.zip`. */
  url: string
  language: string
  releaseName: string
  author: string
  /** SubDL's own flag, which is set on plain uploads too; see rankSubdl. */
  hearingImpaired: boolean
  season: number | null
  /**
   * The episodes it covers, first to last. Null for a season pack, which
   * SubDL sends back mixed in with the episode's own subtitles.
   */
  episodeFrom: number | null
  episodeTo: number | null
  fullSeason: boolean
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
        season?: number | null
        episode?: number | null
        episode_from?: number | null
        episode_end?: number | null
        full_season?: boolean
      }>
    }
    if (body.status === false) throw new Error(body.error ?? 'SubDL rejected the search')

    const count = (value: unknown): number | null =>
      typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null

    return (body.subtitles ?? [])
      .filter((s): s is { url: string } & typeof s => typeof s.url === 'string')
      .map((s) => {
        const pack = s.full_season === true
        const from = pack ? null : (count(s.episode_from) ?? count(s.episode))
        return {
          url: s.url,
          language: normaliseLanguage(s.language ?? 'unknown'),
          releaseName: s.release_name ?? '',
          author: s.author ?? '',
          hearingImpaired: s.hi === true,
          season: typeof s.season === 'number' ? s.season : null,
          episodeFrom: from,
          // A pack comes back with an end of 0, meaning none.
          episodeTo: pack ? null : (count(s.episode_end) ?? from),
          fullSeason: pack
        }
      })
  }

  /**
   * Downloads a candidate next to the video and returns the written path, or
   * null when the archive holds nothing that is this file's subtitle.
   *
   * SubDL serves zip archives, and a season pack holds the whole season, so
   * the entry written is the one that is this episode (pickArchiveEntry) —
   * never simply the first, which handed every episode the season's opener.
   * The language goes in the filename: that is what mpv reads to label the
   * track, and what a later scan reads to see this language is already
   * covered.
   */
  async download(candidate: SubdlCandidate, file: MediaFile): Promise<string | null> {
    const archive = await fetchArchive(DOWNLOAD_HOST + candidate.url)
    const lang = normaliseLanguage(candidate.language)
    const entry = pickArchiveEntry(archive, file, {
      language: lang,
      coverage: coverageOf(candidate, file) ?? 'pack'
    })
    if (!entry) return null

    const stem = basename(file.path, extname(file.path))
    // SDH stays visible in the name, so the menu can say so and the default
    // pick can prefer a plain track over it.
    const suffix = entry.flavour === 'sdh' ? '.sdh' : ''
    const target = await freeName(dirname(file.path), `${stem}.${lang}${suffix}`, entry.extension)
    await writeFile(target, entry.contents)
    return target
  }
}

/**
 * Archives fetched recently, by address.
 *
 * Scanning a season whose only subtitles are a pack asks for the same pack
 * once per episode; keeping the last few spares SubDL, and the wait, all but
 * the first time. Only a real archive with a subtitle in it is kept — an
 * error page served as a download would otherwise be handed back all scan —
 * and nothing large, since these sit in memory until the scan ends
 * (clearArchiveCache). The most recently used are the ones kept.
 */
const recentArchives = new Map<string, Buffer>()
const RECENT_ARCHIVES = 4
const LARGEST_KEPT_ARCHIVE = 10 * 1024 * 1024

async function fetchArchive(url: string): Promise<Buffer> {
  const kept = recentArchives.get(url)
  if (kept) {
    recentArchives.delete(url)
    recentArchives.set(url, kept)
    return kept
  }
  const response = await fetch(url)
  if (!response.ok) throw new Error(`SubDL download failed: ${response.status}`)
  const archive = Buffer.from(await response.arrayBuffer())
  if (archive.length <= LARGEST_KEPT_ARCHIVE && readArchiveSubtitles(archive).length > 0) {
    recentArchives.set(url, archive)
    if (recentArchives.size > RECENT_ARCHIVES) {
      recentArchives.delete(recentArchives.keys().next().value!)
    }
  }
  return archive
}

/** Forgets every archive kept for reuse, once a scan is over. */
export function clearArchiveCache(): void {
  recentArchives.clear()
}

/**
 * A path that does not exist yet, numbering later ones `.2`, `.3` and so on.
 *
 * Two subtitles in the same language is a normal thing to want — one release
 * may be out of sync where another is fine — so a second download must not
 * quietly replace the first.
 */
export async function freeName(folder: string, stem: string, extension: string): Promise<string> {
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

const SUBTITLE_EXTENSIONS = ['.srt', '.ass', '.ssa', '.vtt', '.sub', '.idx']

export interface ArchiveEntry {
  name: string
  extension: string
  contents: Buffer
}

/**
 * Every subtitle in a zip archive, in the order it holds them.
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
export function readArchiveSubtitles(archive: Buffer): ArchiveEntry[] {
  const out: ArchiveEntry[] = []
  for (const entry of listEntries(archive)) {
    const extension = SUBTITLE_EXTENSIONS.find((ext) => entry.name.toLowerCase().endsWith(ext))
    if (!extension) continue
    // Finder's shadow copies of every file, not subtitles.
    if (/(^|\/)__MACOSX\//.test(entry.name)) continue
    const contents = readEntry(archive, entry)
    // A corrupt entry should not stop us looking at the next one.
    if (contents && contents.length > 0) out.push({ name: entry.name, extension, contents })
  }
  return out
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
 * How much of a series file a candidate covers: exactly its episodes, the
 * first of a double episode, a range of episodes including it, or a whole
 * season. Null when it is for something else. A film's are always `exact`.
 *
 * SubDL's own fields are typed in by whoever uploaded, so the release name
 * is read as well, with the library's parser: a release that names another
 * episode outright is not this one, whatever the fields say.
 */
export type Coverage = 'exact' | 'partial' | 'range' | 'pack'

export function coverageOf(candidate: SubdlCandidate, file: MediaFile): Coverage | null {
  if (file.kind !== 'series') return 'exact'
  const first = file.episodes[0]
  const last = file.episodes[file.episodes.length - 1]
  if (first === undefined || last === undefined) return 'pack'

  if (candidate.season !== null && file.season !== null && candidate.season !== file.season) {
    return null
  }

  const named = gatherSignals(`${candidate.releaseName}.srt`)
  if (named.season !== null && named.episodes.length > 0) {
    if (file.season !== null && named.season !== file.season) return null
    if (!named.episodes.includes(first)) return null
  }

  const from = candidate.episodeFrom
  const to = candidate.episodeTo ?? from
  if (from === null || to === null) return 'pack'
  if (from === first && to === last) return 'exact'
  if (from === first && to === from) return 'partial'
  if (from <= first && to >= last) return 'range'
  return null
}

const COVERAGE_ORDER: Record<Coverage, number> = { exact: 0, partial: 1, range: 2, pack: 3 }

/**
 * What a file says about the release it is, to score subtitle release names
 * against: its own name, plus the release tags on its folder — a season
 * pack's episodes are often named plainly, with the `720p AMZN WEBRip` on
 * the folder they sit in. Never the whole path: a folder called `Season 6
 * Complete` made every season pack look like the best match.
 */
export function releaseHint(path: string): string {
  const folder = basename(dirname(path))
  const tags = parseFilename(`${folder}.mkv`).tags.filter(
    (tag) => !/^(season|complete)$/i.test(tag)
  )
  return [basename(path, extname(path)), ...tags].join(' ')
}

/**
 * Best match for this file first, and nothing that is for another episode.
 *
 * What a candidate covers comes first: this episode's own subtitle, then a
 * range that includes it, then a season pack, from which only the right
 * entry will be taken. Within that, a subtitle cut for the same release is
 * the one that will be in sync, so how much of its release name appears in
 * the file's decides the order. It is scored by shared words rather than by
 * containment: the same release is written `AMZN.WEB-DL`, `AMZN WEBDL` and
 * `Amzn.Web.Dl` depending on who uploaded it, and none of those spellings
 * contains the others.
 */
export function rankSubdl(candidates: SubdlCandidate[], file: MediaFile): SubdlCandidate[] {
  const hint = new Set(tokenise(releaseHint(file.path)))
  const score = (candidate: SubdlCandidate): number => {
    const words = tokenise(candidate.releaseName)
    // An upload with no release name tells us nothing, and must not outrank
    // one that names a release this file is not.
    if (words.length === 0) return 0
    return words.filter((word) => hint.has(word)).length / words.length
  }
  // SubDL marks plain uploads hearing-impaired as often as not, so what the
  // release name says — `.HI`, `SDH` — counts first, and the flag only after.
  const namedSdh = (candidate: SubdlCandidate): boolean =>
    identifySubtitle(`${candidate.releaseName}.srt`).flavour === 'sdh'

  return candidates
    .map((candidate) => ({ candidate, coverage: coverageOf(candidate, file) }))
    .filter((c): c is { candidate: SubdlCandidate; coverage: Coverage } => c.coverage !== null)
    .sort((a, b) => {
      const byCoverage = COVERAGE_ORDER[a.coverage] - COVERAGE_ORDER[b.coverage]
      if (byCoverage !== 0) return byCoverage
      const byRelease = score(b.candidate) - score(a.candidate)
      if (Math.abs(byRelease) > 0.001) return byRelease
      // Hearing-impaired subtitles carry sound descriptions most people do
      // not want by default, so they rank below an equivalent plain track.
      const bySdh = Number(namedSdh(a.candidate)) - Number(namedSdh(b.candidate))
      if (bySdh !== 0) return bySdh
      if (a.candidate.hearingImpaired !== b.candidate.hearingImpaired) {
        return a.candidate.hearingImpaired ? 1 : -1
      }
      return 0
    })
    .map((c) => c.candidate)
}

/** Director's cut, extended and the like: a different length of film. */
const CUT = /\b(extended|director'?s|directors|theatrical|unrated|uncut|remastered|imax)\b/gi

function cutsOf(name: string): Set<string> {
  const text = name.toLowerCase().replace(/[._]/g, ' ')
  return new Set([...text.matchAll(CUT)].map((m) => m[1]!.replace(/'/g, '')))
}

export interface PickedEntry extends ArchiveEntry {
  flavour: Flavour
}

/**
 * The entry in an archive that is this file's subtitle, or null if none is.
 *
 * Each entry's name — and the folders it sits in inside the archive — is
 * read the way the library reads a video's, and matched to the file by what
 * it is (subtitleMatch.ts). An entry for another episode, another language or
 * another film is never taken. From anything but an archive made for this
 * one episode, an entry must also say outright which episode it is: better
 * nothing than the season's first episode written down as this one.
 *
 * Of what is left, a film's choice is deliberate too: whole-film subtitles
 * over `CD1`/`CD2` halves (unless the file itself is a half), the cut the
 * file is (extended, director's) over another, full dialogue over SDH, and
 * never a forced track, which only covers the foreign-language lines.
 */
export function pickArchiveEntry(
  archive: Buffer,
  file: MediaFile,
  options: { language: string; coverage: Coverage }
): PickedEntry | null {
  const video = identifyVideo(file.path, file)
  const entries = readArchiveSubtitles(archive)
  // A VobSub needs its `.idx` and `.sub` together; one file is written here,
  // so neither half of one is any use.
  const vobsubs = new Set(
    entries.filter((e) => e.extension === '.idx').map((e) => e.name.slice(0, -4).toLowerCase())
  )
  const videoCuts = cutsOf(basename(file.path))
  const hint = new Set(tokenise(releaseHint(file.path)))

  const choices: Array<{
    entry: ArchiveEntry
    identity: SubtitleIdentity
    score: number
    cutMisses: number
    overlap: number
    order: number
  }> = []
  for (const [order, entry] of entries.entries()) {
    if (entry.extension === '.idx') continue
    if (entry.extension === '.sub' && vobsubs.has(entry.name.slice(0, -4).toLowerCase())) continue

    const parts = entry.name.split(/[\\/]/).filter(Boolean)
    const name = parts.pop()!
    const identity = identifySubtitle(name, parts)

    if (identity.lang && identity.lang !== options.language) continue
    if (identity.flavour === 'forced') continue
    // The archive was found for this one file, so a name that disagrees about
    // the title is not a rival's; only another episode or year rules it out.
    const score = scoreMatch(identity, video, { alone: true })
    if (score === null) continue
    if (file.kind === 'series' && options.coverage !== 'exact' && score < MATCH.partial) continue
    if (file.kind !== 'series' && identity.cd !== null && video.cd === null) continue

    const cuts = cutsOf(name)
    let cutMisses = 0
    for (const cut of cuts) if (!videoCuts.has(cut)) cutMisses++
    for (const cut of videoCuts) if (!cuts.has(cut)) cutMisses++
    const overlap = tokenise(name).filter((word) => hint.has(word)).length

    choices.push({ entry, identity, score, cutMisses, overlap, order })
  }

  choices.sort(
    (a, b) =>
      b.score - a.score ||
      a.cutMisses - b.cutMisses ||
      FLAVOUR_ORDER[a.identity.flavour] - FLAVOUR_ORDER[b.identity.flavour] ||
      b.overlap - a.overlap ||
      a.order - b.order
  )
  const best = choices[0]
  return best ? { ...best.entry, flavour: best.identity.flavour } : null
}

const FLAVOUR_ORDER: Record<Flavour, number> = { full: 0, sdh: 1, forced: 2 }

/** Lowercase words, with the separators release names disagree about gone. */
function tokenise(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
}
