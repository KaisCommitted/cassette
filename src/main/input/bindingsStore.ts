import { DEFAULT_BINDINGS, type KeyBindings } from '@shared/types'
import { canonicalDescriptor } from '@shared/keys'
import { readJson, writeJsonAtomic } from '../state/atomicJson'

/**
 * What the file records for a default the user took away.
 *
 * Defaults are merged underneath the saved file on every load, so that a
 * binding added in a later version reaches people who already have a file.
 * Simply deleting a default would therefore bring it straight back on the
 * next launch; an explicit empty entry is what keeps it gone.
 */
const UNBOUND = ''

/**
 * Keys the app keeps for itself. Escape always means back — out of
 * fullscreen, then out of the player — so it is never bound to an action,
 * and a binding for it in an older file is dropped.
 */
export const RESERVED_DESCRIPTORS = new Set(['key:Escape'])

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
    this.bindings = { ...DEFAULT_BINDINGS, ...normalise(saved ?? {}) }
  }

  /** Every live binding; unbound defaults are left out. */
  all(): KeyBindings {
    return Object.fromEntries(
      Object.entries(this.bindings).filter(([, action]) => action !== UNBOUND)
    )
  }

  resolve(descriptor: string): string | null {
    return this.bindings[canonicalDescriptor(descriptor)] || null
  }

  descriptorsFor(actionId: string): string[] {
    return Object.entries(this.bindings)
      .filter(([, action]) => action === actionId)
      .map(([descriptor]) => descriptor)
  }

  /** Binds a descriptor, taking it from whatever action previously held it. */
  async assign(descriptor: string, actionId: string): Promise<KeyBindings> {
    const key = canonicalDescriptor(descriptor)
    if (RESERVED_DESCRIPTORS.has(key)) return this.all()
    this.bindings = { ...this.bindings, [key]: actionId }
    await this.save()
    return this.all()
  }

  async unassign(descriptor: string): Promise<KeyBindings> {
    const key = canonicalDescriptor(descriptor)
    const next = { ...this.bindings }
    if (key in DEFAULT_BINDINGS) next[key] = UNBOUND
    else delete next[key]
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

/**
 * Brings an older file up to the one spelling of each key.
 *
 * Files saved before keys were canonicalised can hold `key:ArrowLeft` next to
 * `key:Left`; they are the same key, so they collapse into one entry.
 */
function normalise(saved: KeyBindings): KeyBindings {
  const out: KeyBindings = {}
  for (const [descriptor, action] of Object.entries(saved)) {
    const key = canonicalDescriptor(descriptor)
    if (RESERVED_DESCRIPTORS.has(key)) continue
    out[key] = action
  }
  return out
}
