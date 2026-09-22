import type { SubtitleScanResult } from '@shared/types'

const WORDING: Record<SubtitleScanResult['status'], string> = {
  'has-embedded': 'Subtitles already in the file',
  'already-had-one': 'Subtitle file already there',
  downloaded: 'Downloaded',
  'nothing-found': 'Nothing found',
  failed: 'Failed'
}

const TONE: Record<SubtitleScanResult['status'], string> = {
  'has-embedded': '',
  'already-had-one': '',
  downloaded: 'ok',
  'nothing-found': '',
  failed: 'bad'
}

export function ScanLog({ results }: { results: SubtitleScanResult[] }) {
  if (results.length === 0) {
    return <p className="empty">Nothing in that selection to look up.</p>
  }

  const downloaded = results.filter((r) => r.status === 'downloaded').length
  const had = results.filter(
    (r) => r.status === 'already-had-one' || r.status === 'has-embedded'
  ).length
  const missing = results.filter((r) => r.status === 'nothing-found').length

  return (
    <>
      <p className="field-help" style={{ marginTop: 14 }}>
        {downloaded > 0 && `Downloaded ${downloaded}. `}
        {had > 0 && `${had} already had subtitles. `}
        {missing > 0 && `${missing} still without. `}
      </p>
      <div className="scan-log">
        {results.map((result) => (
          <div className="scan-row" key={result.key}>
            <span>{result.label}</span>
            <span className={`status ${TONE[result.status]}`} title={result.detail}>
              {WORDING[result.status]}
            </span>
          </div>
        ))}
      </div>
    </>
  )
}
