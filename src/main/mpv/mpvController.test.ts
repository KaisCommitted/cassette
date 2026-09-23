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
