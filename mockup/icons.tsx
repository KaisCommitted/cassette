/* ===========================================================================
   Cassette — every drawn thing.
   Inline SVG only: no icon pack, no image files. Alongside the glyphs live
   the three signature objects — the spool mark, the tape counter and the
   J-card — because they are drawings too, not screens.
   =========================================================================== */
import React from 'react'

type S = { size?: number; className?: string }

/* ---------------------------------------------------------------------------
   Interface glyphs. One weight, one grid, drawn on a 24-unit box.
   --------------------------------------------------------------------------- */
const g = (size: number, extra?: string) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  className: extra,
  'aria-hidden': true,
})

export const IconLibrary = ({ size = 20, className }: S) => (
  <svg {...g(size, className)}>
    <rect x="3" y="4" width="5" height="16" rx="1" />
    <rect x="10" y="4" width="5" height="16" rx="1" />
    <path d="M17.2 5.4l3.4 14.1" />
    <path d="M4 9h3M11 9h3" />
  </svg>
)

export const IconSettings = ({ size = 20, className }: S) => (
  <svg {...g(size, className)}>
    <path d="M4 7h10M18 7h2" />
    <path d="M4 12h3M11 12h9" />
    <path d="M4 17h12M20 17h0" />
    <rect x="14" y="4.6" width="3.2" height="4.8" rx="0.6" />
    <rect x="7.4" y="9.6" width="3.2" height="4.8" rx="0.6" />
    <rect x="16" y="14.6" width="3.2" height="4.8" rx="0.6" />
  </svg>
)

export const IconPlay = ({ size = 18, className }: S) => (
  <svg {...g(size, className)} fill="currentColor" stroke="none">
    <path d="M7.5 5.2l11 6.8-11 6.8z" />
  </svg>
)

export const IconPause = ({ size = 18, className }: S) => (
  <svg {...g(size, className)} fill="currentColor" stroke="none">
    <rect x="7" y="5" width="3.6" height="14" rx="0.6" />
    <rect x="13.4" y="5" width="3.6" height="14" rx="0.6" />
  </svg>
)

export const IconPrev = ({ size = 18, className }: S) => (
  <svg {...g(size, className)} fill="currentColor" stroke="none">
    <rect x="5" y="5" width="2.4" height="14" rx="0.5" />
    <path d="M19.5 5.4v13.2L9.2 12z" />
  </svg>
)

export const IconNext = ({ size = 18, className }: S) => (
  <svg {...g(size, className)} fill="currentColor" stroke="none">
    <rect x="16.6" y="5" width="2.4" height="14" rx="0.5" />
    <path d="M4.5 5.4v13.2L14.8 12z" />
  </svg>
)

export const IconVolume = ({ size = 18, className }: S) => (
  <svg {...g(size, className)}>
    <path d="M4 9.5h3.5L12 5.5v13L7.5 14.5H4z" fill="currentColor" stroke="currentColor" />
    <path d="M15.4 9.2a4 4 0 010 5.6" />
    <path d="M18 6.8a7.5 7.5 0 010 10.4" />
  </svg>
)

export const IconMute = ({ size = 18, className }: S) => (
  <svg {...g(size, className)}>
    <path d="M4 9.5h3.5L12 5.5v13L7.5 14.5H4z" fill="currentColor" stroke="currentColor" />
    <path d="M16 9.6l4.4 4.8M20.4 9.6L16 14.4" />
  </svg>
)

export const IconFullscreen = ({ size = 18, className }: S) => (
  <svg {...g(size, className)}>
    <path d="M4 9V4.6h4.4M15.6 4.6H20V9M20 15v4.4h-4.4M8.4 19.4H4V15" />
  </svg>
)

export const IconClose = ({ size = 18, className }: S) => (
  <svg {...g(size, className)}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
)

export const IconSearch = ({ size = 16, className }: S) => (
  <svg {...g(size, className)}>
    <circle cx="10.6" cy="10.6" r="5.6" />
    <path d="M14.8 14.8L20 20" />
  </svg>
)

export const IconTick = ({ size = 14, className }: S) => (
  <svg {...g(size, className)} strokeWidth={2.1}>
    <path d="M4.5 12.4l4.6 4.6L19.5 6.6" />
  </svg>
)

