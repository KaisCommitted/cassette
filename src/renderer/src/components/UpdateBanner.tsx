import { useEffect, useState } from 'react'
import { Icon } from '../../shared/Icon'

type Stage = 'idle' | 'available' | 'downloading' | 'ready'

/**
 * A strip under the top bar when a new build exists.
 *
 * It never interrupts: nothing downloads until you click, and nothing installs
 * until the download has finished and you say so. Getting yanked out of an
 * episode by an update is exactly the behaviour this avoids. It sits in the
 * page's flow rather than floating, so it never covers a tile or a button.
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

  if (stage === 'idle' || dismissed) return null

  return (
    <div className="notice" role="status">
      <span className="notice-dot" aria-hidden="true" />

      {stage === 'available' && (
        <>
          <p className="notice-text">
            <strong>Cassette {version} is available.</strong> It downloads in the
            background, and nothing restarts until you say so.
          </p>
          <div className="notice-actions">
            <button
              className="btn btn-primary btn-sm"
              onClick={() => {
                setStage('downloading')
                window.cassette.startUpdateDownload()
              }}
            >
              <Icon name="download" />
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
          <p className="notice-text">
            <strong>Downloading Cassette {version}.</strong> Carry on watching, this
            runs in the background.
          </p>
          <div className="notice-progress" aria-label={`${percent}% downloaded`}>
            <span className="notice-bar">
              <span style={{ width: `${percent}%` }} />
            </span>
            <span className="notice-pct">{percent}%</span>
          </div>
        </>
      )}

      {stage === 'ready' && (
        <>
          <p className="notice-text">
            <strong>Cassette {version} is downloaded.</strong> Installing takes a few
            seconds and reopens the app.
          </p>
          <div className="notice-actions">
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

      <button
        className="icon-btn notice-close"
        aria-label="Dismiss"
        title="Dismiss"
        onClick={() => setDismissed(true)}
      >
        <Icon name="close" />
      </button>
    </div>
  )
}
