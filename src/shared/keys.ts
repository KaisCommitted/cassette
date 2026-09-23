/**
 * One spelling for each key, whoever reports it.
 *
 * Chromium's `before-input-event`, the page's own KeyboardEvent and the native
 * hook all name keys differently: Chromium says `ArrowLeft` and ` ` where the
 * hook and the shipped defaults say `Left` and `Space`. A binding recorded by
 * one and looked up by another then silently never matched, which is how a
 * saved bindings file ended up holding both `key:Left` and `key:ArrowLeft`.
 * Everything goes through here before it becomes a descriptor.
 */
const ALIASES: Record<string, string> = {
  ' ': 'Space',
  Spacebar: 'Space',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  Esc: 'Escape'
}

export function canonicalKey(key: string): string {
  const aliased = ALIASES[key] ?? key
  return aliased.length === 1 ? aliased.toLowerCase() : aliased
}

/** Rewrites the key part of a `key:` descriptor into its one spelling. */
export function canonicalDescriptor(descriptor: string): string {
  if (!descriptor.startsWith('key:')) return descriptor
  const parts = descriptor.slice(4).split('+')
  // `key:+` and `key:Ctrl++` name the plus key itself, which splitting on
  // "+" turns into empty parts.
  const key = descriptor.endsWith('+') ? '+' : (parts.pop() ?? '')
  const modifiers = descriptor.endsWith('+')
    ? parts.filter((p) => p !== '')
    : parts
  return `key:${[...modifiers, canonicalKey(key)].join('+')}`
}
