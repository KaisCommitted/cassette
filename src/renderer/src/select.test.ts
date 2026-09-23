import { describe, expect, it } from 'vitest'
import type { Library, MediaFile, ProgressRecord } from '@shared/types'
import {
  continueWatching,
  describeSeasons,
  episodeLabel,
  formatAgo,
  formatRemaining,
  keyForPath,
  sleeveTone,
  summariseSeries
} from './select'

function file(key: string): MediaFile {
  return {
    path: `C:\\${key}.mkv`,
    sizeBytes: 1,
    key,
    title: 'M',
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
    lastWatched: '2026-09-20T10:00:00.000Z',
    finished: false,
    ...over
  }
}

const library: Library = {
  scannedAt: '',
  series: [
    {
      kind: 'series',
      id: 'm',
      title: 'The Mentalist',
      year: 2008,
      seasons: [
        {
          season: 3,
          episodes: [
            { file: file('a'), season: 3, episodes: [16], label: 'S03E16' },
            { file: file('b'), season: 3, episodes: [17], label: 'S03E17' }
          ]
        }
      ]
    }
  ],
  movies: [
    { kind: 'movie', id: 'r', title: 'Another Round', year: 2020, file: file('m1') }
  ]
}

describe('continueWatching', () => {
  it('lists started, unfinished items', () => {
    const progress = new Map([['a', record({ key: 'a' })]])
    const items = continueWatching(library, progress)
    expect(items.map((i) => i.key)).toEqual(['a'])
    expect(items[0]!.title).toBe('The Mentalist')
    expect(items[0]!.detail).toBe('S03E16')
  })

  it('leaves out finished items', () => {
    const progress = new Map([['a', record({ key: 'a', finished: true })]])
    expect(continueWatching(library, progress)).toEqual([])
  })

  it('ignores anything barely started, which is usually a mis-click', () => {
    const progress = new Map([['a', record({ key: 'a', positionSeconds: 12 })]])
    expect(continueWatching(library, progress)).toEqual([])
  })

  it('puts the most recently watched first', () => {
    // Across different titles: two episodes of one series collapse to a single
    // row, so ordering is exercised with a series and a film.
    const progress = new Map([
      ['a', record({ key: 'a', lastWatched: '2026-09-01T00:00:00.000Z' })],
      ['m1', record({ key: 'm1', lastWatched: '2026-09-22T00:00:00.000Z' })]
    ])
    expect(continueWatching(library, progress).map((i) => i.key)).toEqual(['m1', 'a'])
  })

  it('includes movies alongside episodes', () => {
    const progress = new Map([['m1', record({ key: 'm1' })]])
    const items = continueWatching(library, progress)
    expect(items[0]!.title).toBe('Another Round')
    expect(items[0]!.detail).toBe('2020')
  })

  it('reports how much is left, not how much is done', () => {
    const progress = new Map([['a', record({ key: 'a' })]])
    expect(continueWatching(library, progress)[0]!.remainingSeconds).toBe(1800)
  })
})

describe('summariseSeries', () => {
  it('counts episodes and finds the next unwatched still', () => {
    const progress = new Map([['a', record({ key: 'a', finished: true })]])
    const summary = summariseSeries(library.series[0]!, progress)
    expect(summary.episodeCount).toBe(2)
    expect(summary.watchedCount).toBe(1)
    expect(summary.thumbKey).toBe('b')
  })

  it('falls back to the first episode when nothing is watched', () => {
    expect(summariseSeries(library.series[0]!, new Map()).thumbKey).toBe('a')
  })
})

describe('describeSeasons', () => {
  it('describes a contiguous run as a range', () => {
    expect(describeSeasons([3, 4, 5])).toBe('seasons 3 to 5')
  })

  it('names a single season', () => {
    expect(describeSeasons([4])).toBe('season 4')
  })

  it('spells out gaps rather than implying a range', () => {
    expect(describeSeasons([1, 3, 6])).toBe('seasons 1, 3 and 6')
  })
})

describe('formatRemaining', () => {
  it('rounds to minutes', () => {
    expect(formatRemaining(1080)).toBe('18 min left')
  })

  it('splits hours out', () => {
    expect(formatRemaining(3840)).toBe('1 h 04 left')
  })

  it('avoids saying zero minutes', () => {
    expect(formatRemaining(30)).toBe('under a minute left')
  })
})

