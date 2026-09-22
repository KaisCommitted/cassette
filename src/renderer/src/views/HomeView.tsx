import type { Library, MetadataSnapshot, ProgressRecord } from '@shared/types'
import { Art, PlayOverlay, artUrl } from '../components/Art'
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
  metadata: MetadataSnapshot
  /** Title currently being fetched, or null when idle. */
  metadataBusy: string | null
  query: string
  onQueryChange: (q: string) => void
  onOpenSeries: (id: string) => void
  onPlay: (path: string, key: string) => void
}

export function HomeView({
  library,
  progress,
  metadata,
  metadataBusy,
  query,
  onQueryChange,
  onOpenSeries,
  onPlay
}: HomeViewProps) {
  const resume = continueWatching(library, progress)
  const { series, movies } = filterLibrary(library, query)
  const searching = query.trim() !== ''
  const nothingFound = searching && series.length === 0 && movies.length === 0

  // The hero is whatever you were last part-way through.
  const lead = resume[0]
  const leadSeries = lead?.seriesId
    ? library.series.find((s) => s.id === lead.seriesId)
    : null
  const leadMovieId = lead
    ? library.movies.find((m) => m.file.key === lead.key)?.id
    : undefined
  const leadMeta = lead?.seriesId
    ? metadata.series[lead.seriesId]
    : leadMovieId
      ? metadata.movies[leadMovieId]
      : undefined
  const leadEpisode = lead ? metadata.episodes[lead.key] : undefined

  const resumeLead = (): void => {
    if (!lead) return
    if (lead.seriesId) void window.cassette.resumeSeries(lead.seriesId)
    else onPlay(lead.path, lead.key)
  }

  return (
    <>
      {lead && !searching && (
        <section className="hero">
          <div
            className="hero-art"
            style={{
              backgroundImage: leadMeta?.backdropPath
                ? `url("${artUrl(leadMeta.backdropPath, 'backdrop')}")`
                : `url("cassette-thumb://${lead.key}")`
            }}
          />
          <div className="hero-body">
            <div className="hero-kicker">Still watching</div>
            <h1 className="hero-title">{leadMeta?.title ?? lead.title}</h1>
            <div className="hero-meta">
              {leadEpisode?.title
                ? `${lead.detail}, ${leadEpisode.title}. ${formatRemaining(lead.remainingSeconds)}`
                : `${lead.detail}. ${formatRemaining(lead.remainingSeconds)}`}
            </div>
            {(leadEpisode?.overview || leadMeta?.overview) && (
              <p className="hero-overview">{leadEpisode?.overview || leadMeta?.overview}</p>
            )}
            <div className="hero-actions">
              <button className="btn primary" onClick={resumeLead}>
                Resume
              </button>
              {leadSeries && (
                <button className="btn" onClick={() => onOpenSeries(leadSeries.id)}>
                  All episodes
                </button>
              )}
            </div>
          </div>
          <div className="hero-progress">
            <span style={{ width: `${Math.min(100, lead.fraction * 100)}%` }} />
          </div>
        </section>
      )}

      <div className="library-head enter enter-1">
        <input
          className="search"
          type="search"
          value={query}
          placeholder="Search your library"
          onChange={(e) => onQueryChange(e.target.value)}
        />
        <div className="spacer" />
        {metadataBusy && (
          <span className="metadata-note">Fetching artwork for {metadataBusy}</span>
        )}
      </div>

      {nothingFound && (
        <p className="empty">
          Nothing matches “{query.trim()}”. Try part of a title, or clear the search.
        </p>
      )}

      {!searching && resume.length > 1 && (
        <>
          <div className="row-head enter enter-2">
            <h2>Also on the go</h2>
          </div>
          <div className="still-grid">
            {resume.slice(1).map((item) => {
              const episode = metadata.episodes[item.key]
              const meta = item.seriesId ? metadata.series[item.seriesId] : undefined
              return (
                <button
                  key={item.key}
                  className="tile"
                  onClick={() =>
                    item.seriesId
                      ? void window.cassette.resumeSeries(item.seriesId)
                      : onPlay(item.path, item.key)
                  }
                >
                  <div className="tile-art still">
                    <Art
                      tmdbPath={episode?.stillPath ?? meta?.backdropPath ?? null}
                      kind="still"
                      thumbKey={item.key}
                      alt={item.title}
                    />
                    <PlayOverlay />
                    <div
                      className="card-progress"
                      style={{ width: `${item.fraction * 100}%` }}
                    />
                  </div>
                  <div className="tile-caption">{meta?.title ?? item.title}</div>
                  <div className="tile-sub">
                    {episode?.title ? `${item.detail}, ${episode.title}` : item.detail}
                    {`, ${formatRemaining(item.remainingSeconds)}`}
                  </div>
                </button>
              )
            })}
          </div>
        </>
      )}

      {series.length > 0 && (
        <>
          <div className="row-head enter enter-3">
            <h2>Series</h2>
            <span className="note">
              {series.length === 1 ? '1 series' : `${series.length} series`}
            </span>
          </div>
          <div className="poster-grid">
            {series.map((entry) => {
              const summary = summariseSeries(entry, progress)
              const meta = metadata.series[entry.id]
              const complete =
                summary.watchedCount === summary.episodeCount && summary.episodeCount > 0
              return (
                <button key={entry.id} className="tile" onClick={() => onOpenSeries(entry.id)}>
                  <div className="tile-art poster">
                    <Art
                      tmdbPath={meta?.posterPath ?? null}
                      kind="poster"
                      thumbKey={summary.thumbKey}
                      alt={entry.title}
                      fallbackText={entry.title}
                    />
                    <PlayOverlay />
                    {meta?.rating ? (
                      <span className="tile-rating">{meta.rating.toFixed(1)}</span>
                    ) : null}
                    {complete && <span className="badge-watched">Watched</span>}
                  </div>
                  <div className="tile-caption">{meta?.title ?? entry.title}</div>
                  <div className="tile-sub">
                    {summary.episodeCount} episodes, {describeSeasons(summary.seasonNumbers)}
                  </div>
                </button>
              )
            })}
          </div>
        </>
      )}

      {movies.length > 0 && (
        <>
          <div className="row-head enter enter-4">
            <h2>Films</h2>
            <span className="note">
              {movies.length === 1 ? '1 film' : `${movies.length} films`}
            </span>
          </div>
          <div className="poster-grid">
            {movies.map((movie) => {
              const record = progress.get(movie.file.key)
              const meta = metadata.movies[movie.id]
              return (
                <button
                  key={movie.id}
                  className="tile"
                  onClick={() => onPlay(movie.file.path, movie.file.key)}
                >
                  <div className="tile-art poster">
                    <Art
                      tmdbPath={meta?.posterPath ?? null}
                      kind="poster"
                      thumbKey={movie.file.key}
                      alt={movie.title}
                      fallbackText={movie.title}
                    />
                    <PlayOverlay />
                    {meta?.rating ? (
                      <span className="tile-rating">{meta.rating.toFixed(1)}</span>
                    ) : null}
                    {record?.finished && <span className="badge-watched">Watched</span>}
                    {record && !record.finished && record.durationSeconds > 0 && (
                      <div
                        className="card-progress"
                        style={{
                          width: `${(record.positionSeconds / record.durationSeconds) * 100}%`
                        }}
                      />
                    )}
                  </div>
                  <div className="tile-caption">{meta?.title ?? movie.title}</div>
                  <div className="tile-sub">{meta?.year ?? movie.year ?? 'Year unknown'}</div>
                </button>
              )
            })}
          </div>
        </>
      )}
    </>
  )
}
