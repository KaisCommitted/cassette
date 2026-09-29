import type { SubtitleChoice, SubtitlePick } from '../player/trackChoice'
import { readJson, writeJsonAtomic } from './atomicJson'

/**
 * Remembers, per series and season, the subtitle picked in the menu — not
 * which track, since track ids are particular to one file, but what kind of
 * subtitle it was: its language, whether full, SDH or forced, and whether a
 * file or inside the video.
 *
 * Picking a track for one episode carries to the rest of its season; an
 * episode with nothing like it keeps its own default instead
 * (trackChoice.applySeasonSubtitleChoice).
 */
export class SubtitleChoiceStore {
  private choices = new Map<string, SubtitleChoice>()

  constructor(private readonly file: string) {}

  async load(): Promise<void> {
    const saved = await readJson<Record<string, unknown> | null>(this.file, null)
    // Picks saved before they were described by language and kind were bare
    // menu positions, which can point at a different subtitle in another
    // episode. They are dropped: that season goes back to the default pick
    // until something is chosen again, rather than risk the wrong language.
    this.choices = new Map(
      Object.entries(saved ?? {}).filter((entry): entry is [string, SubtitleChoice] =>
        entry[1] === null || isPick(entry[1])
      )
    )
  }

  get(seriesId: string, season: number): SubtitleChoice | undefined {
    return this.choices.get(seasonKey(seriesId, season))
  }

  async set(seriesId: string, season: number, choice: SubtitleChoice): Promise<void> {
    this.choices.set(seasonKey(seriesId, season), choice)
    await writeJsonAtomic(this.file, Object.fromEntries(this.choices))
  }
}

function isPick(value: unknown): value is SubtitlePick {
  if (typeof value !== 'object' || value === null) return false
  const pick = value as Record<string, unknown>
  return (
    typeof pick['index'] === 'number' &&
    (pick['lang'] === null || typeof pick['lang'] === 'string') &&
    typeof pick['external'] === 'boolean' &&
    (pick['flavour'] === 'full' || pick['flavour'] === 'sdh' || pick['flavour'] === 'forced')
  )
}

function seasonKey(seriesId: string, season: number): string {
  return `${seriesId}:${season}`
}
