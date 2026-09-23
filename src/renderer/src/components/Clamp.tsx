import { useLayoutEffect, useRef, useState } from 'react'

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
            setOpen(!open)
          }}
        >
          {open ? 'Less' : 'More'}
        </button>
      )}
    </div>
  )
}
