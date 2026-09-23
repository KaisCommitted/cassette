import type { Transition } from 'motion/react'

/*
 * Cassette's motion, for the parts animated from script (Motion, and the odd
 * Web Animations call). The CSS side is the --t-* and --ease-* tokens in
 * tokens.css; the two are kept to the same few curves and lengths.
 *
 * The house rule is a tape deck's, not a phone's: things arrive slowly and
 * settle with a long, soft tail, and they never overshoot. Leaving is quicker
 * than arriving, so what goes away never holds up what comes next.
 */

/** A long ease-out: fast off the mark, then a slow, quiet landing. */
export const EASE_OUT = [0.22, 1, 0.36, 1] as const
/** For things leaving: they gather pace as they go, and are gone. */
export const EASE_IN = [0.55, 0, 0.75, 0.3] as const
/** For something that travels from one place to another and stops. */
export const EASE_IN_OUT = [0.65, 0, 0.35, 1] as const

/** Arriving: a panel opening, a list coming in. */
export const arrive: Transition = { duration: 0.42, ease: EASE_OUT }
/** Leaving: the same panel closing. */
export const leave: Transition = { duration: 0.2, ease: EASE_IN }
/**
 * Moving between places — an underline sliding to the next season, a marker
 * following the section you are reading. A spring with no bounce, so it is
 * interrupted gracefully when you click again half-way.
 */
export const glide: Transition = { type: 'spring', bounce: 0, visualDuration: 0.45 }

export function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * A slow brass wash over something, to say "this is where you were".
 *
 * Used on the episode you come back to from the player: the row is already
 * focused, but a focus ring alone is easy to miss while the lights come up.
 */
export function glow(element: HTMLElement, delayMs = 0): void {
  if (prefersReducedMotion()) return
  element.animate(
    [
      { backgroundColor: 'oklch(0.752 0.118 82 / 0)' },
      { backgroundColor: 'oklch(0.752 0.118 82 / 0.13)', offset: 0.25 },
      { backgroundColor: 'oklch(0.752 0.118 82 / 0)' }
    ],
    { duration: 2400, delay: delayMs, easing: 'ease-in-out' }
  )
}
