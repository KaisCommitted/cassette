import type { Library, ProgressRecord } from '@shared/types'
import { Still } from '../components/Still'
import {
  continueWatching,
  describeSeasons,
  filterLibrary,
  formatRemaining,
  summariseSeries
} from '../select'

export interface HomeViewProps {
  library: Library
  progress: Map<string, ProgressRecord>
  query: string
  onQueryChange: (q: string) => void
  onOpenSeries: (id: string) => void
  onPlay: (path: string, key: string) => void
}

export function HomeView({
  library,
  progress,
  query,
  onQueryChange,
  onOpenSeries,
  onPlay
}: HomeViewProps) {
  const resume = continueWatching(library, progress)
  const { series, movies } = filterLibrary(library, query)
  const searching = query.trim() !== ''
  const nothingFound = searching && series.length === 0 && movies.length === 0

  return (
    <>
      <h1 className="page-title">Your library</h1>
      <p className="page-sub">
        {library.series.length} series and {library.movies.length} films on this machine.
      </p>

      <input
        className="search"
        type="search"
        value={query}
        placeholder="Search by title"
        onChange={(e) => onQueryChange(e.target.value)}
      />

      {nothingFound && <p className="empty">No title matches “{query.trim()}”.</p>}

      {!searching && resume.length > 0 && (
        <>
          <h2 className="section-title">Pick up where you left off</h2>
          <div className="grid wide">
            {resume.map((item) => (
              <button
                key={item.key}
                className="card"
                onClick={() =>
                  item.seriesId
                    ? void window.cassette.resumeSeries(item.seriesId)
                    : onPlay(item.path, item.key)
                }
              >
                <Still thumbKey={item.key} alt={item.title} fraction={item.fraction} />
                <div className="card-body">
                  <div className="card-name">{item.title}</div>
                  <div className="card-meta">
                    {item.detail}, {formatRemaining(item.remainingSeconds)}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      {series.length > 0 && (
        <>
          <h2 className="section-title">Series</h2>
          <div className="grid tight">
            {series.map((entry) => {
              const summary = summariseSeries(entry, progress)
              const complete =
                summary.watchedCount === summary.episodeCount && summary.episodeCount > 0
              return (
                <button
                  key={entry.id}
                  className="card"
                  onClick={() => onOpenSeries(entry.id)}
                >
                  <Still
                    thumbKey={summary.thumbKey}
                    alt={entry.title}
                    watched={complete}
                  />
                  <div className="card-body">
                    <div className="card-name">{entry.title}</div>
                    <div className="card-meta">
                      {summary.episodeCount} episodes across{' '}
                      {describeSeasons(summary.seasonNumbers)}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </>
      )}

      {movies.length > 0 && (
        <>
          <h2 className="section-title">Films</h2>
          <div className="grid tight">
            {movies.map((movie) => {
              const record = progress.get(movie.file.key)
              return (
                <button
                  key={movie.id}
                  className="card"
                  onClick={() => onPlay(movie.file.path, movie.file.key)}
                >
                  <Still
                    thumbKey={movie.file.key}
                    alt={movie.title}
                    watched={record?.finished}
                    fraction={
                      record && !record.finished && record.durationSeconds > 0
                        ? record.positionSeconds / record.durationSeconds
                        : undefined
                    }
                  />
                  <div className="card-body">
                    <div className="card-name">{movie.title}</div>
                    <div className="card-meta">{movie.year ?? 'Year unknown'}</div>
                  </div>
                </button>
              )
            })}
          </div>
        </>
      )}
    </>
  )
}