export const IconFolder = ({ size = 18, className }: S) => (
  <svg {...g(size, className)}>
    <path d="M3.5 6.5h6l1.8 2.2h9.2v9.8a1 1 0 01-1 1H4.5a1 1 0 01-1-1z" />
  </svg>
)

export const IconSubtitles = ({ size = 18, className }: S) => (
  <svg {...g(size, className)}>
    <rect x="3" y="5.5" width="18" height="13" rx="1.4" />
    <path d="M6.6 13.4h5M14 13.4h3.4" />
    <path d="M6.6 10h3M12 10h5.4" />
  </svg>
)

export const IconAudio = ({ size = 18, className }: S) => (
  <svg {...g(size, className)}>
    <path d="M4 12v-1M8 15.5v-8M12 18.5v-13M16 15.5v-8M20 12v-1" />
  </svg>
)

export const IconSpeed = ({ size = 18, className }: S) => (
  <svg {...g(size, className)}>
    <path d="M4.4 17.4a8.6 8.6 0 1115.2 0" />
    <path d="M12 13.4l4.2-4" />
    <circle cx="12" cy="14.4" r="1.4" fill="currentColor" stroke="none" />
  </svg>
)

export const IconSleep = ({ size = 18, className }: S) => (
  <svg {...g(size, className)}>
    <circle cx="12" cy="12" r="8" />
    <path d="M12 7.4V12l3.2 2" />
  </svg>
)

export const IconBack = ({ size = 16, className }: S) => (
  <svg {...g(size, className)}>
    <path d="M11 5.5L4.5 12l6.5 6.5M4.8 12H20" />
  </svg>
)

export const IconChevron = ({ size = 14, className }: S) => (
  <svg {...g(size, className)}>
    <path d="M8.5 4.5L16 12l-7.5 7.5" />
  </svg>
)

export const IconRescan = ({ size = 16, className }: S) => (
  <svg {...g(size, className)}>
    <path d="M20 12a8 8 0 11-2.6-5.9" />
    <path d="M20 4.6V9h-4.4" />
  </svg>
)

export const IconDownload = ({ size = 16, className }: S) => (
  <svg {...g(size, className)}>
    <path d="M12 4v10.6M7.6 10.6L12 15l4.4-4.4" />
    <path d="M4.5 18.5h15" />
  </svg>
)

export const IconPlus = ({ size = 14, className }: S) => (
  <svg {...g(size, className)}>
    <path d="M12 5v14M5 12h14" />
  </svg>
)

export const IconMinus = ({ size = 14, className }: S) => (
  <svg {...g(size, className)}>
    <path d="M5 12h14" />
  </svg>
)

export const IconList = ({ size = 16, className }: S) => (
  <svg {...g(size, className)}>
    <path d="M4 7h16M4 12h16M4 17h11" />
  </svg>
)

export const IconWarn = ({ size = 16, className }: S) => (
  <svg {...g(size, className)}>
    <path d="M12 8.4v4.4" />
    <circle cx="12" cy="16.2" r="0.9" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="8.4" />
  </svg>
)

/* ===========================================================================
   SIGNATURE OBJECT 1 — THE SPOOL MARK
   Two cassette hubs. Six teeth each, the way a real hub grips the spindle.
   Ribbon coiled thick on one, thin on the other, with the tape spanning
   between them. Used as the logo, the app icon, and the scanning indicator.
   =========================================================================== */

/** The six-toothed hub, drawn about its own centre so it can be spun. */
function Hub({ cx, cy, coil, tone }: { cx: number; cy: number; coil: number; tone: string }) {
  const teeth = [0, 60, 120, 180, 240, 300]
  return (
    <>
      {/* the ribbon wound on the spool: a ring whose width is how much is left */}
      <circle
        cx={cx}
        cy={cy}
        r={7.2 + coil / 2}
        fill="none"
        stroke={tone}
        strokeWidth={coil}
        opacity={0.55}
      />
      <circle cx={cx} cy={cy} r={7.2 + coil} fill="none" stroke={tone} strokeWidth={0.7} opacity={0.75} />
      {/* the hub itself, with its teeth */}
      <circle cx={cx} cy={cy} r={7} fill="none" stroke="currentColor" strokeWidth={1.5} />
      {teeth.map((a) => (
        <path
          key={a}
          d="M -1.5 -6.6 L 1.5 -6.6 L 1.05 -2.6 L -1.05 -2.6 Z"
          fill="currentColor"
          transform={`translate(${cx} ${cy}) rotate(${a})`}
        />
      ))}
      <circle cx={cx} cy={cy} r={2.4} fill="none" stroke="currentColor" strokeWidth={1.2} />
    </>
  )
}

