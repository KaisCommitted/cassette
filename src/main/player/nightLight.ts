/**
 * Warms and slowly darkens the picture while a sleep timer runs.
 *
 * The warmth comes in over a few seconds; the darkening takes ten minutes, so
 * the room gets dimmer without anyone noticing it happen. It follows the
 * timer: cancelling the timer, closing the player or changing episode by hand
 * all put the picture back at once.
 *
 * The one exception is the timer running out. Playback pauses, and the screen
 * stays dim and warm rather than lighting the room back up over someone who
 * has just fallen asleep. It clears when playback is resumed.
 */

/** How long the darkening takes to reach its deepest. */
export const DIM_RAMP_MS = 10 * 60 * 1000
/** How long the warmth takes to come in: quick, but not a jump. */
export const WARM_RAMP_MS = 20 * 1000

/** How far along each effect is, from 0 (untouched) to 1 (fully applied). */
export interface NightLightLevel {
  warmth: number
  dim: number
}

export class NightLight {
  private startedAt: number | null = null
  /** The timer ran out while this was on, so it outlives the timer. */
  private held = false
  /** Seen the pause the timer asked for, so a later unpause means "awake". */
  private heldPaused = false

  constructor(private readonly now: () => number = Date.now) {}

  /**
   * Brings this in line with the option and the timer.
   *
   * A timer that is replaced by another keeps the dimming where it had got
   * to: choosing "30 minutes" instead of "an hour" should not flash the
   * picture back to full brightness.
   */
  sync(enabled: boolean, timerSet: boolean): void {
    if (enabled && timerSet) {
      if (this.startedAt === null) this.startedAt = this.now()
      this.held = false
      this.heldPaused = false
    } else if (!enabled || !this.held) {
      this.stop()
    }
  }

  /** The timer ran out and paused playback; stay on until someone resumes. */
  hold(): void {
    if (this.startedAt === null) return
    this.held = true
    this.heldPaused = false
  }

  /**
   * Called as playback pauses and resumes. Returns true when this turned the
   * effect off, because playback resumed after the timer had paused it.
   */
  notePaused(paused: boolean): boolean {
    if (!this.held) return false
    if (paused) {
      this.heldPaused = true
      return false
    }
    if (!this.heldPaused) return false
    this.stop()
    return true
  }

  stop(): void {
    this.startedAt = null
    this.held = false
    this.heldPaused = false
  }

  get isOn(): boolean {
    return this.startedAt !== null
  }

  /** How far along each effect is, or null when the picture is untouched. */
  level(): NightLightLevel | null {
    if (this.startedAt === null) return null
    const elapsed = Math.max(0, this.now() - this.startedAt)
    return {
      warmth: Math.min(1, elapsed / WARM_RAMP_MS),
      dim: Math.min(1, elapsed / DIM_RAMP_MS)
    }
  }
}
