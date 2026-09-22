import { describe, expect, it } from 'vitest'
import { parseFilename } from './parseFilename'

const SERIES_DIR =
  'C:\\Watch\\Series\\The Mentalist 2008\\' +
  'The Mentalist 2008 Season 3 Complete 720p AMZN WEBRip x264 [i_c]'

describe('parseFilename — series', () => {
  it('reads season and episode from the filename, not the folder', () => {
    // The folder says "Season 3 Complete 720p ..." — a release name, not a
    // season label. Only SxxEyy in the filename is authoritative.
    const r = parseFilename(`${SERIES_DIR}\\The Mentalist S03E16 Red Queen.mkv`)
    expect(r.kind).toBe('series')
    expect(r.season).toBe(3)
    expect(r.episodes).toEqual([16])
    expect(r.title).toBe('The Mentalist')
  })

  it('returns every episode of a multi-episode file', () => {
    const r = parseFilename(
      `${SERIES_DIR}\\The Mentalist S03E23E24 Strawberries and Cream (I,2).mkv`
    )
    expect(r.episodes).toEqual([23, 24])
    expect(r.season).toBe(3)
    expect(r.title).toBe('The Mentalist')
  })

  it('falls back to an ancestor folder for the year', () => {
    // The filename carries no year; "The Mentalist 2008" does.
    const r = parseFilename(`${SERIES_DIR}\\The Mentalist S03E16 Red Queen.mkv`)
    expect(r.year).toBe(2008)
  })

  it('understands the 1x02 form', () => {
    const r = parseFilename('C:\\Watch\\Series\\Some Show\\Some.Show.1x02.Pilot.mkv')
    expect(r.season).toBe(1)
    expect(r.episodes).toEqual([2])
    expect(r.title).toBe('Some Show')
  })
})

describe('parseFilename — movies', () => {
  it('parses dot-separated scene naming', () => {
    const r = parseFilename(
      'C:\\Watch\\Movies\\Another.Round.2020.720p.WEBRip.800MB.x264-GalaxyRG.mkv'
    )
    expect(r.kind).toBe('movie')
    expect(r.title).toBe('Another Round')
    expect(r.year).toBe(2020)
    expect(r.season).toBeNull()
    expect(r.episodes).toEqual([])
  })

  it('parses title (year) [tags] naming without eating a numeric title', () => {
    // "500" must survive; only 1900-2099 standalone numbers are years.
    const r = parseFilename(
      'C:\\Watch\\Movies\\500 Days of Summer (2009)  [1080p x265 10bit FS69 Joy].mkv'
    )
    expect(r.title).toBe('500 Days of Summer')
    expect(r.year).toBe(2009)
    expect(r.kind).toBe('movie')
  })

  it('leaves no quality or codec tags in the title', () => {
    const r = parseFilename(
      'C:\\Watch\\Movies\\500 Days of Summer (2009)  [1080p x265 10bit FS69 Joy].mkv'
    )
    expect(r.title).not.toMatch(/1080p|x265|10bit|WEBRip/i)
  })
})

describe('parseFilename — kind precedence', () => {
  it('prefers an episode marker over any folder hint', () => {
    const r = parseFilename('C:\\Watch\\Movies\\Show S01E01 Thing.mkv')
    expect(r.kind).toBe('series')
  })

  it('uses a Series ancestor folder when there is no episode marker', () => {
    const r = parseFilename('C:\\Watch\\Series\\Odd Show\\odd-pilot.mkv')
    expect(r.kind).toBe('series')
  })

  it('defaults to movie when nothing indicates otherwise', () => {
    const r = parseFilename('C:\\Random\\something.mkv')
    expect(r.kind).toBe('movie')
  })
})
