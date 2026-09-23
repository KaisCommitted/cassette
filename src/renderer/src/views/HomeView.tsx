import type {
  Library,
  MetadataSnapshot,
  MovieEntry,
  ProgressRecord,
  SeriesEntry
} from '@shared/types'
import { FrameArt, PosterArt, ProgressSeam } from '../components/Art'
import { Icon } from '../../shared/Icon'
import { formatTime } from '../../overlay/format'
import {
  continueWatching,
  describeSeasons,
  episodeLabel,
  filterLibrary,
  formatRemaining,
  summariseSeries,
  type ResumeItem
} from '../select'

/** Which part of the shelf is showing. */
export type Scope = 'all' | 'series' | 'films'

export interface HomeViewProps {
  library: Library
  progress: Map<string, ProgressRecord>
  metadata: MetadataSnapshot
  query: string
  scope: Scope
  onScopeChange: (scope: Scope) => void
  onClearQuery: () => void
  onOpenSeries: (id: string) => void
  onPlay: (path: string, key: string) => void
  onResumeSeries: (seriesId: string) => void
  onChooseFolder: () => void
  onRescan: () => void
  scanning: boolean
  minimumMinutes: number | null
}

export function HomeView(props: HomeViewProps) {
  const { library, progress, metadata, query, scope } = props
  const resume = continueWatching(library, progress)
  const searching = query.trim() !== ''
  const { series, movies } = filterLibrary(library, query)

  if (library.series.length === 0 && library.movies.length === 0) {
    return <EmptyLibrary {...props} />
  }

  const resumeItem = (item: ResumeItem): void => {
    if (item.seriesId) props.onResumeSeries(item.seriesId)
    else props.onPlay(item.path, item.key)
  }

  // Search always looks across the whole shelf: a filter left on Films should
  // not make a series you typed the name of look missing.
  const showSeries = searching || scope !== 'films'
  const showFilms = searching || scope !== 'series'
  const nothingFound = searching && series.length === 0 && movies.length === 0

  return (
    <div className="page page-home">
      {searching ? (
        <header className="results-head">
          <h1 className="results-title" tabIndex={-1} data-return="page-start">
            {nothingFound
              ? `Nothing matches “${query.trim()}”`
              : `Results for “${query.trim()}”`}
          </h1>
          {!nothingFound && (
            <p className="results-count">{countLine(series.length, movies.length)}</p>
          )}
        </header>
      ) : (
        <>
          {resume[0] && (
            <ResumeHero
              item={resume[0]}
              library={library}
              progress={progress}
              metadata={metadata}
              onResume={() => resumeItem(resume[0]!)}
              onOpenSeries={props.onOpenSeries}
            />
          )}

          {resume.length > 1 && (
            <section className="shelf" aria-labelledby="on-the-go">
              <div className="shelf-head">
                <h2 className="shelf-title" id="on-the-go">
                  Also on the go
                </h2>
              </div>
              <div className="still-grid">
                {resume.slice(1).map((item) => (
                  <ResumeTile
                    key={item.key}
                    item={item}
                    metadata={metadata}
                    onClick={() => resumeItem(item)}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Worth a control only once there is enough on the shelf to scroll past. */}
          {library.series.length > 0 &&
            library.movies.length > 0 &&
            library.series.length + library.movies.length > 12 && (
            <ScopeBar
              scope={scope}
              seriesCount={library.series.length}
              filmCount={library.movies.length}
              onChange={props.onScopeChange}
            />
          )}
        </>
      )}

      {nothingFound && (
        <div className="empty-state">
          <Icon name="search" className="empty-icon" />
          <p className="empty-text">
            Search looks at titles, and at years for films. Try part of a title.
          </p>
          <button className="btn btn-ghost" onClick={props.onClearQuery}>
            Clear search
          </button>
        </div>
      )}

      {showSeries && series.length > 0 && (
        <section className="shelf" aria-labelledby="shelf-series">
          <div className="shelf-head">
            <h2 className="shelf-title" id="shelf-series">
              Series
            </h2>
            <span className="shelf-count">
              {series.length === 1 ? '1 series' : `${series.length} series`}
            </span>
          </div>
          <div className="poster-grid">
            {series.map((entry) => (
              <SeriesTile
                key={entry.id}
                entry={entry}
                progress={progress}
                metadata={metadata}
                onClick={() => props.onOpenSeries(entry.id)}
              />
            ))}
          </div>
        </section>
      )}

      {showFilms && movies.length > 0 && (
        <section className="shelf" aria-labelledby="shelf-films">
          <div className="shelf-head">
            <h2 className="shelf-title" id="shelf-films">
              Films
            </h2>
            <span className="shelf-count">
              {movies.length === 1 ? '1 film' : `${movies.length} films`}
            </span>
          </div>
          <div className="poster-grid">
            {movies.map((movie) => (
              <FilmTile
                key={movie.id}
                movie={movie}
                record={progress.get(movie.file.key)}
                metadata={metadata}
                onClick={() => props.onPlay(movie.file.path, movie.file.key)}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function countLine(series: number, films: number): string {
  const parts: string[] = []
  if (series > 0) parts.push(series === 1 ? '1 series' : `${series} series`)
  if (films > 0) parts.push(films === 1 ? '1 film' : `${films} films`)
  return parts.join(' and ')
}

/**
 * What you were last part-way through, large, because that is usually what
 * you came back for.
 */
function ResumeHero({
  item,
  library,
  progress,
  metadata,
  onResume,
  onOpenSeries
}: {
  item: ResumeItem
  library: Library
  progress: Map<string, ProgressRecord>
  metadata: MetadataSnapshot
  onResume: () => void
  onOpenSeries: (id: string) => void
}) {
  const movieId = item.seriesId
    ? undefined
    : library.movies.find((m) => m.file.key === item.key)?.id
  const meta = item.seriesId
    ? metadata.series[item.seriesId]
    : movieId
      ? metadata.movies[movieId]
      : undefined
  const episode = metadata.episodes[item.key]
  const record = progress.get(item.key)
  const title = meta?.title ?? item.title
  const overview = episode?.overview || meta?.overview
  const still = episode?.stillPath
    ? { path: episode.stillPath, kind: 'still' as const }
    : meta?.backdropPath
      ? { path: meta.backdropPath, kind: 'backdrop' as const }
      : null

  return (
    <section className="resume" aria-labelledby="resume-title">
      <div className="resume-head">
        <div>
          <p className="resume-kicker">Still watching</p>
          <h1 className="resume-title" id="resume-title" tabIndex={-1} data-return="page-start">
            {title}
          </h1>
        </div>
        {record && (
          <p className="counter-inline" aria-label="Position">
            <span>{formatTime(record.positionSeconds)}</span>
            <span className="counter-of">of {formatTime(record.durationSeconds)}</span>
          </p>
        )}
      </div>

      <div className="resume-card">
        <button
          className="resume-art"
          onClick={onResume}
          aria-label={`Resume ${title}`}
          data-return={`resume:${item.key}`}
          tabIndex={-1}
        >
          <FrameArt tmdb={still} thumbKey={item.key} title={title}>
            <span className="play-disc" aria-hidden="true">
              <Icon name="play" />
            </span>
          </FrameArt>
        </button>

        <div className="resume-body">
          <p className="resume-where">
            {item.seriesId ? episodeLabel(item.detail, 'long') : item.detail}
          </p>
          {episode?.title && <h2 className="resume-episode">{episode.title}</h2>}
          {overview && <p className="resume-overview">{overview}</p>}

          <div className="resume-foot">
            <div className="resume-progress">
              <span className="bar" aria-hidden="true">
                <span style={{ width: `${Math.min(100, item.fraction * 100)}%` }} />
              </span>
              <span className="resume-left">{formatRemaining(item.remainingSeconds)}</span>
            </div>
            <div className="actions">
              <button className="btn btn-primary" onClick={onResume}>
                <Icon name="play" />
                Resume
              </button>
              {item.seriesId && (
                <button className="btn btn-ghost" onClick={() => onOpenSeries(item.seriesId!)}>
                  <Icon name="library" />
                  All episodes
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function ResumeTile({
  item,
  metadata,
  onClick
}: {
  item: ResumeItem
  metadata: MetadataSnapshot
  onClick: () => void
}) {
  const episode = metadata.episodes[item.key]
  const meta = item.seriesId ? metadata.series[item.seriesId] : undefined
  const title = meta?.title ?? item.title
  const still = episode?.stillPath
    ? { path: episode.stillPath, kind: 'still' as const }
    : meta?.backdropPath
      ? { path: meta.backdropPath, kind: 'backdrop' as const }
      : null
  const where = item.seriesId ? episodeLabel(item.detail, 'short') : item.detail

  return (
    <button className="tile" onClick={onClick} data-return={`resume:${item.key}`}>
      <span className="tile-art">
        <FrameArt tmdb={still} thumbKey={item.key} title={title}>
          <span className="play-disc" aria-hidden="true">
            <Icon name="play" />
          </span>
          <ProgressSeam fraction={item.fraction} />
        </FrameArt>
      </span>
      <span className="tile-caption">{title}</span>
      <span className="tile-sub">
        {episode?.title ? `${where}, ${episode.title}` : where}
      </span>
      <span className="tile-sub tile-sub-quiet">{formatRemaining(item.remainingSeconds)}</span>
    </button>
  )
}

function SeriesTile({
  entry,
  progress,
  metadata,
  onClick
}: {
  entry: SeriesEntry
  progress: Map<string, ProgressRecord>
  metadata: MetadataSnapshot
  onClick: () => void
}) {
  const summary = summariseSeries(entry, progress)
  const meta = metadata.series[entry.id]
  const title = meta?.title ?? entry.title
  const complete = summary.watchedCount === summary.episodeCount && summary.episodeCount > 0
  const seasons = summary.seasonNumbers.length

  return (
    <button className="tile" onClick={onClick} data-return={`series:${entry.id}`}>
      <span className="tile-art">
        <PosterArt
          posterPath={meta?.posterPath ?? null}
          thumbKey={summary.thumbKey}
          title={title}
          detail={seasons === 1 ? '1 season' : `${seasons} seasons`}
        >
          {complete && (
            <span className="watched" title="Watched">
              <Icon name="tick" />
            </span>
          )}
        </PosterArt>
      </span>
      <Caption title={title} rating={meta?.rating ?? null} />
      <span className="tile-sub">
        {summary.episodeCount === 1 ? '1 episode' : `${summary.episodeCount} episodes`},{' '}
        {describeSeasons(summary.seasonNumbers)}
      </span>
      {complete && <span className="visually-hidden">Watched</span>}
    </button>
  )
}

function FilmTile({
  movie,
  record,
  metadata,
  onClick
}: {
  movie: MovieEntry
  record: ProgressRecord | undefined
  metadata: MetadataSnapshot
  onClick: () => void
}) {
  const meta = metadata.movies[movie.id]
  const title = meta?.title ?? movie.title
  const year = meta?.year ?? movie.year
  const fraction =
    record && !record.finished && record.durationSeconds > 0
      ? record.positionSeconds / record.durationSeconds
      : 0

  return (
    <button className="tile" onClick={onClick} data-return={`film:${movie.file.key}`}>
      <span className="tile-art">
        <PosterArt
          posterPath={meta?.posterPath ?? null}
          thumbKey={movie.file.key}
          title={title}
          detail={year ? String(year) : null}
        >
          {record?.finished && (
            <span className="watched" title="Watched">
              <Icon name="tick" />
            </span>
          )}
          <span className="play-disc" aria-hidden="true">
            <Icon name="play" />
          </span>
          <ProgressSeam fraction={fraction} />
        </PosterArt>
      </span>
      <Caption title={title} rating={meta?.rating ?? null} />
      <span className="tile-sub">
        {year ?? 'Year unknown'}
        {fraction > 0 && record
          ? `, ${formatRemaining(record.durationSeconds - record.positionSeconds)}`
          : ''}
      </span>
      {record?.finished && <span className="visually-hidden">Watched</span>}
    </button>
  )
}

/**
 * The title under a poster, with TMDB's rating beside it rather than printed
 * over the artwork, where it would sit on the poster's own lettering.
 */
function Caption({ title, rating }: { title: string; rating: number | null }) {
  return (
    <span className="tile-caption">
      <span className="tile-caption-text">{title}</span>
      {rating ? (
        <span className="rating" title="TMDB rating">
          {rating.toFixed(1)}
        </span>
      ) : null}
    </span>
  )
}

function ScopeBar({
  scope,
  seriesCount,
  filmCount,
  onChange
}: {
  scope: Scope
  seriesCount: number
  filmCount: number
  onChange: (scope: Scope) => void
}) {
  const options: { id: Scope; label: string; count: number }[] = [
    { id: 'all', label: 'Everything', count: seriesCount + filmCount },
    { id: 'series', label: 'Series', count: seriesCount },
    { id: 'films', label: 'Films', count: filmCount }
  ]
  return (
    <div className="scope-bar">
      <div className="segmented" role="group" aria-label="Show">
        {options.map((option) => (
          <button
            key={option.id}
            className="segment"
            aria-pressed={scope === option.id}
            onClick={() => onChange(option.id)}
          >
            {option.label}
            <span className="segment-count">{option.count}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

/** A scan that found nothing is a question about the folder, not a dead end. */
function EmptyLibrary({
  library,
  onChooseFolder,
  onRescan,
  scanning,
  minimumMinutes
}: HomeViewProps) {
  return (
    <div className="page">
      <div className="empty-state empty-state-tall">
        <Icon name="folder" className="empty-icon" />
        <h1 className="empty-title" tabIndex={-1} data-return="page-start">
          No films or series in this folder yet
        </h1>
        <p className="empty-text">
          Cassette found no video files it could use
          {minimumMinutes ? `. Anything shorter than ${minimumMinutes} minutes is left out, so trailers and samples stay off the shelf` : ''}
          . Add files and rescan, or point it at another folder.
        </p>
        <div className="actions">
          <button className="btn btn-primary" onClick={onChooseFolder}>
            <Icon name="folder" />
            Choose another folder
          </button>
          <button className="btn btn-ghost" onClick={onRescan} disabled={scanning}>
            <Icon name="rescan" />
            {scanning ? 'Scanning…' : 'Rescan'}
          </button>
        </div>
        <p className="empty-note">Last scanned {new Date(library.scannedAt).toLocaleString()}</p>
      </div>
    </div>
  )
}
