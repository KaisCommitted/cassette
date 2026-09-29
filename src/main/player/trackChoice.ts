import type { TrackInfo } from '@shared/types'
import { flavourOfTitle, normaliseLanguage, type Flavour } from '../subs/language'

/**
 * Picks which subtitle and audio tracks to turn on when a file loads.
 *
 * mpv would otherwise leave subtitles off unless the file marks a track as
 * default, which release encodes frequently do not. Matching on the language
 * tags the file already carries means embedded subtitles simply come on.
 */

/**
 * Files use both two- and three-letter codes, sometimes with a region, and
 * a track inside the video (`it`, `nld`) is compared with a file beside it
 * (`ita`, `dut`), so both go through the one table the subtitle code uses.
 */
function normaliseLang(lang: string | null): string {
  return lang ? normaliseLanguage(lang) : ''
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
 * A subtitle picked by hand, described by what it is rather than by its
 * track id, which is particular to one file.
 *
 * Its position in the menu is kept too, but only to settle a tie between two
 * alike tracks: on its own, "the second option" is English in one episode and
 * French in the next, as soon as one episode has a subtitle file the other
 * lacks or carries its embedded tracks in another order.
 */
export interface SubtitlePick {
  index: number
  lang: string | null
  /** A file beside the video rather than a track inside it. */
  external: boolean
  flavour: Flavour
}

/** A season's remembered subtitle pick. `null` means off. */
export type SubtitleChoice = SubtitlePick | null

/** Describes one of an episode's subtitle tracks, to remember it by. */
export function describeSubtitlePick(
  subsInMenuOrder: TrackInfo[],
  id: number
): SubtitlePick | undefined {
  const index = subsInMenuOrder.findIndex((t) => t.id === id)
  const track = subsInMenuOrder[index]
  if (!track) return undefined
  return {
    index,
    lang: track.lang ? normaliseLang(track.lang) : null,
    external: track.externalFilename !== null,
    flavour: flavourOfTitle(track.title)
  }
}

/**
 * Applies a season's remembered choice to one episode's own subtitle list,
 * in the order the menu shows them (TrackMenu.tsx, ControlBar's `subs`).
 *
 * The track taken is one that is the same kind of subtitle as the one picked:
 * the same language and flavour (full, SDH or forced), from the same place if
 * this episode has one there — a file, or inside the video — and otherwise
 * from the other. Where several are alike, the one at the remembered position
 * wins.
 *
 * `undefined` means there is nothing to apply — no choice saved for this
 * season, or no track in this episode like the one picked — and the caller
 * should fall back to {@link chooseSubtitleTrack}'s own default instead of
 * guessing.
 */
export function applySeasonSubtitleChoice(
  subsInMenuOrder: TrackInfo[],
  choice: SubtitleChoice | undefined
): number | null | undefined {
  if (choice === undefined) return undefined
  if (choice === null) return null

  const alike = (track: TrackInfo, sameSource: boolean): boolean =>
    normaliseLang(track.lang) === normaliseLang(choice.lang) &&
    flavourOfTitle(track.title) === choice.flavour &&
    (!sameSource || (track.externalFilename !== null) === choice.external)

  const atPosition = subsInMenuOrder[choice.index]
  if (atPosition && alike(atPosition, true)) return atPosition.id
  return (
    subsInMenuOrder.find((t) => alike(t, true))?.id ??
    subsInMenuOrder.find((t) => alike(t, false))?.id
  )
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
