import type { SubtitleChoice } from '../player/trackChoice'
import { readJson, writeJsonAtomic } from './atomicJson'

/**
 * Remembers, per series and season, the position picked in the subtitle
 * menu — not which track, since track ids are particular to one file, but
 * "the second option" is a choice that makes sense across a season.
 *
 * Picking a track for one episode carries to the rest of its season; an
 * episode with fewer options than that keeps its own default instead
 * (trackChoice.applySeasonSubtitleChoice).
 */
export class SubtitleChoiceStore {
  private choices = new Map<string, SubtitleChoice>()

  constructor(private readonly file: string) {}

  async load(): Promise<void> {
    const saved = await readJson<Record<string, SubtitleChoice> | null>(this.file, null)
    this.choices = new Map(Object.entries(saved ?? {}))
  }

  get(seriesId: string, season: number): SubtitleChoice | undefined {
    return this.choices.get(seasonKey(seriesId, season))
  }

  async set(seriesId: string, season: number, choice: SubtitleChoice): Promise<void> {
    this.choices.set(seasonKey(seriesId, season), choice)
    await writeJsonAtomic(this.file, Object.fromEntries(this.choices))
  }
}

function seasonKey(seriesId: string, season: number): string {
  return `${seriesId}:${season}`
}
