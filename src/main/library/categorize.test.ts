import { describe, expect, it } from 'vitest'
import { categorize, type ScannedFile } from './categorize'

/** Builds the scan input from paths alone; sizes and keys do not affect grouping. */
function scan(...paths: string[]): ScannedFile[] {
  return paths.map((path, index) => ({
    path,
    sizeBytes: 1_000_000 + index,
    key: `k${index}`
  }))
}

const W = 'C:\\Watch'

describe('categorize — tidy layouts still work', () => {
  it('reads the Plex-style layout', () => {
    const library = categorize(
      scan(
        `${W}\\Series\\The Mentalist\\Season 3\\The Mentalist S03E16.mkv`,
        `${W}\\Series\\The Mentalist\\Season 3\\The Mentalist S03E17.mkv`,
        `${W}\\Movies\\Another Round (2020).mkv`
      )
    )
    expect(library.series).toHaveLength(1)
    expect(library.series[0]!.seasons[0]!.season).toBe(3)
    expect(library.movies.map((m) => m.title)).toEqual(['Another Round'])
  })

  it('trusts the filename over a release-named season folder', () => {
    const library = categorize(
      scan(
        `${W}\\The Mentalist 2008 Season 3 Complete 720p AMZN WEBRip x264 [i_c]\\The Mentalist S03E16 Red Queen.mkv`,
        `${W}\\The Mentalist 2008 Season 3 Complete 720p AMZN WEBRip x264 [i_c]\\The Mentalist S03E17 Bloodstream.mkv`
      )
    )
    expect(library.series[0]!.title).toBe('The Mentalist')
    expect(library.series[0]!.seasons[0]!.season).toBe(3)
  })
})

describe('categorize — no Movies/Series split', () => {
  it('sorts a flat folder of mixed content', () => {
    const library = categorize(
      scan(
        `${W}\\Breaking Bad S01E01.mkv`,
        `${W}\\Breaking Bad S01E02.mkv`,
        `${W}\\Inception (2010).mkv`,
        `${W}\\Arrival 2016 1080p.mkv`
      )
    )
    expect(library.series.map((s) => s.title)).toEqual(['Breaking Bad'])
    expect(library.movies.map((m) => m.title).sort()).toEqual(['Arrival', 'Inception'])
  })
})

describe('categorize — seasons not in folders', () => {
  it('groups a whole series dumped flat into one directory', () => {
    const library = categorize(
      scan(
        `${W}\\stuff\\The Office S01E01.mkv`,
        `${W}\\stuff\\The Office S01E02.mkv`,
        `${W}\\stuff\\The Office S02E01.mkv`,
        `${W}\\stuff\\The Office S02E02.mkv`
      )
    )
    expect(library.series).toHaveLength(1)
    expect(library.series[0]!.seasons.map((s) => s.season)).toEqual([1, 2])
    expect(library.series[0]!.seasons[1]!.episodes).toHaveLength(2)
  })

  it('reunites a series scattered across unrelated subfolders', () => {
    // The same show in three different places, which folder-driven grouping
    // would report as three separate things.
    const library = categorize(
      scan(
        `${W}\\downloads\\new\\Dark S01E01.mkv`,
        `${W}\\old drive\\Dark S01E02.mkv`,
        `${W}\\misc\\keep\\Dark S01E03.mkv`
      )
    )
    expect(library.series).toHaveLength(1)
    expect(library.series[0]!.seasons[0]!.episodes).toHaveLength(3)
  })
})

describe('categorize — absolute numbering with no season marker', () => {
  it('treats a numbered run under one title as a series', () => {
    const library = categorize(
      scan(
        `${W}\\[SubsPlease] Frieren - 01 (1080p) [A1B2].mkv`,
        `${W}\\[SubsPlease] Frieren - 02 (1080p) [C3D4].mkv`,
        `${W}\\[SubsPlease] Frieren - 03 (1080p) [E5F6].mkv`
      )
    )
    expect(library.series).toHaveLength(1)
    expect(library.series[0]!.title).toBe('Frieren')
    expect(library.series[0]!.seasons[0]!.season).toBe(1)
    expect(
      library.series[0]!.seasons[0]!.episodes.map((e) => e.episodes[0])
    ).toEqual([1, 2, 3])
  })

  it('does not turn a lone numbered film into a series', () => {
    const library = categorize(scan(`${W}\\Ocean's 11 (2001).mkv`))
    expect(library.series).toEqual([])
    expect(library.movies).toHaveLength(1)
    // The 11 is part of the name, not an episode number to strip off.
    expect(library.movies[0]!.title).toBe("Ocean's 11")
  })

  it('leaves films whose titles are numbers alone', () => {
    const library = categorize(scan(`${W}\\1917 (2019).mkv`, `${W}\\2012 (2009).mkv`))
    expect(library.series).toEqual([])
    expect(library.movies.map((m) => m.title).sort()).toEqual(['1917', '2012'])
  })

  it('does not mistake a leading number for an episode', () => {
    const library = categorize(scan(`${W}\\21 Jump Street (2012).mkv`))
    expect(library.movies[0]!.title).toBe('21 Jump Street')
  })
})

