import { describe, expect, it } from 'vitest'
import { DEFAULT_SUBTITLE_STYLE, type SubtitleStyle } from '@shared/types'
import {
  assStyleOverrides,
  coarseTint,
  parseAssStyles,
  subtitleCommands,
  subtitleLook,
  tintAssColour,
  tintHex
} from './subtitleTint'

const DEEPEST = { green: 0.5, blue: 0 }

const HEADER = `[Script Info]
ScriptType: v4.00+

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,52,&H00FFFFFF,&H000000FF,&H00FF0000,&H80000000,-1,0,0,0,100,100,0,0,1,3,2,2,10,10,30,1
Style: Kara,Arial,48,&H00FFFFFF,&H00FF8000,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,2,0,8,10,10,30,1
Style: Ghost,Arial,44,&HFFFFFFFF,&HFFFFFFFF,&H00FFFF00,&H80000000,0,0,0,0,100,100,0,0,1,3,0,4,40,10,10,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`

describe('coarseTint', () => {
  it('moves in tenths, and meets both ends exactly', () => {
    expect(coarseTint({ green: 0.778, blue: 0.6 })).toEqual({ green: 0.8, blue: 0.6 })
    expect(coarseTint(DEEPEST)).toEqual(DEEPEST)
    expect(coarseTint({ green: 0.97, blue: 0.99 })).toBeNull()
    expect(coarseTint(null)).toBeNull()
  })
})

describe('parseAssStyles', () => {
  it('reads every style and its four colours, wherever the Format puts them', () => {
    expect(parseAssStyles(HEADER)).toEqual([
      { name: 'Default', primary: '&H00FFFFFF', secondary: '&H000000FF', outline: '&H00FF0000', back: '&H80000000' },
      { name: 'Kara', primary: '&H00FFFFFF', secondary: '&H00FF8000', outline: '&H00000000', back: '&H80000000' },
      { name: 'Ghost', primary: '&HFFFFFFFF', secondary: '&HFFFFFFFF', outline: '&H00FFFF00', back: '&H80000000' }
    ])
  })

  it('reads old SSA styles, whose outline is the TertiaryColour', () => {
    const ssa = `[V4 Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, TertiaryColour, BackColour, Bold
Style: Sign,Arial,20,16777215,255,16711680,0,-1`
    expect(parseAssStyles(ssa)).toEqual([
      { name: 'Sign', primary: '16777215', secondary: '255', outline: '16711680', back: '0' }
    ])
  })

  it('finds nothing in a header without styles', () => {
    expect(parseAssStyles('[Script Info]\nTitle: x\n')).toEqual([])
  })
})

describe('tintAssColour', () => {
  it('cuts green and blue and keeps red and the transparency', () => {
    // &HAABBGGRR: a half-transparent light blue.
    expect(tintAssColour('&H80FF8040', DEEPEST)).toBe('&H80004040')
    expect(tintAssColour('&HFFFFFFFF', DEEPEST)).toBe('&HFF0080FF')
  })

  it('reads short and decimal colours too', () => {
    expect(tintAssColour('&HFFFFFF&', DEEPEST)).toBe('&H000080FF')
    expect(tintAssColour('16711680', DEEPEST)).toBe('&H00000000') // pure blue
  })

  it('leaves out what it cannot read', () => {
    expect(tintAssColour('bogus', DEEPEST)).toBeNull()
  })
})

describe('assStyleOverrides', () => {
  it('tints each style by the same amounts, so karaoke keeps two colours', () => {
    const overrides = assStyleOverrides(parseAssStyles(HEADER), DEEPEST)
    expect(overrides).toContain('Kara.PrimaryColour=&H000080FF')
    expect(overrides).toContain('Kara.SecondaryColour=&H00004000')
    // Outline-only text stays invisible where it was.
    expect(overrides).toContain('Ghost.PrimaryColour=&HFF0080FF')
    // At the deepest setting, no colour lets any blue through.
    for (const entry of overrides) expect(entry.match(/=&H..(..)/)![1]).toBe('00')
  })
})

describe('tintHex', () => {
  it('tints Cassette’s own colours', () => {
    expect(tintHex('#FFFFFF', DEEPEST)).toBe('#FF8000')
    expect(tintHex('#FFFFFF', null)).toBe('#FFFFFF')
  })
})

describe('subtitleLook', () => {
  const style: SubtitleStyle = { ...DEFAULT_SUBTITLE_STYLE, marginPercent: 10, scale: 1.4 }
  const styles = parseAssStyles(HEADER)

  it('is the appearance settings alone with the night light off', () => {
    expect(subtitleLook(style, null, styles)).toEqual({
      color: '#FFFFFF',
      outline: '#000000',
      pos: 90,
      scale: 1.4,
      override: 'no',
      assStyles: []
    })
  })

  it('tints plain subtitles without touching where they sit', () => {
    const look = subtitleLook(style, DEEPEST, null)
    expect(look).toMatchObject({ color: '#FF8000', pos: 90, scale: 1.4, override: 'no', assStyles: [] })
  })

  it('tints a styled track with position and size held neutral, so nothing moves', () => {
    const look = subtitleLook(style, DEEPEST, styles)
    expect(look.override).toBe('yes')
    expect(look.pos).toBe(100)
    expect(look.scale).toBe(1)
    expect(look.assStyles.length).toBe(12)
  })

  it('leaves forced styles to the plain colours, which already reach them', () => {
    const forced = { ...style, overrideEmbeddedStyles: true }
    expect(subtitleLook(forced, DEEPEST, styles)).toMatchObject({ override: 'force', pos: 90, assStyles: [] })
  })
})

describe('subtitleCommands', () => {
  const style: SubtitleStyle = { ...DEFAULT_SUBTITLE_STYLE, marginPercent: 10 }
  const styles = parseAssStyles(HEADER)
  const names = (commands: unknown[][]): string[] => commands.map((c) => String(c[1]))

  it('sends everything the first time', () => {
    expect(names(subtitleCommands(null, subtitleLook(style, null, null)))).toEqual([
      'sub-pos',
      'sub-scale',
      'sub-color',
      'sub-border-color',
      'sub-ass-style-overrides',
      'sub-ass-override'
    ])
  })

  it('makes position neutral before styled subtitles are switched to be tinted', () => {
    const off = subtitleLook(style, null, styles)
    const on = subtitleLook(style, DEEPEST, styles)
    const sent = names(subtitleCommands(off, on))
    expect(sent.at(-1)).toBe('sub-ass-override')
    expect(sent.indexOf('sub-pos')).toBeLessThan(sent.indexOf('sub-ass-override'))
  })

  it('switches the tinting off before position goes back', () => {
    const on = subtitleLook(style, DEEPEST, styles)
    const off = subtitleLook(style, null, styles)
    const sent = names(subtitleCommands(on, off))
    expect(sent[0]).toBe('sub-ass-override')
    expect(sent).toContain('sub-pos')
  })

  it('sends nothing when nothing changed', () => {
    const on = subtitleLook(style, DEEPEST, styles)
    expect(subtitleCommands(on, subtitleLook(style, DEEPEST, styles))).toEqual([])
  })
})
