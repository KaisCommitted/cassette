import { describe, expect, it } from 'vitest'
import {
  DIM_RAMP_MS,
  FADE_IN_MS,
  FADE_OUT_MS,
  NightLight,
  nightLightLook,
  WARM_RAMP_MS
} from './nightLight'

function clock(): { now: () => number; advance: (ms: number) => void } {
  let t = 1_000_000
  return { now: () => t, advance: (ms) => (t += ms) }
}

describe('NightLight with the sleep timer', () => {
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

  it('fades back out quickly when the timer is cancelled', () => {
    const c = clock()
    const light = new NightLight(c.now)
    light.sync(true, true)
    c.advance(DIM_RAMP_MS / 2)
    light.sync(true, false)
    expect(light.level()).toEqual({ warmth: 1, dim: 0.5 })
    expect(light.snapshot().changing).toBe(true)

    c.advance(FADE_OUT_MS / 2)
    expect(light.level()!.warmth).toBeCloseTo(0.5)
    expect(light.level()!.dim).toBeCloseTo(0.25)

    c.advance(FADE_OUT_MS / 2)
    expect(light.level()).toBeNull()
    expect(light.snapshot().changing).toBe(false)
  })

  it('turns off when the option is switched off mid-timer', () => {
    const c = clock()
    const light = new NightLight(c.now)
    light.sync(true, true)
    light.sync(false, true)
    c.advance(FADE_OUT_MS)
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
    const c = clock()
    const light = new NightLight(c.now)
    light.sync(true, true)
    light.hold()
    light.sync(true, false)
    expect(light.isOn).toBe(true)

    // The pause the timer asked for has not been reported yet: still playing
    // is not the same as resumed.
    expect(light.notePaused(false)).toBe(false)
    expect(light.notePaused(true)).toBe(false)
    c.advance(DIM_RAMP_MS)
    expect(light.level()).toEqual({ warmth: 1, dim: 1 })

    expect(light.notePaused(false)).toBe(true)
    c.advance(FADE_OUT_MS)
    expect(light.level()).toBeNull()
  })

  it('lets the option switch off a held effect', () => {
    const c = clock()
    const light = new NightLight(c.now)
    light.sync(true, true)
    light.hold()
    light.sync(false, false)
    c.advance(FADE_OUT_MS)
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

describe('NightLight switched on by hand', () => {
  it('fades in over a second or two, then stays on', () => {
    const c = clock()
    const light = new NightLight(c.now)
    light.setManual(true)
    expect(light.level()).toEqual({ warmth: 0, dim: 0 })
    expect(light.snapshot().changing).toBe(true)

    c.advance(FADE_IN_MS / 2)
    expect(light.level()!.dim).toBeCloseTo(0.5)

    c.advance(FADE_IN_MS / 2)
    expect(light.level()).toEqual({ warmth: 1, dim: 1 })
    expect(light.snapshot().changing).toBe(false)

    // Nothing the player does on its own lets go of it.
    c.advance(DIM_RAMP_MS * 10)
    light.sync(true, false)
    light.notePaused(true)
    light.notePaused(false)
    light.endTimer()
    expect(light.level()).toEqual({ warmth: 1, dim: 1 })
  })

  it('fades out faster than it came in', () => {
    const c = clock()
    const light = new NightLight(c.now)
    light.setManual(true)
    c.advance(FADE_IN_MS)
    light.setManual(false)
    c.advance(FADE_OUT_MS / 2)
    expect(light.level()!.dim).toBeCloseTo(0.5)
    c.advance(FADE_OUT_MS / 2)
    expect(light.level()).toBeNull()
  })

  it('turns round mid-fade from wherever it had got to', () => {
    const c = clock()
    const light = new NightLight(c.now)
    light.setManual(true)
    c.advance(FADE_IN_MS / 2)
    light.setManual(false)
    expect(light.level()!.dim).toBeCloseTo(0.5)
    c.advance(FADE_OUT_MS / 4)
    light.setManual(true)
    expect(light.level()!.dim).toBeCloseTo(0.25)
  })

  it('starts fully on when it was left on at the last launch', () => {
    const light = new NightLight(Date.now, { on: true })
    expect(light.level()).toEqual({ warmth: 1, dim: 1 })
    expect(light.snapshot().changing).toBe(false)
  })

  it('is not undone when a timer set on top of it is cancelled', () => {
    const c = clock()
    const light = new NightLight(c.now, { on: true })
    light.sync(true, true)
    expect(light.level()).toEqual({ warmth: 1, dim: 1 })
    light.sync(true, false)
    c.advance(FADE_OUT_MS)
    expect(light.level()).toEqual({ warmth: 1, dim: 1 })
  })

  it('is not undone when a timer set on top of it runs out and playback resumes', () => {
    const c = clock()
    const light = new NightLight(c.now, { on: true })
    light.sync(true, true)
    light.hold()
    light.sync(true, false)
    light.notePaused(true)
    expect(light.notePaused(false)).toBe(true)
    c.advance(FADE_OUT_MS)
    expect(light.level()).toEqual({ warmth: 1, dim: 1 })
  })

  it('falls back to what the timer has done when switched off during one', () => {
    const c = clock()
    const light = new NightLight(c.now)
    light.sync(true, true)
    c.advance(DIM_RAMP_MS / 4)
    light.setManual(true)
    c.advance(FADE_IN_MS)
    expect(light.level()).toEqual({ warmth: 1, dim: 1 })

    light.setManual(false)
    c.advance(FADE_OUT_MS)
    const level = light.level()!
    expect(level.warmth).toBe(1)
    expect(level.dim).toBeCloseTo(0.25 + (FADE_IN_MS + FADE_OUT_MS) / DIM_RAMP_MS)
  })
})

describe('NightLight.snapshot', () => {
  /** A clock that moves on by a millisecond every time it is read. */
  function drifting(): { now: () => number; set: (t: number) => void } {
    let t = 1_000_000
    return { now: () => t++, set: (to) => (t = to) }
  }

  it('never reports a fade as over while it still shows a trace of it', () => {
    // Reading the level and "still changing" a moment apart used to let a
    // fade end in between: a last, almost-finished frame with nothing to
    // follow it. Walk the end of both kinds of fade a millisecond at a time.
    for (const kind of ['timer', 'manual'] as const) {
      for (let offset = -5; offset <= 5; offset++) {
        const c = drifting()
        const light = new NightLight(c.now, { on: kind === 'manual' })
        if (kind === 'timer') {
          light.sync(true, true)
          c.set(1_000_000 + DIM_RAMP_MS)
          light.sync(true, false)
        } else {
          light.setManual(false)
        }
        const start = c.now()
        c.set(start + FADE_OUT_MS + offset)
        const { level, changing } = light.snapshot()
        if (level !== null) expect(changing).toBe(true)
        if (!changing) expect(level).toBeNull()
      }
    }
  })

  it('needs the once-a-second tick only while the timer drives it', () => {
    const c = clock()
    const light = new NightLight(c.now, { on: true })
    expect(light.snapshot().followsTimer).toBe(false)

    light.sync(true, true)
    expect(light.snapshot().followsTimer).toBe(true)
    // Held after the timer ran out, it is still the timer's darkening.
    light.hold()
    light.sync(true, false)
    expect(light.snapshot().followsTimer).toBe(true)

    light.notePaused(true)
    light.notePaused(false)
    expect(light.snapshot().followsTimer).toBe(false)
    c.advance(FADE_OUT_MS)
    expect(light.snapshot()).toEqual({ level: { warmth: 1, dim: 1 }, changing: false, followsTimer: false })
  })
})

describe('nightLightLook', () => {
  const FULL = { warmth: 1, dim: 1 }

  it('leaves the picture alone while nothing has come in yet', () => {
    expect(nightLightLook(1, { warmth: 0, dim: 0 })).toEqual({ green: 1, blue: 1, dim: 0 })
  })

  it('is a gentle warmth, barely darker, at the bottom of the slider', () => {
    const look = nightLightLook(0, FULL)
    expect(look.blue).toBeGreaterThan(0.75)
    expect(look.green).toBeGreaterThan(0.9)
    expect(look.dim).toBeLessThanOrEqual(0.1)
  })

  it('lets no blue through and is very dark at the top', () => {
    const look = nightLightLook(1, FULL)
    expect(look.blue).toBe(0)
    // Green cut too, so it reads as amber rather than yellow-green.
    expect(look.green).toBeLessThanOrEqual(0.5)
    expect(look.dim).toBeGreaterThanOrEqual(0.8)
  })

  it('keeps the middle of the slider in between, not bunched at one end', () => {
    const bottom = nightLightLook(0, FULL)
    const middle = nightLightLook(0.5, FULL)
    const top = nightLightLook(1, FULL)
    const share = (m: number, lo: number, hi: number): number => (m - lo) / (hi - lo)
    for (const key of ['green', 'blue', 'dim'] as const) {
      const s = share(middle[key], bottom[key], top[key])
      expect(s).toBeGreaterThan(0.2)
      expect(s).toBeLessThan(0.5)
    }
  })

  it('gets steadily stronger along the slider', () => {
    let previous = nightLightLook(0, FULL)
    for (let i = 0.1; i <= 1.0001; i += 0.1) {
      const look = nightLightLook(i, FULL)
      expect(look.blue).toBeLessThan(previous.blue)
      expect(look.green).toBeLessThan(previous.green)
      expect(look.dim).toBeGreaterThan(previous.dim)
      previous = look
    }
  })

  it('takes a new intensity at once, part-way through the timer', () => {
    const c = clock()
    const light = new NightLight(c.now)
    light.sync(true, true)
    c.advance(DIM_RAMP_MS / 2)
    const level = light.level()!
    const gentle = nightLightLook(0.2, level)
    const deep = nightLightLook(1, level)
    // The ramp is where it was; only where it is heading has changed.
    expect(deep.dim).toBeCloseTo(nightLightLook(1, FULL).dim / 2)
    expect(gentle.dim).toBeCloseTo(nightLightLook(0.2, FULL).dim / 2)
    expect(deep.blue).toBe(0)
  })
})
