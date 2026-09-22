import { basename, extname, sep } from 'node:path'

/**
 * Everything a single filename and its folders can tell us, before any
 * cross-file reasoning.
 *
 * Kept separate from the decision of what a file *is*: one filename often
 * cannot tell you. `Show - 03.mkv` is an episode when twenty siblings look
 * like it and a film called "Show 03" when it stands alone. This layer only
 * gathers evidence; `categorize` weighs it.
 */
export interface FileSignals {
  /** Title as read from the filename, junk stripped. */
  titleGuess: string
  /**
   * The title with any trailing number left in place.
   *
   * Stripping the number is right for an episode and wrong for a film —
   * `Ocean's 11` is not `Ocean's` — so both readings are kept and the
   * caller picks once it knows which it is looking at.
   */
  titleWithNumber: string
  /** Nearest ancestor folder that looks like a title rather than a release. */
  folderTitle: string | null
  year: number | null
  /** Season stated in the filename, e.g. the 3 in S03E04. */
  season: number | null
  /** Episodes stated outright. Empty when the filename does not say. */
  episodes: number[]
  /** A number that might be an episode, when nothing states one outright. */
  looseNumber: number | null
  /** Season stated by a folder, e.g. "Season 3" or "S03". */
  folderSeason: number | null
  /** An air date, for daily shows numbered by date rather than episode. */
  airDate: string | null
  /** Top-level Movies/ or Series/ folder, when there is one. */
  kindHint: 'series' | 'movie' | null
}

const SXXEYY = /\bs(\d{1,2})[\s._-]*((?:e\d{1,3}[\s._-]*)+)/i
const NXNN = /\b(\d{1,2})x(\d{2,3})\b/i
/** `Episode 5`, `Ep 5`, `E05`, `Part 3` — an episode without a season. */
const LOOSE_EPISODE = /\b(?:episode|episodio|ep|e|part|pt)[\s._-]*(\d{1,3})\b/i
const YEAR = /\b(19|20)\d{2}\b/
// Separators are normalised to spaces before this runs, so spaces count too.
const AIR_DATE = /\b(20\d{2})[\s.\-_](\d{2})[\s.\-_](\d{2})\b/
/** `Season 3`, `S03`, `Series 3`, `Saison 3` on a folder. */
const FOLDER_SEASON = /\b(?:season|series|saison|temporada|s)[\s._-]*(\d{1,2})\b/i

const JUNK =
  /\b(?:\d{3,4}p|4k|uhd|x26[45]|h\.?26[45]|hevc|avc|10bit|8bit|hdr|dv|web-?rip|web-?dl|webdl|bluray|bdrip|brrip|dvdrip|hdtv|amzn|nf|hmax|dsnp|atvp|aac\d?|ac3|eac3|dts(?:-hd)?|truehd|ddp?\d?(?:\.\d)?|flac|opus|xvid|divx|remux|proper|repack|extended|uncut|complete|multi|dual|subbed|dubbed|season|\d+mb|\d+gb)\b/i

/** Folders that describe a release rather than name a show. */
const RELEASE_FOLDER =
  /\b(?:\d{3,4}p|x26[45]|hevc|web-?rip|web-?dl|bluray|bdrip|hdtv|amzn|complete|season|s\d{1,2})\b/i

function normaliseSeparators(text: string): string {
  return (
    text
      // A leading [Group] names whoever released it, not the show.
      .replace(/^\s*\[[^\]]*\]\s*/, ' ')
      .replace(/[._]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  )
}

function cleanTitle(raw: string): string {
  return raw
    .replace(/[[(][^\])]*[\])]\s*$/g, '')
    .replace(/[\s\-–_([{]+$/g, '')
    .replace(/^[\s\-–_)\]}]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function earliestIndex(text: string, patterns: RegExp[]): number {
  let best = -1
  for (const pattern of patterns) {
    const match = pattern.exec(text)
    if (match && (best === -1 || match.index < best)) best = match.index
  }
  return best
}

/**
 * A trailing number that might be an episode.
 *
 * Deliberately conservative. Four-digit numbers are years, and a number that
 * opens the title belongs to it — `21 Jump Street` is not episode 21. Only a
 * number that follows the title is a candidate, which is the shape anime and
 * absolute-numbered releases actually use: `Show - 05 [1080p]`.
 */
export function findLooseNumber(
  text: string,
  year: number | null
): { value: number; index: number } | null {
  // Bracketed groups hold resolutions, hashes and release tags, never episodes.
  // Blanked rather than removed so indexes still line up with the original.
  const masked = text.replace(/[[(][^\])]*[\])]/g, (match) => ' '.repeat(match.length))
  const matches = [...masked.matchAll(/(?<![\w])(\d{1,3})(?![\w])/g)]

  for (let i = matches.length - 1; i >= 0; i--) {
    const match = matches[i]!
    const value = Number(match[1])
    // A number opening the title belongs to it: `21 Jump Street`.
    if (match.index === 0) continue
    if (year !== null && value === year) continue
    if (value === 0) continue
    return { value, index: match.index }
  }
  return null
}

