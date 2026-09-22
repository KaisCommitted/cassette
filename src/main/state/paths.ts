import { app } from 'electron'
import { join } from 'node:path'

export function dataDir(): string {
  return app.getPath('userData')
}

export const settingsFile = (): string => join(dataDir(), 'settings.json')
export const progressFile = (): string => join(dataDir(), 'progress.json')
export const libraryFile = (): string => join(dataDir(), 'library.json')

export const cacheDir = (): string => join(dataDir(), 'cache')
export const thumbsDir = (): string => join(cacheDir(), 'thumbs')
export const keybindsFile = (): string => join(dataDir(), 'keybinds.json')
