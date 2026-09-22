import { net } from 'electron'
import { pathToFileURL } from 'node:url'

/**
 * Serves a local file over a custom scheme, readable from the renderer.
 *
 * The explicit allow-origin header is what makes this work in a packaged
 * build. Our schemes are registered with `corsEnabled`, so Chromium applies
 * CORS to them — and the packaged renderer is served from `file://`, an opaque
 * origin, so a response with no allow-origin header is refused before it ever
 * reaches the page. In development the renderer comes from http://localhost
 * and the same request sails through, which is exactly why this only ever
 * broke once installed.
 */
export async function serveLocalFile(path: string): Promise<Response> {
  const response = await net.fetch(pathToFileURL(path).toString())
  const headers = new Headers(response.headers)
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Cache-Control', 'public, max-age=86400')
  return new Response(response.body, { status: response.status, headers })
}
