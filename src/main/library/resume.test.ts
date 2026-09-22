import { describe, expect, it } from 'vitest'
import type { MediaFile, ProgressRecord, SeriesEntry } from '@shared/types'
import { resumeTarget, watchedFraction } from './resume'

function file(key: string): MediaFile {
  return {
    path: `C:\\${key}.mkv`,
    sizeBytes: 1,
    key,
    title: 'S',
    year: null,
    season: 1,
    episodes: [1],
    kind: 'series',
    tags: []
  }
}

function record(over: Partial<ProgressRecord> & { key: string }): ProgressRecord {
  return {
    positionSeconds: 600,
    durationSeconds: 2400,
    lastWatched: '2026-01-01T00:00:00.000Z',
    finished: false,
    ...over
  }
}

const series: SeriesEntry = {
  kind: 'series',
  id: 's',
  title: 'Show',
  year: null,
  seasons: [
    {
      season: 1,
      episodes: [
        { file: file('e1'), season: 1, episodes: [1], label: 'S01E01' },
        { file: file('e2'), season: 1, episodes: [2], label: 'S01E02' }
      ]
    },
    {
      season: 2,
      episodes: [{ file: file('e3'), season: 2, episodes: [1], label: 'S02E01' }]
    }
  ]
}

describe('resumeTarget', () => {
  it('offers the first episode when nothing has been watched', () => {
    const target = resumeTarget(series, new Map())
    expect(target?.episode.file.key).toBe('e1')
    expect(target?.positionSeconds).toBe(0)
    expect(target?.reason).toBe('next-up')
  })

  it('returns to the exact second of a part-watched episode', () => {
    const progress = new Map([['e2', record({ key: 'e2', positionSeconds: 934 })]])
    const target = resumeTarget(series, progress)
    expect(target?.episode.file.key).toBe('e2')
    expect(target?.positionSeconds).toBe(934)
    expect(target?.reason).toBe('in-progress')
  })

  it('picks the most recently watched when several are part-done', () => {
    // Exactly the "hopped between two series months apart" case: the older
    // half-watched episode must not win over the newer one.
    const progress = new Map([
      ['e1', record({ key: 'e1', lastWatched: '2026-01-01T00:00:00.000Z' })],
      ['e3', record({ key: 'e3', lastWatched: '2026-06-01T00:00:00.000Z' })]
    ])
    expect(resumeTarget(series, progress)?.episode.file.key).toBe('e3')
  })

  it('moves on to the next unwatched episode once one is finished', () => {
    const progress = new Map([['e1', record({ key: 'e1', finished: true })]])
    const target = resumeTarget(series, progress)
    expect(target?.episode.file.key).toBe('e2')
    expect(target?.reason).toBe('next-up')
  })

  it('crosses into the next season when a season is complete', () => {
    const progress = new Map([
      ['e1', record({ key: 'e1', finished: true })],
      ['e2', record({ key: 'e2', finished: true })]
    ])
    expect(resumeTarget(series, progress)?.episode.file.key).toBe('e3')
  })

  it('offers a restart once everything is watched', () => {
    const progress = new Map(
      ['e1', 'e2', 'e3'].map((k) => [k, record({ key: k, finished: true })])
    )
    const target = resumeTarget(series, progress)
    expect(target?.episode.file.key).toBe('e1')
    expect(target?.reason).toBe('start-over')
  })

  it('ignores a few seconds of accidental playback', () => {
    const progress = new Map([['e2', record({ key: 'e2', positionSeconds: 8 })]])
    expect(resumeTarget(series, progress)?.episode.file.key).toBe('e1')
  })
})

describe('watchedFraction', () => {
  it('is zero for something never played', () => {
    expect(watchedFraction(undefined)).toBe(0)
  })

  it('fills completely for a finished episode', () => {
    expect(watchedFraction(record({ key: 'e', finished: true }))).toBe(1)
  })

  it('reports part-way through', () => {
    expect(watchedFraction(record({ key: 'e', positionSeconds: 600 }))).toBe(0.25)
  })
})
