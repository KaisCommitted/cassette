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

/** A readable name for a track, falling back through title, language, codec. */
export function trackLabel(track: {
  id: number
  title: string | null
  lang: string | null
  codec: string | null
}): string {
  const parts = [track.title, track.lang?.toUpperCase()].filter(Boolean)
  if (parts.length > 0) return parts.join(' · ')
  return track.codec ? `Track ${track.id} (${track.codec})` : `Track ${track.id}`
}
