import { useState } from 'react'
import type { ProgressRecord, SeriesEntry } from '@shared/types'
import { Still } from '../components/Still'
import { describeSeasons, formatRemaining, summariseSeries } from '../select'

export interface SeriesViewProps {
  series: SeriesEntry
  progress: Map<string, ProgressRecord>
  onBack: () => void
  onPlay: (path: string, key: string) => void
}

export function SeriesView({ series, progress, onBack, onPlay }: SeriesViewProps) {
  const summary = summariseSeries(series, progress)
  const [season, setSeason] = useState(
    () => series.seasons.find((s) => s.episodes.some((e) => !progress.get(e.file.key)?.finished))
      ?.season ?? series.seasons[0]?.season ?? 0
  )

  const current = series.seasons.find((s) => s.season === season) ?? series.seasons[0]

  return (
    <>
      <button className="back" onClick={onBack}>
        Back to library
      </button>

      <h1 className="page-title">
        {series.title}
        {series.year ? ` (${series.year})` : ''}
      </h1>
      <p className="page-sub">
        {summary.episodeCount} episodes across {describeSeasons(summary.seasonNumbers)}
        {summary.watchedCount > 0 && `, ${summary.watchedCount} watched`}.
      </p>

      {series.seasons.length > 1 && (
        <div className="season-tabs" role="tablist">
          {series.seasons.map((s) => (
            <button
              key={s.season}
              role="tab"
              className="season-tab"
              aria-selected={s.season === season}
              onClick={() => setSeason(s.season)}
            >
              {s.season === 0 ? 'Unsorted' : `Season ${s.season}`}
            </button>
          ))}
        </div>
      )}

      {current?.episodes.map((episode) => {
        const record = progress.get(episode.file.key)
        const fraction =
          record && record.durationSeconds > 0
            ? record.positionSeconds / record.durationSeconds
            : 0
        const fileName = episode.file.path.split(/[\\/]/).pop() ?? ''

        return (
          <button
            key={episode.file.key}
            className="episode"
            onClick={() => onPlay(episode.file.path, episode.file.key)}
          >
            <div className="still">
              <Still
                thumbKey={episode.file.key}
                alt={episode.label}
                fraction={record?.finished ? 0 : fraction}
              />
            </div>
            <div>
              <div className="no">{episode.label}</div>
              <div className="file">{fileName}</div>
            </div>
            <div className="right">
              {record?.finished
                ? 'Watched'
                : record && fraction > 0
                  ? formatRemaining(record.durationSeconds - record.positionSeconds)
                  : ''}
            </div>
          </button>
        )
      })}
    </>
  )
}
