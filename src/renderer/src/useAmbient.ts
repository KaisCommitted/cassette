import { useEffect, useState } from 'react'

export interface Ambient {
  /** `r, g, b` triple, ready to drop into a CSS colour function. */
  rgb: string
  /** True once a colour has actually been read from the artwork. */
  ready: boolean
}

const NEUTRAL: Ambient = { rgb: '24, 30, 38', ready: false }

/**
 * Pulls a dominant colour out of the current artwork.
 *
 * The room takes on the colour of what is being projected: a flat near-black
 * page behind vivid poster art reads as dead, and this ties the background to
 * whatever you are actually watching. Sampling happens on a tiny canvas, so
 * the cost is a single downscaled draw per image.
 */
export function useAmbient(src: string | null): Ambient {
  const [ambient, setAmbient] = useState<Ambient>(NEUTRAL)

  useEffect(() => {
    if (!src) {
      setAmbient(NEUTRAL)
      return
    }

    let cancelled = false
    const image = new Image()
    image.crossOrigin = 'anonymous'

    image.onload = () => {
      if (cancelled) return
      try {
        const size = 24
        const canvas = document.createElement('canvas')
        canvas.width = size
        canvas.height = size
        const context = canvas.getContext('2d', { willReadFrequently: true })
        if (!context) return
        context.drawImage(image, 0, 0, size, size)
        const { data } = context.getImageData(0, 0, size, size)

        // Weight by saturation so the wash picks up the artwork's character
        // rather than averaging everything into grey.
        let r = 0
        let g = 0
        let b = 0
        let weight = 0
        for (let i = 0; i < data.length; i += 4) {
          const pr = data[i]!
          const pg = data[i + 1]!
          const pb = data[i + 2]!
          const max = Math.max(pr, pg, pb)
          const min = Math.min(pr, pg, pb)
          const saturation = max === 0 ? 0 : (max - min) / max
          const w = 0.25 + saturation
          r += pr * w
          g += pg * w
          b += pb * w
          weight += w
        }
        if (weight === 0) return

        setAmbient({
          rgb: `${Math.round(r / weight)}, ${Math.round(g / weight)}, ${Math.round(b / weight)}`,
          ready: true
        })
      } catch {
        // A tainted canvas means we simply keep the neutral background.
        setAmbient(NEUTRAL)
      }
    }

    image.onerror = () => setAmbient(NEUTRAL)
    image.src = src

    return () => {
      cancelled = true
    }
  }, [src])

  return ambient
}
