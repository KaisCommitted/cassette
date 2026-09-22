import { useEffect, useRef, useState } from 'react'
import { artUrl, thumbUrl } from '../mediaUrls'

export type ArtKind = 'poster' | 'backdrop' | 'still'

export interface ArtProps {
  /** TMDB path, e.g. `/abc.jpg`. Null falls back to a frame from the file. */
  tmdbPath: string | null
  kind: ArtKind
  /** Media key, used to fall back to a frame grabbed from the file itself. */
  thumbKey?: string | null
  alt: string
  /** Shown when there is neither artwork nor a usable frame. */
  fallbackText?: string
}

/** How long to wait before a second attempt at an image that failed. */
const RETRY_DELAY_MS = 1500

/**
 * Artwork with a ladder of fallbacks: TMDB first, then a frame pulled from the
 * file, then a plain title card. A tile is never empty, and nothing here ever
 * reaches the network — the main process owns that.
 *
 * A failure is retried once rather than being final. Artwork is downloaded the
 * first time it is asked for, so the first request after a scan can lose a race
 * or hit a hiccup; giving up permanently would leave a placeholder on screen
 * even though the image is sitting in the cache by then. Failure state also
 * resets whenever the source changes, so metadata arriving late replaces a
 * placeholder instead of being ignored.
 */
export function Art({ tmdbPath, kind, thumbKey, alt, fallbackText }: ArtProps) {
  const [tmdbFailed, setTmdbFailed] = useState(false)
  const [thumbFailed, setThumbFailed] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const retriedFor = useRef<string | null>(null)

  // Late metadata should get a fresh chance, not inherit an earlier failure.
  useEffect(() => {
    setTmdbFailed(false)
    setThumbFailed(false)
    setLoaded(false)
    setAttempt(0)
    retriedFor.current = null
  }, [tmdbPath, thumbKey])

  const useTmdb = Boolean(tmdbPath) && !tmdbFailed
  const useThumb = !useTmdb && Boolean(thumbKey) && !thumbFailed

  if (!useTmdb && !useThumb) {
    return <div className="art-fallback">{fallbackText ?? alt}</div>
  }

  const base = useTmdb ? artUrl(tmdbPath!, kind) : thumbUrl(thumbKey!)
  // The attempt number makes the retry a genuinely new request rather than one
  // the browser answers from its own cache of the failure.
  const src = attempt === 0 ? base : `${base}?retry=${attempt}`

  const handleError = (): void => {
    if (retriedFor.current !== base) {
      retriedFor.current = base
      setTimeout(() => setAttempt((n) => n + 1), RETRY_DELAY_MS)
      return
    }
    setLoaded(false)
    if (useTmdb) setTmdbFailed(true)
    else setThumbFailed(true)
  }

  return (
    <>
      {!loaded && <div className="art-skeleton" />}
      <img
        // Keyed by src so a retry, or a switch from frame to real artwork,
        // replays the fade instead of swapping in place.
        key={src}
        src={src}
        alt={alt}
        loading="lazy"
        style={{ opacity: loaded ? 1 : 0, transition: 'opacity 320ms ease' }}
        onLoad={() => setLoaded(true)}
        onError={handleError}
      />
    </>
  )
}

export function PlayOverlay() {
  return (
    <div className="tile-play">
      <svg width="46" height="46" viewBox="0 0 48 48" aria-hidden="true">
        <circle
          cx="24"
          cy="24"
          r="22"
          fill="rgba(12,14,18,0.72)"
          stroke="#fff"
          strokeWidth="1.5"
        />
        <path
          d="M20 16.5v15a.6.6 0 0 0 .92.5l11.2-7.5a.6.6 0 0 0 0-1l-11.2-7.5a.6.6 0 0 0-.92.5Z"
          fill="#fff"
        />
      </svg>
    </div>
  )
}
