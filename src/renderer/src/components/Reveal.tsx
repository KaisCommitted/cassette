import type { ReactNode } from 'react'
import { motion } from 'motion/react'
import { EASE_IN_OUT, EASE_OUT } from '../../shared/motion'

/**
 * Something that opens inside a list — a row asking for a key, a question
 * about a clash — unfolding to its height and folding away again, so the
 * rows below it glide rather than jump. Put it inside an AnimatePresence.
 *
 * The words come in a moment after the room is made for them, and go before
 * it closes.
 */
export function Reveal({ children }: { children: ReactNode }) {
  return (
    <motion.div
      style={{ overflow: 'hidden' }}
      initial={{ height: 0, opacity: 0 }}
      animate={{
        height: 'auto',
        opacity: 1,
        transition: {
          height: { duration: 0.42, ease: EASE_OUT },
          opacity: { duration: 0.32, ease: EASE_OUT, delay: 0.08 }
        }
      }}
      exit={{
        height: 0,
        opacity: 0,
        transition: {
          height: { duration: 0.3, ease: EASE_IN_OUT },
          opacity: { duration: 0.16 }
        }
      }}
    >
      {children}
    </motion.div>
  )
}
