import type { Library, ProgressRecord } from '@shared/types'
import { MediaCard } from '../components/MediaCard'

export interface LibraryViewProps {
  library: Library
  progress: Map<string, ProgressRecord>
  onRescan: () => void
}

const gridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
  gap: 12,
  marginBottom: 40
} as const

export function LibraryView({ library, progress, onRescan }: LibraryViewProps) {
  const play = (path: string, key: string): void => {
    void window.cassette.play(path, key)
  }

  return (
    <div style={{ padding: 24, fontFamily: 'system-ui', color: '#eee' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginBottom: 24
        }}
      >
        <h1 style={{ margin: 0, fontSize: 22 }}>Library</h1>
        <button onClick={onRescan} style={{ cursor: 'pointer' }}>
          Rescan
        </button>
      </div>

      {library.series.map((series) => (
        <section key={series.id}>
          <h2 style={{ fontSize: 17 }}>
            {series.title}
            {series.year ? ` (${series.year})` : ''}
          </h2>
          {series.seasons.map((season) => (
            <div key={season.season}>
              <h3 style={{ fontSize: 14, opacity: 0.7 }}>Season {season.season}</h3>
              <div style={gridStyle}>
                {season.episodes.map((ep) => (
                  <MediaCard
                    key={ep.file.key}
                    title={ep.label}
                    subtitle={ep.file.path.split(/[\\/]/).pop() ?? ''}
                    progress={progress.get(ep.file.key) ?? null}
                    onPlay={() => play(ep.file.path, ep.file.key)}
                  />
                ))}
              </div>
            </div>
          ))}
        </section>
      ))}

      {library.movies.length > 0 && (
        <section>
          <h2 style={{ fontSize: 17 }}>Movies</h2>
          <div style={gridStyle}>
            {library.movies.map((movie) => (
              <MediaCard
                key={movie.file.key}
                title={movie.title}
                subtitle={movie.year ? String(movie.year) : ''}
                progress={progress.get(movie.file.key) ?? null}
                onPlay={() => play(movie.file.path, movie.file.key)}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
