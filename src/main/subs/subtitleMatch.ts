import { basename, extname } from 'node:path'
import type { MediaFile, MediaKind } from '@shared/types'
import { parseFilename } from '../library/parseFilename'
import { gatherSignals, identityOf, seasonFromFolder, type FileSignals } from '../library/signals'
import { readTrailingTags, type Flavour } from './language'

export type { Flavour } from './language'

/**
 * What a subtitle file is, and whether it belongs to a given video.
 *
 * A subtitle's name is read with the same parser the library uses to tell
 * series, episodes and films apart (library/signals.ts), so a subtitle is
 * matched to a video by what both of them *are* — the same episode of the
 * same show, or the same film — rather than by whether one filename happens
 * to start with the other. `Show.S01E03.srt` belongs to
 * `Show - 1x03 - Title.mkv`; `Show.S01E04.srt` never does, however the
 * folder is laid out.
 *
 * Used for subtitles found on disk (localSubtitles.ts) and for picking the
 * right entry out of a downloaded archive (subdl.ts), which is where a season
 * pack used to hand every episode the same first file.
 */

/** One way of reading which episode a name refers to. */
export interface EpisodeReading {
  /** Null when the name gives no season, as absolute numbering does not. */
  season: number | null
  episodes: number[]
}

export interface SubtitleIdentity {
  /** The name without its extension, lowercased, for the named-for check. */
  stem: string
  /** Significant words of the title it names, if it names one. */
  words: string[]
  year: number | null
  /** Empty when the name states no episode at all. */
  readings: EpisodeReading[]
  /**
   * A season-and-episode marker or an air date: something only an episode
   * carries, so a film can never be what it is for.
   */
  seasoned: boolean
  lang: string | null
  flavour: Flavour
  /** `CD1`, `CD2`: half of a film split across two files. */
  cd: number | null
}

export interface VideoIdentity {
  path: string
  stem: string
  kind: MediaKind
  /** Where the library places it: its own season and episodes. */
  placed: EpisodeReading | null
  /** What its filename alone says, for names the library renumbered. */
  raw: EpisodeReading[]
  words: string[]
  year: number | null
  cd: number | null
}

/**
 * How sure a match is. Only the order matters: the best-matching video in a
 * folder is the one a subtitle is offered to.
 */
export const MATCH = {
  /** Named after the video: `Show S01E01.eng.srt` beside `Show S01E01.mkv`. */
  named: 100,
  /** The same episode, with the season stated. */
  episodeSeasoned: 60,
  /** The same episode, the season left unsaid (absolute numbering). */
  episode: 50,
  /** The first of a double episode, for the double-episode file. */
  partial: 30,
  /** The same film by title. Up to 15 more for how closely it agrees. */
  title: 20,
  /** Nothing either way. Only ever good enough when there is one video. */
  unknown: 1
} as const

/** Folders that hold subtitles, as opposed to naming a release or an episode. */
export const SUBTITLE_FOLDER = /(?:^|[\s._-])(?:subs?|subtitles?|subtitulos|legendas|srt)(?:$|[\s._-])/i

const STOPWORDS = new Set(['the', 'and', 'of', 'an', 'les', 'le', 'la', 'el', 'der', 'die', 'das'])

const CD = /\b(?:cd|disc|disk)[\s._-]*(\d)\b/i

/** Significant words of a title, for comparing two spellings of one name. */
export function titleWords(title: string): string[] {
  return title
    .toLowerCase()
    .replace(/\b(19|20)\d{2}\b/g, ' ')
    .split(/[^a-z0-9]+/)
    .filter((word) => (word.length >= 3 || /^\d+$/.test(word)) && !STOPWORDS.has(word))
}

/**
 * The episodes a set of signals points at, every way it can be read.
 *
 * An outright marker is one reading. A bare number following the title is
 * the episode, and three-digit ones are also tried as packed season and
 * episode — `305` for season 3 episode 5 — exactly as the library does when
 * a whole show is numbered that way.
 */
function readingsOf(signals: FileSignals, folderSeason: number | null): EpisodeReading[] {
  if (signals.episodes.length > 0) {
    return [{ season: signals.season ?? folderSeason, episodes: signals.episodes }]
  }
  if (signals.airDate) {
    const [year, month, day] = signals.airDate.split('-').map(Number)
    return [{ season: year!, episodes: [month! * 100 + day!] }]
  }
  if (signals.looseNumber !== null) {
    const n = signals.looseNumber
    const readings: EpisodeReading[] = [{ season: folderSeason, episodes: [n] }]
    if (n >= 100 && n % 100 !== 0) {
      readings.push({ season: Math.floor(n / 100), episodes: [n % 100] })
    }
    return readings
  }
  return []
}

