import { useEffect, useState } from 'react'

type Stage = 'idle' | 'available' | 'downloading' | 'ready'

/**
 * A quiet pill in the corner when a new build exists.
 *
 * It never interrupts: nothing downloads until you click, and nothing installs
 * until the download has finished and you say so. Getting yanked out of an
 * episode by an update is exactly the behaviour this avoids.
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
    })
    return () => {
      offAvailable()
      offProgress()
      offReady()
    }
  }, [])

  if (stage === 'idle' || dismissed) return null

  return (
    <div className="update-pill" role="status">
      <div className="update-mark" aria-hidden="true">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 4v10m0 0 4-4m-4 4-4-4" />
          <path d="M5 19h14" />
        </svg>
      </div>

      <div className="update-body">
        {stage === 'available' && (
          <>
            <div className="update-title">Cassette {version} is ready to install</div>
            <div className="update-sub">Downloads in the background. Nothing restarts until you say so.</div>
            <div className="update-actions">
              <button
                className="btn primary"
                onClick={() => {
                  setStage('downloading')
                  window.cassette.startUpdateDownload()
                }}
              >
                Download
              </button>
              <button className="btn" onClick={() => setDismissed(true)}>
                Not now
              </button>
            </div>
          </>
        )}

        {stage === 'downloading' && (
          <>
            <div className="update-title">Downloading {version}</div>
            <div className="update-bar">
              <span style={{ width: `${percent}%` }} />
            </div>
            <div className="update-sub">{percent}% — carry on watching, this runs in the background.</div>
          </>
        )}

        {stage === 'ready' && (
          <>
            <div className="update-title">Cassette {version} is downloaded</div>
            <div className="update-sub">Installing takes a few seconds and reopens the app.</div>
            <div className="update-actions">
              <button className="btn primary" onClick={() => window.cassette.installUpdate()}>
                Restart and install
              </button>
              <button className="btn" onClick={() => setDismissed(true)}>
                Later
              </button>
            </div>
          </>
        )}
      </div>

      <button
        className="update-close"
        aria-label="Dismiss"
        onClick={() => setDismissed(true)}
      >
        ×
      </button>
    </div>
  )
}
