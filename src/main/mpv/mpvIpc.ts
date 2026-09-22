import { EventEmitter } from 'node:events'
import type { Duplex } from 'node:stream'

interface Pending {
  resolve: (value: never) => void
  reject: (reason: Error) => void
  timer: NodeJS.Timeout
}

/**
 * How long to wait for a reply before giving up on a command.
 *
 * A reply that never arrives must not hang the caller forever: several
 * seeks issued at once (a held-down arrow key) could otherwise leave the
 * player permanently unresponsive.
 */
export const COMMAND_TIMEOUT_MS = 5000

/**
 * mpv's JSON IPC: one JSON object per line, in both directions.
 * Replies carry back the `request_id` we sent, so they may arrive
 * out of order.
 */
export class MpvIpc extends EventEmitter {
  private nextId = 1
  private buffer = ''
  private pending = new Map<number, Pending>()

  constructor(private readonly socket: Duplex) {
    super()
    this.socket.on('data', (chunk: Buffer) => this.onData(chunk.toString('utf8')))
  }

  private onData(chunk: string): void {
    this.buffer += chunk
    const lines = this.buffer.split('\n')
    this.buffer = lines.pop() ?? ''
    for (const line of lines) {
      if (line.trim() === '') continue
      let msg: Record<string, unknown>
      try {
        msg = JSON.parse(line) as Record<string, unknown>
      } catch {
        continue // mpv occasionally emits non-JSON noise; ignore it
      }
      this.dispatch(msg)
    }
  }

  private dispatch(msg: Record<string, unknown>): void {
    if (msg['event'] === 'property-change') {
      this.emit('property', msg['name'] as string, msg['data'])
      return
    }
    if (typeof msg['event'] === 'string') {
      this.emit('event', msg['event'], msg)
      return
    }
    const id = msg['request_id'] as number | undefined
    if (id === undefined) return
    const entry = this.pending.get(id)
    if (!entry) return
    clearTimeout(entry.timer)
    this.pending.delete(id)
    if (msg['error'] === 'success') {
      entry.resolve(msg['data'] as never)
    } else {
      entry.reject(new Error(String(msg['error'])))
    }
  }

  command<T>(args: unknown[]): Promise<T> {
    const request_id = this.nextId++
    const payload = `${JSON.stringify({ command: args, request_id })}\n`
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(request_id)
        reject(new Error(`mpv did not reply to ${JSON.stringify(args)} within ${COMMAND_TIMEOUT_MS}ms`))
      }, COMMAND_TIMEOUT_MS)
      // Never keep the process alive just to wait on a reply.
      timer.unref?.()

      this.pending.set(request_id, {
        resolve: resolve as (value: never) => void,
        reject,
        timer
      })
      this.socket.write(payload)
    })
  }

  async observeProperty(name: string): Promise<void> {
    await this.command(['observe_property', this.nextId, name])
  }
}
