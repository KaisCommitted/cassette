import { Duplex } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { getPath: () => '' } }))

import { MpvController } from './mpvController'
import { MpvIpc } from './mpvIpc'

/**
 * A stand-in for mpv's pipe that answers every command with success, and
 * reports a file as loaded as soon as one is asked for.
 */
function fakeMpv(options: { opens?: boolean } = {}): { sock: Duplex; commands: unknown[][] } {
  const commands: unknown[][] = []
  const opens = options.opens ?? true
  const sock = new Duplex({
    read(): void {
      // Replies are pushed from write(); nothing to pull.
    },
    write(chunk: unknown, _encoding: unknown, callback: () => void): void {
      const msg = JSON.parse(String(chunk)) as { command: unknown[]; request_id: number }
      commands.push(msg.command)
      sock.push(`${JSON.stringify({ error: 'success', data: null, request_id: msg.request_id })}\n`)
      if (msg.command[0] === 'loadfile') {
        // A file that opens announces itself; one that does not ends at once
        // with the reason, the way mpv reports a missing or broken file.
        const event = opens ? { event: 'file-loaded' } : { event: 'end-file', reason: 'error' }
        sock.push(`${JSON.stringify(event)}\n`)
      }
      callback()
    }
  })
  return { sock, commands }
}

async function playing(): Promise<{ mpv: MpvController; sock: Duplex }> {
  const { sock } = fakeMpv()
  const mpv = new MpvController()
  await mpv.attach(new MpvIpc(sock))
  await mpv.load('C:\\show.mkv', 0, 'Show — S01E01')
  expect(mpv.getState().path).toBe('C:\\show.mkv')
  return { mpv, sock }
}

describe('MpvController when a file will not open', () => {
  it('gives up as soon as mpv reports the error, and forgets the file', async () => {
    const { sock } = fakeMpv({ opens: false })
    const mpv = new MpvController()
    await mpv.attach(new MpvIpc(sock))
    await expect(mpv.load('C:\\broken.mkv', 0, 'Broken')).rejects.toThrow(/could not open/)
    expect(mpv.getState().path).toBeNull()
    expect(mpv.getState().loading).toBe(false)
  })
})

describe('MpvController when mpv goes away', () => {
  it('forgets the file when stopping, even though mpv never answered', async () => {
    const { mpv, sock } = await playing()
    sock.destroy()
    await mpv.stop().catch(() => undefined)
    expect(mpv.getState().path).toBeNull()
  })

  it('says so, once', async () => {
    const { mpv, sock } = await playing()
    const exited = vi.fn()
    mpv.on('exit', exited)
    sock.destroy()
    await new Promise((r) => setImmediate(r))
    expect(exited).toHaveBeenCalledTimes(1)
  })

  it('refuses further commands at once rather than waiting on each', async () => {
    const { mpv, sock } = await playing()
    sock.destroy()
    await new Promise((r) => setImmediate(r))
    await expect(mpv.setPaused(true)).rejects.toThrow(/gone|not running/)
  })
})

/** Simulates mpv reporting a property, the way `time-pos` and `duration` do. */
function reportProperty(sock: Duplex, name: string, data: number | boolean): Promise<void> {
  sock.push(`${JSON.stringify({ event: 'property-change', name, data })}\n`)
  return new Promise((r) => setImmediate(r))
}

describe('MpvController.seekRelative', () => {
  it('emits where the jump lands, for a toast to show', async () => {
    const { mpv, sock } = await playing()
    await reportProperty(sock, 'duration', 1000)
    await reportProperty(sock, 'time-pos', 200)

    const landed = vi.fn()
    mpv.on('seekJump', landed)
    await mpv.seekRelative(60)
    expect(landed).toHaveBeenCalledWith(260)
  })

  it('clamps the landing spot to the end of the file', async () => {
    const { mpv, sock } = await playing()
    await reportProperty(sock, 'duration', 1000)
    await reportProperty(sock, 'time-pos', 950)

    const landed = vi.fn()
    mpv.on('seekJump', landed)
    await mpv.seekRelative(200)
    expect(landed).toHaveBeenCalledWith(1000)
  })

  it('never lands before zero, even with no known duration yet', async () => {
    const { mpv, sock } = await playing()
    await reportProperty(sock, 'time-pos', 5)

    const landed = vi.fn()
    mpv.on('seekJump', landed)
    await mpv.seekRelative(-60)
    expect(landed).toHaveBeenCalledWith(0)
  })
})

