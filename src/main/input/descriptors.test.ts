import { describe, expect, it } from 'vitest'
import {
  describeKey,
  describeMouseButton,
  describeWheel,
  hookKeyName,
  humaniseDescriptor
} from './descriptors'

describe('describeKey', () => {
  it('describes a bare key', () => {
    expect(describeKey({ key: 'g', control: false, alt: false, shift: false })).toBe('key:g')
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

describe('mouse descriptors', () => {
  it('names the side buttons', () => {
    expect(describeMouseButton(3)).toBe('mouse:button4')
    expect(describeMouseButton(4)).toBe('mouse:button5')
  })

  it('distinguishes wheel direction', () => {
    expect(describeWheel(-120)).toBe('mouse:wheelUp')
    expect(describeWheel(120)).toBe('mouse:wheelDown')
  })

  it('shares one shape with keys, so both bind the same way', () => {
    expect(describeMouseButton(0).split(':')).toHaveLength(2)
    expect(describeKey({ key: 'a', control: false, alt: false, shift: false }).split(':'))
      .toHaveLength(2)
  })
})

describe('hookKeyName', () => {
  it('spells punctuation the way the page reports it', () => {
    expect(hookKeyName('Comma')).toBe(',')
    expect(hookKeyName('Period')).toBe('.')
    expect(hookKeyName('Backquote')).toBe('`')
    expect(hookKeyName('Minus')).toBe('-')
    expect(hookKeyName('Equal')).toBe('=')
    expect(hookKeyName('Slash')).toBe('/')
  })

  it('folds the numpad onto the main keys', () => {
    expect(hookKeyName('Numpad1')).toBe('1')
    expect(hookKeyName('NumpadEnter')).toBe('Enter')
    expect(hookKeyName('NumpadAdd')).toBe('+')
  })

  it('uses the same arrow names as the page', () => {
    expect(hookKeyName('ArrowLeft')).toBe('Left')
    expect(hookKeyName('ArrowDown')).toBe('Down')
  })

  it('lowercases letters and passes other names through', () => {
    expect(hookKeyName('A')).toBe('a')
    expect(hookKeyName('F5')).toBe('F5')
    expect(hookKeyName('Space')).toBe('Space')
  })
})

describe('humaniseDescriptor', () => {
  it('reads keyboard chords back in a familiar form', () => {
    expect(humaniseDescriptor('key:Ctrl+Left')).toBe('Ctrl + Left')
  })

  it('uppercases single letters', () => {
    expect(humaniseDescriptor('key:g')).toBe('G')
  })

  it('names mouse buttons plainly', () => {
    expect(humaniseDescriptor('mouse:button4')).toBe('Mouse 4')
    expect(humaniseDescriptor('mouse:wheelUp')).toBe('Wheel up')
  })
})