/** Reads a name as if it were a video's, with no folders to lean on. */
function signalsFor(name: string): FileSignals {
  return gatherSignals(`${name}.srt`)
}

/**
 * What a subtitle is, from its name and the folders between it and the video.
 *
 * `folders` runs outermost first and holds only folders below where the
 * search started — `Subs`, or `Subs/Show.S01E03.1080p` in the layout RARBG
 * uses — never the library folders above, which describe the video's show
 * rather than this file. A name that says nothing of its own, like
 * `2_English.srt`, takes what it is from the nearest of those folders that
 * does.
 */
export function identifySubtitle(name: string, folders: string[] = []): SubtitleIdentity {
  const stem = basename(name, extname(name))
  const { rest: own, lang, flavour } = readTrailingTags(stem)

  let folderSeason: number | null = null
  for (let i = folders.length - 1; i >= 0 && folderSeason === null; i--) {
    folderSeason = seasonFromFolder(folders[i]!)
  }

  let signals = own ? signalsFor(own) : null
  let readings = signals ? readingsOf(signals, folderSeason) : []
  let words = signals ? titleWords(identityOf(signals)) : []

  if (readings.length === 0 && words.length === 0) {
    for (let i = folders.length - 1; i >= 0; i--) {
      const folder = folders[i]!
      // `Subs`, `English`: a folder that only says it holds subtitles, or in
      // which language, says nothing about what they are for.
      if (readTrailingTags(folder).rest === '') continue
      const fromFolder = signalsFor(folder)
      const folderReadings = readingsOf(fromFolder, folderSeason)
      const folderWords = titleWords(identityOf(fromFolder))
      if (folderReadings.length === 0 && folderWords.length === 0) continue
      signals = fromFolder
      readings = folderReadings
      words = folderWords
      break
    }
  }

  const cd = CD.exec(stem)
  return {
    stem: stem.toLowerCase(),
    words,
    year: signals?.year ?? null,
    readings,
    seasoned: Boolean(signals && (signals.season !== null || signals.airDate !== null)),
    lang,
    flavour,
    cd: cd ? Number(cd[1]) : null
  }
}

/**
 * What a video is: where the library placed it when that is known, and what
 * its own name says either way.
 */
export function identifyVideo(path: string, placed?: MediaFile | null): VideoIdentity {
  const signals = gatherSignals(path)
  const kind = placed?.kind ?? (signals.episodes.length > 0 || signals.airDate ? 'series' : 'movie')
  const season = placed ? placed.season : (signals.season ?? signals.folderSeason)
  const episodes = placed ? placed.episodes : signals.episodes
  const words = new Set([
    ...titleWords(placed?.title ?? ''),
    ...titleWords(identityOf(signals)),
    ...(kind === 'movie' ? titleWords(signals.titleWithNumber) : episodeTitleWords(path))
  ])
  const cd = CD.exec(basename(path))
  return {
    path,
    stem: basename(path, extname(path)).toLowerCase(),
    kind,
    placed:
      kind === 'series' && episodes.length > 0
        ? { season: season ?? null, episodes }
        : null,
    raw: readingsOf(signals, signals.folderSeason),
    words: [...words],
    year: placed?.year ?? signals.year,
    cd: cd ? Number(cd[1]) : null
  }
}

/**
 * The rest of an episode's name once the release tags are gone, which is
 * usually its title — `Forest Green` in `The Mentalist S06E18 Forest Green` —
 * so that a subtitle named only for the episode's title is not taken for
 * another show's.
 */
function episodeTitleWords(path: string): string[] {
  const tags = new Set(parseFilename(path).tags.map((tag) => tag.toLowerCase()))
  return titleWords(basename(path, extname(path))).filter(
    (word) => !tags.has(word) && !/^\d+$/.test(word) && !/^s\d+e\d+/.test(word)
  )
}

/**
 * Whether a subtitle is named for the video: the video's name, alone or
 * followed by more. `Show E1.eng` is; `Show E10.eng` is not.
 */
