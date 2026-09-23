import { describe, expect, it } from 'vitest'
import { canonicalDescriptor, canonicalKey } from './keys'

describe('canonicalKey', () => {
  it('spells arrows and space the way the defaults do', () => {
    expect(canonicalKey('ArrowLeft')).toBe('Left')
    expect(canonicalKey(' ')).toBe('Space')
  })

  it('lowercases single characters and leaves named keys alone', () => {
    expect(canonicalKey('G')).toBe('g')
    expect(canonicalKey('PageUp')).toBe('PageUp')
  })
})

describe('canonicalDescriptor', () => {
  it('rewrites only the key, keeping the modifiers', () => {
    expect(canonicalDescriptor('key:Ctrl+ArrowLeft')).toBe('key:Ctrl+Left')
  })

  it('keeps the plus key intact', () => {
    expect(canonicalDescriptor('key:+')).toBe('key:+')
    expect(canonicalDescriptor('key:Ctrl++')).toBe('key:Ctrl++')
  })

  it('leaves mouse descriptors alone', () => {
    expect(canonicalDescriptor('mouse:button4')).toBe('mouse:button4')
  })
})
