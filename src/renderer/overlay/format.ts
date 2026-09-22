/** `1:02:03`, or `2:03` for anything under an hour. */
export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const s = Math.floor(seconds)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const ss = String(sec).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

const LANGUAGE_NAMES: Record<string, string> = {
  eng: 'English',
  en: 'English',
  fre: 'French',
  fra: 'French',
  fr: 'French',
  ara: 'Arabic',
  ar: 'Arabic',
  spa: 'Spanish',
  es: 'Spanish',
  ger: 'German',
  deu: 'German',
  de: 'German',
  ita: 'Italian',
  it: 'Italian',
  dut: 'Dutch',
  nld: 'Dutch',
  nl: 'Dutch',
  por: 'Portuguese',
  pt: 'Portuguese',
  rus: 'Russian',
  ru: 'Russian'
}

/**
 * A readable name for a track, falling back through title, language, codec.
 *
 * With several subtitles loaded for one episode — a couple embedded, a couple
 * downloaded — the menu is only useful if each line says which is which, so a
 * track loaded from a file beside the video says so.
 */
export function trackLabel(track: {
  id: number
  title: string | null
  lang: string | null
  codec: string | null
  externalFilename?: string | null
}): string {
  const language = track.lang ? LANGUAGE_NAMES[track.lang.toLowerCase()] : undefined
  const named = track.title?.trim() || language || track.lang?.toUpperCase()
  const base = named ?? (track.codec ? `Track ${track.id} (${track.codec})` : `Track ${track.id}`)

  // A downloaded subtitle's title is its filename, which already repeats the
  // episode name; the language on its own reads better beside it.
  if (!track.externalFilename) return base
  const short = language ?? (named || 'Subtitle')
  return `${short} · file`
}

/** Mouse descriptor for a raw browser event; must match the main process. */
export function describeMouse(event: MouseEvent): string {
  switch (event.button) {
    case 0:
      return 'mouse:left'
    case 1:
      return 'mouse:middle'
    case 2:
      return 'mouse:right'
    case 3:
      return 'mouse:button4'
    case 4:
      return 'mouse:button5'
    default:
      return `mouse:button${event.button + 1}`
  }
}
