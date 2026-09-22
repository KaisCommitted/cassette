import { describe, expect, it } from 'vitest'
import { describeEmbedded, parseTrackList } from './embeddedSubtitles'

// Taken verbatim from mpv's output on the reference library.
const MENTALIST = `
 (+) Video --vid=1 (*) (h264 1280x720 23.976fps)
 (+) Audio --aid=1 --alang=eng (*) (aac 2ch 48000Hz)
     Subs  --sid=1  --slang=eng  'English (SDH)' (ass)
`

const MOVIE = `
     Subs   --sid=1  --slang=eng  (subrip)
     Subs   --sid=2  --slang=eng  'SDH' (subrip)
     Subs   --sid=9  --slang=ara  (ass)
     Subs   --sid=13 --slang=fre  (subrip)
`

describe('parseTrackList', () => {
  it('finds a single embedded track', () => {
    const tracks = parseTrackList(MENTALIST)
    expect(tracks).toHaveLength(1)
    expect(tracks[0]).toEqual({ id: 1, lang: 'eng', title: 'English (SDH)', codec: 'ass' })
  })

  it('finds every track in a multi-language file', () => {
    const tracks = parseTrackList(MOVIE)
    expect(tracks.map((t) => t.lang)).toEqual(['eng', 'eng', 'ara', 'fre'])
  })

  it('handles a track with no title', () => {
    expect(parseTrackList(MOVIE)[0]!.title).toBeNull()
  })

  it('ignores video and audio lines', () => {
    expect(parseTrackList(MENTALIST).every((t) => t.codec !== 'h264')).toBe(true)
  })

  it('returns nothing for a file with no subtitles', () => {
    expect(parseTrackList('(+) Video --vid=1 (h264)\n(+) Audio --aid=1 (aac)')).toEqual([])
  })

  it('survives unexpected output without throwing', () => {
    expect(parseTrackList('')).toEqual([])
  })
})

describe('describeEmbedded', () => {
  it('says so plainly when there are none', () => {
    expect(describeEmbedded([])).toBe('none')
  })

  it('names one language', () => {
    expect(describeEmbedded(parseTrackList(MENTALIST))).toBe('English')
  })

  it('summarises a long list rather than printing all of it', () => {
    expect(describeEmbedded(parseTrackList(MOVIE))).toBe('English, Arabic and 1 more')
  })
})
