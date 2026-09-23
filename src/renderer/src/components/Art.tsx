import { useEffect, useRef, useState, type ReactNode } from 'react'
import { artUrl, thumbUrl } from '../mediaUrls'
import { sleeveTone } from '../select'

export type ArtKind = 'poster' | 'backdrop' | 'still'

/** How long to wait before a second attempt at an image that failed. */
const RETRY_DELAY_MS = 1500

/**
 * One image that fades in when it arrives and gets one second chance.
 *
 * A failure is retried once rather than being final. Artwork is downloaded the
 * first time it is asked for, so the first request after a scan can lose a race
 * or hit a hiccup; giving up permanently would leave a placeholder on screen
 * even though the image is sitting in the cache by then.
 *
 * Nothing here ever reaches the network — the main process owns that.
 */
function ArtImage({
  src,
  className,
  onLoad,
  onFail
}: {
  src: string
  className: string
  onLoad?: () => void
  onFail: () => void
}) {
  const [attempt, setAttempt] = useState(0)
  const [loaded, setLoaded] = useState(false)
  const retry = useRef<ReturnType<typeof setTimeout> | null>(null)

  // A new source is a fresh start, not an inherited failure.
  useEffect(() => {
    setAttempt(0)
    setLoaded(false)
    return () => {
      if (retry.current) clearTimeout(retry.current)
    }
  }, [src])

  // The attempt number makes the retry a genuinely new request rather than one
  // the browser answers from its own cache of the failure.
  const url = attempt === 0 ? src : `${src}?retry=${attempt}`

  return (
    <img
      key={url}
      className={loaded ? `${className} is-loaded` : className}
      src={url}
      alt=""
      loading="lazy"
      decoding="async"
      draggable={false}
      onLoad={() => {
        setLoaded(true)
        onLoad?.()
      }}
      onError={() => {
        if (attempt === 0) {
          retry.current = setTimeout(() => setAttempt(1), RETRY_DELAY_MS)
          return
        }
        onFail()
      }}
    />
  )
}

/**
 * Walks a list of candidate images, falling to the next when one fails.
 *
 * Resets whenever the list changes, so metadata arriving late replaces a
 * placeholder instead of being ignored because an earlier source had failed.
 */
function useLadder(candidates: (string | null)[]): {
  src: string | null
  fail: () => void
} {
  const list = candidates.filter((c): c is string => Boolean(c))
  const signature = list.join('|')
  const [index, setIndex] = useState(0)
  useEffect(() => setIndex(0), [signature])
  return {
    src: list[index] ?? null,
    fail: () => setIndex((i) => i + 1)
  }
}

export interface PosterArtProps {
  /** TMDB poster path, or null when TMDB has nothing (or has not answered yet). */
  posterPath: string | null
  /** A file to pull a frame from when there is no poster. */
  thumbKey: string | null
  title: string
  /** Printed small on the sleeve: a year, a season count. */
  detail?: string | null
  children?: ReactNode
}

/**
 * A tape on the shelf.
 *
 * With TMDB artwork the poster fills the sleeve, edge to edge, with only a
 * hairline inset to say it is a case. Without it the sleeve is printed: a
 * colour from the title, the title itself, and — when the file can give one —
 * a frame from the video in a window, the way a tape box shows a still. The
 * printed sleeve is always underneath, so artwork that arrives late fades in
 * over it rather than replacing a blank.
 */
export function PosterArt({ posterPath, thumbKey, title, detail, children }: PosterArtProps) {
  const [posterFailed, setPosterFailed] = useState(false)
  useEffect(() => setPosterFailed(false), [posterPath])
  const showPoster = Boolean(posterPath) && !posterFailed

  return (
    <div className={`sleeve tone-${sleeveTone(title)}`}>
      <SleeveFace
        title={title}
        detail={detail ?? null}
        // A frame costs the main process a decode, so it is only asked for
        // when the sleeve is actually going to show it.
        thumbKey={showPoster ? null : thumbKey}
      />
      {showPoster && (
        <ArtImage
          src={artUrl(posterPath!, 'poster')}
          className="sleeve-art"
          onFail={() => setPosterFailed(true)}
        />
      )}
      {children}
    </div>
  )
}

function SleeveFace({
  title,
  detail,
  thumbKey
}: {
  title: string
  detail: string | null
  thumbKey: string | null
}) {
  const [frame, setFrame] = useState<'loading' | 'shown' | 'failed'>('loading')
  useEffect(() => setFrame('loading'), [thumbKey])

  return (
    <div className="sleeve-face" aria-hidden="true">
      <span className="sleeve-brand">Cassette home video</span>
      {/* The window is only drawn once there is a frame to put in it: an empty
          box while one is generated reads as something broken. */}
      {thumbKey && frame !== 'failed' && (
        <span className={frame === 'shown' ? 'sleeve-window is-shown' : 'sleeve-window'}>
          <ArtImage
            src={thumbUrl(thumbKey)}
            className="sleeve-frame"
            onLoad={() => setFrame('shown')}
            onFail={() => setFrame('failed')}
          />
        </span>
      )}
      <span className="sleeve-title">{title}</span>
      <span className="sleeve-foot">
        <span className="sleeve-reels">
          <i />
          <i />
        </span>
        {detail && <span className="sleeve-detail">{detail}</span>}
      </span>
    </div>
  )
}

export interface FrameArtProps {
  /** TMDB image to try first: an episode still or a backdrop. */
  tmdb: { path: string; kind: ArtKind } | null
  /** A file to pull a frame from when TMDB has nothing. */
  thumbKey: string | null
  title: string
  children?: ReactNode
}

/**
 * A 16:9 picture: TMDB's image, else a frame from the file, else a printed
 * card in the same colours as the tape's sleeve.
 */
export function FrameArt({ tmdb, thumbKey, title, children }: FrameArtProps) {
  const { src, fail } = useLadder([
    tmdb ? artUrl(tmdb.path, tmdb.kind) : null,
    thumbKey ? thumbUrl(thumbKey) : null
  ])

  return (
    <div className={`frame tone-${sleeveTone(title)}`}>
      <div className="frame-face" aria-hidden="true">
        <span className="sleeve-title">{title}</span>
        <span className="sleeve-reels">
          <i />
          <i />
        </span>
      </div>
      {src && <ArtImage src={src} className="frame-art" onFail={fail} />}
      {children}
    </div>
  )
}

/** Watch progress along the bottom edge of a picture. */
export function ProgressSeam({ fraction }: { fraction: number }) {
  const pct = Math.max(0, Math.min(100, fraction * 100))
  if (pct <= 0) return null
  return (
    <span className="seam" aria-hidden="true">
      <span style={{ width: `${pct}%` }} />
    </span>
  )
}
