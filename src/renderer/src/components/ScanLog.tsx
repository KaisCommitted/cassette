import type { SubtitleScanResult } from '@shared/types'
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

export function ScanLog({ results }: { results: SubtitleScanResult[] }) {
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
        {results.map((result) => (
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
              {WORDING[result.status]}
              {result.detail && result.status === 'failed' && (
                <span className="scan-row-detail">{result.detail}</span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </>
  )
}
