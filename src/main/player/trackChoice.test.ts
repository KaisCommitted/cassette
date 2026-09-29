import { describe, expect, it } from 'vitest'
import type { TrackInfo } from '@shared/types'
import {
  applySeasonSubtitleChoice,
  chooseAudioTrack,
  chooseSubtitleTrack,
  describeSubtitlePick,
  type SubtitlePick
} from './trackChoice'

function track(over: Partial<TrackInfo> & { id: number; type: TrackInfo['type'] }): TrackInfo {
  return { title: null, lang: null, codec: null, selected: false, externalFilename: null, ...over }
}

describe('chooseSubtitleTrack', () => {
  const prefs = ['eng']

  it('turns on a matching language automatically', () => {
    const tracks = [
      track({ id: 1, type: 'sub', lang: 'fre' }),
      track({ id: 2, type: 'sub', lang: 'eng' })
    ]
    expect(chooseSubtitleTrack(tracks, prefs, true)).toBe(2)
  })

  it('treats two- and three-letter codes as the same language', () => {
    const tracks = [track({ id: 1, type: 'sub', lang: 'en' })]
    expect(chooseSubtitleTrack(tracks, prefs, true)).toBe(1)
  })

  it('ignores a region suffix', () => {
    const tracks = [track({ id: 3, type: 'sub', lang: 'en-US' })]
    expect(chooseSubtitleTrack(tracks, prefs, true)).toBe(3)
  })

  it('prefers full dialogue over a signs and songs track', () => {
    const tracks = [
      track({ id: 1, type: 'sub', lang: 'eng', title: 'Signs and Songs' }),
      track({ id: 2, type: 'sub', lang: 'eng', title: 'Full Subtitles' })
    ]
    expect(chooseSubtitleTrack(tracks, prefs, true)).toBe(2)
  })

  it('skips forced tracks when a full one exists', () => {
    const tracks = [
      track({ id: 1, type: 'sub', lang: 'eng', title: 'Forced' }),
      track({ id: 2, type: 'sub', lang: 'eng' })
    ]
    expect(chooseSubtitleTrack(tracks, prefs, true)).toBe(2)
  })

  it('does not demote SDH: it is full dialogue, not a partial track', () => {
    const tracks = [
      track({ id: 1, type: 'sub', lang: 'eng', title: 'English (SDH)' }),
      track({ id: 2, type: 'sub', lang: 'eng', title: 'English' })
    ]
    // Neither is partial, so the tie goes to the one the file lists first.
    expect(chooseSubtitleTrack(tracks, prefs, true)).toBe(1)
  })

  it('still puts a signs-and-songs track behind an SDH one', () => {
    const tracks = [
      track({ id: 1, type: 'sub', lang: 'eng', title: 'Signs and Songs' }),
      track({ id: 2, type: 'sub', lang: 'eng', title: 'English (SDH)' })
    ]
    expect(chooseSubtitleTrack(tracks, prefs, true)).toBe(2)
  })

  it('still enables an unmatched track rather than leaving subtitles off', () => {
    const tracks = [track({ id: 1, type: 'sub', lang: 'jpn' })]
    expect(chooseSubtitleTrack(tracks, prefs, true)).toBe(1)
  })

  it('stays off when the feature is disabled', () => {
    const tracks = [track({ id: 1, type: 'sub', lang: 'eng' })]
    expect(chooseSubtitleTrack(tracks, prefs, false)).toBeNull()
  })

  it('has nothing to choose when the file carries no subtitles', () => {
    expect(chooseSubtitleTrack([track({ id: 1, type: 'audio' })], prefs, true)).toBeNull()
  })
})

describe('chooseAudioTrack', () => {
  it('leaves a single audio track alone', () => {
    const tracks = [track({ id: 1, type: 'audio', lang: 'jpn' })]
    expect(chooseAudioTrack(tracks, ['eng'])).toBeNull()
  })

  it('switches to the preferred language', () => {
    const tracks = [
      track({ id: 1, type: 'audio', lang: 'jpn' }),
      track({ id: 2, type: 'audio', lang: 'eng' })
    ]
    expect(chooseAudioTrack(tracks, ['eng'])).toBe(2)
  })

  it('defers to mpv when no track matches', () => {
    const tracks = [
      track({ id: 1, type: 'audio', lang: 'jpn' }),
      track({ id: 2, type: 'audio', lang: 'kor' })
    ]
    expect(chooseAudioTrack(tracks, ['eng'])).toBeNull()
  })

  it('skips a commentary track in the right language', () => {
    const tracks = [
      track({ id: 1, type: 'audio', lang: 'eng', title: 'Director Commentary' }),
      track({ id: 2, type: 'audio', lang: 'eng' })
    ]
    expect(chooseAudioTrack(tracks, ['eng'])).toBe(2)
  })
})

