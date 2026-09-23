import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Icon } from '../../shared/Icon'
import { EASE_IN, EASE_OUT } from '../../shared/motion'

type Stage = 'idle' | 'available' | 'downloading' | 'ready'

/**
 * A small card in the bottom-left corner when a new build exists.
 *
 * It never interrupts: nothing downloads until you click, and nothing installs
 * until the download has finished and you say so. Getting yanked out of an
 * episode by an update is exactly the behaviour this avoids.
 *
 * It floats rather than taking a place in the page, so a notice appearing
 * never pushes the library down under the pointer. The corner is clear of the
 * top bar's scan and artwork chips, and the player's controls are a window of
 * their own above this one, so it can never sit over them either.
 */
export function UpdateBanner() {
  const [stage, setStage] = useState<Stage>('idle')
  const [version, setVersion] = useState('')
  const [percent, setPercent] = useState(0)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    const offAvailable = window.cassette.onUpdateAvailable((info) => {
      setVersion(info.version)
      setStage('available')
    })
    const offProgress = window.cassette.onUpdateProgress((info) => {
      setPercent(info.percent)
      setStage('downloading')
    })
    const offReady = window.cassette.onUpdateReady((info) => {
      setVersion(info.version)
      setStage('ready')
      // A finished download is worth saying again, even after "Not now".
      setDismissed(false)
    })
    return () => {
      offAvailable()
      offProgress()
      offReady()
    }
  }, [])

  const shown = stage !== 'idle' && !dismissed

  // Rises gently into the corner, and sinks away when dismissed.
  return (
    <AnimatePresence>
      {shown && (
        <motion.aside
          className="update-card"
          role="status"
          aria-live="polite"
          aria-label="Update"
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE_OUT } }}
          exit={{ opacity: 0, y: 12, transition: { duration: 0.24, ease: EASE_IN } }}
        >
          <span className="update-mark" aria-hidden="true">
            <Icon name="download" />
          </span>

          <div className="update-body">
            {stage === 'available' && (
              <>
                <p className="update-title">Cassette {version} is ready to install</p>
                <p className="update-sub">
                  Downloads in the background. Nothing restarts until you say so.
                </p>
                <div className="update-actions">
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => {
                      setStage('downloading')
                      window.cassette.startUpdateDownload()
                    }}
                  >
                    Download
                  </button>
                  <button className="btn btn-quiet btn-sm" onClick={() => setDismissed(true)}>
                    Not now
                  </button>
                </div>
              </>
            )}

            {stage === 'downloading' && (
              <>
                <p className="update-title">Downloading {version}</p>
                <span className="update-bar" aria-hidden="true">
                  <span style={{ width: `${percent}%` }} />
                </span>
                <p className="update-sub">
                  <span className="update-pct">{percent}%</span> — carry on watching, this runs in
                  the background.
                </p>
              </>
            )}

            {stage === 'ready' && (
              <>
                <p className="update-title">Cassette {version} is downloaded</p>
                <p className="update-sub">Installing takes a few seconds and reopens the app.</p>
                <div className="update-actions">
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => window.cassette.installUpdate()}
                  >
                    Restart and install
                  </button>
                  <button className="btn btn-quiet btn-sm" onClick={() => setDismissed(true)}>
                    Later
                  </button>
                </div>
              </>
            )}
          </div>

          <button
            className="icon-btn update-close"
            aria-label="Dismiss"
            title="Dismiss"
            onClick={() => setDismissed(true)}
          >
            <Icon name="close" />
          </button>
        </motion.aside>
      )}
    </AnimatePresence>
  )
}