/**
 * The mark. `running` turns the hubs against each other (SPOOL SPIN).
 * Also the loading and scanning indicator — never a spinner ring.
 */
export function SpoolMark({
  size = 44,
  running = false,
  className = '',
}: { size?: number; running?: boolean; className?: string }) {
  const w = size * (76 / 44)
  return (
    <svg
      width={w}
      height={size}
      viewBox="0 0 76 44"
      className={`spool ${running ? 'is-running' : ''} ${className}`}
      aria-hidden="true"
    >
      {/* the tape spanning the gap, and the pressure pad below it */}
      <path d="M22 22h32" stroke="var(--accent-deep)" strokeWidth={1.4} />
      <path d="M26 30.5h24" stroke="currentColor" strokeWidth={1} opacity={0.35} />
      <g className="spool__hub spool__hub--a">
        <Hub cx={22} cy={22} coil={5.6} tone="var(--accent)" />
      </g>
      <g className="spool__hub spool__hub--b">
        <Hub cx={54} cy={22} coil={1.8} tone="var(--accent)" />
      </g>
    </svg>
  )
}

/** The wordmark. Struck, not set — it belongs to the typewriter face. */
export function Wordmark({ className = '' }: { className?: string }) {
  return <span className={`wordmark ${className}`}>Cassette</span>
}

/**
 * The app icon. One hub, drawn heavy enough to survive 16px, in its case.
 * `size` 16 drops the fine detail; anything larger keeps it.
 */
export function AppIcon({ size = 512 }: { size?: number }) {
  const fine = size >= 24
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <rect x="0" y="0" width="64" height="64" rx={size >= 24 ? 12 : 10} fill="#1E1C1A" />
      <rect x="4" y="4" width="56" height="56" rx={size >= 24 ? 9 : 7} fill="none" stroke="#38332E" strokeWidth="2" />
      <g color="#EDE8DF">
        <circle cx="32" cy="32" r="19" fill="none" stroke="#E5A83B" strokeWidth={fine ? 6 : 8} opacity="0.5" />
        <circle cx="32" cy="32" r="13.5" fill="none" stroke="currentColor" strokeWidth="3" />
        {[0, 60, 120, 180, 240, 300].map((a) => (
          <path
            key={a}
            d="M -3.1 -13 L 3.1 -13 L 2.1 -5.2 L -2.1 -5.2 Z"
            fill="currentColor"
            transform={`translate(32 32) rotate(${a})`}
          />
        ))}
        <circle cx="32" cy="32" r="4.6" fill="#1E1C1A" stroke="currentColor" strokeWidth="2.4" />
      </g>
    </svg>
  )
}

/* ===========================================================================
   SIGNATURE OBJECT 2 — THE TAPE COUNTER
   plus ROLLING DIGITS, the motion every changing number uses.
   =========================================================================== */

const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']