export function namedFor(subtitleStem: string, videoStem: string): boolean {
  if (!subtitleStem.startsWith(videoStem)) return false
  const next = subtitleStem.charAt(videoStem.length)
  return next === '' || /[.\-_\s[(]/.test(next)
}

function sameEpisodes(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((n, i) => n === b[i])
}

/**
 * How well the readings of a subtitle agree with one reading of a video.
 *
 * The same episodes is a match. So, less strongly, is a subtitle for only
 * the first half of a double episode — it is in sync for as long as it runs.
 * A subtitle for the second half is not: it would start twenty minutes early.
 */
function episodeScore(sub: EpisodeReading[], video: EpisodeReading[]): number {
  let best = 0
  for (const s of sub) {
    for (const v of video) {
      if (s.season !== null && v.season !== null && s.season !== v.season) continue
      const seasoned = s.season !== null && v.season !== null
      if (sameEpisodes(s.episodes, v.episodes)) {
        best = Math.max(best, seasoned ? MATCH.episodeSeasoned : MATCH.episode)
      } else if (s.episodes[0] === v.episodes[0]) {
        best = Math.max(best, MATCH.partial)
      }
    }
  }
  return best
}

/**
 * How well a subtitle fits a video, or null when it is for something else.
 *
 * Null is a firm no, whatever the folder looks like: another episode, another
 * season, another film, another year of a remade film. Everything else is a
 * score, compared across a folder's videos to decide which one a subtitle is
 * offered to.
 *
 * A title that shares no word with the video's is a no as well — unless the
 * video is `alone`, the only one the subtitle could be for. Then it is only
 * a name that does not agree, and names disagree for innocent reasons: a
 * film saved as `tt-inc-1080p.mkv` beside `Inception.2010.eng.srt`, an
 * anime under its English title with a subtitle under its Japanese one.
 */
export function scoreMatch(
  sub: SubtitleIdentity,
  video: VideoIdentity,
  options: { alone?: boolean } = {}
): number | null {
  const shared = sub.words.filter((word) => video.words.includes(word)).length
  const titleClash = sub.words.length > 0 && video.words.length > 0 && shared === 0
  if (titleClash && !options.alone) return null

  let score: number
  if (video.kind === 'series') {
    if (sub.readings.length > 0) {
      const readings = video.placed ? [video.placed, ...video.raw] : video.raw
      score = episodeScore(sub.readings, readings)
      if (score === 0) return null
    } else {
      score = MATCH.unknown
    }
    if (titleClash) score = MATCH.unknown
  } else {
    if (sub.seasoned) return null
    // `Part 1` against `Part 2`: the only numbering a film has to go wrong on.
    if (sub.readings.length > 0 && video.raw.length > 0) {
      if (episodeScore(sub.readings, video.raw) === 0) return null
    }
    if (sub.year !== null && video.year !== null && sub.year !== video.year) return null
    if (sub.cd !== null && video.cd !== null && sub.cd !== video.cd) return null
    if (shared > 0) {
      // How much of both titles is shared, so `The Dark Knight` goes to that
      // film and not to `The Dark Knight Rises` beside it.
      const union = new Set([...sub.words, ...video.words]).size
      score = MATCH.title + Math.round((10 * shared) / union)
      if (sub.year !== null && sub.year === video.year) score += 5
    } else {
      score = MATCH.unknown
    }
  }

  if (namedFor(sub.stem, video.stem)) return Math.max(score, MATCH.named)
  return score
}

/**
 * Of every video a subtitle could be for, the ones it belongs to.
 *
 * The best-scoring video wins. When several tie they must all be the same
 * thing — two copies of one episode at different sizes — or the subtitle is
 * ambiguous and goes to none of them: a `Show - 05.srt` beside season 1's
 * episode 5 and season 2's is not safe to hand to either. A subtitle that
 * says nothing about what it is only ever belongs to a video with no rival.
 */
export function ownersOf(sub: SubtitleIdentity, videos: VideoIdentity[]): VideoIdentity[] {
  let best = 0
  let owners: VideoIdentity[] = []
  const alone = videos.length === 1
  for (const video of videos) {
    const score = scoreMatch(sub, video, { alone })
    if (score === null || score < best) continue
    if (score > best) {
      best = score
      owners = [video]
    } else {
      owners.push(video)
    }
  }
  if (owners.length === 0) return []
  if (best <= MATCH.unknown && videos.length > 1) return []

  const what = (video: VideoIdentity): string =>
    [video.kind, video.words.join(' '), video.placed?.season, video.placed?.episodes.join('-'), video.year].join('|')
  const first = what(owners[0]!)
  return owners.every((video) => what(video) === first) ? owners : []
}