describe('MpvController.stepVolume', () => {
  it('emits the level it lands on, for a toast to show', async () => {
    const { mpv, sock } = await playing()
    await reportProperty(sock, 'volume', 50)

    const stepped = vi.fn()
    mpv.on('volumeStep', stepped)
    await mpv.stepVolume(5)
    expect(stepped).toHaveBeenCalledWith({ volume: 55, muted: false })
  })

  it('stops at the loudest mpv allows, and at silence', async () => {
    const { mpv, sock } = await playing()
    const stepped = vi.fn()
    mpv.on('volumeStep', stepped)

    await reportProperty(sock, 'volume', 128)
    await mpv.stepVolume(5)
    expect(stepped).toHaveBeenLastCalledWith({ volume: 130, muted: false })

    await reportProperty(sock, 'volume', 3)
    await mpv.stepVolume(-5)
    expect(stepped).toHaveBeenLastCalledWith({ volume: 0, muted: false })
  })

  it('keeps climbing while a held key outruns mpv reporting back', async () => {
    const { mpv, sock } = await playing()
    await reportProperty(sock, 'volume', 50)

    const stepped = vi.fn()
    mpv.on('volumeStep', stepped)
    // Three presses before mpv says anything about the first.
    await Promise.all([mpv.stepVolume(5), mpv.stepVolume(5), mpv.stepVolume(5)])
    expect(stepped.mock.calls.map(([step]) => step.volume)).toEqual([55, 60, 65])
  })

  it('says it is still muted when stepped while muted', async () => {
    const { mpv, sock } = await playing()
    await reportProperty(sock, 'volume', 40)
    await reportProperty(sock, 'mute', true)

    const stepped = vi.fn()
    mpv.on('volumeStep', stepped)
    await mpv.stepVolume(-5)
    expect(stepped).toHaveBeenCalledWith({ volume: 35, muted: true })
  })
})

describe('MpvController.toggleMute', () => {
  it('announces the new state from the mute key', async () => {
    const { mpv, sock } = await playing()
    await reportProperty(sock, 'volume', 70)

    const stepped = vi.fn()
    mpv.on('volumeStep', stepped)
    await mpv.toggleMute({ announce: true })
    expect(stepped).toHaveBeenCalledWith({ volume: 70, muted: true })
  })

  it('stays quiet from the button, which shows its own state', async () => {
    const { mpv } = await playing()
    const stepped = vi.fn()
    mpv.on('volumeStep', stepped)
    await mpv.toggleMute()
    expect(stepped).not.toHaveBeenCalled()
  })

  it('flips from what was last asked, not from a report still on its way', async () => {
    const { mpv } = await playing()
    const stepped = vi.fn()
    mpv.on('volumeStep', stepped)
    await Promise.all([mpv.toggleMute({ announce: true }), mpv.toggleMute({ announce: true })])
    expect(stepped.mock.calls.map(([step]) => step.muted)).toEqual([true, false])
  })

  it('flips again after mpv has answered but before it reports the change', async () => {
    const { mpv } = await playing()
    const stepped = vi.fn()
    mpv.on('volumeStep', stepped)
    // The stand-in answers every command and never reports a property,
    // which is the gap between mpv's reply and its report, held open.
    await mpv.toggleMute({ announce: true })
    await mpv.toggleMute({ announce: true })
    expect(stepped.mock.calls.map(([step]) => step.muted)).toEqual([true, false])
  })
})

describe('MpvController.stepVolume after mpv has answered', () => {
  it('builds on the level it asked for while the report is still on its way', async () => {
    const { mpv, sock } = await playing()
    await reportProperty(sock, 'volume', 50)
    const stepped = vi.fn()
    mpv.on('volumeStep', stepped)
    await mpv.stepVolume(5)
    await mpv.stepVolume(5)
    expect(stepped.mock.calls.map(([step]) => step.volume)).toEqual([55, 60])
  })
})