function Strip({ n, i }: { n: number; i: number }) {
  return (
    <span className="roll__d">
      <span className="roll__strip" style={{ ['--n' as string]: n, ['--i' as string]: i }}>
        {DIGITS.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </span>
    </span>
  )
}

/**
 * Any text made of digits and separators, rolled into place like an odometer.
 * Digits roll; colons, dots and spaces sit still. Rightmost moves first.
 */
export function Rolling({ text, className = '' }: { text: string; className?: string }) {
  const chars = text.split('')
  const last = chars.length - 1
  return (
    <span className={`roll ${className}`} aria-label={text} role="img">
      {chars.map((c, idx) =>
        c >= '0' && c <= '9' ? (
          <Strip key={idx} n={Number(c)} i={last - idx} />
        ) : (
          <span key={idx} className="roll__sep" aria-hidden="true">
            {c === ' ' ? ' ' : c}
          </span>
        )
      )}
    </span>
  )
}

/** Seconds as h:mm:ss or m:ss, ready to roll. */
export function clock(totalSeconds: number, forceHours = false): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 || forceHours ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`
}

/**
 * Three digits, white on black drums, a hairline gap between each.
 * The counter in an old deck: it counts tape, not time, and it means nothing
 * on its own — which is exactly why it belongs here.
 */
export function TapeCounter({
  value,
  size = 'md',
  label,
  className = '',
}: { value: number; size?: 'sm' | 'md' | 'lg'; label?: string; className?: string }) {
  const digits = String(Math.abs(Math.round(value)) % 1000).padStart(3, '0').split('')
  const cls = size === 'sm' ? 'counter--sm' : size === 'lg' ? 'counter--lg' : ''
  return (
    <span className={`counter ${cls} ${className}`} role="img" aria-label={label ?? `Counter ${digits.join('')}`}>
      {digits.map((d, idx) => (
        <span className="counter__drum" key={idx}>
          <span className="roll">
            <Strip n={Number(d)} i={digits.length - 1 - idx} />
          </span>
        </span>
      ))}
    </span>
  )
}

/* ===========================================================================
   SIGNATURE OBJECT 3 — THE J-CARD
   The folded paper insert from a cassette case. It stands in for every
   poster, because none of these files came with artwork. Spine down the
   left, the fold crease, the ruled area you would have written on, the
   title struck in typewriter, the running time stamped in the corner.
   =========================================================================== */

export type Stock = 'oat' | 'manila' | 'clay' | 'ash'

/** Which card stock a title was printed on. Stable for a given id. */
export function stockFor(id: string): Stock {
  const stocks: Stock[] = ['oat', 'manila', 'clay', 'ash']
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 997
  return stocks[h % 4]
}

/** What the copy on the drive actually is — the thing you would have written
 *  in the corner of the card yourself. Stable for a given id. */
export function sourceFor(id: string): string {
  const sources = ['1080p', '720p', '2160p', '576p', '1080p', '720p']
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 17 + id.charCodeAt(i)) % 991
  return sources[h % sources.length]
}

export function JCard({
  title,
  kind,
  meta,
  stamp,
  code,
  stock,
  wide = false,
}: {
  title: string
  kind: string
  meta: string
  stamp: string
  code: string
  stock: Stock
  wide?: boolean
}) {
  return (
    <div className={`jcard ${wide ? 'jcard--wide' : ''}`} data-stock={stock} aria-hidden="true">
      <div className="jcard__spine">
        <span className="jcard__spine-rule" />
        <span className="jcard__spine-title">{title}</span>
        <span className="jcard__spine-rule" />
      </div>
      <div className="jcard__crease" />
      <div className="jcard__face">
        <div className="jcard__head">
          <span>{kind}</span>
          <span className="jcard__code">{code}</span>
        </div>
        <h3 className="jcard__title">{title}</h3>
        <p className="jcard__meta">{meta}</p>
        <div className="jcard__rules" />
        <span className="jcard__stamp">{stamp}</span>
      </div>
    </div>
  )
}

/* ===========================================================================
   Artwork slots. Flat warm blocks in the right ratio with a faint label.
   Drop an <img> in as a child and it covers the slot; nothing else moves.
   =========================================================================== */

export function Slot({
  ratio,
  label,
  tint = 1,
  fill = false,
  children,
  className = '',
  style,
}: {
  ratio: '16x9' | '2x3'
  label: string
  tint?: 1 | 2 | 3 | 4 | 5
  /** Take the shape of the frame rather than the ratio. The label still says
   *  what belongs here, and a dropped-in image still covers it. */
  fill?: boolean
  children?: React.ReactNode
  className?: string
  style?: React.CSSProperties
}) {
  return (
    <div
      className={`slot ${fill ? 'slot--fill' : `slot--${ratio}`} slot--tint-${tint} ${className}`}
      style={style}
    >
      {children}
      <span className="slot__label">{label}</span>
    </div>
  )
}
