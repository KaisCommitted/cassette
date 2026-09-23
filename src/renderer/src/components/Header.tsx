import { forwardRef } from 'react'
import type { ScanProgressInfo } from '@shared/types'
import { Icon, Logo } from '../../shared/Icon'

export interface HeaderProps {
  current: 'library' | 'settings'
  query: string
  onQueryChange: (query: string) => void
  onLibrary: () => void
  onSettings: () => void
  scanning: boolean
  scanProgress: ScanProgressInfo | null
}

/**
 * The bar across the top: the mark, the two places, and search.
 *
 * Search lives here rather than on the library page so it is one keystroke
 * away from anywhere — typing from a series or from settings takes you to the
 * results. A scan running in the background shows here too, since it can be
 * started from settings and outlast your visit there.
 */
export const Header = forwardRef<HTMLInputElement, HeaderProps>(function Header(
  { current, query, onQueryChange, onLibrary, onSettings, scanning, scanProgress },
  searchRef
) {
  return (
    <header className="topbar">
      <button className="brand" onClick={onLibrary} aria-label="Cassette, go to the library">
        <Logo variant="mark" className="brand-mark" />
        <Logo variant="wordmark" className="brand-word" />
      </button>

      <nav className="nav" aria-label="Main">
        {/* `rail-link` is what the automated capture (src/main/testCapture.ts)
            looks for to move between screens, so the name outlives the rail. */}
        <button
          className="rail-link nav-link"
          aria-current={current === 'library' ? 'page' : undefined}
          onClick={onLibrary}
        >
          <Icon name="library" />
          Library
        </button>
        <button
          className="rail-link nav-link"
          aria-current={current === 'settings' ? 'page' : undefined}
          onClick={onSettings}
        >
          <Icon name="settings" />
          Settings
        </button>
      </nav>

      <div className="topbar-end">
        {scanning && (
          <button className="scan-chip" onClick={onSettings} title="Scan progress in Settings">
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
          </button>
        )}

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
      </div>
    </header>
  )
})
