import { describe, expect, it } from 'vitest'
import { DIM_RAMP_MS, NightLight, WARM_RAMP_MS } from './nightLight'

function clock(): { now: () => number; advance: (ms: number) => void } {
  let t = 1_000_000
  return { now: () => t, advance: (ms) => (t += ms) }
}

describe('NightLight', () => {
  it('stays off without a timer', () => {
    const light = new NightLight()
    light.sync(true, false)
    expect(light.level()).toBeNull()
  })

  it('stays off when the option is off', () => {
    const light = new NightLight()
    light.sync(false, true)
    expect(light.level()).toBeNull()
  })

  it('warms quickly and dims over ten minutes', () => {
    const c = clock()
    const light = new NightLight(c.now)
    light.sync(true, true)
    expect(light.level()).toEqual({ warmth: 0, dim: 0 })

    c.advance(WARM_RAMP_MS / 2)
    expect(light.level()!.warmth).toBeCloseTo(0.5)

    c.advance(DIM_RAMP_MS / 2 - WARM_RAMP_MS / 2)
    expect(light.level()).toEqual({ warmth: 1, dim: 0.5 })

    c.advance(DIM_RAMP_MS)
    expect(light.level()).toEqual({ warmth: 1, dim: 1 })
  })

  it('keeps its progress when the timer is replaced', () => {
    const c = clock()
    const light = new NightLight(c.now)
    light.sync(true, true)
    c.advance(DIM_RAMP_MS / 2)
    light.sync(true, true)
    expect(light.level()!.dim).toBe(0.5)
  })

  it('turns off when the timer is cancelled', () => {
    const light = new NightLight()
    light.sync(true, true)
    light.sync(true, false)
    expect(light.level()).toBeNull()
  })

  it('turns off when the option is switched off mid-timer', () => {
    const light = new NightLight()
    light.sync(true, true)
    light.sync(false, true)
    expect(light.level()).toBeNull()
  })

  it('starts from the beginning when switched on mid-timer', () => {
    const c = clock()
    const light = new NightLight(c.now)
    light.sync(false, true)
    c.advance(DIM_RAMP_MS)
    light.sync(true, true)
    expect(light.level()!.dim).toBe(0)
  })

  it('stays on after the timer runs out, until playback resumes', () => {
    const light = new NightLight()
    light.sync(true, true)
    light.hold()
    light.sync(true, false)
    expect(light.isOn).toBe(true)

    // The pause the timer asked for has not been reported yet: still playing
    // is not the same as resumed.
    expect(light.notePaused(false)).toBe(false)
    expect(light.notePaused(true)).toBe(false)
    expect(light.isOn).toBe(true)

    expect(light.notePaused(false)).toBe(true)
    expect(light.level()).toBeNull()
  })

  it('lets the option switch off a held effect', () => {
    const light = new NightLight()
    light.sync(true, true)
    light.hold()
    light.sync(false, false)
    expect(light.isOn).toBe(false)
  })

  it('ignores pausing while a timer is still running', () => {
    const light = new NightLight()
    light.sync(true, true)
    light.notePaused(true)
    expect(light.notePaused(false)).toBe(false)
    expect(light.isOn).toBe(true)
  })

  it('does nothing when told to hold while off', () => {
    const light = new NightLight()
    light.hold()
    light.sync(true, false)
    expect(light.isOn).toBe(false)
  })
})
