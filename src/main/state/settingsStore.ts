import { DEFAULT_SETTINGS, DEFAULT_SUBTITLE_STYLE, type Settings } from '@shared/types'
import { readJson, writeJsonAtomic } from './atomicJson'

export class SettingsStore {
  private settings: Settings = { ...DEFAULT_SETTINGS }

  constructor(private readonly file: string) {}

  async load(): Promise<void> {
    const saved = await readJson<Partial<Settings> | null>(this.file, null)
    // Merged over the defaults so a settings file written by an earlier
    // version still works once new options exist.
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...(saved ?? {}),
      subtitleStyle: { ...DEFAULT_SUBTITLE_STYLE, ...(saved?.subtitleStyle ?? {}) }
    }
  }

  get(): Settings {
    return { ...this.settings, subtitleStyle: { ...this.settings.subtitleStyle } }
  }

  async patch(changes: Partial<Settings>): Promise<Settings> {
    this.settings = {
      ...this.settings,
      ...changes,
      subtitleStyle: { ...this.settings.subtitleStyle, ...(changes.subtitleStyle ?? {}) }
    }
    await writeJsonAtomic(this.file, this.settings)
    return this.get()
  }

  async setRoots(roots: string[]): Promise<void> {
    await this.patch({ libraryRoots: roots })
  }
}
