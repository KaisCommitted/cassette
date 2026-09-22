/* ===========================================================================
   Cassette — the update notice.
   Corner of the screen, fades up warm, and never interrupts what is playing.
   =========================================================================== */
import React, { useEffect, useState } from 'react'
import { SpoolMark, Rolling, IconClose, IconDownload, IconTick } from './icons'

type Stage = 'offered' | 'getting' | 'ready'

export default function UpdateNotice({ onDismiss }: { onDismiss: () => void }) {
  const [stage, setStage] = useState<Stage>('offered')
  const [pct, setPct] = useState(0)

  useEffect(() => {
    if (stage !== 'getting') return
    const t = window.setInterval(() => {
      setPct((p) => {
        if (p >= 100) {
          window.clearInterval(t)
          setStage('ready')
          return 100
        }
        return Math.min(100, p + 4 + Math.floor(Math.random() * 9))
      })
    }, 220)
    return () => window.clearInterval(t)
  }, [stage])

  return (
    <aside className="update" role="status" aria-live="polite">
      <div className="update__head">
        <SpoolMark size={22} running={stage === 'getting'} />
        <span className="update__title">
          {stage === 'ready' ? 'Update ready' : 'A new version is out'}
        </span>
        <span className="update__ver">0.2.0</span>
        <button className="update__x" onClick={onDismiss} aria-label="Dismiss">
          <IconClose size={14} />
        </button>
      </div>

      {stage === 'offered' && (
        <>
          <p className="update__body">Installing takes about a minute and keeps your shelf as it is.</p>
          <ul className="update__notes">
            <li>Subtitle searching now covers a whole season at once</li>
            <li>The player remembers where you were, even after a crash</li>
            <li>Folders with more than 20,000 files scan roughly twice as fast</li>
          </ul>
          <div className="update__actions">
            <button className="btn btn--accent" onClick={() => setStage('getting')}>
              <IconDownload />
              Get it
            </button>
            <button className="btn btn--quiet" onClick={onDismiss}>Not now</button>
          </div>
        </>
      )}

      {stage === 'getting' && (
        <>
          <p className="update__body">
            Downloading — <Rolling text={String(pct).padStart(3, '0')} />%
          </p>
          <div className="update__bar">
            <div className="progress">
              <div className="progress__fill" style={{ ['--pct' as string]: `${pct}%` }} />
            </div>
          </div>
        </>
      )}

      {stage === 'ready' && (
        <>
          <p className="update__body">
            <IconTick size={13} /> Downloaded. Cassette will restart into the new version.
          </p>
          <div className="update__actions">
            <button className="btn btn--accent" onClick={onDismiss}>Restart now</button>
            <button className="btn btn--quiet" onClick={onDismiss}>Next time I open it</button>
          </div>
        </>
      )}
    </aside>
  )
}
