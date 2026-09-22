/**
 * Pauses playback after a set time, or at the end of the current episode.
 *
 * Built for falling asleep to something: it pauses rather than closing, so
 * whatever was playing is still there in the morning and Continue Watching
 * picks it back up at the right second.
 */
export interface SleepTimerDeps {
  pause: () => void
  now?: () => number
}

export class SleepTimer {
  private endsAt: number | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  private afterEpisode = false
  private readonly now: () => number

  constructor(private readonly deps: SleepTimerDeps) {
    this.now = deps.now ?? Date.now
  }

  /** Sets a countdown. Replaces any timer already running. */
  setDuration(seconds: number): void {
    this.clear()
    if (seconds <= 0) return
    this.endsAt = this.now() + seconds * 1000
    this.timer = setTimeout(() => {
      this.endsAt = null
      this.timer = null
      this.deps.pause()
    }, seconds * 1000)
    this.timer.unref?.()
  }

  /** Stops at the end of whatever is playing rather than after a fixed time. */
  setAfterEpisode(): void {
    this.clear()
    this.afterEpisode = true
  }

  /**
   * Called when an episode finishes. Returns true when playback should stop
   * here instead of rolling into the next one.
   */
  shouldStopAtEpisodeEnd(): boolean {
    if (!this.afterEpisode) return false
    this.afterEpisode = false
    return true
  }

  clear(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    this.endsAt = null
    this.afterEpisode = false
  }

  /** Seconds left, or null when nothing is scheduled. */
  remainingSeconds(): number | null {
    if (this.endsAt === null) return null
    return Math.max(0, Math.round((this.endsAt - this.now()) / 1000))
  }

  get stopsAfterEpisode(): boolean {
    return this.afterEpisode
  }

  get isSet(): boolean {
    return this.endsAt !== null || this.afterEpisode
  }

  /** Pushes the end time back, for a "give me longer" button. */
  extend(seconds: number): void {
    const remaining = this.remainingSeconds()
    if (remaining === null) return
    this.setDuration(remaining + seconds)
  }
}
