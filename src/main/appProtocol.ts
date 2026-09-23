import { protocol } from 'electron'
import { join, normalize, sep } from 'node:path'
import { APP_SCHEME } from './protocolSchemes'
import { serveLocalFile } from './protocolResponse'
import { IMAGE_SIZES } from './tmdb/tmdbClient'
import type { ArtworkCache } from './tmdb/artworkCache'
import type { ThumbnailService } from './thumbs/thumbnails'
import type { Library } from '@shared/types'

export interface RendererRoutes {
  rendererDir: string
  artwork: ArtworkCache
  thumbnails: ThumbnailService
  getLibrary: () => Library | null
}

/**
 * Serves the renderer, and its images, over one origin.
 *
 * Everything the page loads comes from `app://` — the bundle, TMDB artwork and
 * the frames grabbed from local files. That is the point: a packaged renderer
 * runs from an origin of its own, and a request from it to a *different*
 * custom scheme is refused by Chromium before any handler sees it. Artwork
 * loaded fine in development, where the page is served over http, and silently
 * fell back to placeholders once installed, with no request ever arriving.
 *
 * Keeping images on the same origin removes that whole class of problem rather
 * than negotiating with it.
 */
export function serveRenderer(routes: RendererRoutes): void {
  const { rendererDir, artwork, thumbnails, getLibrary } = routes

  protocol.handle(APP_SCHEME, async (request) => {
    const url = new URL(request.url)
    const path = decodeURIComponent(url.pathname)

    if (path.startsWith('/_art/')) return serveArt(artwork, path)
    if (path.startsWith('/_thumb/')) return serveThumb(thumbnails, getLibrary(), path)

    // Resolve inside the renderer directory only: a crafted path must not be
    // able to walk out of it and read the rest of the disk.
    const target = normalize(join(rendererDir, path))
    if (target !== rendererDir && !target.startsWith(rendererDir + sep)) {
      return new Response('forbidden', { status: 403 })
    }

    try {
      return await serveLocalFile(target)
    } catch {
      return new Response('not found', { status: 404 })
    }
  })
}

/** `/_art/<kind>/<tmdb path>` */
async function serveArt(cache: ArtworkCache, path: string): Promise<Response> {
  const rest = path.slice('/_art/'.length)
  const slash = rest.indexOf('/')
  if (slash === -1) return new Response('bad path', { status: 400 })

  const kind = rest.slice(0, slash) as keyof typeof IMAGE_SIZES
  const size = IMAGE_SIZES[kind]
  if (!size) return new Response('unknown size', { status: 404 })

  const tmdbPath = rest.slice(slash)
  if (!/^\/[\w.-]+\.(jpg|png)$/i.test(tmdbPath)) {
    return new Response('bad path', { status: 400 })
  }

  const file = await cache.ensure(tmdbPath, size)
  if (!file) return new Response('not available', { status: 404 })
  return serveLocalFile(file)
}

/** `/_thumb/<media key>`, optionally followed by `/<anything>` to bust caches. */
async function serveThumb(
  thumbnails: ThumbnailService,
  library: Library | null,
  path: string
): Promise<Response> {
  const key = path.slice('/_thumb/'.length).split('/')[0]!
  const videoPath = findPath(library, key)
  if (!videoPath) return new Response('unknown key', { status: 404 })

  const file = await thumbnails.ensure(key, videoPath)
  if (!file) return new Response('could not generate', { status: 404 })
  return serveLocalFile(file)
}

function findPath(library: Library | null, key: string): string | null {
  if (!library) return null
  for (const series of library.series) {
    for (const season of series.seasons) {
      for (const episode of season.episodes) {
        if (episode.file.key === key) return episode.file.path
      }
    }
  }
  return library.movies.find((m) => m.file.key === key)?.file.path ?? null
}

/** The URL a window should load for one of the renderer's HTML entry points. */
export function rendererUrl(file: string): string {
  return `${APP_SCHEME}://bundle/${file}`
}
