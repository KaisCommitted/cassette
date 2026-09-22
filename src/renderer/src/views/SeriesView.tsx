import { useEffect, useState } from 'react'
import type {
  MetadataSnapshot,
  ProgressRecord,
  SeriesEntry,
  SubtitleScanResult
} from '@shared/types'
import { Art, PlayOverlay, artUrl } from '../components/Art'
import { ScanLog } from '../components/ScanLog'
import { describeSeasons, formatRemaining, summariseSeries } from '../select'

export interface SeriesViewProps {
  series: SeriesEntry
  progress: Map<string, ProgressRecord>
  metadata: MetadataSnapshot
  onBack: () => void
  onPlay: (path: string, key: string) => void
  onRefreshProgress: () => void
}

export function SeriesView({
  series,
  progress,
  metadata,
  onBack,
  onPlay,
  onRefreshProgress
}: SeriesViewProps) {
  const summary = summariseSeries(series, progress)
  const seriesMeta = metadata.series[series.id]
  const [season, setSeason] = useState(
    () =>
      series.seasons.find((s) =>
        s.episodes.some((e) => !progress.get(e.file.key)?.finished)
      )?.season ??
      series.seasons[0]?.season ??
      0
  )
  const [scanning, setScanning] = useState(false)
  const [scanResults, setScanResults] = useState<SubtitleScanResult[] | null>(null)

  const current = series.seasons.find((s) => s.season === season) ?? series.seasons[0]

  // The season tabs should follow the library when progress changes underneath.
  useEffect(() => setScanResults(null), [series.id])

  const scan = async (scope: Parameters<typeof window.cassette.scanSubtitles>[0]) => {
    setScanning(true)
    setScanResults(null)
    try {
      setScanResults(await window.cassette.scanSubtitles(scope))
    } finally {
      setScanning(false)
    }
  }

  const toggleWatched = async (key: string, watched: boolean): Promise<void> => {
    await window.cassette.markWatched(key, watched)
    onRefreshProgress()
  }

  return (
    <>
      <section className="series-hero">
        {seriesMeta?.backdropPath && (
          <div
            className="hero-art"
            style={{ backgroundImage: `url("${artUrl(seriesMeta.backdropPath, 'backdrop')}")` }}
          />
        )}
        <div className="inner">
          <button className="back" onClick={onBack}>
            Back to library
          </button>
          <h1 className="page-title">
            {seriesMeta?.title ?? series.title}
            {series.year ? ` (${series.year})` : ''}
          </h1>
          <p className="page-sub" style={{ marginBottom: 12 }}>
            {summary.episodeCount} episodes across {describeSeasons(summary.seasonNumbers)}
            {summary.watchedCount > 0 && `, ${summary.watchedCount} watched`}.
          </p>
          {seriesMeta?.overview && (
            <p className="hero-overview" style={{ marginBottom: 0 }}>{seriesMeta.overview}</p>
          )}
        </div>
      </section>

      <div className="series-actions">
        <button
          className="btn primary"
          onClick={() => void window.cassette.resumeSeries(series.id)}
        >
          {summary.watchedCount === 0 ? 'Start watching' : 'Resume'}
        </button>
        <button
          className="btn"
          disabled={scanning}
          onClick={() => void scan({ kind: 'series', seriesId: series.id })}
        >
          {scanning ? 'Looking…' : 'Find subtitles for the series'}
        </button>
        {current && (
          <button
            className="btn"
            disabled={scanning}
            onClick={() =>
              void scan({ kind: 'season', seriesId: series.id, season: current.season })
            }
          >
            Find subtitles for season {current.season}
          </button>
        )}
      </div>

      {scanResults && <ScanLog results={scanResults} />}

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
        const finished = record?.finished === true
        const fraction =
          record && record.durationSeconds > 0
            ? record.positionSeconds / record.durationSeconds
            : 0
        const fileName = episode.file.path.split(/[\\/]/).pop() ?? ''
        const meta = metadata.episodes[episode.file.key]

        return (
          <div
            key={episode.file.key}
            className="episode"
            role="button"
            tabIndex={0}
            onClick={() => onPlay(episode.file.path, episode.file.key)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onPlay(episode.file.path, episode.file.key)
            }}
          >
            <div className="still">
              <Art
                tmdbPath={meta?.stillPath ?? null}
                kind="still"
                thumbKey={episode.file.key}
                alt={episode.label}
              />
              <PlayOverlay />
              {(fraction > 0 || finished) && (
                <div
                  className={finished ? 'card-progress complete' : 'card-progress'}
                  style={{ width: `${finished ? 100 : fraction * 100}%` }}
                />
              )}
            </div>
            <div>
              <div className="no">
                {episode.label}
                {meta?.title ? <span className="ep-title">{meta.title}</span> : null}
              </div>
              <div className="file">{meta?.overview || fileName}</div>
            </div>
            <div
              className="right"
              style={{ display: 'flex', alignItems: 'center', gap: 10 }}
            >
              <span>
                {finished
                  ? 'Watched'
                  : fraction > 0
                    ? formatRemaining(record!.durationSeconds - record!.positionSeconds)
                    : ''}
              </span>
              <button
                className="btn"
                style={{ padding: '4px 9px', fontSize: 12 }}
                onClick={(e) => {
                  e.stopPropagation()
                  void toggleWatched(episode.file.key, !finished)
                }}
              >
                {finished ? 'Unwatch' : 'Mark watched'}
              </button>
              <button
                className="btn"
                style={{ padding: '4px 9px', fontSize: 12 }}
                disabled={scanning}
                onClick={(e) => {
                  e.stopPropagation()
                  void scan({ kind: 'episode', key: episode.file.key })
                }}
              >
                Subtitles
              </button>
            </div>
          </div>
        )
      })}
    </>
  )
}
