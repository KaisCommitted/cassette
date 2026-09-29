import { deflateRawSync } from 'node:zlib'

/**
 * Real zip archives for tests, so the parser and the entry picker are tested
 * against the format rather than a mock.
 */

export interface ZipEntry {
  name: string
  contents: string
  /** Stored rather than deflated, which small archives sometimes are. */
  stored?: boolean
  /**
   * Mimics an archive written as a stream: the flag says the sizes come after
   * the data, so the local header carries zeroes.
   */
  streamed?: boolean
}

/** Builds a real zip so the parser is tested against the format, not a mock. */
export function buildZip(entries: ZipEntry[]): Buffer {
  const locals: Buffer[] = []
  const centrals: Buffer[] = []
  let offset = 0

  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8')
    const raw = Buffer.from(entry.contents, 'utf8')
    const data = entry.stored ? raw : deflateRawSync(raw)
    const method = entry.stored ? 0 : 8
    const flags = entry.streamed ? 0x08 : 0

    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(flags, 6)
    local.writeUInt16LE(method, 8)
    local.writeUInt32LE(entry.streamed ? 0 : data.length, 18)
    local.writeUInt32LE(entry.streamed ? 0 : raw.length, 22)
    local.writeUInt16LE(name.length, 26)
    locals.push(local, name, data)

    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(flags, 8)
    central.writeUInt16LE(method, 10)
    central.writeUInt32LE(data.length, 20)
    central.writeUInt32LE(raw.length, 24)
    central.writeUInt16LE(name.length, 28)
    central.writeUInt32LE(offset, 42)
    centrals.push(central, name)

    offset += 30 + name.length + data.length
  }

  const directory = Buffer.concat(centrals)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(directory.length, 12)
  end.writeUInt32LE(offset, 16)

  return Buffer.concat([...locals, directory, end])
}
