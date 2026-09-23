import type { ScanProgressInfo } from '@shared/types'
import { Icon, Logo } from '../../shared/Icon'

export interface SetupViewProps {
  scanning: boolean
  /** The folder being read, once one has been chosen. */
  folder: string | null
  progress: ScanProgressInfo | null
  onChoose: () => void
  onCancel: () => void
}

/**
 * First run: one question, then the first scan.
 *
 * A first scan opens every file to read its length, so on a big folder it
 * takes long enough to need a proper screen of its own — a counter that
 * visibly moves, what it is working through, and a way to stop. When it
 * finishes the library simply replaces this screen.
 */
export function SetupView({ scanning, folder, progress, onChoose, onCancel }: SetupViewProps) {
  const pct = progress && progress.total > 0 ? (progress.done / progress.total) * 100 : null

  return (
    <div className="setup">
      <div className="setup-inner">
        <Logo variant="mark" className="setup-mark" />

        {!scanning ? (
          <>
            <h1 className="setup-title">Where do you keep your films and series?</h1>
            <p className="setup-text">
              Cassette reads one folder on this computer and sorts what is in it into
              series, seasons and films. Nothing is uploaded and there is no account.
            </p>
            <button className="btn btn-primary btn-lg" onClick={onChoose} autoFocus>
              <Icon name="folder" />
              Choose folder
            </button>
            <p className="setup-note">
              Subfolders are included. You can change the folder later in Settings.
            </p>
          </>
        ) : (
          <div className="setup-scan" role="status" aria-live="polite">
            <h1 className="setup-title">Reading your folder</h1>
            {folder && <p className="setup-folder">{folder}</p>}

            <div className="counter">
              <span className="counter-digits">
                {String(progress?.done ?? 0).padStart(4, '0')}
              </span>
              <span className="counter-label">
                {progress ? `of ${progress.total} files checked` : 'files checked'}
              </span>
            </div>

            <div className="meter" aria-hidden="true">
              <span
                className={pct === null ? 'is-indeterminate' : undefined}
                style={pct === null ? undefined : { width: `${pct}%` }}
              />
            </div>

            <p className="setup-text">
              {progress
                ? 'Each file is opened once to read its length, so short clips and trailers can be left out. Later scans skip files already checked.'
                : 'Looking through the folders for video files.'}
            </p>

            <button className="btn btn-ghost" onClick={onCancel}>
              Stop
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