/** Kept for callers that only need the value. */
export function extractLooseNumber(text: string, year: number | null): number | null {
  return findLooseNumber(text, year)?.value ?? null
}

/** Reads a `Season 3` style folder, ignoring the release noise around it. */
export function seasonFromFolder(name: string): number | null {
  const match = FOLDER_SEASON.exec(normaliseSeparators(name))
  if (!match) return null
  const value = Number(match[1])
  return value >= 0 && value <= 99 ? value : null
}

export function gatherSignals(absolutePath: string): FileSignals {
  const stem = basename(absolutePath, extname(absolutePath))
  const text = normaliseSeparators(stem)
  const folders = absolutePath.split(sep).slice(0, -1)

  let season: number | null = null
  let episodes: number[] = []

  const sxx = SXXEYY.exec(text)
  const nxn = NXNN.exec(text)

  if (sxx) {
    season = Number(sxx[1])
    episodes = [...sxx[2]!.matchAll(/e(\d{1,3})/gi)].map((m) => Number(m[1]))
  } else if (nxn) {
    season = Number(nxn[1])
    episodes = [Number(nxn[2])]
  }

  /*
   * A year that opens the title is the title — `1917`, `2012`, `1984`. Taking
   * it as the release year would leave the film with no name at all, so only a
   * year that follows something counts.
   */
  const yearMatches = [...text.matchAll(/\b(?:19|20)\d{2}\b/g)].filter((m) => m.index > 0)
  let year = yearMatches.length > 0 ? Number(yearMatches[0]![0]) : null
  const yearIndex = yearMatches.length > 0 ? yearMatches[0]!.index : -1

  const dateMatch = AIR_DATE.exec(text)
  const airDate = dateMatch ? `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}` : null
  // A date supplies its own year; do not also treat it as a release year.
  if (airDate) year = null

  // `Episode 5` with no season is still an outright statement of an episode.
  if (episodes.length === 0 && !airDate) {
    const loose = LOOSE_EPISODE.exec(text)
    if (loose) episodes = [Number(loose[1])]
  }

  const markerCut = earliestIndex(text, [SXXEYY, NXNN, LOOSE_EPISODE, AIR_DATE, JUNK])
  const cut =
    markerCut === -1 ? yearIndex : yearIndex === -1 ? markerCut : Math.min(markerCut, yearIndex)
  let titleGuess = cleanTitle(cut === -1 ? text : text.slice(0, cut))
  const titleWithNumber = titleGuess

  const loose =
    episodes.length === 0 && !airDate ? findLooseNumber(text, year) : null
  const looseNumber = loose?.value ?? null

  // With a loose number, the title is whatever came before it.
  if (loose && loose.index > 0) {
    titleGuess = cleanTitle(text.slice(0, loose.index))
  }

  /*
   * A filename that is nothing but a number — `01.mkv` sitting in a show's
   * folder — is an episode number, and the title has to come from the folder.
   */
  if (episodes.length === 0 && looseNumber === null && /^\d{1,3}$/.test(text)) {
    episodes = [Number(text)]
    titleGuess = ''
  }

  let folderSeason: number | null = null
  let folderTitle: string | null = null
  for (let i = folders.length - 1; i >= 0; i--) {
    const name = folders[i]!
    if (folderSeason === null) folderSeason = seasonFromFolder(name)
    if (folderTitle === null && !RELEASE_FOLDER.test(name) && !/^(movies|films|series|tv|shows|downloads|video|videos|media)$/i.test(name)) {
      folderTitle = cleanTitle(normaliseSeparators(name).replace(JUNK, '').trim())
    }
    if (folderSeason !== null && folderTitle !== null) break
  }

  let kindHint: 'series' | 'movie' | null = null
  for (const name of folders) {
    if (/^(series|tv|shows)$/i.test(name)) kindHint = 'series'
    else if (/^(movies|films)$/i.test(name)) kindHint = 'movie'
  }

  // Fall back to the folder when the filename yields nothing usable, which is
  // common for `Show/01.mkv` style layouts.
  if (titleGuess.length < 2 && folderTitle) titleGuess = folderTitle

  if (year === null && folderTitle) {
    const folderYear = YEAR.exec(folderTitle)
    if (folderYear) year = Number(folderYear[0])
  }

  return {
    titleGuess,
    titleWithNumber,
    folderTitle,
    year,
    season,
    episodes,
    looseNumber,
    folderSeason,
    airDate,
    kindHint
  }
}

/** Identity used to group files that belong to the same title. */
export function identityOf(signals: FileSignals): string {
  const base = signals.titleGuess || signals.folderTitle || ''
  return base
    .toLowerCase()
    .replace(/\b(19|20)\d{2}\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}