describe('applySeasonSubtitleChoice', () => {
  const embeddedSdh = track({ id: 10, type: 'sub', lang: 'eng', title: 'English (SDH)' })
  const embedded = track({ id: 11, type: 'sub', lang: 'eng', title: 'English' })
  const file = track({
    id: 12, type: 'sub', lang: 'eng', title: 'English (file)',
    externalFilename: 'C:\\Show S01E01.eng.srt'
  })
  const french = track({
    id: 13, type: 'sub', lang: 'fre', title: 'French (file)',
    externalFilename: 'C:\\Show S01E02.fre.srt'
  })
  const pick = (over: Partial<SubtitlePick>): SubtitlePick => ({
    index: 0, lang: 'eng', external: false, flavour: 'full', ...over
  })

  it('has nothing to apply when the season has no remembered choice', () => {
    expect(applySeasonSubtitleChoice([embedded], undefined)).toBeUndefined()
  })

  it('turns subtitles off when that was the remembered choice', () => {
    expect(applySeasonSubtitleChoice([embedded], null)).toBeNull()
  })

  it('picks the track at the remembered position when it is the same kind', () => {
    expect(applySeasonSubtitleChoice([embeddedSdh, embedded], pick({ index: 1 }))).toBe(11)
  })

  it('does not take a different subtitle just because the position lines up', () => {
    // Picked: English at position 1. Here position 1 is French.
    const chosen = applySeasonSubtitleChoice([embedded, french], pick({ index: 1, external: false }))
    expect(chosen).toBe(11)
    // Picked: full English. Position 0 is now SDH; the full track moved.
    expect(applySeasonSubtitleChoice([embeddedSdh, embedded], pick({ index: 0 }))).toBe(11)
  })

  it('finds the same kind of subtitle from the same place first', () => {
    expect(
      applySeasonSubtitleChoice([embedded, file], pick({ index: 0, external: true }))
    ).toBe(12)
  })

  it('falls back to the same language from the other place', () => {
    expect(applySeasonSubtitleChoice([file], pick({ index: 0, external: false }))).toBe(12)
  })

  it('knows a track and a file name the same language however each spells it', () => {
    // mkv tracks say `it` and `nld`; subtitle files say `ita` and `dut`.
    const italian = track({ id: 20, type: 'sub', lang: 'it', title: 'Italiano' })
    const dutch = track({ id: 21, type: 'sub', lang: 'nld', title: 'Nederlands' })
    expect(applySeasonSubtitleChoice([italian], pick({ lang: 'ita', external: true }))).toBe(20)
    expect(applySeasonSubtitleChoice([dutch], pick({ lang: 'dut', external: true }))).toBe(21)
    expect(chooseSubtitleTrack([dutch, italian], ['ita'], true)).toBe(20)
  })

  it('has nothing to apply when no track is like the one picked', () => {
    expect(applySeasonSubtitleChoice([french], pick({ index: 0 }))).toBeUndefined()
    expect(applySeasonSubtitleChoice([embeddedSdh], pick({ index: 0 }))).toBeUndefined()
  })
})

describe('describeSubtitlePick', () => {
  it('records what a track is, and where it sat', () => {
    const subs = [
      track({ id: 3, type: 'sub', lang: 'en', title: 'English (SDH)' }),
      track({
        id: 4, type: 'sub', lang: 'fre', title: 'French forced (file)',
        externalFilename: 'C:\\x.fre.forced.srt'
      })
    ]
    expect(describeSubtitlePick(subs, 3)).toEqual({
      index: 0, lang: 'eng', external: false, flavour: 'sdh'
    })
    expect(describeSubtitlePick(subs, 4)).toEqual({
      index: 1, lang: 'fre', external: true, flavour: 'forced'
    })
    expect(describeSubtitlePick(subs, 99)).toBeUndefined()
  })
})
