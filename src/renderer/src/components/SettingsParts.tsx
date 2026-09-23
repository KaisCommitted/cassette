import { useEffect, useRef, useState, type InputHTMLAttributes, type ReactNode } from 'react'

/* The pieces every settings section is built from. */

export function Section({
  id,
  title,
  children
}: {
  id: string
  title: string
  children: ReactNode
}) {
  return (
    <section className="settings-section" id={`settings-${id}`} aria-labelledby={`h-${id}`}>
      <h2 className="settings-section-title" id={`h-${id}`} tabIndex={-1}>
        {title}
      </h2>
      <div className="settings-section-body">{children}</div>
    </section>
  )
}

/** A setting that is on or off: what it does on the left, the switch on the right. */
export function SwitchRow({
  label,
  help,
  checked,
  onChange
}: {
  label: string
  help?: ReactNode
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label className="setting-row">
      <span className="setting-text">
        <span className="setting-label">{label}</span>
        {help && <span className="setting-help">{help}</span>}
      </span>
      <input
        type="checkbox"
        className="switch"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  )
}

/**
 * A text box that saves when you leave it or press Enter.
 *
 * Saving on every keystroke round-trips through the main process, and the box
 * is then refilled from what came back — which dropped a trailing comma in the
 * language lists, so a second language could not be typed at all.
 */
export function DraftInput({
  value,
  onCommit,
  className,
  ...rest
}: {
  value: string
  onCommit: (value: string) => void
  className?: string
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  const [draft, setDraft] = useState(value)
  const focused = useRef(false)
  useEffect(() => {
    if (!focused.current) setDraft(value)
  }, [value])

  return (
    <input
      {...rest}
      className={className ? `input ${className}` : 'input'}
      value={draft}
      onFocus={() => {
        focused.current = true
      }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        focused.current = false
        if (draft !== value) onCommit(draft)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') {
          e.stopPropagation()
          setDraft(value)
          focused.current = false
          requestAnimationFrame(() => e.currentTarget?.blur())
        }
      }}
    />
  )
}
