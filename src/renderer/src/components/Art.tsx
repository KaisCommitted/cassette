import { useState } from 'react'

export type ArtKind = 'poster' | 'backdrop' | 'still'

export interface ArtProps {
  /** TMDB path, e.g. `/abc.jpg`. Null falls back to a local frame. */
  tmdbPath: string | null
  kind: ArtKind
  /** Media key, used to fall back to a frame grabbed from the file itself. */
  thumbKey?: string | null
  alt: string
  /** Shown when there is neither artwork nor a usable frame. */
  fallbackText?: string
}

/** URL for cached TMDB artwork; the main process downloads it on first ask. */
export function artUrl(tmdbPath: string, kind: ArtKind): string {
  return `cassette-art://${kind}${tmdbPath}`
}

/**
 * Artwork with a ladder of fallbacks: TMDB first, then a frame pulled from the
 * file, then a plain title card. A tile is never empty, and nothing here ever
 * reaches the network — the main process owns that.
 */
export function Art({ tmdbPath, kind, thumbKey, alt, fallbackText }: ArtProps) {
  const [tmdbFailed, setTmdbFailed] = useState(false)
  const [thumbFailed, setThumbFailed] = useState(false)

  const useTmdb = tmdbPath && !tmdbFailed
  const useThumb = !useTmdb && thumbKey && !thumbFailed

  if (useTmdb) {
    return (
      <img
        src={artUrl(tmdbPath, kind)}
        alt={alt}
        loading="lazy"
        onError={() => setTmdbFailed(true)}
      />
    )
  }

  if (useThumb) {
    return (
      <img
        src={`cassette-thumb://${thumbKey}`}
        alt={alt}
        loading="lazy"
        onError={() => setThumbFailed(true)}
      />
    )
  }

  return <div className="art-fallback">{fallbackText ?? alt}</div>
}

export function PlayOverlay() {
  return (
    <div className="tile-play">
      <svg width="46" height="46" viewBox="0 0 48 48" aria-hidden="true">
        <circle cx="24" cy="24" r="22" fill="rgba(12,14,18,0.72)" stroke="#fff" strokeWidth="1.5" />
        <path d="M20 16.5v15a.6.6 0 0 0 .92.5l11.2-7.5a.6.6 0 0 0 0-1l-11.2-7.5a.6.6 0 0 0-.92.5Z" fill="#fff" />
      </svg>
    </div>
  )
}
