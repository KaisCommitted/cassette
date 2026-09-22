import { createHash } from 'node:crypto'
import { basename } from 'node:path'

/**
 * Identity for a media file that survives being moved or having its
 * containing folder renamed. Modification time is deliberately excluded:
 * copy and sync tools rewrite it routinely, which would silently discard
 * watch history.
 */
export function mediaKey(path: string, sizeBytes: number): string {
  const name = basename(path).toLowerCase()
  return createHash('sha1').update(`${sizeBytes}:${name}`).digest('hex').slice(0, 16)
}
