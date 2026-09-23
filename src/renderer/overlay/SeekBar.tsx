import { useCallback, useEffect, useRef, useState } from 'react'
import { formatTime } from './format'

export interface SeekBarProps {
  position: number
  duration: number
  onSeek: (seconds: number) => void
  onActivity: () => void
}

/**
 * Click or drag to seek, with a hover preview of the target time.
 *
 * While dragging it shows the dragged position rather than mpv's reported
 * one, so the handle tracks the pointer instead of snapping back on each
 * incoming state update.
 */
export function SeekBar({ position, duration, onSeek, onActivity }: SeekBarProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState(false)
  const [dragSeconds, setDragSeconds] = useState(0)
  const [hover, setHover] = useState<number | null>(null)

  const secondsAt = useCallback(
    (clientX: number): number => {
      const el = trackRef.current
      if (!el || duration <= 0) return 0
      const rect = el.getBoundingClientRect()
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
      return ratio * duration
    },
    [duration]
  )

  useEffect(() => {
    if (!dragging) return
    const move = (e: MouseEvent): void => {
      setDragSeconds(secondsAt(e.clientX))
      onActivity()
    }
    const up = (e: MouseEvent): void => {
      onSeek(secondsAt(e.clientX))
      setDragging(false)
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
    return () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
  }, [dragging, secondsAt, onSeek, onActivity])

  const shown = dragging ? dragSeconds : position
  const pct = duration > 0 ? (shown / duration) * 100 : 0
  const hoverPct = hover !== null && duration > 0 ? (hover / duration) * 100 : null
  const active = dragging || hover !== null

  return (
    <div
      className={active ? 'seek is-active' : 'seek'}
      onMouseDown={(e) => {
        setDragSeconds(secondsAt(e.clientX))
        setDragging(true)
      }}
      onMouseMove={(e) => setHover(secondsAt(e.clientX))}
      onMouseLeave={() => setHover(null)}
    >
      {hoverPct !== null && (
        <div className="seek-tip" style={{ left: `${hoverPct}%` }}>
          {formatTime(hover ?? 0)}
        </div>
      )}

      <div className="seek-track" ref={trackRef}>
        {hoverPct !== null && <div className="seek-hover" style={{ width: `${hoverPct}%` }} />}
        <div className="seek-fill" style={{ width: `${pct}%` }} />
        <div className="seek-thumb" style={{ left: `${pct}%` }} />
      </div>
    </div>
  )
}
