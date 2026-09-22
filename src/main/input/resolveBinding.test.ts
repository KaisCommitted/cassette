import { describe, expect, it } from 'vitest'
import { describeKey, resolveBinding } from './resolveBinding'

describe('describeKey', () => {
  it('describes a bare key', () => {
    expect(describeKey({ key: 'g', control: false, alt: false, shift: false })).toBe(
      'key:g'
    )
  })

  it('lowercases the key so shift state does not change identity', () => {
    expect(describeKey({ key: 'G', control: false, alt: false, shift: true })).toBe(
      'key:Shift+g'
    )
  })

  it('orders modifiers consistently', () => {
    expect(describeKey({ key: 'Left', control: true, alt: true, shift: false })).toBe(
      'key:Ctrl+Alt+Left'
    )
  })
})

describe('resolveBinding — VLC defaults', () => {
  const cases: Array<[string, string]> = [
    ['key:Space', 'playPause'],
    ['key:f', 'toggleFullscreen'],
    ['key:Left', 'seekShortBack'],
    ['key:Right', 'seekShortForward'],
    ['key:Ctrl+Left', 'seekMediumBack'],
    ['key:Ctrl+Right', 'seekMediumForward'],
    ['key:Up', 'volumeUp'],
    ['key:Down', 'volumeDown'],
    ['key:v', 'cycleSubtitleTrack'],
    ['key:b', 'cycleAudioTrack'],
    ['key:g', 'subtitleDelayDown'],
    ['key:h', 'subtitleDelayUp'],
    ['key:Escape', 'stop']
  ]

  for (const [descriptor, action] of cases) {
    it(`maps ${descriptor} to ${action}`, () => {
      expect(resolveBinding(descriptor)).toBe(action)
    })
  }

  it('returns null for an unbound key', () => {
    expect(resolveBinding('key:z')).toBeNull()
  })
})
