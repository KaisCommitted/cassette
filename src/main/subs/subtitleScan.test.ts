import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, type Library, type MediaFile, type Settings } from '@shared/types'
import { filesInScope, wantedLanguages } from './subtitleScan'
import { rankCandidates, type SubtitleCandidate } from './openSubtitles'

function file(key: string): MediaFile {
  return {
    path: `C:\${key}.mkv`, sizeBytes: 1, key, title: 'S', year: null,
    season: 1, episodes: [1], kind: 'series', tags: []
  }
}

const library: Library = {
  scannedAt: '',
  series: [
    {
      kind: 'series', id: 'show', title: 'Show', year: null,
      seasons: [
        { season: 1, episodes: [
          { file: file('a'), season: 1, episodes: [1], label: 'S01E01' },
          { file: file('b'), season: 1, episodes: [2], label: 'S01E02' }
        ] },
        { season: 2, episodes: [
          { file: file('c'), season: 2, episodes: [1], label: 'S02E01' }
        ] }
      ]
    },
    {
      kind: 'series', id: 'other', title: 'Other', year: null,
      seasons: [{ season: 1, episodes: [
        { file: file('d'), season: 1, episodes: [1], label: 'S01E01' }
      ] }]
    }
  ],
  movies: [{ kind: 'movie', id: 'film', title: 'Film', year: 2020, file: file('m') }]
}

describe('filesInScope', () => {
  it('covers a whole series', () => {
    const keys = filesInScope(library, { kind: 'series', seriesId: 'show' }).map((f) => f.file.key)
    expect(keys).toEqual(['a', 'b', 'c'])
  })

  it('covers one season only', () => {
    const keys = filesInScope(library, { kind: 'season', seriesId: 'show', season: 1 })
      .map((f) => f.file.key)
    expect(keys).toEqual(['a', 'b'])
  })

  it('covers a single episode', () => {
    const keys = filesInScope(library, { kind: 'episode', key: 'b' }).map((f) => f.file.key)
    expect(keys).toEqual(['b'])
  })

  it('covers a film', () => {
    const keys = filesInScope(library, { kind: 'movie', key: 'm' }).map((f) => f.file.key)
    expect(keys).toEqual(['m'])
  })

  it('does not stray into another series', () => {
    const keys = filesInScope(library, { kind: 'series', seriesId: 'show' }).map((f) => f.file.key)
    expect(keys).not.toContain('d')
  })

  it('labels each file so progress is readable', () => {
    expect(filesInScope(library, { kind: 'episode', key: 'a' })[0]!.label).toBe('Show S01E01')
  })
})

describe('wantedLanguages', () => {
  const settings = (over: Partial<Settings>): Settings => ({ ...DEFAULT_SETTINGS, ...over })

  it('treats two- and three-letter codes as one language', () => {
    // The shipped default is 'eng, en', which must not mean English twice.
    expect(wantedLanguages(settings({ preferredSubtitleLanguages: ['eng', 'en'] }))).toEqual([
      'eng'
    ])
  })

  it('keeps every distinct language, in the order given', () => {
    const chosen = wantedLanguages(
      settings({ preferredSubtitleLanguages: ['fr', 'English', 'ara'] })
    )
    expect(chosen).toEqual(['fre', 'eng', 'ara'])
  })

  it('takes only the first when fetching every language is off', () => {
    const chosen = wantedLanguages(
      settings({
        preferredSubtitleLanguages: ['fre', 'eng'],
        downloadEveryPreferredLanguage: false
      })
    )
    expect(chosen).toEqual(['fre'])
  })

  it('falls back to English rather than searching for nothing', () => {
    expect(wantedLanguages(settings({ preferredSubtitleLanguages: [] }))).toEqual(['eng'])
  })
})

describe('rankCandidates', () => {
  function candidate(over: Partial<SubtitleCandidate>): SubtitleCandidate {
    return { id: '1', fileId: 1, language: 'en', release: '', downloads: 0, fromTrusted: false, ...over }
  }

  it('puts trusted uploads first', () => {
    const list = [candidate({ id: 'a', downloads: 900 }), candidate({ id: 'b', fromTrusted: true })]
    expect(list.sort(rankCandidates)[0]!.id).toBe('b')
  })

  it('falls back to download count', () => {
    const list = [candidate({ id: 'a', downloads: 10 }), candidate({ id: 'b', downloads: 99 })]
    expect(list.sort(rankCandidates)[0]!.id).toBe('b')
  })
})
