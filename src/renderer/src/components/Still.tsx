import { useState } from 'react'

export interface StillProps {
  /** Media key; the still is generated on demand by the main process. */
  thumbKey: string | null
  alt: string
  /** 0–1 watch progress, drawn as a seam along the bottom. */
  fraction?: number
  watched?: boolean
}

/**
 * A frame pulled from the video itself.
 *
 * Stills are 16:9 because that is what the source actually is — inventing
 * portrait poster art would mean fabricating something the files do not
 * contain.
 */
export function Still({ thumbKey, alt, fraction, watched }: StillProps) {
  const [failed, setFailed] = useState(false)

  return (
    <div className="card-still">
      {thumbKey && !failed ? (
        <img
          src={`mnf-thumb://${thumbKey}`}
          alt={alt}
          loading="lazy"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="placeholder">no still</span>
      )}

      {watched && <span className="badge-watched">Watched</span>}

      {fraction !== undefined && fraction > 0 && (
        <div className="card-progress" style={{ width: `${Math.min(100, fraction * 100)}%` }} />
      )}
    </div>
  )
}
