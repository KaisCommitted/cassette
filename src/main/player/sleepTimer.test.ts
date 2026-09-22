import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SleepTimer } from './sleepTimer'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('SleepTimer', () => {
  it('pauses once the time is up', () => {
    let paused = false
    const timer = new SleepTimer({ pause: () => (paused = true) })
    timer.setDuration(90 * 60)
    vi.advanceTimersByTime(90 * 60 * 1000)
    expect(paused).toBe(true)
  })

  it('does not pause early', () => {
    let paused = false
    const timer = new SleepTimer({ pause: () => (paused = true) })
    timer.setDuration(90 * 60)
    vi.advanceTimersByTime(89 * 60 * 1000)
    expect(paused).toBe(false)
  })

  it('counts down', () => {
    const timer = new SleepTimer({ pause: () => undefined })
    timer.setDuration(600)
    vi.advanceTimersByTime(60_000)
    expect(timer.remainingSeconds()).toBe(540)
  })

  it('reports nothing scheduled by default', () => {
    expect(new SleepTimer({ pause: () => undefined }).remainingSeconds()).toBeNull()
  })

  it('can be cancelled', () => {
    let paused = false
    const timer = new SleepTimer({ pause: () => (paused = true) })
    timer.setDuration(60)
    timer.clear()
    vi.advanceTimersByTime(120_000)
    expect(paused).toBe(false)
    expect(timer.isSet).toBe(false)
  })

  it('replaces an existing timer rather than stacking', () => {
    let pauses = 0
    const timer = new SleepTimer({ pause: () => pauses++ })
    timer.setDuration(60)
    timer.setDuration(120)
    vi.advanceTimersByTime(300_000)
    expect(pauses).toBe(1)
  })

  it('can be extended while running', () => {
    const timer = new SleepTimer({ pause: () => undefined })
    timer.setDuration(600)
    vi.advanceTimersByTime(300_000)
    timer.extend(600)
    expect(timer.remainingSeconds()).toBe(900)
  })

  it('stops at the end of the episode when asked', () => {
    const timer = new SleepTimer({ pause: () => undefined })
    timer.setAfterEpisode()
    expect(timer.shouldStopAtEpisodeEnd()).toBe(true)
  })

  it('only stops once, so the next episode plays normally', () => {
    const timer = new SleepTimer({ pause: () => undefined })
    timer.setAfterEpisode()
    expect(timer.shouldStopAtEpisodeEnd()).toBe(true)
    expect(timer.shouldStopAtEpisodeEnd()).toBe(false)
  })

  it('lets episodes roll on when no timer is set', () => {
    expect(new SleepTimer({ pause: () => undefined }).shouldStopAtEpisodeEnd()).toBe(false)
  })
})
