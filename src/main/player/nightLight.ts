/**
 * Warms and darkens the picture, for watching in a dark room.
 *
 * Two things turn it on. Switching it on by hand is a standing choice: it
 * stays on through pauses, episodes, closing the player and restarting the
 * app, until it is switched off again. It comes and goes with a short fade,
 * so the switch is seen to answer without the room jumping.
 *
 * The sleep timer can bring it in too, when that option is on. Then the
 * warmth comes in over a few seconds and the darkening takes ten minutes, so
 * the room gets dimmer without anyone noticing it happen. It follows the
 * timer: cancelling the timer, closing the player or changing episode by hand
 * all put the picture back — unless the night light was already on by hand,
 * which the timer never undoes.
 *
 * The one exception is the timer running out. Playback pauses, and the screen
 * stays dim and warm rather than lighting the room back up over someone who
 * has just fallen asleep. It clears when playback is resumed.
 *
 * This only tracks how far along each effect is. How warm and how dark "all
 * the way" is comes from the intensity setting, through nightLightLook.
 */

/** How long the timer's darkening takes to reach its deepest. */
export const DIM_RAMP_MS = 10 * 60 * 1000
/** How long the timer's warmth takes to come in: quick, but not a jump. */
export const WARM_RAMP_MS = 20 * 1000
/** Switching on by hand: long enough not to jolt, short enough to feel like an answer. */
export const FADE_IN_MS = 1500
/** Going off, by hand or with the timer: back promptly, without a snap. */
export const FADE_OUT_MS = 600

/** How far along each effect is, from 0 (untouched) to 1 (fully applied). */
export interface NightLightLevel {
  warmth: number
  dim: number
}

const NONE: NightLightLevel = { warmth: 0, dim: 0 }

export class NightLight {
  /** Switched on by hand, and where its fade was when last changed. */
  private manualOn: boolean
  private manualFrom: number
  private manualAt = 0

  private timerStartedAt: number | null = null
  /** The timer ran out while this was on, so it outlives the timer. */
  private held = false
  /** Seen the pause the timer asked for, so a later unpause means "awake". */
  private heldPaused = false
  /** What the timer had done when it let go, fading back out. */
  private released: { level: NightLightLevel; at: number } | null = null

  /**
   * `on` is the saved choice at launch. It starts fully applied: nothing is
   * playing yet, so there is nothing to fade.
   */
  constructor(
    private readonly now: () => number = Date.now,
    options: { on?: boolean } = {}
  ) {
    this.manualOn = options.on === true
    this.manualFrom = this.manualOn ? 1 : 0
  }

  /** Switched on or off by hand; fades from wherever it is now. */
  setManual(on: boolean): void {
    if (on === this.manualOn) return
    const t = this.now()
    this.manualFrom = this.manualValue(t)
    this.manualAt = t
    this.manualOn = on
  }

  /**
   * Brings the timer's part in line with the option and the timer.
   *
   * A timer that is replaced by another keeps the dimming where it had got
   * to: choosing "30 minutes" instead of "an hour" should not flash the
   * picture back to full brightness.
   */
  sync(withTimer: boolean, timerSet: boolean): void {
    if (withTimer && timerSet) {
      if (this.timerStartedAt === null) this.timerStartedAt = this.now()
      this.held = false
      this.heldPaused = false
    } else if (!withTimer || !this.held) {
      this.endTimer()
    }
  }

  /** The timer ran out and paused playback; stay on until someone resumes. */
  hold(): void {
    if (this.timerStartedAt === null) return
    this.held = true
    this.heldPaused = false
  }

  /**
   * Called as playback pauses and resumes. Returns true when this let go of
   * the timer's effect, because playback resumed after the timer paused it.
   */
  notePaused(paused: boolean): boolean {
    if (!this.held) return false
    if (paused) {
      this.heldPaused = true
      return false
    }
    if (!this.heldPaused) return false
    this.endTimer()
    return true
  }

  /**
   * Lets go of whatever the timer was doing, fading it back out. Switched on
   * by hand, the night light stays exactly as it was.
   */
  endTimer(): void {
    if (this.timerStartedAt !== null) {
      const t = this.now()
      const level = this.timerLevel(t)
      const fading = this.releasedLevel(t)
      this.released = {
        level: {
          warmth: Math.max(level.warmth, fading.warmth),
          dim: Math.max(level.dim, fading.dim)
        },
        at: t
      }
    }
    this.timerStartedAt = null
    this.held = false
    this.heldPaused = false
  }

