import { FINISHED_THRESHOLD } from '@shared/types'
import type { EpisodeEntry, ProgressRecord, SeriesEntry } from '@shared/types'

export interface ResumeTarget {
  episode: EpisodeEntry
  /** Where to start, in seconds. Zero for an episode never started. */
  positionSeconds: number
  /** Why this is the episode being offered, for the label on the button. */
  reason: 'in-progress' | 'next-up' | 'start-over'
}

/**
 * Where to drop someone back into a series.
 *
 * The rule, in order:
 *   1. The episode they were part-way through, most recently watched first.
 *      Coming back months later still lands on that exact second.
 *   2. Otherwise the first episode they have not finished.
 *   3. Otherwise the very first episode, because the series is fully watched
 *      and starting over is the only sensible offer.
 */
export function resumeTarget(
  series: SeriesEntry,
  progress: Map<string, ProgressRecord>
): ResumeTarget | null {
  const episodes = series.seasons.flatMap((s) => s.episodes)
  if (episodes.length === 0) return null

  const started = episodes
    .map((episode) => ({ episode, record: progress.get(episode.file.key) }))
    .filter(
      (
        candidate
      ): candidate is { episode: EpisodeEntry; record: ProgressRecord } =>
        candidate.record !== undefined &&
        !candidate.record.finished &&
        candidate.record.durationSeconds > 0 &&
        candidate.record.positionSeconds > 30
    )
    .sort((a, b) => b.record.lastWatched.localeCompare(a.record.lastWatched))

  const mostRecent = started[0]
  if (mostRecent) {
    return {
      episode: mostRecent.episode,
      positionSeconds: mostRecent.record.positionSeconds,
      reason: 'in-progress'
    }
  }

  const nextUp = episodes.find((episode) => !progress.get(episode.file.key)?.finished)
  if (nextUp) {
    return { episode: nextUp, positionSeconds: 0, reason: 'next-up' }
  }

  return { episode: episodes[0]!, positionSeconds: 0, reason: 'start-over' }
}

/** Fraction watched, for the seam drawn along an episode's still. */
export function watchedFraction(record: ProgressRecord | undefined): number {
  if (!record || record.durationSeconds <= 0) return 0
  if (record.finished) return 1
  return Math.min(1, record.positionSeconds / record.durationSeconds)
}

export function isFinished(record: ProgressRecord | undefined): boolean {
  if (!record) return false
  if (record.finished) return true
  if (record.durationSeconds <= 0) return false
  return record.positionSeconds / record.durationSeconds >= FINISHED_THRESHOLD
}
