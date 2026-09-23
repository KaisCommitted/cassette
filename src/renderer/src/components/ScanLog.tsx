import type { SubtitleScanResult, SubtitleSearchOptions } from '@shared/types'
import { Icon } from '../../shared/Icon'

const WORDING: Record<SubtitleScanResult['status'], string> = {
  'has-embedded': 'Subtitles already in the file',
  'already-had-one': 'Subtitle file already there',
  downloaded: 'Downloaded',
  'nothing-found': 'Nothing found',
  failed: 'Failed'
}

const TONE: Record<SubtitleScanResult['status'], string> = {
  'has-embedded': 'had',
  'already-had-one': 'had',
  downloaded: 'ok',
  'nothing-found': 'none',
  failed: 'bad'
}

export interface ScanLogProps {
  results: SubtitleScanResult[]
  /** Keys of rows with a follow-up search running. */
  busy: Set<string>
  /** Searches one file again, differently. */
  onSearchAgain: (key: string, options: SubtitleSearchOptions) => void
}

/**
 * What a subtitle search found, one row per file, each with its next step.
 *
 * A file that already had subtitles can be searched anyway — the ones inside
 * a file are often not the ones you want. A file SubDL had nothing for can be
 * tried on OpenSubtitles, one at a time, because its free quota is a handful
 * of downloads a day and a whole season would spend it on nothing.
 */
export function ScanLog({ results, busy, onSearchAgain }: ScanLogProps) {
  if (results.length === 0) {
    return <p className="scan-summary">Nothing in that selection to look up.</p>
  }

  const downloaded = results.filter((r) => r.status === 'downloaded').length
  const had = results.filter(
    (r) => r.status === 'already-had-one' || r.status === 'has-embedded'
  ).length
  const missing = results.filter((r) => r.status === 'nothing-found').length
  const failed = results.filter((r) => r.status === 'failed').length

  return (
    <>
      <p className="scan-summary">
        {downloaded > 0 && `Downloaded ${downloaded}. `}
        {had > 0 && `${had} already had subtitles. `}
        {missing > 0 && `${missing} still without. `}
        {failed > 0 && `${failed} failed.`}
      </p>
      <ul className="scan-log">
        {results.map((result) => {
          const running = busy.has(result.key)
          const next: { label: string; options: SubtitleSearchOptions } | null =
            result.status === 'has-embedded' || result.status === 'already-had-one'
              ? { label: 'Search anyway', options: { force: true } }
              : result.status === 'nothing-found' && result.canTryOpenSubtitles
                ? { label: 'Try OpenSubtitles', options: { force: true, provider: 'opensubtitles' } }
                : result.status === 'failed'
                  ? { label: 'Try again', options: { force: true } }
                  : null
          return (
            <li className={`scan-row tone-${TONE[result.status]}`} key={result.key}>
              <span className="scan-row-mark" aria-hidden="true">
                {result.status === 'downloaded' || TONE[result.status] === 'had' ? (
                  <Icon name="tick" />
                ) : result.status === 'failed' ? (
                  <Icon name="warning" />
                ) : (
                  <Icon name="minus" />
                )}
              </span>
              <span className="scan-row-label">{result.label}</span>
              <span className="scan-row-status" title={result.detail}>
                {running ? 'Searching…' : WORDING[result.status]}
                {!running && result.detail && result.status !== 'has-embedded' && (
                  <span className="scan-row-detail">{result.detail}</span>
                )}
                {next && !running && (
                  <button
                    className="scan-row-action"
                    onClick={() => onSearchAgain(result.key, next.options)}
                  >
                    {next.label}
                  </button>
                )}
              </span>
            </li>
          )
        })}
      </ul>
    </>
  )
}
