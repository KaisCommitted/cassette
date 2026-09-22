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

  return (
    <div
      style={{ position: 'relative', padding: '8px 0', cursor: 'pointer' }}
      onMouseDown={(e) => {
        setDragSeconds(secondsAt(e.clientX))
        setDragging(true)
      }}
      onMouseMove={(e) => setHover(secondsAt(e.clientX))}
      onMouseLeave={() => setHover(null)}
    >
      {hoverPct !== null && (
        <div
          style={{
            position: 'absolute',
            bottom: 22,
            left: `${hoverPct}%`,
            transform: 'translateX(-50%)',
            background: 'rgba(8,8,11,0.94)',
            border: '1px solid rgba(255,255,255,0.14)',
            borderRadius: 6,
            padding: '3px 7px',
            fontSize: 11.5,
            fontVariantNumeric: 'tabular-nums',
            pointerEvents: 'none',
            whiteSpace: 'nowrap'
          }}
        >
          {formatTime(hover ?? 0)}
        </div>
      )}

      <div
        ref={trackRef}
        style={{
          position: 'relative',
          height: dragging || hover !== null ? 6 : 4,
          background: 'rgba(255,255,255,0.22)',
          borderRadius: 999,
          transition: 'height 120ms ease'
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            width: `${pct}%`,
            background: '#e50914',
            borderRadius: 999
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: `${pct}%`,
            width: 13,
            height: 13,
            marginLeft: -6.5,
            marginTop: -6.5,
            borderRadius: '50%',
            background: '#fff',
            boxShadow: '0 1px 4px rgba(0,0,0,0.5)',
            opacity: dragging || hover !== null ? 1 : 0,
            transition: 'opacity 120ms ease',
            pointerEvents: 'none'
          }}
        />
      </div>
    </div>
  )
}
