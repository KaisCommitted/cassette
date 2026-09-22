import { DEFAULT_BINDINGS } from './defaultBindings'

export interface KeyDescriptor {
  key: string
  control: boolean
  alt: boolean
  shift: boolean
}

/** Single-character keys are compared case-insensitively; named keys are not. */
function canonicalKey(key: string): string {
  return key.length === 1 ? key.toLowerCase() : key
}

export function describeKey(e: KeyDescriptor): string {
  const parts: string[] = []
  if (e.control) parts.push('Ctrl')
  if (e.alt) parts.push('Alt')
  if (e.shift) parts.push('Shift')
  parts.push(canonicalKey(e.key))
  return `key:${parts.join('+')}`
}

export function resolveBinding(descriptor: string): string | null {
  return DEFAULT_BINDINGS[descriptor] ?? null
}
