import { spawn, type ChildProcess } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { createConnection } from 'node:net'
import { app } from 'electron'
import { join } from 'node:path'
import type { Duplex } from 'node:stream'

export function mpvBinaryPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'mpv', 'mpv.exe')
    : join(app.getAppPath(), 'resources', 'mpv', 'mpv.exe')
}

/** Electron hands back a pointer-sized buffer; mpv wants the numeric HWND. */
export function hwndToNumber(handle: Buffer): string {
  return handle.readBigUInt64LE(0).toString()
}

export interface MpvProcess {
  child: ChildProcess
  socket: Duplex
  pipePath: string
}

/**
 * Launch mpv embedded in the given native window.
 *
 * mpv is given no input handling at all — every binding in this app is ours,
 * and mpv stealing keyboard focus would break that.
 */
export async function startMpv(hwnd: Buffer): Promise<MpvProcess> {
  // The suffix is random, not just the pid: an orphaned mpv from a crashed or
  // force-killed run can still be holding a pipe, and a recycled pid would let
  // us connect to that stale player instead of the one we just spawned —
  // silently controlling the wrong file.
  const pipePath = `\\\\.\\pipe\\mininetflix-mpv-${process.pid}-${randomUUID()}`
  const child = spawn(
    mpvBinaryPath(),
    [
      `--wid=${hwndToNumber(hwnd)}`,
      `--input-ipc-server=${pipePath}`,
      '--idle=yes',
      '--force-window=yes',
      '--keep-open=no',
      '--hwdec=auto-safe',
      '--no-input-default-bindings',
      '--input-vo-keyboard=no',
      '--input-cursor=no',
      '--osc=no',
      '--no-osd-bar',
      '--sub-auto=fuzzy'
    ],
    { stdio: 'ignore' }
  )

  const socket = await connectWithRetry(pipePath)
  return { child, socket, pipePath }
}

/** mpv creates the pipe asynchronously, so the first connects will fail. */
async function connectWithRetry(pipePath: string, attempts = 50): Promise<Duplex> {
  for (let i = 0; i < attempts; i++) {
    try {
      return await new Promise<Duplex>((resolve, reject) => {
        const sock = createConnection(pipePath)
        sock.once('connect', () => resolve(sock))
        sock.once('error', reject)
      })
    } catch {
      await new Promise((r) => setTimeout(r, 100))
    }
  }
  throw new Error(`mpv IPC pipe never appeared at ${pipePath}`)
}
