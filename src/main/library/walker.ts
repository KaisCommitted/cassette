import { readdir, stat } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { MEDIA_EXTENSIONS } from '@shared/types'

export interface WalkedFile {
  path: string
  sizeBytes: number
}

const SKIP_NAME = /^(desktop\.ini|thumbs\.db|\..*)$/i
const SKIP_CONTAINS = /\b(sample|extras?|featurettes?|trailers?)\b/i

function isMedia(name: string): boolean {
  return (MEDIA_EXTENSIONS as readonly string[]).includes(extname(name).toLowerCase())
}

async function walkDir(dir: string, out: WalkedFile[]): Promise<void> {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return // unreadable or missing directory: skip it, never crash the scan
  }
  for (const entry of entries) {
    const full = join(dir, entry.name)
    if (SKIP_NAME.test(entry.name)) continue
    if (entry.isDirectory()) {
      if (SKIP_CONTAINS.test(entry.name)) continue
      await walkDir(full, out)
    } else if (entry.isFile() && isMedia(entry.name) && !SKIP_CONTAINS.test(entry.name)) {
      const info = await stat(full)
      out.push({ path: full, sizeBytes: info.size })
    }
  }
}

export async function walk(roots: string[]): Promise<WalkedFile[]> {
  const out: WalkedFile[] = []
  for (const root of roots) await walkDir(root, out)
  return out
}
