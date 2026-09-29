import type { SubtitleStyle } from '@shared/types'

/**
 * Subtitles under the night light.
 *
 * mpv draws subtitles after the night light's shader has run, so they have
 * to be recoloured to match the picture instead. Plain subtitles (SRT and
 * the like) take Cassette's own colours, which are simply tinted. Styled
 * (ASS) subtitles carry their own colours per style; each style's colours
 * are tinted by the same amounts, alpha kept, so karaoke keeps its two
 * colours, boxed signs keep their box and outline-only text stays outline
 * only.
 *
 * mpv only applies per-style overrides with `sub-ass-override=yes`, and
 * `yes` also moves styled subtitles by `sub-pos` and scales them by
 * `sub-scale`, both of which are set for plain subtitles. Measured with the
 * bundled mpv, `yes` with `sub-pos` 100 and `sub-scale` 1 draws exactly the
 * same pixels as `no`, so while a styled track is being tinted those two are
 * held neutral. Only the track on screen is affected by them, and it is a
 * styled one.
 *
 * What stays untinted: colours written into a line itself (`\c` tags,
 * mostly signs and karaoke), and picture subtitles (PGS, VobSub). The
 * overlay's darkening still covers both.
 */

/** How much green and blue light the night light lets through, each 0 to 1. */
export interface NightTint {
  green: number
  blue: number
}

/**
 * The tint subtitles get: the picture's, in steps of a tenth.
 *
 * Every change of subtitle colour makes mpv lay the subtitles out again, so
 * following a fade frame by frame would do that dozens of times a second.
 * Steps of a tenth (and, in MpvController, no more than a few a second) keep
 * it to a handful per fade or slider drag. The ends of the range (untouched,
 * and the deepest setting with no blue at all) are whole tenths, so they are
 * met exactly; no tint at all comes back as null.
 */
export function coarseTint(tint: NightTint | null): NightTint | null {
  if (!tint) return null
  const step = (v: number): number => Math.round(Math.max(0, Math.min(1, v)) * 10) / 10
  const coarse = { green: step(tint.green), blue: step(tint.blue) }
  return coarse.green === 1 && coarse.blue === 1 ? null : coarse
}

/** One ASS style's colours as the file writes them. */
export interface AssStyleColours {
  name: string
  primary: string
  secondary: string
  outline: string
  back: string
}

/**
 * The styles in an ASS or SSA header (mpv's `sub-ass-extradata`), with
 * their colours. The Format line says where each field is, since files
 * order them differently; SSA calls the outline colour TertiaryColour.
 */
export function parseAssStyles(header: string): AssStyleColours[] {
  const styles: AssStyleColours[] = []
  let inStyles = false
  let format: string[] | null = null
  for (const raw of header.split(/\r?\n/)) {
    const line = raw.trim()
    if (line.startsWith('[')) {
      inStyles = /^\[v4\+? styles\]$/i.test(line)
      format = null
      continue
    }
    if (!inStyles) continue
    const colon = line.indexOf(':')
    if (colon === -1) continue
    const kind = line.slice(0, colon).trim().toLowerCase()
    const fields = line.slice(colon + 1).split(',').map((f) => f.trim())
    if (kind === 'format') {
      format = fields.map((f) => f.toLowerCase())
      continue
    }
    if (kind !== 'style' || !format) continue
    // The name comes first and may itself contain commas; the rest may not.
    const extra = fields.length - format.length
    if (extra < 0) continue
    const values = [fields.slice(0, extra + 1).join(','), ...fields.slice(extra + 1)]
    const field = (...names: string[]): string => {
      for (const n of names) {
        const i = format!.indexOf(n)
        if (i !== -1) return values[i] ?? ''
      }
      return ''
    }
    const name = field('name')
    if (!name) continue
    styles.push({
      name,
      primary: field('primarycolour'),
      secondary: field('secondarycolour'),
      outline: field('outlinecolour', 'tertiarycolour'),
      back: field('backcolour')
    })
  }
  return styles
}

/**
 * An ASS colour (`&HAABBGGRR`, `&HBBGGRR` or a decimal number) with green
 * and blue cut, its transparency kept. Null when it cannot be read.
 */
