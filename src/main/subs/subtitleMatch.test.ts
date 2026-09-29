import { describe, expect, it } from 'vitest'
import { join } from 'node:path'
import type { MediaFile } from '@shared/types'
import {
  identifySubtitle,
  identifyVideo,
  MATCH,
  ownersOf,
  scoreMatch
} from './subtitleMatch'

const root = join('C:', 'Watch')

function episode(path: string, season: number, episodes: number[], title = 'The Mentalist'): MediaFile {
  return { path, sizeBytes: 1, key: path, title, year: 2008, season, episodes, kind: 'series', tags: [] }
}

function film(path: string, title: string, year: number | null): MediaFile {
  return { path, sizeBytes: 1, key: path, title, year, season: null, episodes: [], kind: 'movie', tags: [] }
}

describe('identifySubtitle', () => {
  it('reads the episode the way the library reads a video', () => {
    const id = identifySubtitle('The.Mentalist.S06E18.720p.HDTV.x264-KILLERS.srt')
    expect(id.readings).toEqual([{ season: 6, episodes: [18] }])
    expect(id.words).toEqual(['mentalist'])
    expect(id.seasoned).toBe(true)
  })

  it('reads 1x03 and double episodes', () => {
    expect(identifySubtitle('Show - 1x03 - Title.srt').readings).toEqual([{ season: 1, episodes: [3] }])
    expect(identifySubtitle('Show.S01E01E02.srt').readings).toEqual([{ season: 1, episodes: [1, 2] }])
  })

  it('reads absolute numbering, and a packed number both ways', () => {
    expect(identifySubtitle('Frieren - 05 [1080p].srt').readings).toEqual([
      { season: null, episodes: [5] }
    ])
    expect(identifySubtitle('Show 305.srt').readings).toEqual([
      { season: null, episodes: [305] },
      { season: 3, episodes: [5] }
    ])
  })

  it('takes the language, flavour and numbering tags off the end', () => {
    const id = identifySubtitle('Show S01E01.eng.sdh.2.srt')
    expect(id.lang).toBe('eng')
    expect(id.flavour).toBe('sdh')
    expect(id.readings).toEqual([{ season: 1, episodes: [1] }])
    expect(identifySubtitle('Movie.2010.English.Forced.srt').flavour).toBe('forced')
    expect(identifySubtitle('The.Mentalist.S06E18.HDTV.x264-LOL.HI.srt').flavour).toBe('sdh')
  })

  it('does not read a track index as an episode', () => {
    const id = identifySubtitle('2_English.srt')
    expect(id.readings).toEqual([])
    expect(id.words).toEqual([])
    expect(id.lang).toBe('eng')
  })

  it('takes what a nameless subtitle is from the folder it sits in', () => {
    const id = identifySubtitle('2_English.srt', ['Subs', 'Show.S01E03.1080p.WEB.x264-GRP'])
    expect(id.readings).toEqual([{ season: 1, episodes: [3] }])
    expect(id.words).toEqual(['show'])
  })

  it('ignores folders that only say they hold subtitles', () => {
    expect(identifySubtitle('English.srt', ['Subs']).words).toEqual([])
    expect(identifySubtitle('1.srt', ['Subs', 'English']).readings).toEqual([
      { season: null, episodes: [1] }
    ])
  })

  it('takes a season from a folder when the name has none', () => {
    expect(identifySubtitle('Frieren - 05.srt', ['Season 2']).readings[0]).toEqual({
      season: 2,
      episodes: [5]
    })
  })

  it('reads a film title and year, and the CD it is half of', () => {
    const id = identifySubtitle('Heat.1995.CD2.srt')
    expect(id.words).toEqual(['heat'])
    expect(id.year).toBe(1995)
    expect(id.cd).toBe(2)
    expect(id.seasoned).toBe(false)
  })
})