describe('continueWatching — one row per series', () => {
  it('shows a series once, at the episode you actually stopped on', () => {
    const progress = new Map([
      ['a', record({ key: 'a', lastWatched: '2026-03-01T00:00:00.000Z' })],
      ['b', record({ key: 'b', lastWatched: '2026-09-01T00:00:00.000Z' })]
    ])
    const items = continueWatching(library, progress)
    expect(items).toHaveLength(1)
    expect(items[0]!.key).toBe('b')
  })

  it('still lists a film separately from a series', () => {
    const progress = new Map([
      ['a', record({ key: 'a', lastWatched: '2026-03-01T00:00:00.000Z' })],
      ['m1', record({ key: 'm1', lastWatched: '2026-09-01T00:00:00.000Z' })]
    ])
    expect(continueWatching(library, progress).map((i) => i.key)).toEqual(['m1', 'a'])
  })

  it('keeps each series when two are on the go, newest first', () => {
    // The case from real use: two shows watched months apart, both resumable.
    const twoShows = {
      ...library,
      series: [
        library.series[0]!,
        {
          kind: 'series' as const,
          id: 'other',
          title: 'Other Show',
          year: null,
          seasons: [
            {
              season: 1,
              episodes: [
                { file: file('x'), season: 1, episodes: [1], label: 'S01E01' }
              ]
            }
          ]
        }
      ]
    }
    const progress = new Map([
      ['a', record({ key: 'a', lastWatched: '2026-01-01T00:00:00.000Z' })],
      ['x', record({ key: 'x', lastWatched: '2026-08-01T00:00:00.000Z' })]
    ])
    const items = continueWatching(twoShows, progress)
    expect(items.map((i) => i.title)).toEqual(['Other Show', 'The Mentalist'])
  })
})

describe('episodeLabel', () => {
  it('writes an episode out in words', () => {
    expect(episodeLabel('S03E16', 'long')).toBe('Season 3, episode 16')
    expect(episodeLabel('S03E16', 'short')).toBe('S3 E16')
  })

  it('covers a file that holds two episodes', () => {
    expect(episodeLabel('S03E23-E24', 'long')).toBe('Season 3, episodes 23–24')
    expect(episodeLabel('S03E23-E24', 'short')).toBe('S3 E23–24')
  })

  it('leaves anything else alone', () => {
    expect(episodeLabel('Film', 'long')).toBe('Film')
    expect(episodeLabel('2020', 'short')).toBe('2020')
  })
})

describe('keyForPath', () => {
  it('finds the episode a playing file belongs to', () => {
    expect(keyForPath(library, file('b').path)).toBe('b')
  })

  it('returns null for a file that is not in the library', () => {
    expect(keyForPath(library, 'D:/elsewhere.mkv')).toBeNull()
  })
})

describe('sleeveTone', () => {
  it('gives a title the same colour every time', () => {
    expect(sleeveTone('The Quiet Floor')).toBe(sleeveTone('The Quiet Floor'))
  })

  it('stays within the four sleeve colours', () => {
    for (const title of ['A', 'Northern Signal', '', 'Paper & Ash', 'x'.repeat(300)]) {
      const tone = sleeveTone(title)
      expect(tone).toBeGreaterThanOrEqual(0)
      expect(tone).toBeLessThan(4)
    }
  })
})

describe('formatAgo', () => {
  const now = new Date('2026-09-23T12:00:00.000Z')

  it('counts minutes, hours and days', () => {
    expect(formatAgo('2026-09-23T11:52:00.000Z', now)).toBe('8 minutes ago')
    expect(formatAgo('2026-09-23T09:00:00.000Z', now)).toBe('3 hours ago')
    expect(formatAgo('2026-09-22T12:00:00.000Z', now)).toBe('yesterday')
    expect(formatAgo('2026-09-20T12:00:00.000Z', now)).toBe('3 days ago')
  })

  it('says so for a missing time rather than printing NaN', () => {
    expect(formatAgo('', now)).toBe('at an unknown time')
  })
})
