import { basename, extname, sep } from 'node:path'
import type { MediaKind, ParsedMedia } from '@shared/types'

/** `S03E16`, and `S03E23E24` for multi-episode files. */
const SXXEYY = /\bs(\d{1,2})((?:e\d{1,3})+)\b/i
/** The alternative `1x02` form. */
const NXNN = /\b(\d{1,2})x(\d{2,3})\b/i
/** Standalone 1900-2099 only, so "500" and "1080" are never years. */
const YEAR = /\b(19|20)\d{2}\b/

/**
 * Tokens that mark the end of a title. Everything from the first match
 * onwards is release metadata, not part of the name.
 */
const JUNK =
  /\b(?:\d{3,4}p|x26[45]|h\.?26[45]|hevc|10bit|8bit|web-?rip|web-?dl|bluray|brrip|dvdrip|hdtv|amzn|nf|hmax|dsnp|aac\d?|ac3|dts|ddp?5\.1|flac|xvid|divx|remux|proper|repack|extended|complete|season|\d+mb|\d+gb)\b/i

function normaliseSeparators(name: string): string {
  return name.replace(/[._]+/g, ' ').replace(/\s+/g, ' ').trim()
}

function cleanTitle(raw: string): string {
  return raw
    .replace(/[[(][^\])]*[\])]\s*$/g, '') // trailing complete bracketed blobs
    // Cutting the title at the year leaves the opening bracket behind, as in
    // "500 Days of Summer (" — strip any orphan opener and trailing separators.
    .replace(/[\s\-–_([{]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Index of the earliest match among the given patterns, or -1. */
function earliestIndex(text: string, patterns: RegExp[]): number {
  let best = -1
  for (const p of patterns) {
    const m = p.exec(text)
    if (m && (best === -1 || m.index < best)) best = m.index
  }
  return best
}

function yearFromAncestors(path: string): number | null {
  const parts = path.split(sep).slice(0, -1).reverse()
  for (const part of parts) {
    const m = YEAR.exec(part)
    if (m) return Number(m[0])
  }
  return null
}

function kindFromAncestors(path: string): MediaKind | null {
  const parts = path.split(sep).slice(0, -1)
  for (const part of parts) {
    if (/^(series|tv|shows)$/i.test(part)) return 'series'
    if (/^(movies|films)$/i.test(part)) return 'movie'
  }
  return null
}

export function parseFilename(absolutePath: string): ParsedMedia {
  const stem = basename(absolutePath, extname(absolutePath))
  const text = normaliseSeparators(stem)

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

  // Title ends at whichever comes first: the episode marker, the year,
  // or the first release-metadata token.
  const cut = earliestIndex(text, [SXXEYY, NXNN, YEAR, JUNK])
  const title = cleanTitle(cut === -1 ? text : text.slice(0, cut))

  const yearMatch = YEAR.exec(text)
  const year = yearMatch ? Number(yearMatch[0]) : yearFromAncestors(absolutePath)

  const kind: MediaKind =
    episodes.length > 0 ? 'series' : (kindFromAncestors(absolutePath) ?? 'movie')

  const tags = [...text.matchAll(new RegExp(JUNK.source, 'gi'))].map((m) => m[0])

  return { title, year, season, episodes, kind, tags }
}
