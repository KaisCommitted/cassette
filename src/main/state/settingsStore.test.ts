import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '@shared/types'
import { nightLightLook } from '../player/nightLight'
import { SettingsStore } from './settingsStore'

let dir: string
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'cassette-settings-'))
})
afterAll(async () => {
  await rm(dir, { recursive: true, force: true })
})

async function loaded(saved: object | null): Promise<SettingsStore> {
  const file = join(dir, `${Math.random()}.json`)
  if (saved) await writeFile(file, JSON.stringify(saved), 'utf8')
  const store = new SettingsStore(file)
  await store.load()
  return store
}

const FULL = { warmth: 1, dim: 1 }

describe('SettingsStore and the night light intensity', () => {
  it('starts a fresh install at the default', async () => {
    expect((await loaded(null)).get().nightLightIntensity).toBe(DEFAULT_SETTINGS.nightLightIntensity)
  })

  it('keeps the darkness a sleep timer user had before there was an intensity', async () => {
    const store = await loaded({ sleepNightLight: true })
    const intensity = store.get().nightLightIntensity
    // The old timer covered 60% of the light at its deepest.
    expect(nightLightLook(intensity, FULL).dim).toBeCloseTo(0.6, 6)
    expect(intensity).toBeCloseTo(0.7623, 4)
  })

  it('gives everyone else who upgrades the default', async () => {
    const store = await loaded({ sleepNightLight: false })
    expect(store.get().nightLightIntensity).toBe(DEFAULT_SETTINGS.nightLightIntensity)
  })

  it('never overrides an intensity already chosen', async () => {
    const store = await loaded({ sleepNightLight: true, nightLightIntensity: 0.3 })
    expect(store.get().nightLightIntensity).toBe(0.3)
  })
})
