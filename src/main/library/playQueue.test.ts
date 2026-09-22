import { describe, expect, it } from 'vitest'
import type { Library, MediaFile } from '@shared/types'
import { findNext, findPrevious, flattenPlayable } from './playQueue'

function file(key: string): MediaFile {
  return {
    path: `C:\\${key}.mkv`,
    sizeBytes: 1,
    key,
    title: 'T',
    year: null,
    season: null,
    episodes: [],
    kind: 'series',
    tags: []
  }
}

const library: Library = {
  scannedAt: '2026-09-22T00:00:00.000Z',
  series: [
    {
      kind: 'series',
      id: 'mentalist',
      title: 'The Mentalist',
      year: 2008,
      seasons: [
        {
          season: 3,
          episodes: [
            { file: file('a'), season: 3, episodes: [23], label: 'S03E23' },
            { file: file('b'), season: 3, episodes: [24], label: 'S03E24' }
          ]
        },
        {
          season: 4,
          episodes: [{ file: file('c'), season: 4, episodes: [1], label: 'S04E01' }]
        }
      ]
    },
    {
      kind: 'series',
      id: 'other',
      title: 'Other Show',
      year: null,
      seasons: [
        {
          season: 1,
          episodes: [{ file: file('d'), season: 1, episodes: [1], label: 'S01E01' }]
        }
      ]
    }
  ],
  movies: [
    { kind: 'movie', id: 'round', title: 'Another Round', year: 2020, file: file('m1') }
  ]
}

describe('flattenPlayable', () => {
  it('lists episodes in season order, then movies', () => {
    expect(flattenPlayable(library).map((i) => i.key)).toEqual([
      'a',
      'b',
      'c',
      'd',
      'm1'
    ])
  })

  it('labels episodes with the series name', () => {
    expect(flattenPlayable(library)[0]!.label).toBe('The Mentalist — S03E23')
  })

  it('labels movies with just the title and marks them seriesless', () => {
    const movie = flattenPlayable(library).at(-1)!
    expect(movie.label).toBe('Another Round')
    expect(movie.seriesId).toBeNull()
  })
})

describe('findNext', () => {
  it('advances within a season', () => {
    expect(findNext(library, 'a')?.key).toBe('b')
  })

  it('rolls over into the next season of the same series', () => {
    expect(findNext(library, 'b')?.key).toBe('c')
  })

  it('stops at the end of a series rather than continuing into another show', () => {
    expect(findNext(library, 'c')).toBeNull()
  })

  it('never advances from a movie', () => {
    expect(findNext(library, 'm1')).toBeNull()
  })

  it('returns null for an unknown key', () => {
    expect(findNext(library, 'nope')).toBeNull()
  })
})

describe('findPrevious', () => {
  it('steps back within a season', () => {
    expect(findPrevious(library, 'b')?.key).toBe('a')
  })

  it('steps back across a season boundary in the same series', () => {
    expect(findPrevious(library, 'c')?.key).toBe('b')
  })

  it('stops at the start of a series', () => {
    expect(findPrevious(library, 'a')).toBeNull()
  })

  it('does not step back from the first episode of a later series', () => {
    expect(findPrevious(library, 'd')).toBeNull()
  })
})
