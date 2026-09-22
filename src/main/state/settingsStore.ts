import { DEFAULT_SETTINGS, type Settings } from '@shared/types'
import { readJson, writeJsonAtomic } from './atomicJson'

export class SettingsStore {
  private settings: Settings = { ...DEFAULT_SETTINGS }

  constructor(private readonly file: string) {}

  async load(): Promise<void> {
    this.settings = await readJson<Settings>(this.file, { ...DEFAULT_SETTINGS })
  }

  get(): Settings {
    return this.settings
  }

  async setRoots(roots: string[]): Promise<void> {
    this.settings = { ...this.settings, libraryRoots: roots }
    await writeJsonAtomic(this.file, this.settings)
  }
}
