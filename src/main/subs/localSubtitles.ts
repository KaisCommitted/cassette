import { readdir, stat } from 'node:fs/promises'
import { basename, dirname, extname, join } from 'node:path'

export const SUBTITLE_EXTENSIONS = ['.srt', '.ass', '.ssa', '.sub', '.vtt'] as const

export interface FoundSubtitle {
  path: string
  /** Language guessed from the filename, e.g. `eng`, or null. */
  lang: string | null
  /** Human label for the menu, e.g. "English (file)". */
  label: string
}

const LANG_HINTS: Record<string, string> = {
  en: 'eng',
  eng: 'eng',
  english: 'eng',
  fr: 'fre',
  fre: 'fre',
  fra: 'fre',
  french: 'fre',
  ar: 'ara',
  ara: 'ara',
  arabic: 'ara',
  es: 'spa',
  spa: 'spa',
  spanish: 'spa',
  de: 'ger',
  ger: 'ger',
  german: 'ger',
  it: 'ita',
  ita: 'ita',
  italian: 'ita',
  nl: 'dut',
  dut: 'dut',
  nld: 'dut',
  dutch: 'dut',
  pt: 'por',
  por: 'por',
  portuguese: 'por',
  ru: 'rus',
  rus: 'rus',
  russian: 'rus'
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
  return LANG_HINTS[base] ?? base
}

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

/** Pulls a language out of trailing tokens like `Show.S01E01.eng.srt`. */
export function guessLanguage(fileName: string): string | null {
  const stem = basename(fileName, extname(fileName))
  const tokens = stem.toLowerCase().split(/[.\-_\s[\]()]+/).filter(Boolean)
  // Search from the end: the language tag is a suffix, and an early token
  // could easily be part of the title itself.
  for (let i = tokens.length - 1; i >= 0; i--) {
    const hit = LANG_HINTS[tokens[i]!]
    if (hit) return hit
  }
  return null
}

export function languageName(lang: string | null): string {
  if (!lang) return 'Unknown language'
  return NAMES[lang] ?? lang.toUpperCase()
}

function isSubtitle(name: string): boolean {
  return (SUBTITLE_EXTENSIONS as readonly string[]).includes(extname(name).toLowerCase())
}

/**
 * Subtitle files sitting next to a video.
 *
 * Matching is by filename stem, so `Show S01E01.mkv` picks up
 * `Show S01E01.eng.srt` and anything in a neighbouring `Subs` folder, which is
 * how most downloads arrive. No network and no API key involved.
 */
export async function findLocalSubtitles(videoPath: string): Promise<FoundSubtitle[]> {
  const stem = basename(videoPath, extname(videoPath)).toLowerCase()
  const folders = [dirname(videoPath), join(dirname(videoPath), 'Subs'), join(dirname(videoPath), 'subs')]

  const found: FoundSubtitle[] = []
  const seen = new Set<string>()

  for (const folder of folders) {
    let entries: string[]
    try {
      entries = await readdir(folder)
    } catch {
      continue
    }
    for (const entry of entries) {
      if (!isSubtitle(entry)) continue
      const entryStem = basename(entry, extname(entry)).toLowerCase()
      // A subtitle in a dedicated Subs folder belongs to the only video there,
      // so it does not have to repeat the full filename.
      const belongs = entryStem.startsWith(stem) || folder.toLowerCase().endsWith('subs')
      if (!belongs) continue

      const path = join(folder, entry)
      if (seen.has(path.toLowerCase())) continue
      try {
        if ((await stat(path)).size === 0) continue
      } catch {
        continue
      }
      seen.add(path.toLowerCase())
      const lang = guessLanguage(entry)
      found.push({ path, lang, label: `${languageName(lang)} (file)` })
    }
  }

  return found
}
