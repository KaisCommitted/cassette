import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import type {
  EpisodeEntry,
  MetadataSnapshot,
  ProgressRecord,
  SeriesEntry,
  SubtitleScanResult,
  SubtitleScanScope
} from '@shared/types'
import { Backdrop, FrameArt, ProgressSeam } from '../components/Art'
import { ScanLog } from '../components/ScanLog'
import { Icon } from '../../shared/Icon'
import { describeSeasons, episodeLabel, formatRemaining, summariseSeries } from '../select'

export interface SeriesViewProps {
  series: SeriesEntry
  progress: Map<string, ProgressRecord>
  metadata: MetadataSnapshot
  /** The episode on screen most recently, from this series or any other. */
  lastPlayedKey: string | null
  /** Bumped each time the player closes. */
  returns: number
  onBack: () => void
  onPlay: (path: string, key: string) => void
  onResumeSeries: (seriesId: string) => void
  onRefreshProgress: () => void
}

/** What the subtitle panel is showing: a search under way, or its results. */
type SubtitleSearch = { scope: string; results: SubtitleScanResult[] | null } | null

function seasonName(season: number): string {
  return season === 0 ? 'Unsorted' : `Season ${season}`
}

export function SeriesView({
  series,
  progress,
  metadata,
  lastPlayedKey,
  returns,
  onBack,
  onPlay,
  onResumeSeries,
  onRefreshProgress
}: SeriesViewProps) {
  const summary = summariseSeries(series, progress)
  const meta = metadata.series[series.id]
  const title = meta?.title ?? series.title
  const year = meta?.year ?? series.year

  const [season, setSeason] = useState(
    () =>
      series.seasons.find((s) => s.episodes.some((e) => !progress.get(e.file.key)?.finished))
        ?.season ??
      series.seasons[0]?.season ??
      0
  )
  const current = series.seasons.find((s) => s.season === season) ?? series.seasons[0]

  const [search, setSearch] = useState<SubtitleSearch>(null)
  const searching = search !== null && search.results === null

  // Results belong to the series they were asked for.
  useEffect(() => setSearch(null), [series.id])

  const scan = async (scope: SubtitleScanScope, label: string): Promise<void> => {
    setSearch({ scope: label, results: null })
    try {
      const results = await window.cassette.scanSubtitles(scope)
      setSearch({ scope: label, results })
    } catch {
      setSearch({
        scope: label,
        results: [{ key: 'error', label, status: 'failed', detail: 'The search did not finish.' }]
      })
    }
  }

  const toggleWatched = async (key: string, watched: boolean): Promise<void> => {
    await window.cassette.markWatched(key, watched)
    onRefreshProgress()
  }

  /*
   * Coming back from the player puts you on the episode you were watching,
   * even if autoplay carried you into the next season: that season is opened,
   * and its row is scrolled to and focused.
   */
  const focusAfterReturn = useRef<string | null>(null)
  const lastReturns = useRef(returns)
  useEffect(() => {
    if (returns === lastReturns.current) return
    lastReturns.current = returns
    if (!lastPlayedKey) return
    const home = series.seasons.find((s) => s.episodes.some((e) => e.file.key === lastPlayedKey))
    if (!home) return
    setSeason(home.season)
    focusAfterReturn.current = lastPlayedKey
  }, [returns, lastPlayedKey, series.seasons])

  const listRef = useRef<HTMLOListElement>(null)
  useLayoutEffect(() => {
    const key = focusAfterReturn.current
    if (!key || !listRef.current) return
    const row = listRef.current.querySelector<HTMLElement>(
      `[data-return="${CSS.escape(`episode:${key}`)}"]`
    )
    if (!row) return
    focusAfterReturn.current = null
    row.scrollIntoView({ block: 'center' })
    row.focus({ preventScroll: true })
  })

  const tabs = useRef<(HTMLButtonElement | null)[]>([])
  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>, index: number): void => {
    const count = series.seasons.length
    const next =
      e.key === 'ArrowRight'
        ? (index + 1) % count
        : e.key === 'ArrowLeft'
          ? (index - 1 + count) % count
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? count - 1
              : null
    if (next === null) return
    e.preventDefault()
    setSeason(series.seasons[next]!.season)
    tabs.current[next]?.focus()
  }

  const hasPanel = search !== null

  return (
    <div className="page page-series">
      <section className="series-hero">
        <div className="series-hero-art" aria-hidden="true">
          <Backdrop path={meta?.backdropPath ?? null} />
        </div>

        <div className="series-hero-inner">
          <button className="btn btn-ghost btn-sm back-btn" onClick={onBack}>
            <Icon name="back-arrow" />
            Library
          </button>

          <p className="series-meta">
            {year ? `${year}. ` : ''}
            {summary.episodeCount === 1 ? '1 episode' : `${summary.episodeCount} episodes`} across{' '}
            {describeSeasons(summary.seasonNumbers)}
            {summary.watchedCount > 0 && `, ${summary.watchedCount} watched`}.
          </p>
          <h1 className="series-title" tabIndex={-1} data-return="page-start">
            {title}
          </h1>
          {meta?.overview && <p className="series-overview">{meta.overview}</p>}

          <div className="actions series-actions">
            <button className="btn btn-primary" onClick={() => onResumeSeries(series.id)}>
              <Icon name="play" />
              {summary.watchedCount === 0 && !anyStarted(series, progress)
                ? 'Start watching'
                : 'Resume'}
            </button>
            {current && (
              <button
                className="btn btn-ghost"
                disabled={searching}
                onClick={() =>
                  void scan(
                    { kind: 'season', seriesId: series.id, season: current.season },
                    seasonName(current.season)
                  )
                }
              >
                <Icon name="subtitles" />
                Subtitles for {seasonName(current.season).toLowerCase()}
              </button>
            )}
            {series.seasons.length > 1 && (
              <button
                className="btn btn-quiet"
                disabled={searching}
                onClick={() => void scan({ kind: 'series', seriesId: series.id }, 'Every season')}
              >
                Every season
              </button>
            )}
          </div>
        </div>
      </section>

      <div className={hasPanel ? 'series-body has-panel' : 'series-body'}>
        <div className="episodes">
          {series.seasons.length > 1 && (
            <div className="season-tabs" role="tablist" aria-label="Seasons">
              {series.seasons.map((s, i) => {
                const watched = s.episodes.filter((e) => progress.get(e.file.key)?.finished).length
                return (
                  <button
                    key={s.season}
                    ref={(el) => {
                      tabs.current[i] = el
                    }}
                    role="tab"
                    id={`season-tab-${s.season}`}
                    aria-selected={s.season === season}
                    aria-controls="season-panel"
                    tabIndex={s.season === season ? 0 : -1}
                    className="season-tab"
                    onClick={() => setSeason(s.season)}
                    onKeyDown={(e) => onTabKey(e, i)}
                  >
                    {seasonName(s.season)}
                    <span className="season-tab-count">
                      {watched === s.episodes.length ? (
                        <Icon name="tick" />
                      ) : (
                        s.episodes.length
                      )}
                    </span>
                  </button>
                )
              })}
            </div>
          )}

          <ol
            className="episode-list"
            ref={listRef}
            id="season-panel"
            role={series.seasons.length > 1 ? 'tabpanel' : undefined}
            aria-labelledby={series.seasons.length > 1 ? `season-tab-${season}` : undefined}
          >
            {current?.episodes.map((episode) => (
              <EpisodeRow
                key={episode.file.key}
                episode={episode}
                record={progress.get(episode.file.key)}
                metadata={metadata}
                seriesTitle={title}
                last={episode.file.key === lastPlayedKey}
                searching={searching}
                onPlay={() => onPlay(episode.file.path, episode.file.key)}
                onToggleWatched={(watched) => void toggleWatched(episode.file.key, watched)}
                onFindSubtitles={() =>
                  void scan(
                    { kind: 'episode', key: episode.file.key },
                    episodeLabel(episode.label, 'short')
                  )
                }
              />
            ))}
          </ol>
        </div>

        {search && (
          <aside className="subtitle-panel" aria-live="polite" aria-label="Subtitle search">
            <div className="subtitle-panel-head">
              <h2 className="subtitle-panel-title">Subtitles: {search.scope}</h2>
              {!searching && (
                <button
                  className="icon-btn"
                  aria-label="Close subtitle results"
                  title="Close"
                  onClick={() => setSearch(null)}
                >
                  <Icon name="close" />
                </button>
              )}
            </div>
            {searching ? (
              <div className="subtitle-panel-busy">
                <span className="meter" aria-hidden="true">
                  <span className="is-indeterminate" />
                </span>
                <p>Looking for subtitles. Files that already have them are skipped.</p>
              </div>
            ) : (
              <ScanLog results={search.results ?? []} />
            )}
          </aside>
        )}
      </div>
    </div>
  )
}

