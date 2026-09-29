import { Duplex } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_SUBTITLE_STYLE } from '@shared/types'

// The night light writes its shader under userData; keep that out of the repo.
vi.mock('electron', async () => {
  const os = await import('node:os')
  return { app: { getPath: () => os.tmpdir() } }
})

import { MpvController } from './mpvController'
import { MpvIpc } from './mpvIpc'

const HEADER = `[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,52,&H00FFFFFF,&H000000FF,&H00FF0000,&H80000000,-1,0,0,0,100,100,0,0,1,3,2,2,10,10,30,1
`

const DEEPEST = { green: 0.5, blue: 0 }
const GAP_MS = 300

/**
 * A stand-in for mpv's pipe: records every command, answers after
 * `delayMs`, fails the commands `fail` picks (once each), and can announce
 * property changes the way mpv does.
 */
function fakeMpv(options: { delayMs?: number; fail?: (command: unknown[]) => boolean } = {}) {
  const commands: unknown[][] = []
  const failed = new Set<string>()
  const sock: Duplex = new Duplex({
    read(): void {},
    write(chunk: unknown, _encoding: unknown, callback: () => void): void {
      for (const line of String(chunk).split('\n').filter(Boolean)) {
        const msg = JSON.parse(line) as { command: unknown[]; request_id: number }
        commands.push(msg.command)
        const key = JSON.stringify(msg.command)
        const fail = options.fail?.(msg.command) === true && !failed.has(key)
        if (fail) failed.add(key)
        const data =
          msg.command[0] === 'get_property' && msg.command[1] === 'sub-ass-extradata' ? HEADER : null
        const reply = `${JSON.stringify({ error: fail ? 'error running command' : 'success', data, request_id: msg.request_id })}\n`
        setTimeout(() => sock.push(reply), options.delayMs ?? 0)
      }
      callback()
    }
  })
  const announce = (name: string, data: unknown): void => {
    sock.push(`${JSON.stringify({ event: 'property-change', name, data })}\n`)
  }
  return { sock, commands, announce }
}

async function attached(options: Parameters<typeof fakeMpv>[0] = {}) {
  const fake = fakeMpv(options)
  const mpv = new MpvController()
  await mpv.attach(new MpvIpc(fake.sock))
  fake.commands.length = 0
  return { mpv, ...fake }
}

const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
const named = (commands: unknown[][], name: string): unknown[][] =>
  commands.filter((c) => c[1] === name)

describe('MpvController night light', () => {
  it('sends no subtitle appearance until a file has asked for its own', async () => {
    const { mpv, commands } = await attached()
    await mpv.setNightLight(DEEPEST)
    await wait(GAP_MS + 50)
    expect(named(commands, 'sub-color')).toEqual([])
    expect(named(commands, 'sub-ass-override')).toEqual([])

    await mpv.applySubtitleStyle(DEFAULT_SUBTITLE_STYLE)
    await wait(GAP_MS + 50)
    expect(named(commands, 'sub-color').at(-1)).toEqual(['set_property', 'sub-color', '#FF8000'])
  })

  it('works through only the newest look while mpv is busy', async () => {
    const { mpv, commands } = await attached({ delayMs: 40 })
    const runs: Promise<void>[] = []
    for (let i = 0; i <= 20; i++) runs.push(mpv.setNightLight({ green: 1 - i / 40, blue: 1 - i / 20 }))
    await Promise.all(runs)
    const opts = named(commands, 'glsl-shader-opts')
    expect(opts.length).toBeLessThanOrEqual(2)
    expect(opts.at(-1)).toEqual(['set_property', 'glsl-shader-opts', 'green=0.500,blue=0.000'])
  })

  it('retints subtitles a few times over a fade, ending on the last step', async () => {
    const { mpv, commands } = await attached()
    await mpv.applySubtitleStyle(DEFAULT_SUBTITLE_STYLE)
    await wait(GAP_MS + 50)
    commands.length = 0
    // A second-and-a-half fade at twenty frames a second (or as near as
    // this machine's timers manage).
    const started = Date.now()
    for (let i = 0; i <= 30; i++) {
      await mpv.setNightLight({ green: 1 - (0.5 * i) / 30, blue: 1 - i / 30 })
      await wait(50)
    }
    const took = Date.now() - started
    await wait(GAP_MS + 50)
    const colours = named(commands, 'sub-color')
    // One every gap at most, plus the one at the start and the last.
    expect(colours.length).toBeLessThanOrEqual(Math.ceil(took / GAP_MS) + 2)
    expect(colours.length).toBeLessThanOrEqual(16) // every tenth step, whatever the timing
    expect(colours.at(-1)).toEqual(['set_property', 'sub-color', '#FF8000'])
    expect(named(commands, 'glsl-shader-opts').length).toBe(31)
  })

  it('tries a failed step again rather than taking it as done', async () => {
    const { mpv, commands } = await attached({
      fail: (c) => c[0] === 'change-list' && c[2] === 'append'
    })
    await expect(mpv.setNightLight(DEEPEST)).rejects.toThrow()
    await mpv.setNightLight(DEEPEST)
    expect(commands.filter((c) => c[0] === 'change-list' && c[2] === 'append').length).toBe(2)
    // Taken now, so the same look again sends nothing more.
    const before = commands.length
    await mpv.setNightLight(DEEPEST)
    expect(commands.length).toBe(before)
  })

  it('tries failed subtitle colours again by itself', async () => {
    const { mpv, commands } = await attached({
      fail: (c) => c[1] === 'sub-color' && c[2] === '#FF8000'
    })
    await mpv.applySubtitleStyle(DEFAULT_SUBTITLE_STYLE)
    await mpv.setNightLight(DEEPEST)
    await wait(2 * GAP_MS + 100)
    const tinted = named(commands, 'sub-color').filter((c) => c[2] === '#FF8000')
    expect(tinted.length).toBe(2)
  })

  it('tints a styled track by its styles without moving it, and puts it back in order', async () => {
    const { mpv, commands, announce } = await attached()
    announce('track-list', [{ id: 1, type: 'sub', codec: 'ass', selected: true }])
    announce('sid', 1)
    await wait(10)
    await mpv.applySubtitleStyle({ ...DEFAULT_SUBTITLE_STYLE, marginPercent: 10 })
    commands.length = 0

    await mpv.setNightLight(DEEPEST)
    await wait(GAP_MS + 50)
    const on = commands.map((c) => `${c[1]}=${JSON.stringify(c[2])}`)
    expect(on).toContain('sub-ass-style-overrides=' + JSON.stringify([
      'Default.PrimaryColour=&H000080FF',
      'Default.SecondaryColour=&H000000FF',
      'Default.OutlineColour=&H00000000',
      'Default.BackColour=&H80000000'
    ]))
    expect(on.indexOf('sub-pos=100')).toBeGreaterThanOrEqual(0)
    expect(on.indexOf('sub-pos=100')).toBeLessThan(on.indexOf('sub-ass-override="yes"'))

    commands.length = 0
    await mpv.setNightLight(null)
    await wait(GAP_MS + 50)
    const off = commands.filter((c) => c[0] === 'set_property').map((c) => `${c[1]}=${JSON.stringify(c[2])}`)
    expect(off[0]).toBe('sub-ass-override="no"')
    expect(off).toContain('sub-pos=90')
  })
})