export function tintAssColour(value: string, tint: NightTint): string | null {
  const text = value.trim().replace(/&$/, '')
  let n: number
  if (/^&h[0-9a-f]+$/i.test(text)) n = parseInt(text.slice(2), 16)
  else if (/^-?\d+$/.test(text)) n = Number(text)
  else return null
  if (!Number.isFinite(n)) return null
  n = n >>> 0
  const alpha = (n >>> 24) & 255
  const blue = Math.round(((n >>> 16) & 255) * tint.blue)
  const green = Math.round(((n >>> 8) & 255) * tint.green)
  const red = n & 255
  return '&H' + [alpha, blue, green, red].map(hexByte).join('')
}

/** `sub-ass-style-overrides` entries that tint every style's colours. */
export function assStyleOverrides(styles: AssStyleColours[], tint: NightTint): string[] {
  const out: string[] = []
  for (const style of styles) {
    const fields: [string, string][] = [
      ['PrimaryColour', style.primary],
      ['SecondaryColour', style.secondary],
      ['OutlineColour', style.outline],
      ['BackColour', style.back]
    ]
    for (const [param, value] of fields) {
      const tinted = tintAssColour(value, tint)
      if (tinted) out.push(`${style.name}.${param}=${tinted}`)
    }
  }
  return out
}

/** A `#RRGGBB` colour with the night light's cut to green and blue. */
export function tintHex(hex: string, tint: NightTint | null): string {
  if (!tint || !/^#[0-9a-f]{6}$/i.test(hex)) return hex
  const n = parseInt(hex.slice(1), 16)
  const channels = [(n >> 16) & 255, ((n >> 8) & 255) * tint.green, (n & 255) * tint.blue]
  return '#' + channels.map(hexByte).join('')
}

/** Every subtitle property the night light and the appearance settings share. */
export interface SubtitleLook {
  color: string
  outline: string
  /** `sub-pos`: 100 is the bottom edge. */
  pos: number
  scale: number
  override: 'no' | 'yes' | 'force'
  assStyles: string[]
}

/**
 * What mpv's subtitle properties should be, given the appearance settings,
 * the night light's (coarse) tint and, when the track on screen is a styled
 * one, its styles.
 */
export function subtitleLook(
  style: SubtitleStyle,
  tint: NightTint | null,
  assStyles: AssStyleColours[] | null
): SubtitleLook {
  const look: SubtitleLook = {
    color: tintHex(style.color, tint),
    outline: tintHex(style.outlineColor, tint),
    pos: 100 - Math.round(style.marginPercent),
    scale: style.scale,
    override: style.overrideEmbeddedStyles ? 'force' : 'no',
    assStyles: []
  }
  // Forced, the plain colours above reach styled subtitles already.
  if (!tint || style.overrideEmbeddedStyles || !assStyles) return look
  const overrides = assStyleOverrides(assStyles, tint)
  if (overrides.length === 0) return look
  return { ...look, override: 'yes', pos: 100, scale: 1, assStyles: overrides }
}

/**
 * The commands that take mpv from one look to the next, in an order that
 * never shows a frame in between with styled subtitles moved: `yes` is
 * switched on only once `sub-pos` and `sub-scale` are neutral, and off
 * before they go back.
 */
export function subtitleCommands(from: SubtitleLook | null, to: SubtitleLook): unknown[][] {
  const set = (name: string, value: unknown): unknown[] => ['set_property', name, value]
  const leaving = from?.override === 'yes' && to.override !== 'yes'
  const changes: unknown[][] = []
  if (!from || from.pos !== to.pos) changes.push(set('sub-pos', to.pos))
  if (!from || from.scale !== to.scale) changes.push(set('sub-scale', to.scale))
  if (!from || from.color !== to.color) changes.push(set('sub-color', to.color))
  if (!from || from.outline !== to.outline) changes.push(set('sub-border-color', to.outline))
  if (!from || from.assStyles.join('\n') !== to.assStyles.join('\n')) {
    changes.push(set('sub-ass-style-overrides', to.assStyles))
  }
  if (!from || from.override !== to.override) {
    const override = set('sub-ass-override', to.override)
    return leaving ? [override, ...changes] : [...changes, override]
  }
  return changes
}

function hexByte(value: number): string {
  return Math.round(Math.max(0, Math.min(255, value)))
    .toString(16)
    .padStart(2, '0')
    .toUpperCase()
}