function anyStarted(series: SeriesEntry, progress: Map<string, ProgressRecord>): boolean {
  return series.seasons.some((s) =>
    s.episodes.some((e) => (progress.get(e.file.key)?.positionSeconds ?? 0) > 30)
  )
}

function EpisodeRow({
  episode,
  record,
  metadata,
  seriesTitle,
  last,
  searching,
  onPlay,
  onToggleWatched,
  onFindSubtitles
}: {
  episode: EpisodeEntry
  record: ProgressRecord | undefined
  metadata: MetadataSnapshot
  seriesTitle: string
  last: boolean
  searching: boolean
  onPlay: () => void
  onToggleWatched: (watched: boolean) => void
  onFindSubtitles: () => void
}) {
  const meta = metadata.episodes[episode.file.key]
  const finished = record?.finished === true
  const fraction =
    record && record.durationSeconds > 0 ? record.positionSeconds / record.durationSeconds : 0
  const started = !finished && fraction > 0 && (record?.positionSeconds ?? 0) > 30
  const fileName = episode.file.path.split(/[\\/]/).pop() ?? ''
  const short = episodeLabel(episode.label, 'short')
  const number = episode.episodes.length > 1 ? episode.episodes.join('–') : String(episode.episodes[0] ?? '')

  const status = finished
    ? 'Watched'
    : started
      ? formatRemaining(record!.durationSeconds - record!.positionSeconds)
      : meta?.runtimeMinutes
        ? `${meta.runtimeMinutes} min`
        : null

  return (
    <li className={last ? 'episode is-last' : 'episode'}>
      <button
        className="episode-main"
        onClick={onPlay}
        data-return={`episode:${episode.file.key}`}
        aria-label={`Play ${short}${meta?.title ? `, ${meta.title}` : ''}`}
      >
        <span className="episode-no" aria-hidden="true">
          {number}
        </span>
        <span className="episode-still">
          <FrameArt
            tmdb={meta?.stillPath ? { path: meta.stillPath, kind: 'still' } : null}
            thumbKey={episode.file.key}
            title={seriesTitle}
          >
            <span className="play-disc" aria-hidden="true">
              <Icon name="play" />
            </span>
            <ProgressSeam fraction={finished ? 1 : fraction} />
          </FrameArt>
        </span>
        <span className="episode-text">
          <span className="episode-title">{meta?.title || short}</span>
          <span className="episode-meta">
            {short}
            {status && <span className={finished ? 'is-watched' : undefined}>{status}</span>}
            {last && <span className="is-last-label">Last played</span>}
          </span>
          <span className="episode-overview">{meta?.overview || fileName}</span>
        </span>
      </button>

      <div className="episode-actions">
        <button
          className={finished ? 'icon-btn watch-toggle is-on' : 'icon-btn watch-toggle'}
          aria-pressed={finished}
          aria-label={finished ? `${short} is watched. Mark as unwatched` : `Mark ${short} as watched`}
          title={finished ? 'Mark as unwatched' : 'Mark as watched'}
          onClick={() => onToggleWatched(!finished)}
        >
          <Icon name="tick" />
        </button>
        <button
          className="icon-btn"
          aria-label={`Find subtitles for ${short}`}
          title="Find subtitles for this episode"
          disabled={searching}
          onClick={onFindSubtitles}
        >
          <Icon name="subtitles" />
        </button>
      </div>
    </li>
  )
}
