import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { flavourOfTitle, guessLanguage, normaliseLanguage, readTrailingTags } from './language'

describe('guessLanguage', () => {
  it('reads the language tag at the end of a name', () => {
    expect(guessLanguage('Show S01E01.eng.srt')).toBe('eng')
    expect(guessLanguage('Show.S01E01.en.forced.srt')).toBe('eng')
    expect(guessLanguage('Show.S01E01.eng.2.srt')).toBe('eng')
    expect(guessLanguage('Movie.2010.French.SDH.srt')).toBe('fre')
  })

  it('reads a name that is nothing but tags', () => {
    expect(guessLanguage('English.srt')).toBe('eng')
    expect(guessLanguage('2_English.srt')).toBe('eng')
    expect(guessLanguage('English_2.srt')).toBe('eng')
  })

  it('does not take a language out of the title', () => {
    expect(guessLanguage('It.2017.1080p.BluRay.srt')).toBeNull()
    expect(guessLanguage('Russian.Doll.S01E03.srt')).toBeNull()
    expect(guessLanguage('The.Italian.Job.2003.srt')).toBeNull()
    expect(guessLanguage('The.Italian.Job.2003.eng.srt')).toBe('eng')
  })

  it('does not mistake a property of every object for a language', () => {
    expect(guessLanguage('Show.constructor.srt')).toBeNull()
  })
})

describe('readTrailingTags', () => {
  it('leaves the name without its tags', () => {
    expect(readTrailingTags('Show.S01E01.eng.sdh.2')).toEqual({
      rest: 'Show.S01E01',
      lang: 'eng',
      flavour: 'sdh',
      stripped: true
    })
    expect(readTrailingTags('2_English').rest).toBe('')
    expect(readTrailingTags('Frieren - 05').stripped).toBe(false)
  })
})

describe('normaliseLanguage', () => {
  it('gives every spelling of a language one code', () => {
    expect(normaliseLanguage('it')).toBe('ita')
    expect(normaliseLanguage('nld')).toBe('dut')
    expect(normaliseLanguage('deu')).toBe('ger')
    expect(normaliseLanguage('pt-BR')).toBe('por')
    expect(normaliseLanguage('English')).toBe('eng')
  })
})

describe('flavourOfTitle', () => {
  it('reads what the menu calls a track', () => {
    expect(flavourOfTitle('English (SDH)')).toBe('sdh')
    expect(flavourOfTitle('English forced (file)')).toBe('forced')
    expect(flavourOfTitle('Signs and Songs')).toBe('forced')
    expect(flavourOfTitle('English (file)')).toBe('full')
    expect(flavourOfTitle(null)).toBe('full')
  })
})

describe('language.ts', () => {
  // Everything that reads a language imports this module; it importing any
  // of them back is the cycle it was split out to end.
  it('depends on nothing else in the app', () => {
    const source = readFileSync(join(__dirname, 'language.ts'), 'utf8')
    const imports = [...source.matchAll(/from '([^']+)'/g)].map((m) => m[1])
    expect(imports.every((path) => path!.startsWith('node:'))).toBe(true)
  })
})
