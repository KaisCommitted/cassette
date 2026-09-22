import { DEFAULT_BINDINGS, type KeyBindings } from '@shared/types'
import { readJson, writeJsonAtomic } from '../state/atomicJson'

/**
 * The user's bindings, defaults merged underneath.
 *
 * Stored as descriptor to action so a single action can have several
 * bindings, and so keyboard and mouse live in one table — `key:g` and
 * `mouse:button4` are the same kind of thing as far as this is concerned.
 */
export class BindingsStore {
  private bindings: KeyBindings = { ...DEFAULT_BINDINGS }

  constructor(private readonly file: string) {}

  async load(): Promise<void> {
    const saved = await readJson<KeyBindings | null>(this.file, null)
    // Defaults fill any gap, so a binding added in a later version still
    // works for someone who already has a saved file.
    this.bindings = saved ? { ...DEFAULT_BINDINGS, ...saved } : { ...DEFAULT_BINDINGS }
  }

  all(): KeyBindings {
    return { ...this.bindings }
  }

  resolve(descriptor: string): string | null {
    return this.bindings[descriptor] ?? null
  }

  descriptorsFor(actionId: string): string[] {
    return Object.entries(this.bindings)
      .filter(([, action]) => action === actionId)
      .map(([descriptor]) => descriptor)
  }

  /** Binds a descriptor, taking it from whatever action previously held it. */
  async assign(descriptor: string, actionId: string): Promise<KeyBindings> {
    this.bindings = { ...this.bindings, [descriptor]: actionId }
    await this.save()
    return this.all()
  }

  async unassign(descriptor: string): Promise<KeyBindings> {
    const next = { ...this.bindings }
    delete next[descriptor]
    this.bindings = next
    await this.save()
    return this.all()
  }

  async reset(): Promise<KeyBindings> {
    this.bindings = { ...DEFAULT_BINDINGS }
    await this.save()
    return this.all()
  }

  private async save(): Promise<void> {
    await writeJsonAtomic(this.file, this.bindings)
  }
}
