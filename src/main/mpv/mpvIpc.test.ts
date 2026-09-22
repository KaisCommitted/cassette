import { Duplex } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'
import { COMMAND_TIMEOUT_MS, MpvIpc } from './mpvIpc'

/**
 * A Duplex whose writes we capture and whose reads we inject.
 *
 * Deliberately NOT a PassThrough: that loops writes back round as reads, so
 * the client would receive its own outgoing commands as if mpv had sent them.
 */
function fakeSocket(): { sock: Duplex; written: string[] } {
  const written: string[] = []
  const sock = new Duplex({
    read(): void {
      // Data is injected by tests via sock.push(); nothing to pull.
    },
    write(chunk: unknown, _encoding: unknown, callback: () => void): void {
      written.push(String(chunk))
      callback()
    }
  })
  return { sock, written }
}

describe('MpvIpc', () => {
  it('sends a command as newline-delimited JSON with a request id', () => {
    const { sock, written } = fakeSocket()
    const ipc = new MpvIpc(sock)
    void ipc.command(['set_property', 'pause', true])
    expect(written[0]).toBe('{"command":["set_property","pause",true],"request_id":1}\n')
  })

  it('resolves a command with the matching request id', async () => {
    const { sock } = fakeSocket()
    const ipc = new MpvIpc(sock)
    const pending = ipc.command<number>(['get_property', 'time-pos'])
    sock.push('{"error":"success","data":42,"request_id":1}\n')
    expect(await pending).toBe(42)
  })

  it('rejects when mpv reports an error', async () => {
    const { sock } = fakeSocket()
    const ipc = new MpvIpc(sock)
    const pending = ipc.command(['get_property', 'nope'])
    sock.push('{"error":"property not found","request_id":1}\n')
    await expect(pending).rejects.toThrow('property not found')
  })

  it('matches replies that arrive out of order', async () => {
    const { sock } = fakeSocket()
    const ipc = new MpvIpc(sock)
    const first = ipc.command<string>(['a'])
    const second = ipc.command<string>(['b'])
    sock.push('{"error":"success","data":"B","request_id":2}\n')
    sock.push('{"error":"success","data":"A","request_id":1}\n')
    expect(await second).toBe('B')
    expect(await first).toBe('A')
  })

  it('emits property changes as events', async () => {
    const { sock } = fakeSocket()
    const ipc = new MpvIpc(sock)
    const seen: Array<[string, unknown]> = []
    ipc.on('property', (name: string, value: unknown) => seen.push([name, value]))
    sock.push('{"event":"property-change","name":"time-pos","data":12.5}\n')
    await new Promise((r) => setImmediate(r))
    expect(seen).toEqual([['time-pos', 12.5]])
  })

  it('handles a message split across two chunks', async () => {
    const { sock } = fakeSocket()
    const ipc = new MpvIpc(sock)
    const pending = ipc.command<number>(['get_property', 'x'])
    sock.push('{"error":"success","data":7,')
    sock.push('"request_id":1}\n')
    expect(await pending).toBe(7)
  })

  it('rejects rather than hanging when mpv never replies', async () => {
    vi.useFakeTimers()
    try {
      const { sock } = fakeSocket()
      const ipc = new MpvIpc(sock)
      const pending = ipc.command(['seek', 10, 'relative'])
      // Surface the rejection before advancing, so it is never unhandled.
      const settled = pending.catch((e: Error) => e.message)
      await vi.advanceTimersByTimeAsync(COMMAND_TIMEOUT_MS + 1)
      expect(await settled).toMatch(/did not reply/)
    } finally {
      vi.useRealTimers()
    }
  })

  it('ignores blank lines and unparseable garbage', async () => {
    const { sock } = fakeSocket()
    const ipc = new MpvIpc(sock)
    const pending = ipc.command<number>(['get_property', 'x'])
    sock.push('\n')
    sock.push('not json\n')
    sock.push('{"error":"success","data":1,"request_id":1}\n')
    expect(await pending).toBe(1)
  })
})
