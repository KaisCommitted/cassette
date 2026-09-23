import { useCallback, useEffect, useRef, useState } from 'react'
import { ACTIONS, type KeyBindings } from '@shared/types'
import { describeCaptured, descriptorParts, humaniseDescriptor } from '../inputDescriptors'
import { Icon } from '../../shared/Icon'
import { Section } from './SettingsParts'

export interface ControlsSectionProps {
  bindings: KeyBindings
  onAssign: (descriptor: string, actionId: string) => void
  onUnassign: (descriptor: string) => void
  onReset: () => void
}

/** A capture waiting on a decision: the key is already doing something else. */
interface Conflict {
  descriptor: string
  actionId: string
  heldBy: string
}

/** Two presses this close together count as a double click. */
const DOUBLE_CLICK_MS = 300

function actionLabel(id: string): string {
  return ACTIONS.find((a) => a.id === id)?.label ?? id
}

/**
 * Key and mouse bindings for the player.
 *
 * Each action lists what it is bound to, and each of those can be taken off
 * on its own. Adding opens a listening row: keys are read from anywhere, mouse
 * buttons and the wheel only from a pad inside that row — so pressing Cancel,
 * or clicking somewhere else on the page, never gets bound by accident. A key
 * already used by another action asks before moving it.
 */
