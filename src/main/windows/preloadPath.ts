import { join } from 'node:path'

/** Where the preload bundle sits, relative to the built main process. */
export function preloadPath(): string {
  return join(__dirname, '../preload/index.js')
}
