// Reports how many library files already carry embedded subtitle tracks.
// Run: node scripts/probe-subs.mjs "C:\\path\\to\\library"

import { spawn } from 'node:child_process'
import { readdir, stat } from 'node:fs/promises'
import { extname, join } from 'node:path'

const MPV = 'resources/mpv/mpv.exe'
const MEDIA = ['.mkv', '.mp4', '.avi', '.m4v', '.mov', '.webm']
const root = process.argv[2]

async function walk(dir, out = []) {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const entry of entries) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) await walk(full, out)
    else if (MEDIA.includes(extname(entry.name).toLowerCase())) out.push(full)
  }
  return out
}

/** Asks mpv to list tracks without decoding anything. */
function probe(path) {
  return new Promise((resolve) => {
    const child = spawn(
      MPV,
      ['--no-config', '--vo=null', '--ao=null', '--frames=0', '--msg-level=all=no,cplayer=v', path],
      { stdio: ['ignore', 'pipe', 'pipe'] }
    )
    let text = ''
    child.stdout.on('data', (d) => (text += d))
    child.stderr.on('data', (d) => (text += d))
    const timer = setTimeout(() => child.kill(), 20000)
    child.on('exit', () => {
      clearTimeout(timer)
      const subs = [...text.matchAll(/^\s*\(\+\)?\s*Subs?\s/gim)].length
      const lines = text.split('\n').filter((l) => /Subs/i.test(l))
      resolve({ subs: lines.length, lines })
    })
    child.on('error', () => {
      clearTimeout(timer)
      resolve({ subs: 0, lines: [] })
    })
  })
}

const files = await walk(root)
console.log(`Probing ${files.length} files…\n`)

let withSubs = 0
let without = []

for (const file of files) {
  const { subs, lines } = await probe(file)
  if (subs > 0) {
    withSubs++
    if (withSubs <= 3) {
      console.log(`  example: ${file.split(/[\\/]/).pop()}`)
      for (const l of lines) console.log(`      ${l.trim()}`)
    }
  } else {
    without.push(file.split(/[\\/]/).pop())
  }
}

console.log(`\nWITH embedded subtitles:    ${withSubs} / ${files.length}`)
console.log(`WITHOUT embedded subtitles: ${without.length}`)
for (const name of without.slice(0, 10)) console.log(`   - ${name}`)
