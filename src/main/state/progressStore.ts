import { FINISHED_THRESHOLD } from '@shared/types'
import type { EpisodeEntry, ProgressRecord, SeriesEntry } from '@shared/types'
import { readJson, writeJsonAtomic } from './atomicJson'

export class ProgressStore {
  private records = new Map<string, ProgressRecord>()

  constructor(private readonly file: string) {}

  async load(): Promise<void> {
    const raw = await readJson<ProgressRecord[]>(this.file, [])
    this.records = new Map(raw.map((r) => [r.key, r]))
  }

  async save(): Promise<void> {
    await writeJsonAtomic(this.file, [...this.records.values()])
  }

  get(key: string): ProgressRecord | null {
    return this.records.get(key) ?? null
  }

  record(key: string, positionSeconds: number, durationSeconds: number): void {
    const finished =
      durationSeconds > 0 && positionSeconds / durationSeconds >= FINISHED_THRESHOLD
    this.records.set(key, {
      key,
      positionSeconds,
      durationSeconds,
      lastWatched: new Date().toISOString(),
      finished
    })
  }

  isFinished(key: string): boolean {
    return this.records.get(key)?.finished ?? false
  }

  /** First episode in season/episode order that is not yet finished. */
  nextUnwatched(series: SeriesEntry): EpisodeEntry | null {
    for (const season of series.seasons) {
      for (const episode of season.episodes) {
        if (!this.isFinished(episode.file.key)) return episode
      }
    }
    return null
  }

  all(): ProgressRecord[] {
    return [...this.records.values()]
  }
}
