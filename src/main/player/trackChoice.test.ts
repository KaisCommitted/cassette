import { describe, expect, it } from 'vitest'
import type { TrackInfo } from '@shared/types'
import { applySeasonSubtitleChoice, chooseAudioTrack, chooseSubtitleTrack } from './trackChoice'

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
  const subs = [
    track({ id: 10, type: 'sub', lang: 'eng', title: 'English (SDH)' }),
    track({ id: 11, type: 'sub', lang: 'eng', title: 'English · file' })
  ]

  it('has nothing to apply when the season has no remembered choice', () => {
    expect(applySeasonSubtitleChoice(subs, undefined)).toBeUndefined()
  })

  it('picks the track at the remembered position', () => {
    expect(applySeasonSubtitleChoice(subs, 1)).toBe(11)
  })

  it('turns subtitles off when that was the remembered choice', () => {
    expect(applySeasonSubtitleChoice(subs, null)).toBeNull()
  })

  it('has nothing to apply when this episode has fewer options than that', () => {
    expect(applySeasonSubtitleChoice([subs[0]!], 1)).toBeUndefined()
  })
})
