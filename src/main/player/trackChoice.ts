import type { TrackInfo } from '@shared/types'

/**
 * Picks which subtitle and audio tracks to turn on when a file loads.
 *
 * mpv would otherwise leave subtitles off unless the file marks a track as
 * default, which release encodes frequently do not. Matching on the language
 * tags the file already carries means embedded subtitles simply come on.
 */

function normaliseLang(lang: string | null): string {
  if (!lang) return ''
  const value = lang.toLowerCase().trim()
  // Files use both two- and three-letter codes, sometimes with a region.
  const base = value.split(/[-_]/)[0] ?? value
  const aliases: Record<string, string> = {
    en: 'eng',
    english: 'eng',
    fr: 'fre',
    fra: 'fre',
    french: 'fre',
    ar: 'ara',
    arabic: 'ara',
    es: 'spa',
    spanish: 'spa',
    de: 'ger',
    deu: 'ger',
    german: 'ger'
  }
  return aliases[base] ?? base
}

function rank(track: TrackInfo, preferences: string[]): number {
  const lang = normaliseLang(track.lang)
  const index = preferences.findIndex((p) => normaliseLang(p) === lang)
  return index === -1 ? Number.MAX_SAFE_INTEGER : index
}

/**
 * Prefer a full-dialogue track over a signs-and-songs or forced one.
 *
 * Plurals matter here: these are almost always labelled "Signs and Songs".
 * SDH is not partial — it is full dialogue plus sound description for the
 * deaf and hard-of-hearing — so it is not demoted here; it competes with a
 * plain track on nothing but track order, which is what keeps the first
 * track a file offers the default when both are equally full.
 */
function isPartial(track: TrackInfo): boolean {
  return /\b(signs?|songs?|forced|commentary)\b/i.test(track.title ?? '')
}

export function chooseSubtitleTrack(
  tracks: TrackInfo[],
  preferences: string[],
  enabled: boolean
): number | null {
  if (!enabled) return null
  const subs = tracks.filter((t) => t.type === 'sub')
  if (subs.length === 0) return null

  const sorted = [...subs].sort((a, b) => {
    const byLang = rank(a, preferences) - rank(b, preferences)
    if (byLang !== 0) return byLang
    const byPartial = Number(isPartial(a)) - Number(isPartial(b))
    if (byPartial !== 0) return byPartial
    return a.id - b.id
  })

  const best = sorted[0]!
  // With no language match at all, still turn on the only track there is;
  // a subtitle in an unexpected language beats none for a foreign-language file.
  return best.id
}

/**
 * A season's remembered subtitle pick, as a position in the menu rather than
 * a track id: track ids are particular to one file, but "the second option"
 * is a choice that carries across a season. `null` means off.
 */
export type SubtitleChoice = number | null

/**
 * Applies a season's remembered choice to one episode's own subtitle list,
 * in the order the menu shows them (TrackMenu.tsx, ControlBar's `subs`).
 *
 * `undefined` means there is nothing to apply — no choice saved for this
 * season, or this episode has fewer options than the position asked for —
 * and the caller should fall back to {@link chooseSubtitleTrack}'s own
 * default instead of guessing.
 */
export function applySeasonSubtitleChoice(
  subsInMenuOrder: TrackInfo[],
  choice: SubtitleChoice | undefined
): number | null | undefined {
  if (choice === undefined) return undefined
  if (choice === null) return null
  return subsInMenuOrder[choice]?.id
}

export function chooseAudioTrack(
  tracks: TrackInfo[],
  preferences: string[]
): number | null {
  const audio = tracks.filter((t) => t.type === 'audio')
  if (audio.length <= 1) return null

  const sorted = [...audio].sort((a, b) => {
    const byLang = rank(a, preferences) - rank(b, preferences)
    if (byLang !== 0) return byLang
    const byPartial = Number(isPartial(a)) - Number(isPartial(b))
    if (byPartial !== 0) return byPartial
    return a.id - b.id
  })

  const best = sorted[0]!
  // Leave mpv's own choice alone when nothing matches a preference.
  return rank(best, preferences) === Number.MAX_SAFE_INTEGER ? null : best.id
}
