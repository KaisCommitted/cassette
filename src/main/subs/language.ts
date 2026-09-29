import { basename, extname } from 'node:path'

/**
 * Languages, and the tags a subtitle's name carries after what it is for:
 * `Show.S01E01.eng.sdh.2.srt` is episode one's second English SDH subtitle.
 *
 * Shared by everything that reads a language — subtitle files, archive
 * entries, mpv's tracks — so that a file saying `ita` and a track saying `it`
 * are the same language everywhere. It depends on nothing else in the app.
 */

const LANGUAGES = new Map<string, string>([
  ['en', 'eng'],
  ['eng', 'eng'],
  ['english', 'eng'],
  ['fr', 'fre'],
  ['fre', 'fre'],
  ['fra', 'fre'],
  ['french', 'fre'],
  ['ar', 'ara'],
  ['ara', 'ara'],
  ['arabic', 'ara'],
  ['es', 'spa'],
  ['spa', 'spa'],
  ['spanish', 'spa'],
  ['de', 'ger'],
  ['ger', 'ger'],
  ['deu', 'ger'],
  ['german', 'ger'],
  ['it', 'ita'],
  ['ita', 'ita'],
  ['italian', 'ita'],
  ['nl', 'dut'],
  ['dut', 'dut'],
  ['nld', 'dut'],
  ['dutch', 'dut'],
  ['pt', 'por'],
  ['por', 'por'],
  ['portuguese', 'por'],
  ['ru', 'rus'],
  ['rus', 'rus'],
  ['russian', 'rus']
])

const NAMES: Record<string, string> = {
  eng: 'English',
  fre: 'French',
  ara: 'Arabic',
  spa: 'Spanish',
  ger: 'German',
  ita: 'Italian',
  dut: 'Dutch',
  por: 'Portuguese',
  rus: 'Russian'
}

/**
 * One spelling for a language, whatever form it arrived in.
 *
 * Files, containers and subtitle services each name languages differently —
 * `en`, `eng`, `English`, `en-US` — and comparing those forms directly makes
 * the same language look like three. Everything settles on the three-letter
 * code used in filenames.
 */
export function normaliseLanguage(value: string): string {
  const base = value.toLowerCase().trim().split(/[-_]/)[0] ?? ''
  return LANGUAGES.get(base) ?? base
}

export function languageName(lang: string | null): string {
  if (!lang) return 'Unknown language'
  return NAMES[lang] ?? lang.toUpperCase()
}

/** Full dialogue, dialogue plus sound description, or only the foreign bits. */
export type Flavour = 'full' | 'sdh' | 'forced'

const FLAVOURS = new Map<string, Flavour>([
  ['forced', 'forced'],
  ['foreign', 'forced'],
  ['sdh', 'sdh'],
  ['hi', 'sdh'],
  ['cc', 'sdh']
])

/** Reads a flavour off a track title, as a menu entry names it. */
export function flavourOfTitle(title: string | null): Flavour {
  const text = title ?? ''
  if (/\b(signs?|songs?|forced|foreign)\b/i.test(text)) return 'forced'
  if (/\b(sdh|hi|cc|hearing)\b/i.test(text)) return 'sdh'
  return 'full'
}

/** Words that say what a file is (a subtitle) rather than what it is for. */
const FILLER = new Set(['sub', 'subs', 'subtitle', 'subtitles', 'full', 'default', 'track', 'srt'])

export interface TrailingTags {
  /** The name up to the tags. */
  rest: string
  /** The language the tags name, or null when they name none. */
  lang: string | null
  flavour: Flavour
  /** Whether there were any tags at all. */
  stripped: boolean
}

/**
 * Reads the language, flavour and numbering tags off the end of a name.
 *
 * Only tags at the end count, working back from the last one to the first
 * word that is not a tag. A language named anywhere else is part of the
 * title — `It.2017`, `Russian.Doll.S01E03`, `The.Italian.Job.2003` — and
 * reading it as a tag would file the subtitle under the wrong language.
 * A name that is nothing but tags, like RARBG's `2_English`, is all tag.
 */
export function readTrailingTags(stem: string): TrailingTags {
  const tokens = [...stem.matchAll(/[^.\s_\-[\]()]+/g)]
  let flavour: Flavour = 'full'
  let lang: string | null = null
  let stripped = false
  let end = tokens.length

  const isTag = (token: string): boolean =>
    LANGUAGES.has(token) || FLAVOURS.has(token) || FILLER.has(token)

  while (end > 0) {
    const token = tokens[end - 1]![0].toLowerCase()
    const before = end > 1 ? tokens[end - 2]![0].toLowerCase() : ''
    if (FLAVOURS.has(token) && end > 1) {
      if (flavour === 'full') flavour = FLAVOURS.get(token)!
    } else if (LANGUAGES.has(token)) {
      if (lang === null) lang = LANGUAGES.get(token)!
    } else if (FILLER.has(token)) {
      // Taken as read.
    } else if (/^\d{1,2}$/.test(token) && end === tokens.length && isTag(before)) {
      // `.eng.2`: the second English subtitle, not episode two.
    } else if (/^\d{1,3}$/.test(token) && end === 1 && stripped) {
      // `2_English`: a track number in front of the language.
    } else {
      break
    }
    stripped = true
    end--
  }

  const rest = end === 0 ? '' : stem.slice(0, tokens[end - 1]!.index + tokens[end - 1]![0].length)
  return { rest, lang, flavour, stripped }
}

/** The language a subtitle's name is tagged with, e.g. `eng`, or null. */
export function guessLanguage(fileName: string): string | null {
  return readTrailingTags(basename(fileName, extname(fileName))).lang
}
