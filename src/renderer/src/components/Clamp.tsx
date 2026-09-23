import { useLayoutEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { prefersReducedMotion } from '../../shared/motion'

/** Opening and closing unfold the paragraph rather than jump it. */
const UNFOLD = { duration: 460, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }

/**
 * A paragraph cut to a few lines, with More when — and only when — it is cut.
 *
 * Overviews are written to be read whole, and an ellipsis with no way past it
 * hides the end of every longer one. Expanding on hover was the other option,
 * but a row that grows under the pointer pushes the rows below it away as you
 * move down the list; a click is deliberate and the page stays still until
 * you ask.
 */
export function Clamp({
  text,
  lines,
  className
}: {
  text: string
  lines: number
  className?: string
}) {
  const ref = useRef<HTMLParagraphElement>(null)
  const [open, setOpen] = useState(false)
  const [cut, setCut] = useState(false)

  // Whether the text overflows depends on the width it is given, so it is
  // measured again whenever that changes.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = (): void => {
      if (!open) setCut(el.scrollHeight > el.clientHeight + 1)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [text, open])

  // A new text starts closed again.
  useLayoutEffect(() => setOpen(false), [text])

  /*
   * The paragraph's height is eased between the cut and the whole, and what
   * sits below it moves down or up with it. Closing keeps the whole text
   * showing until the box has shrunk to the cut, and only then puts the cut
   * back, so the words are never clipped short while the box is still tall.
   */
  const toggle = (): void => {
    const el = ref.current
    if (!el || prefersReducedMotion()) {
      setOpen(!open)
      return
    }
    el.getAnimations().forEach((a) => a.cancel())
    const from = el.getBoundingClientRect().height
    if (!open) {
      flushSync(() => setOpen(true))
      const to = el.getBoundingClientRect().height
      el.animate([{ height: `${from}px` }, { height: `${to}px` }], UNFOLD)
      return
    }
    const to = parseFloat(getComputedStyle(el).lineHeight) * lines
    if (!Number.isFinite(to) || to >= from) {
      setOpen(false)
      return
    }
    const closing = el.animate([{ height: `${from}px` }, { height: `${to}px` }], {
      ...UNFOLD,
      fill: 'forwards'
    })
    closing.onfinish = () => {
      // Cut in the same frame the held height is let go, so nothing flickers.
      flushSync(() => setOpen(false))
      closing.cancel()
    }
  }

  return (
    <div className={className ? `clamp ${className}` : 'clamp'}>
      <p
        ref={ref}
        className="clamp-text"
        style={open ? undefined : { WebkitLineClamp: lines }}
        data-open={open || undefined}
      >
        {text}
      </p>
      {(cut || open) && (
        <button
          className="clamp-toggle"
          aria-expanded={open}
          onClick={(e) => {
            e.stopPropagation()
            toggle()
          }}
        >
          {open ? 'Less' : 'More'}
        </button>
      )}
    </div>
  )
}
