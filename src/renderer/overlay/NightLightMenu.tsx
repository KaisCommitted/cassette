import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { motion } from 'motion/react'
import type { NightLightState, Settings } from '@shared/types'
import { Icon } from '../shared/Icon'
import { arrive, leave } from '../shared/motion'

const api = window.cassette

/**
 * The night light, all of it in one place: on or off, how strong, and
 * whether the sleep timer brings it in. Everything here is a saved setting,
 * the same ones as in Settings, so the two always agree.
 */
export function NightLightMenu({
  night,
  onClose
}: {
  night: NightLightState
  onClose: () => void
}) {
  const help = night.on
    ? 'Stays on until you turn it off'
    : night.look
      ? 'On with the sleep timer'
      : 'Warmer and darker, for a dark room'

  return (
    <motion.div
      className="osd-menu"
      role="dialog"
      aria-label="Night light"
      initial={{ opacity: 0, y: 10, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1, transition: arrive }}
      exit={{ opacity: 0, y: 6, scale: 0.98, transition: leave }}
    >
      <div className="osd-menu-head">
        <h2 className="osd-menu-title">Night light</h2>
        <button className="osd-small" onClick={onClose} aria-label="Close" title="Close">
          <Icon name="close" />
        </button>
      </div>

      <OsdSwitch
        label="Night light"
        help={help}
        checked={night.on}
        onChange={(on) => void api.updateSettings({ nightLight: on })}
      />

      <IntensitySlider value={night.intensity} />

      <div className="osd-menu-section">
        <OsdSwitch
          label="With the sleep timer"
          help="Comes in when a timer is set, dimming over 10 min"
          checked={night.withTimer}
          onChange={(on) => void api.updateSettings({ sleepNightLight: on })}
        />
      </div>
    </motion.div>
  )
}

/**
 * How strong the night light is. Dragging it changes the picture as it
 * moves, so the right level can be found by eye against what is playing.
 */
function IntensitySlider({ value }: { value: number }) {
  // Held here while dragging: the saved value arrives a moment behind the
  // thumb, and following it would pull the thumb back under the cursor.
  // Once the saved value has caught up, it takes over again.
  const [dragged, setDragged] = useState<number | null>(null)
  const save = useCoalescedSave()
  const percent = Math.round((dragged ?? value) * 100)
  useEffect(() => {
    if (dragged !== null && Math.round(value * 100) === Math.round(dragged * 100)) setDragged(null)
  }, [value, dragged])

  return (
    <div className="osd-night-intensity">
      <div className="osd-night-intensity-head">
        <label htmlFor="osd-night-intensity" className="osd-switch-label">
          Intensity
        </label>
        <output htmlFor="osd-night-intensity" className="osd-night-intensity-value">
          {percent}%
        </output>
      </div>
      <input
        id="osd-night-intensity"
        type="range"
        className="osd-range osd-night-range"
        min={0}
        max={100}
        value={percent}
        style={{ '--fill': `${percent}%` } as CSSProperties}
        onChange={(e) => {
          const next = Number(e.target.value) / 100
          setDragged(next)
          save({ nightLightIntensity: next })
        }}
        aria-label="Night light intensity"
      />
      <div className="osd-night-intensity-ends" aria-hidden="true">
        <span>Gentle</span>
        <span>Deep amber</span>
      </div>
    </div>
  )
}

/**
 * Saves settings as fast as the main process takes them and no faster.
 *
 * A drag sends dozens of changes a second, each written to disk before it
 * reaches the picture. Queueing them all would leave the picture trailing
 * further and further behind the thumb; keeping only the newest while one
 * is on its way means it is never more than one save behind.
 */
function useCoalescedSave(): (changes: Partial<Settings>) => void {
  const busy = useRef(false)
  const waiting = useRef<Partial<Settings> | null>(null)

  const send = (changes: Partial<Settings>): void => {
    if (busy.current) {
      waiting.current = { ...waiting.current, ...changes }
      return
    }
    busy.current = true
    void api
      .updateSettings(changes)
      .catch(() => undefined)
      .then(() => {
        busy.current = false
        const next = waiting.current
        waiting.current = null
        // The last change of a drag still goes, even if the menu has shut.
        if (next) send(next)
      })
  }
  return send
}

/**
 * An on/off row in a player menu.
 *
 * It flips as soon as it is pressed, and then follows the saved setting, so
 * a change from elsewhere — the key, or the other menu — shows here too.
 */
export function OsdSwitch({
  label,
  help,
  checked,
  onChange
}: {
  label: string
  help: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  const [on, setOn] = useState(checked)
  useEffect(() => setOn(checked), [checked])

  return (
    <button
      className="osd-switch-row"
      role="switch"
      aria-checked={on}
      onClick={() => {
        setOn(!on)
        onChange(!on)
      }}
    >
      <span className="osd-switch-text">
        <span className="osd-switch-label">{label}</span>
        <span className="osd-switch-help">{help}</span>
      </span>
      <span className="osd-switch" aria-hidden="true" />
    </button>
  )
}