export function ControlsSection({ bindings, onAssign, onUnassign, onReset }: ControlsSectionProps) {
  const [listening, setListening] = useState<string | null>(null)
  const [conflict, setConflict] = useState<Conflict | null>(null)
  const [justAdded, setJustAdded] = useState<string | null>(null)
  const [confirmReset, setConfirmReset] = useState(false)

  const descriptorsFor = useCallback(
    (actionId: string) =>
      Object.entries(bindings)
        .filter(([, id]) => id === actionId)
        .map(([descriptor]) => descriptor),
    [bindings]
  )

  const commit = useCallback(
    (descriptor: string, actionId: string) => {
      const heldBy = bindings[descriptor]
      setListening(null)
      if (heldBy === actionId) {
        setJustAdded(descriptor)
        return
      }
      if (heldBy) {
        setConflict({ descriptor, actionId, heldBy })
        return
      }
      onAssign(descriptor, actionId)
      setJustAdded(descriptor)
    },
    [bindings, onAssign]
  )

  // The highlight on a new binding is a moment, not a state.
  useEffect(() => {
    if (!justAdded) return
    const timer = setTimeout(() => setJustAdded(null), 1400)
    return () => clearTimeout(timer)
  }, [justAdded])

  const groups = [...new Set(ACTIONS.map((a) => a.group))]

  return (
    <Section id="controls" title="Controls">
      <p className="section-intro">
        These work while something is playing. Everywhere else your keys type and move
        around the library as usual. Pause and hide is the exception: it works from any
        app, so you can get Cassette out of the way and back.
      </p>

      {groups.map((group) => (
        <div className="bind-group" key={group}>
          <h3 className="bind-group-title">{group}</h3>
          <ul className="bind-list">
            {ACTIONS.filter((a) => a.group === group).map((action) => {
              const descriptors = descriptorsFor(action.id)
              const isListening = listening === action.id
              const pending = conflict?.actionId === action.id ? conflict : null
              return (
                <li
                  className={isListening || pending ? 'bind-row is-open' : 'bind-row'}
                  key={action.id}
                >
                  <div className="bind-main">
                    <span className="bind-action">
                      {action.label}
                      {action.id === 'hideAndPause' && (
                        <span className="bind-note">
                          Works from any app. Use a key combination or a side mouse button.
                        </span>
                      )}
                    </span>
                    <span className="bind-keys">
                      {descriptors.length === 0 && <span className="bind-none">Not bound</span>}
                      {descriptors.map((d) => (
                        <span
                          className={d === justAdded ? 'binding is-new' : 'binding'}
                          key={d}
                        >
                          {descriptorParts(d).map((part, i) => (
                            <kbd className="keycap" key={i}>
                              {part}
                            </kbd>
                          ))}
                          <button
                            className="binding-remove"
                            aria-label={`Remove ${humaniseDescriptor(d)} from ${action.label}`}
                            title="Remove"
                            onClick={() => onUnassign(d)}
                          >
                            <Icon name="close" />
                          </button>
                        </span>
                      ))}
                    </span>
                    <button
                      className="btn btn-quiet btn-sm bind-add"
                      aria-expanded={isListening}
                      aria-label={`Add a binding for ${action.label}`}
                      onClick={() => {
                        setConflict(null)
                        setListening(isListening ? null : action.id)
                      }}
                    >
                      <Icon name="plus" />
                      Add
                    </button>
                  </div>

                  {isListening && (
                    <CapturePad
                      actionLabel={action.label}
                      onCapture={(d) => commit(d, action.id)}
                      onCancel={() => setListening(null)}
                    />
                  )}

                  {pending && (
                    <div className="bind-conflict" role="alert">
                      <p>
                        <strong>{humaniseDescriptor(pending.descriptor)}</strong> is already
                        used for {actionLabel(pending.heldBy)}.
                      </p>
                      <div className="actions">
                        <button
                          className="btn btn-primary btn-sm"
                          autoFocus
                          onClick={() => {
                            onAssign(pending.descriptor, pending.actionId)
                            setJustAdded(pending.descriptor)
                            setConflict(null)
                          }}
                        >
                          Move it to {action.label.toLowerCase()}
                        </button>
                        <button className="btn btn-quiet btn-sm" onClick={() => setConflict(null)}>
                          Keep it on {actionLabel(pending.heldBy).toLowerCase()}
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      ))}

      <div className="bind-reset">
        {confirmReset ? (
          <>
            <p>This replaces every binding you have added or removed with VLC's defaults.</p>
            <div className="actions">
              <button
                className="btn btn-primary btn-sm"
                autoFocus
                onClick={() => {
                  onReset()
                  setConfirmReset(false)
                }}
              >
                Restore defaults
              </button>
              <button className="btn btn-quiet btn-sm" onClick={() => setConfirmReset(false)}>
                Keep mine
              </button>
            </div>
          </>
        ) : (
          <button className="btn btn-ghost" onClick={() => setConfirmReset(true)}>
            <Icon name="rescan" />
            Restore VLC defaults
          </button>
        )}
      </div>
    </Section>
  )
}

/**
 * Listens for the next key, or a mouse press on the pad.
 *
 * Keys come from anywhere while it is open, ahead of everything else on the
 * page. Holding a modifier shows it straight away, so it is clear a
 * combination is being built. Escape cancels; binding Escape itself is a
 * button, since the key cannot be both.
 */
function CapturePad({
  actionLabel,
  onCapture,
  onCancel
}: {
  actionLabel: string
  onCapture: (descriptor: string) => void
  onCancel: () => void
}) {
  const [held, setHeld] = useState<string[]>([])
  const padRef = useRef<HTMLDivElement>(null)
  const rowRef = useRef<HTMLDivElement>(null)
  const pendingClick = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Held in a ref so the listeners below are installed once: reinstalling
  // them on every render would also drop a pending single click.
  const handlers = useRef({ onCapture, onCancel })
  handlers.current = { onCapture, onCancel }

  useEffect(() => {
    const onCapture = (d: string): void => handlers.current.onCapture(d)
    const onCancel = (): void => handlers.current.onCancel()
    const modifiers = (e: KeyboardEvent): string[] =>
      [e.ctrlKey && 'Ctrl', e.altKey && 'Alt', e.shiftKey && 'Shift'].filter(
        (m): m is string => Boolean(m)
      )

    const onKeyDown = (e: KeyboardEvent): void => {
      // Tab still moves focus, so the buttons below stay reachable from the
      // keyboard. It is not a key anyone binds to a player action.
      if (e.key === 'Tab') return
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'Escape' && !e.ctrlKey && !e.altKey && !e.shiftKey) return onCancel()
      if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) {
        setHeld(modifiers(e))
        return
      }
      onCapture(describeCaptured({ type: 'key', event: e }))
    }
    const onKeyUp = (e: KeyboardEvent): void => setHeld(modifiers(e))

    // A press anywhere outside this row means you have moved on.
    const onOutside = (e: MouseEvent): void => {
      if (rowRef.current && !rowRef.current.contains(e.target as Node)) onCancel()
    }

    const pad = padRef.current
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault()
      onCapture(describeCaptured({ type: 'wheel', event: e }))
    }

    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('keyup', onKeyUp, true)
    window.addEventListener('mousedown', onOutside, true)
    pad?.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('keyup', onKeyUp, true)
      window.removeEventListener('mousedown', onOutside, true)
      pad?.removeEventListener('wheel', onWheel)
      if (pendingClick.current) clearTimeout(pendingClick.current)
    }
  }, [])

  return (
    <div className="capture" ref={rowRef}>
      <p className="capture-prompt" role="status">
        {held.length > 0 ? (
          <>
            {held.map((m) => (
              <kbd className="keycap" key={m}>
                {m}
              </kbd>
            ))}
            <span>+ the key to go with it…</span>
          </>
        ) : (
          <>Press the key or key combination for {actionLabel.toLowerCase()}.</>
        )}
      </p>

      <div
        className="capture-pad"
        ref={padRef}
        onMouseDown={(e) => {
          e.preventDefault()
          const native = e.nativeEvent
          if (native.button !== 0) {
            onCapture(describeCaptured({ type: 'mouse', event: native }))
            return
          }
          // A left press might be the first half of a double click.
          if (pendingClick.current) {
            clearTimeout(pendingClick.current)
            pendingClick.current = null
            onCapture(describeCaptured({ type: 'mouse', event: native, double: true }))
            return
          }
          pendingClick.current = setTimeout(() => {
            pendingClick.current = null
            onCapture('mouse:left')
          }, DOUBLE_CLICK_MS)
        }}
        // Side buttons would otherwise also go back or forward.
        onMouseUp={(e) => e.preventDefault()}
        onAuxClick={(e) => e.preventDefault()}
        onContextMenu={(e) => e.preventDefault()}
      >
        Or click, double-click, scroll or press a side button here
      </div>

      <div className="actions">
        <button className="btn btn-quiet btn-sm" onClick={() => onCapture('key:Escape')}>
          Use Escape
        </button>
        <button className="btn btn-quiet btn-sm" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  )
}
