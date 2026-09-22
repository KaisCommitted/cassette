import { describe, expect, it } from 'vitest'
import type { MediaFile } from '@shared/types'
import { groupIntoLibrary, normaliseId } from './groupIntoLibrary'

function file(over: Partial<MediaFile>): MediaFile {
  return {
    path: 'C:\\x.mkv',
    sizeBytes: 1,
    key: 'k',
    title: 'T',
    year: null,
    season: null,
    episodes: [],
    kind: 'movie',
    tags: [],
    ...over
  }
}

describe('normaliseId', () => {
  it('ignores case, punctuation and spacing', () => {
    expect(normaliseId('The Mentalist')).toBe(normaliseId('the  mentalist!'))
  })
})

describe('groupIntoLibrary', () => {
  it('clusters episodes into seasons under one series', () => {
    const lib = groupIntoLibrary([
      file({ kind: 'series', title: 'The Mentalist', season: 3, episodes: [16], key: 'a' }),
      file({ kind: 'series', title: 'The Mentalist', season: 3, episodes: [17], key: 'b' }),
      file({ kind: 'series', title: 'The Mentalist', season: 4, episodes: [1], key: 'c' })
    ])
    expect(lib.series).toHaveLength(1)
    expect(lib.series[0]!.seasons.map((s) => s.season)).toEqual([3, 4])
    expect(lib.series[0]!.seasons[0]!.episodes).toHaveLength(2)
  })

  it('keeps incomplete season numbering intact', () => {
    // The reference library owns seasons 3-5 of a 7-season show.
    const lib = groupIntoLibrary([
      file({ kind: 'series', title: 'M', season: 5, episodes: [1], key: 'a' }),
      file({ kind: 'series', title: 'M', season: 3, episodes: [1], key: 'b' })
    ])
    expect(lib.series[0]!.seasons.map((s) => s.season)).toEqual([3, 5])
  })

  it('labels a multi-episode file as a range', () => {
    const lib = groupIntoLibrary([
      file({ kind: 'series', title: 'M', season: 3, episodes: [23, 24], key: 'a' })
    ])
    expect(lib.series[0]!.seasons[0]!.episodes[0]!.label).toBe('S03E23-E24')
  })

  it('labels a single episode with zero padding', () => {
    const lib = groupIntoLibrary([
      file({ kind: 'series', title: 'M', season: 3, episodes: [6], key: 'a' })
    ])
    expect(lib.series[0]!.seasons[0]!.episodes[0]!.label).toBe('S03E06')
  })

  it('sorts episodes within a season', () => {
    const lib = groupIntoLibrary([
      file({ kind: 'series', title: 'M', season: 1, episodes: [10], key: 'a' }),
      file({ kind: 'series', title: 'M', season: 1, episodes: [2], key: 'b' })
    ])
    expect(lib.series[0]!.seasons[0]!.episodes.map((e) => e.episodes[0])).toEqual([2, 10])
  })

  it('puts movies in their own list, sorted by title', () => {
    const lib = groupIntoLibrary([
      file({ title: 'Another Round', year: 2020, key: 'a' }),
      file({ title: '500 Days of Summer', year: 2009, key: 'b' })
    ])
    expect(lib.movies.map((m) => m.title)).toEqual(['500 Days of Summer', 'Another Round'])
    expect(lib.series).toEqual([])
  })

  it('files a series entry with no episode marker as season 0', () => {
    const lib = groupIntoLibrary([
      file({ kind: 'series', title: 'Odd Show', season: null, episodes: [], key: 'a' })
    ])
    expect(lib.series[0]!.seasons[0]!.season).toBe(0)
  })
})
