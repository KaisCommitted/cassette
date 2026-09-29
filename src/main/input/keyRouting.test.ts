import { describe, expect, it } from 'vitest'
import { isMediaKey, keyOwner } from './keyRouting'

const press = (over: Partial<Parameters<typeof keyOwner>[0]>): Parameters<typeof keyOwner>[0] => ({
  from: 'library',
  key: ' ',
  playing: true,
  typing: false,
  pip: false,
  ...over
})

describe('keyOwner', () => {
  it('gives every key to the page with nothing playing', () => {
    expect(keyOwner(press({ playing: false }))).toBe('page')
    expect(keyOwner(press({ playing: false, from: 'player' }))).toBe('page')
  })

  it('gives keys in the library to the player while the full player covers it', () => {
    expect(keyOwner(press({}))).toBe('player')
    expect(keyOwner(press({ key: 'Escape' }))).toBe('player')
  })

  it('leaves keys typed into a library text box alone', () => {
    expect(keyOwner(press({ typing: true, key: 'm' }))).toBe('page')
  })

  it('never lets the library’s typing hold back keys pressed in the player', () => {
    // Typed in search during picture-in-picture, then clicked the little
    // window: the library still reports typing, but this key is not its.
    for (const key of [' ', 'p', 'ArrowLeft', 'Escape']) {
      expect(keyOwner(press({ from: 'player', typing: true, pip: true, key }))).toBe('player')
    }
    expect(keyOwner(press({ from: 'player', typing: true, pip: false }))).toBe('player')
  })

  it('gives the library its own keys back in picture-in-picture', () => {
    for (const key of [' ', 'ArrowDown', 'Enter', 'Escape', 'p']) {
      expect(keyOwner(press({ pip: true, key }))).toBe('page')
    }
  })

  it('keeps media keys for the player from the library in picture-in-picture', () => {
    expect(keyOwner(press({ pip: true, key: 'MediaPlayPause' }))).toBe('player')
    expect(keyOwner(press({ pip: true, key: 'AudioVolumeUp' }))).toBe('player')
  })

  it('still lets typing win over a media key in the library', () => {
    expect(keyOwner(press({ pip: true, typing: true, key: 'MediaPlayPause' }))).toBe('page')
  })
})

describe('isMediaKey', () => {
  it('knows media and volume keys from ordinary ones', () => {
    expect(isMediaKey('MediaTrackNext')).toBe(true)
    expect(isMediaKey('AudioVolumeMute')).toBe(true)
    expect(isMediaKey('m')).toBe(false)
    expect(isMediaKey('Escape')).toBe(false)
  })
})