describe('categorize — episode words instead of SxxEyy', () => {
  it('reads "Episode 5" and "Ep 6"', () => {
    const library = categorize(
      scan(`${W}\\Chernobyl Episode 1.mkv`, `${W}\\Chernobyl Ep 2.mkv`)
    )
    expect(library.series).toHaveLength(1)
    expect(
      library.series[0]!.seasons[0]!.episodes.map((e) => e.episodes[0])
    ).toEqual([1, 2])
  })

  it('reads the 1x02 form', () => {
    const library = categorize(scan(`${W}\\Fringe 1x02.mkv`, `${W}\\Fringe 1x03.mkv`))
    expect(library.series[0]!.seasons[0]!.season).toBe(1)
  })
})

describe('categorize — a season folder is enough on its own', () => {
  it('treats a single file under a Season folder as an episode', () => {
    const library = categorize(scan(`${W}\\Show\\Season 4\\something odd.mkv`))
    expect(library.series).toHaveLength(1)
    expect(library.series[0]!.seasons[0]!.season).toBe(4)
  })

  it('applies the folder season to files that omit it', () => {
    const library = categorize(
      scan(`${W}\\Show\\Season 4\\Show - 01.mkv`, `${W}\\Show\\Season 4\\Show - 02.mkv`)
    )
    expect(library.series[0]!.seasons[0]!.season).toBe(4)
  })
})

describe('categorize — packed three-digit numbering', () => {
  it('unpacks 305 as season 3 episode 5 when the group agrees', () => {
    const library = categorize(
      scan(`${W}\\Lost 301.mkv`, `${W}\\Lost 302.mkv`, `${W}\\Lost 303.mkv`)
    )
    const seasons = library.series[0]!.seasons
    expect(seasons.map((s) => s.season)).toEqual([3])
    expect(seasons[0]!.episodes.map((e) => e.episodes[0])).toEqual([1, 2, 3])
  })
})

describe('categorize — daily shows numbered by date', () => {
  it('groups by year and orders by date', () => {
    const library = categorize(
      scan(`${W}\\The Daily Show 2024.05.01.mkv`, `${W}\\The Daily Show 2024.05.02.mkv`)
    )
    expect(library.series).toHaveLength(1)
    expect(library.series[0]!.seasons[0]!.season).toBe(2024)
    expect(
      library.series[0]!.seasons[0]!.episodes.map((e) => e.episodes[0])
    ).toEqual([501, 502])
  })
})

describe('categorize — titles that disagree between files', () => {
  it('groups differing separators and picks the commonest spelling', () => {
    const library = categorize(
      scan(
        `${W}\\The.Office.S01E01.mkv`,
        `${W}\\The Office S01E02.mkv`,
        `${W}\\The_Office_S01E03.mkv`
      )
    )
    expect(library.series).toHaveLength(1)
    expect(library.series[0]!.title).toBe('The Office')
    expect(library.series[0]!.seasons[0]!.episodes).toHaveLength(3)
  })

  it('ignores a year difference when grouping', () => {
    const library = categorize(
      scan(`${W}\\Dark 2017 S01E01.mkv`, `${W}\\Dark S01E02.mkv`)
    )
    expect(library.series).toHaveLength(1)
    expect(library.series[0]!.year).toBe(2017)
  })
})

describe('categorize — multi-episode files and edge cases', () => {
  it('keeps both episodes of a double file', () => {
    const library = categorize(scan(`${W}\\Show S03E23E24 Finale.mkv`))
    expect(library.series[0]!.seasons[0]!.episodes[0]!.episodes).toEqual([23, 24])
    expect(library.series[0]!.seasons[0]!.episodes[0]!.label).toBe('S03E23-E24')
  })

  it('falls back to the folder when the filename is just a number', () => {
    const library = categorize(
      scan(`${W}\\Severance\\01.mkv`, `${W}\\Severance\\02.mkv`)
    )
    expect(library.series).toHaveLength(1)
    expect(library.series[0]!.title).toBe('Severance')
  })

  it('handles an empty library', () => {
    const library = categorize([])
    expect(library.series).toEqual([])
    expect(library.movies).toEqual([])
  })

  it('keeps two different shows apart', () => {
    const library = categorize(
      scan(
        `${W}\\Dark S01E01.mkv`,
        `${W}\\Dark S01E02.mkv`,
        `${W}\\Fringe S01E01.mkv`,
        `${W}\\Fringe S01E02.mkv`
      )
    )
    expect(library.series.map((s) => s.title)).toEqual(['Dark', 'Fringe'])
  })
})
