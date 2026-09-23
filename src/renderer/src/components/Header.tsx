import { forwardRef, useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import type { MetadataProgressInfo, ScanProgressInfo } from '@shared/types'
import { Icon, Logo } from '../../shared/Icon'
import { arrive, glide, leave } from '../../shared/motion'

/** A chip in the bar: it fades in beside the cog, and away when done. */
const chipMotion = {
  initial: { opacity: 0, x: 8 },
  animate: { opacity: 1, x: 0, transition: arrive },
  exit: { opacity: 0, transition: leave }
}

export interface HeaderProps {
  current: 'library' | 'settings'
  query: string
  onQueryChange: (query: string) => void
  /** Steps back one screen; null on the library, which has nowhere to go back to. */
  onBack: (() => void) | null
  onLibrary: () => void
  onSettings: () => void
  scanning: boolean
  scanProgress: ScanProgressInfo | null
  /** A TMDB lookup under way, or null. */
  artwork: MetadataProgressInfo | null
}

/**
 * The bar across the top: back, the mark, search, and settings.
 *
 * There are only two places to be — the library and settings — so they are
 * not spelled out as tabs. The mark is the way home, as it is on most things
 * with a mark; settings is a cog in the corner, where people look for it; and
 * Back sits first, wherever you are, so leaving a series or settings is the
 * same move every time. That leaves the middle to search, which is what the
 * bar is for once you are past the first screen.
 *
 * A scan or an artwork lookup running in the background shows here too, since
 * either can outlast the screen it was started from.
 */
export const Header = forwardRef<HTMLInputElement, HeaderProps>(function Header(
  {
    current,
    query,
    onQueryChange,
    onBack,
    onLibrary,
    onSettings,
    scanning,
    scanProgress,
    artwork
  },
  searchRef
) {
  // A lookup where every title is already known finishes in a blink; saying
  // anything about it would only flash. Only one that keeps going is shown.
  const [artworkShown, setArtworkShown] = useState(false)
  const busy = artwork !== null
  useEffect(() => {
    if (!busy) {
      setArtworkShown(false)
      return
    }
    const timer = setTimeout(() => setArtworkShown(true), 800)
    return () => clearTimeout(timer)
  }, [busy])

  return (
    <header className="topbar">
      <div className="topbar-start">
        {/* Back eases in as the mark slides over to make room, and leaves
            where it stood as the mark slides back. */}
        <AnimatePresence initial={false} mode="popLayout">
          {onBack && (
            <motion.button
              key="back"
              className="icon-btn topbar-back"
              onClick={onBack}
              aria-label="Back"
              title="Back (Esc)"
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0, transition: { ...arrive, delay: 0.08 } }}
              exit={{ opacity: 0, x: -6, transition: leave }}
            >
              <Icon name="back-arrow" />
            </motion.button>
          )}
        </AnimatePresence>
        {/* \`rail-link\` and the hidden label are what the automated capture
            (src/main/testCapture.ts) looks for to move between screens. */}
        <motion.button
          layout="position"
          transition={glide}
          className="brand rail-link"
          onClick={onLibrary}
          aria-current={current === 'library' ? 'page' : undefined}
          title="Library"
        >
          <span className="visually-hidden">Library</span>
          <Logo variant="mark" className="brand-mark" />
          <Logo variant="wordmark" className="brand-word" />
        </motion.button>
      </div>

      <label className="searchbox">
        <Icon name="search" />
        <input
          ref={searchRef}
          type="search"
          value={query}
          placeholder="Search your library"
          aria-label="Search your library"
          aria-keyshortcuts="/ Control+F"
          spellCheck={false}
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={(e) => {
            // Escape empties the box first, then lets go of it.
            if (e.key !== 'Escape') return
            e.stopPropagation()
            if (query) onQueryChange('')
            else e.currentTarget.blur()
          }}
        />
        <kbd className="searchbox-hint" aria-hidden="true">
          /
        </kbd>
      </label>

      <div className="topbar-end">
        <AnimatePresence initial={false} mode="popLayout">
          {!scanning && artworkShown && artwork && (
            <motion.span
              key="artwork"
              {...chipMotion}
              className="scan-chip"
              role="status"
              title={artwork.current}
            >
              <span className="scan-chip-bar" aria-hidden="true">
                <span style={{ width: `${(artwork.done / artwork.total) * 100}%` }} />
              </span>
              <span className="scan-chip-text">
                Artwork {artwork.done} of {artwork.total}
              </span>
            </motion.span>
          )}

          {scanning && (
            <motion.button
              key="scan"
              {...chipMotion}
              className="scan-chip"
              onClick={onSettings}
              title="Scan progress in Settings"
            >
              <span className="scan-chip-bar" aria-hidden="true">
                <span
                  className={scanProgress ? undefined : 'is-indeterminate'}
                  style={
                    scanProgress
                      ? { width: `${(scanProgress.done / scanProgress.total) * 100}%` }
                      : undefined
                  }
                />
              </span>
              <span className="scan-chip-text">
                {scanProgress
                  ? `Scanning ${scanProgress.done} of ${scanProgress.total}`
                  : 'Scanning'}
              </span>
            </motion.button>
          )}
        </AnimatePresence>

        <button
          className="icon-btn topbar-settings rail-link"
          onClick={onSettings}
          aria-current={current === 'settings' ? 'page' : undefined}
          title="Settings"
        >
          <span className="visually-hidden">Settings</span>
          <Icon name="settings" />
        </button>
      </div>
    </header>
  )
})