describe('scoreMatch', () => {
  const s06e18 = identifyVideo(
    join(root, 'The Mentalist 2008 Season 6 Complete 720p AMZN WEBRip x264 [i_c]', 'The Mentalist S06E18 Forest Green.mkv'),
    episode('', 6, [18])
  )

  it('matches the same episode however it is written', () => {
    expect(scoreMatch(identifySubtitle('The.Mentalist.S06E18.HDTV.srt'), s06e18)).toBe(MATCH.episodeSeasoned)
    expect(scoreMatch(identifySubtitle('Mentalist 6x18.srt'), s06e18)).toBe(MATCH.episodeSeasoned)
  })

  it('never matches another episode or another season', () => {
    expect(scoreMatch(identifySubtitle('The.Mentalist.S06E01.srt'), s06e18)).toBeNull()
    expect(scoreMatch(identifySubtitle('The.Mentalist.S05E18.srt'), s06e18)).toBeNull()
  })

  it('never matches another show', () => {
    expect(scoreMatch(identifySubtitle('Castle.S06E18.srt'), s06e18)).toBeNull()
  })

  it('knows the episode by its title', () => {
    expect(scoreMatch(identifySubtitle('Forest Green.srt'), s06e18)).toBe(MATCH.unknown)
  })

  it('gives the first half of a double episode to the double file, not the second', () => {
    const double = identifyVideo(join(root, 'Show.S01E01E02.1080p.mkv'), episode('', 1, [1, 2], 'Show'))
    expect(scoreMatch(identifySubtitle('Show.S01E01E02.srt'), double)).toBe(MATCH.episodeSeasoned)
    expect(scoreMatch(identifySubtitle('Show.S01E01.srt'), double)).toBe(MATCH.partial)
    expect(scoreMatch(identifySubtitle('Show.S01E02.srt'), double)).toBeNull()
  })

  it('matches specials as season 0', () => {
    const special = identifyVideo(join(root, 'Show.S00E02.1080p.mkv'), episode('', 0, [2], 'Show'))
    expect(scoreMatch(identifySubtitle('Show.S00E02.srt'), special)).toBe(MATCH.episodeSeasoned)
    expect(scoreMatch(identifySubtitle('Show.S01E02.srt'), special)).toBeNull()
  })

  it('matches absolute numbering against where the library placed it', () => {
    const frieren = identifyVideo(join(root, 'Frieren - 05 [1080p].mkv'), episode('', 1, [5], 'Frieren'))
    expect(scoreMatch(identifySubtitle('Frieren - 05.srt'), frieren)).toBe(MATCH.episode)
    expect(scoreMatch(identifySubtitle('Frieren S01E05.srt'), frieren)).toBe(MATCH.episodeSeasoned)
    expect(scoreMatch(identifySubtitle('Frieren - 06.srt'), frieren)).toBeNull()
  })

  it('never gives a film an episode subtitle, or a remake the original’s', () => {
    const heat = identifyVideo(join(root, 'Heat (1995).mkv'), film('', 'Heat', 1995))
    expect(scoreMatch(identifySubtitle('Heat.S01E01.srt'), heat)).toBeNull()
    expect(scoreMatch(identifySubtitle('Heat.2021.srt'), heat)).toBeNull()
    expect(scoreMatch(identifySubtitle('Inception.2010.srt'), heat)).toBeNull()
    expect(scoreMatch(identifySubtitle('Heat.1995.1080p.BluRay.srt'), heat)).toBeGreaterThan(MATCH.title)
  })

  it('tells the parts of a film apart', () => {
    const part1 = identifyVideo(join(root, 'Dune Part 1 (2021).mkv'), film('', 'Dune Part 1', 2021))
    expect(scoreMatch(identifySubtitle('Dune.Part.2.2021.srt'), part1)).toBeNull()
  })

  it('lets a video alone in its folder take a subtitle whose title disagrees', () => {
    const inception = identifyVideo(join(root, 'tt-inc-1080p.mkv'))
    const sub = identifySubtitle('Inception.2010.eng.srt')
    expect(scoreMatch(sub, inception)).toBeNull()
    expect(scoreMatch(sub, inception, { alone: true })).toBe(MATCH.unknown)
    // Alone or not, another episode, season or year is still another one.
    expect(scoreMatch(identifySubtitle('Castle.S06E19.srt'), s06e18, { alone: true })).toBeNull()
    expect(scoreMatch(identifySubtitle('Castle.S06E18.srt'), s06e18, { alone: true })).toBe(MATCH.unknown)
    const heat = identifyVideo(join(root, 'Heat (1995).mkv'), film('', 'Heat', 1995))
    expect(scoreMatch(identifySubtitle('Heat.2021.srt'), heat, { alone: true })).toBeNull()
  })

  it('counts a name that starts with the video’s as the surest match', () => {
    const video = identifyVideo(join(root, 'Show E1.mkv'))
    expect(scoreMatch(identifySubtitle('Show E1.eng.srt'), video)).toBe(MATCH.named)
    expect(scoreMatch(identifySubtitle('Show E10.eng.srt'), video)).toBeNull()
  })
})

describe('ownersOf', () => {
  const videos = [
    identifyVideo(join(root, 'Show S01E05.mkv'), episode('', 1, [5], 'Show')),
    identifyVideo(join(root, 'Show S02E05.mkv'), episode('', 2, [5], 'Show'))
  ]

  it('gives a subtitle to the episode it names', () => {
    expect(ownersOf(identifySubtitle('Show.S02E05.srt'), videos).map((v) => v.path)).toEqual([
      videos[1]!.path
    ])
  })

  it('gives an ambiguous one to neither', () => {
    expect(ownersOf(identifySubtitle('Show - 05.srt'), videos)).toEqual([])
  })

  it('gives a nameless one to neither when there are rivals', () => {
    expect(ownersOf(identifySubtitle('English.srt'), videos)).toEqual([])
    expect(ownersOf(identifySubtitle('English.srt'), [videos[0]!])).toHaveLength(1)
  })

  it('sends a film’s subtitle to the closer title', () => {
    const films = [
      identifyVideo(join(root, 'The Dark Knight.mkv'), film('', 'The Dark Knight', null)),
      identifyVideo(join(root, 'The Dark Knight Rises.mkv'), film('', 'The Dark Knight Rises', null))
    ]
    expect(ownersOf(identifySubtitle('The.Dark.Knight.srt'), films).map((v) => v.path)).toEqual([
      films[0]!.path
    ])
  })
})