  /**
   * Where everything stands at one moment.
   *
   * `changing` means moving quickly enough that one update a second would
   * show as steps: a fade, or the timer's warmth coming in. The timer's
   * darkening is slow enough for the once-a-second tick. Both are read from
   * the same instant: read a moment apart, a fade could finish in between,
   * leaving a last, almost-finished frame that nothing came back to clear.
   *
   * `followsTimer` means the timer is driving it, running or held after it
   * ran out, so its slow darkening needs the once-a-second tick.
   */
  snapshot(): { level: NightLightLevel | null; changing: boolean; followsTimer: boolean } {
    const t = this.now()
    const manual = this.manualValue(t)
    const timer = this.timerLevel(t)
    const fading = this.releasedLevel(t)
    if (fading === NONE) this.released = null
    const followsTimer = this.timerStartedAt !== null
    const releasing = fading !== NONE
    const active = this.manualOn || manual > 0 || followsTimer || releasing
    const changing =
      manual !== (this.manualOn ? 1 : 0) ||
      releasing ||
      (followsTimer && t - this.timerStartedAt! < WARM_RAMP_MS)
    return {
      level: active
        ? {
            warmth: Math.max(manual, timer.warmth, fading.warmth),
            dim: Math.max(manual, timer.dim, fading.dim)
          }
        : null,
      changing,
      followsTimer
    }
  }

  /** How far along each effect is, or null when the picture is untouched. */
  level(): NightLightLevel | null {
    return this.snapshot().level
  }

  /** Something is being done to the picture, or is about to be. */
  get isOn(): boolean {
    return this.snapshot().level !== null
  }

  /** The by-hand fade at time `t`. */
  private manualValue(t: number): number {
    const elapsed = Math.max(0, t - this.manualAt)
    return this.manualOn
      ? Math.min(1, this.manualFrom + elapsed / FADE_IN_MS)
      : Math.max(0, this.manualFrom - elapsed / FADE_OUT_MS)
  }

  private timerLevel(t: number): NightLightLevel {
    if (this.timerStartedAt === null) return NONE
    const elapsed = Math.max(0, t - this.timerStartedAt)
    return {
      warmth: Math.min(1, elapsed / WARM_RAMP_MS),
      dim: Math.min(1, elapsed / DIM_RAMP_MS)
    }
  }

  /** What is left of the timer's fade-out at time `t`; NONE once it is over. */
  private releasedLevel(t: number): NightLightLevel {
    if (!this.released) return NONE
    const left = 1 - Math.max(0, t - this.released.at) / FADE_OUT_MS
    if (left <= 0) return NONE
    return { warmth: this.released.level.warmth * left, dim: this.released.level.dim * left }
  }
}

/** What the picture gets, from the intensity and how far along each effect is. */
export interface NightLook {
  /** How much green and blue light is let through, 0 to 1; red is left alone. */
  green: number
  blue: number
  /** How much of the picture a black layer covers, 0 to 1. */
  dim: number
}

/*
 * The two ends of the intensity slider. The bottom is a gentle warmth, about
 * the colour of a screen's own mild night mode, and barely any darker. The
 * top lets no blue through at all and about half the green, which reads as
 * deep amber rather than the yellow-green that cutting blue alone gives, and
 * covers most of the light.
 */
const GENTLE: NightLook = { green: 0.93, blue: 0.8, dim: 0.08 }
const DEEPEST: NightLook = { green: 0.5, blue: 0, dim: 0.82 }
const DIM_CURVE = 1.3

/**
 * How warm and dark the picture is at an intensity from 0 to 1, with each
 * effect `level` of the way there.
 *
 * Each curve starts slowly, so the lower half of the slider covers the
 * ordinary warm-evening range (the middle is about 3500 K and a third
 * darker) and the top quarter is kept for going all the way to amber in a
 * dark room. With straight lines the slider was already strong a third of
 * the way up, leaving little between "a touch warmer" and "very warm".
 */
export function nightLightLook(intensity: number, level: NightLightLevel): NightLook {
  const i = Math.max(0, Math.min(1, intensity))
  const green = GENTLE.green + (DEEPEST.green - GENTLE.green) * i ** 1.5
  const blue = GENTLE.blue + (DEEPEST.blue - GENTLE.blue) * i ** 2
  const dim = GENTLE.dim + (DEEPEST.dim - GENTLE.dim) * i ** DIM_CURVE
  return {
    green: 1 - (1 - green) * level.warmth,
    blue: 1 - (1 - blue) * level.warmth,
    dim: dim * level.dim
  }
}

/**
 * The intensity whose darkening, fully in, covers `dim` of the light: the
 * inverse of nightLightLook's darkening curve.
 */
export function intensityForDim(dim: number): number {
  const share = (dim - GENTLE.dim) / (DEEPEST.dim - GENTLE.dim)
  return Math.max(0, Math.min(1, share)) ** (1 / DIM_CURVE)
}

/**
 * How dark the sleep timer's night light went before it had an intensity:
 * a black layer over 60% of the light.
 */
export const LEGACY_TIMER_DIM = 0.6
