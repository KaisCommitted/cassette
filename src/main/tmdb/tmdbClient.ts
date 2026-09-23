const API = 'https://api.themoviedb.org/3'

export interface TmdbMatch {
  tmdbId: number
  title: string
  overview: string
  posterPath: string | null
  backdropPath: string | null
  year: number | null
  rating: number | null
}

export interface TmdbEpisode {
  season: number
  episode: number
  title: string
  overview: string
  stillPath: string | null
  runtimeMinutes: number | null
  airDate: string | null
}

interface SearchResult {
  id: number
  name?: string
  title?: string
  overview?: string
  poster_path?: string | null
  backdrop_path?: string | null
  first_air_date?: string
  release_date?: string
  vote_average?: number
}

/**
 * Reads titles, artwork and episode details from TMDB.
 *
 * Authenticates with a v4 read token rather than the v3 key in the query
 * string, so the credential never lands in a URL that could end up in a log.
 * Every method returns null rather than throwing on a miss: metadata is a
 * nicety here, and a failed lookup must never stop a file from playing.
 */
export class TmdbClient {
  constructor(private readonly token: string) {}

  private async get<T>(path: string, params: Record<string, string> = {}): Promise<T | null> {
    const url = new URL(API + path)
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)

    try {
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${this.token}`,
          accept: 'application/json'
        }
      })
      if (!response.ok) return null
      return (await response.json()) as T
    } catch {
      return null // offline, or TMDB is down: fall back to filenames
    }
  }

  async findSeries(title: string, year: number | null): Promise<TmdbMatch | null> {
    const params: Record<string, string> = { query: title }
    if (year) params['first_air_date_year'] = String(year)

    let body = await this.get<{ results?: SearchResult[] }>('/search/tv', params)
    // A wrong year in the filename should not cost us the match.
    if (!body?.results?.length && year) {
      body = await this.get<{ results?: SearchResult[] }>('/search/tv', { query: title })
    }
    const hit = body?.results?.[0]
    return hit ? toMatch(hit) : null
  }

  async findMovie(title: string, year: number | null): Promise<TmdbMatch | null> {
    const params: Record<string, string> = { query: title }
    if (year) params['year'] = String(year)

    let body = await this.get<{ results?: SearchResult[] }>('/search/movie', params)
    if (!body?.results?.length && year) {
      body = await this.get<{ results?: SearchResult[] }>('/search/movie', { query: title })
    }
    const hit = body?.results?.[0]
    return hit ? toMatch(hit) : null
  }

  /** Every episode of one season, so a season costs a single request. */
  async season(tmdbId: number, season: number): Promise<TmdbEpisode[]> {
    const body = await this.get<{
      episodes?: Array<{
        season_number?: number
        episode_number?: number
        name?: string
        overview?: string
        still_path?: string | null
        runtime?: number | null
        air_date?: string | null
      }>
    }>(`/tv/${tmdbId}/season/${season}`)

    return (body?.episodes ?? []).map((e) => ({
      season: e.season_number ?? season,
      episode: e.episode_number ?? 0,
      title: e.name ?? '',
      overview: e.overview ?? '',
      stillPath: e.still_path ?? null,
      runtimeMinutes: e.runtime ?? null,
      airDate: e.air_date ?? null
    }))
  }
}

function toMatch(hit: SearchResult): TmdbMatch {
  const date = hit.first_air_date ?? hit.release_date ?? ''
  const year = /^(\d{4})/.exec(date)
  return {
    tmdbId: hit.id,
    title: hit.name ?? hit.title ?? '',
    overview: hit.overview ?? '',
    posterPath: hit.poster_path ?? null,
    backdropPath: hit.backdrop_path ?? null,
    year: year ? Number(year[1]) : null,
    rating: typeof hit.vote_average === 'number' ? hit.vote_average : null
  }
}

/** TMDB image sizes, picked per use so we never pull a 4K still for a card. */
export const IMAGE_SIZES = {
  poster: 'w500',
  backdrop: 'w1280',
  still: 'w300',
  // TMDB cuts stills at w92, w185, w300 and original, nothing between. w300
  // suits a row in an episode list but smears across the home page's big
  // card, so anything shown wider than that asks for the original.
  'still-large': 'original'
} as const

export function imageUrl(path: string, size: string): string {
  return `https://image.tmdb.org/t/p/${size}${path}`
}
