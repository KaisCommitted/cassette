import { useEffect, useState } from 'react'
import { episodeLabel } from '../src/select'

export interface NowPlaying {
  /** The series or film, by its TMDB title where there is one. */
  title: string
  /** "S3 E16 · Red Queen" for an episode; the year for a film. */
  detail: string | null
}

/**
 * What is on screen, in words.
 *
 * The main process sends a single label ("The Mentalist — S03E16"). The
 * library and TMDB's metadata know more — the episode's own title — and both
 * are already on hand, so the overlay asks for them once per file. Until they
 * answer, or when the file is not in the library, the label is split instead.
 */
export function useNowPlaying(path: string | null, label: string): NowPlaying {
  const [known, setKnown] = useState<{ path: string; value: NowPlaying } | null>(null)

  useEffect(() => {
    if (!path) return
    let cancelled = false
    void (async () => {
      const [library, metadata] = await Promise.all([
        window.cassette.getLibrary(),
        window.cassette.getMetadata()
      ])
      if (cancelled || !library) return

      for (const series of library.series) {
        for (const season of series.seasons) {
          const episode = season.episodes.find((e) => e.file.path === path)
          if (!episode) continue
          const title = metadata.series[series.id]?.title ?? series.title
          const episodeTitle = metadata.episodes[episode.file.key]?.title
          const where = episodeLabel(episode.label, 'short')
          setKnown({
            path,
            value: { title, detail: episodeTitle ? `${where} · ${episodeTitle}` : where }
          })
          return
        }
      }
      const movie = library.movies.find((m) => m.file.path === path)
      if (movie) {
        const meta = metadata.movies[movie.id]
        const year = meta?.year ?? movie.year
        setKnown({
          path,
          value: { title: meta?.title ?? movie.title, detail: year ? String(year) : null }
        })
      }
    })().catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [path])

  if (known && known.path === path) return known.value
  const [title, detail] = label.split(' — ')
  return { title: title || label, detail: detail ? episodeLabel(detail, 'short') : null }
}
