import { rm } from 'node:fs/promises'
import { afterAll, describe, expect, it, vi } from 'vitest'

// The probe keeps its cache in the app's data folder; point that at a
// scratch directory. Hoisted, with its own imports, so the mock factory can
// use it before the module's static imports have run.
const dataDir = await vi.hoisted(async () => {
  const { mkdtempSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  return mkdtempSync(join(tmpdir(), 'cassette-probe-'))
})
vi.mock('electron', () => ({
  app: { isPackaged: false, getAppPath: () => '', getPath: () => dataDir }
}))

import { MediaProbe, type ProbeOutcome } from './mediaProbe'

afterAll(async () => {
  await rm(dataDir, { recursive: true, force: true })
})

const finished: ProbeOutcome = { durationSeconds: 2520, subtitles: [], complete: true }
const silent: ProbeOutcome = { durationSeconds: null, subtitles: [], complete: true }
const cutShort: ProbeOutcome = { durationSeconds: null, subtitles: [], complete: false }

describe('MediaProbe', () => {
  it('asks once for a file it has already read', async () => {
    const runner = vi.fn(async () => finished)
    const probe = new MediaProbe(runner)
    await probe.probe('k1', 'C:\\a.mkv')
    await probe.probe('k1', 'C:\\a.mkv')
    expect(runner).toHaveBeenCalledTimes(1)
  })

  it('remembers a file mpv read but could not time', async () => {
    const runner = vi.fn(async () => silent)
    const probe = new MediaProbe(runner)
    await probe.probe('k2', 'C:\\b.mkv')
    await probe.probe('k2', 'C:\\b.mkv')
    expect(runner).toHaveBeenCalledTimes(1)
  })

  it('asks again for a file whose probe never finished', async () => {
    const runner = vi.fn(async () => cutShort)
    const probe = new MediaProbe(runner)
    expect(await probe.probe('k3', 'C:\\c.mkv')).toEqual({ durationSeconds: null, subtitles: [] })
    await probe.probe('k3', 'C:\\c.mkv')
    expect(runner).toHaveBeenCalledTimes(2)
    expect(probe.cached('k3')).toBeNull()
  })

  it('keeps what another instance saved in the meantime', async () => {
    const a = new MediaProbe(async () => finished)
    const b = new MediaProbe(async () => finished)
    await a.load()
    await b.load()
    await a.probe('shared-a', 'C:\\a.mkv')
    await b.probe('shared-b', 'C:\\b.mkv')
    await a.save()
    await b.save()

    const fresh = new MediaProbe(async () => cutShort)
    await fresh.load()
    expect(fresh.cached('shared-a')).not.toBeNull()
    expect(fresh.cached('shared-b')).not.toBeNull()
  })
})
