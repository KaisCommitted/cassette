/* ===========================================================================
   Cassette — first run.
   One promise, one button. Then the scan, which is the spool mark turning
   and a count rolling up. Nothing to sign up for, nothing to agree to.
   =========================================================================== */
import React, { useEffect, useState } from 'react'
import { SpoolMark, Wordmark, Rolling, IconFolder, IconTick } from './icons'
import { SCAN_PATHS, MEDIA_FOLDER } from './data'

type Stage = 'choose' | 'scanning' | 'done'

export default function FirstRun({
  startScanning = false,
  onDone,
}: { startScanning?: boolean; onDone: () => void }) {
  const [stage, setStage] = useState<Stage>(startScanning ? 'scanning' : 'choose')
  const [count, setCount] = useState(0)
  const [pathIndex, setPathIndex] = useState(0)

  useEffect(() => {
    if (stage !== 'scanning') return
    const tick = window.setInterval(() => {
      setCount((n) => {
        const next = n + 7 + Math.floor(Math.random() * 23)
        if (next >= 318) {
          window.clearInterval(tick)
          window.setTimeout(() => setStage('done'), 500)
          return 318
        }
        return next
      })
      setPathIndex((i) => (i + 1) % SCAN_PATHS.length)
    }, 340)
    return () => window.clearInterval(tick)
  }, [stage])

  useEffect(() => {
    if (stage !== 'done') return
    const t = window.setTimeout(onDone, 1100)
    return () => window.clearTimeout(t)
  }, [stage, onDone])

  return (
    <div className="firstrun">
      <div className="firstrun__inner">
        <span className="firstrun__mark">
          <SpoolMark size={64} running={stage === 'scanning'} />
        </span>
        <div className="firstrun__word">
          <Wordmark />
        </div>

        {stage === 'choose' && (
          <>
            <p className="firstrun__line">
              Cassette reads the films and programmes already on this computer. Nothing is
              uploaded, nothing is sent anywhere, and there is no account to make.
            </p>
            <button className="btn btn--accent btn--lg" onClick={() => setStage('scanning')}>
              <IconFolder size={16} />
              Choose folder
            </button>
            <p className="firstrun__note">You can add more folders later, in Settings.</p>
          </>
        )}

        {stage === 'scanning' && (
          <div className="firstrun__scan">
            <p className="firstrun__count">
              <Rolling text={String(count).padStart(3, '0')} />
              <span className="faint" style={{ fontSize: 'var(--t-15)' }}>files</span>
            </p>
            <p className="firstrun__what">{SCAN_PATHS[pathIndex]}</p>
            <p className="firstrun__note">Reading {MEDIA_FOLDER}. This does not move or change anything.</p>
          </div>
        )}

        {stage === 'done' && (
          <div className="firstrun__scan fade">
            <p className="firstrun__count">
              <Rolling text="318" />
              <span className="faint" style={{ fontSize: 'var(--t-15)' }}>files</span>
            </p>
            <p className="firstrun__what" style={{ color: 'var(--accent)' }}>
              <IconTick size={13} /> Shelf ready
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
