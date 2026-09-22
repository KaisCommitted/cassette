// Draws the Cassette app icon straight to build/icon.png.
//
// Rasterised here rather than converted from the SVG so the build needs no
// image toolchain: the mark is only rectangles and circles, and Node ships
// both the deflate and the CRC needed to write a PNG.
//
// Run: node scripts/render-icon.cjs [size]

const { deflateSync, crc32 } = require('node:zlib')
const { writeFileSync, mkdirSync } = require('node:fs')
const { join } = require('node:path')

const SIZE = Number(process.argv[2] ?? 512)
const S = SIZE / 512 // everything below is authored at 512

const INK = [0x12, 0x15, 0x1a]
const SHELL = [0x1b, 0x20, 0x27]
const EDGE = [0x2c, 0x34, 0x3e]
const LABEL = [0x23, 0x2b, 0x34]
const LABEL_LINE = [0x39, 0x43, 0x4f]
const WINDOW = [0x0c, 0x0f, 0x13]
const LAMP = [0xe8, 0xa3, 0x3d]
const TAPE = [0x6a, 0x4c, 0x1e]

const canvas = Buffer.alloc(SIZE * SIZE * 4)

function blend(x, y, colour, alpha) {
  if (x < 0 || y < 0 || x >= SIZE || y >= SIZE || alpha <= 0) return
  const i = (y * SIZE + x) * 4
  const a = Math.min(1, alpha)
  for (let c = 0; c < 3; c++) {
    canvas[i + c] = Math.round(canvas[i + c] * (1 - a) + colour[c] * a)
  }
  canvas[i + 3] = Math.round(canvas[i + 3] * (1 - a) + 255 * a)
}

/** Signed distance to a rounded rectangle, for cheap antialiasing. */
function roundedRectDistance(px, py, x, y, w, h, r) {
  const cx = Math.abs(px - (x + w / 2)) - (w / 2 - r)
  const cy = Math.abs(py - (y + h / 2)) - (h / 2 - r)
  const dx = Math.max(cx, 0)
  const dy = Math.max(cy, 0)
  return Math.min(Math.max(cx, cy), 0) + Math.sqrt(dx * dx + dy * dy) - r
}

function fillRoundedRect(x, y, w, h, r, colour) {
  for (let py = Math.floor(y - 2); py < Math.ceil(y + h + 2); py++) {
    for (let px = Math.floor(x - 2); px < Math.ceil(x + w + 2); px++) {
      const d = roundedRectDistance(px + 0.5, py + 0.5, x, y, w, h, r)
      blend(px, py, colour, Math.min(1, 0.5 - d))
    }
  }
}

function strokeRoundedRect(x, y, w, h, r, colour, width) {
  for (let py = Math.floor(y - width - 2); py < Math.ceil(y + h + width + 2); py++) {
    for (let px = Math.floor(x - width - 2); px < Math.ceil(x + w + width + 2); px++) {
      const d = Math.abs(roundedRectDistance(px + 0.5, py + 0.5, x, y, w, h, r))
      blend(px, py, colour, Math.min(1, width / 2 - d + 0.5))
    }
  }
}

function fillCircle(cx, cy, radius, colour, opacity = 1) {
  for (let py = Math.floor(cy - radius - 2); py < Math.ceil(cy + radius + 2); py++) {
    for (let px = Math.floor(cx - radius - 2); px < Math.ceil(cx + radius + 2); px++) {
      const d = Math.hypot(px + 0.5 - cx, py + 0.5 - cy) - radius
      blend(px, py, colour, Math.min(1, 0.5 - d) * opacity)
    }
  }
}

function strokeCircle(cx, cy, radius, colour, width) {
  for (let py = Math.floor(cy - radius - width - 2); py < Math.ceil(cy + radius + width + 2); py++) {
    for (let px = Math.floor(cx - radius - width - 2); px < Math.ceil(cx + radius + width + 2); px++) {
      const d = Math.abs(Math.hypot(px + 0.5 - cx, py + 0.5 - cy) - radius)
      blend(px, py, colour, Math.min(1, width / 2 - d + 0.5))
    }
  }
}

const s = (n) => n * S

// Backdrop
fillRoundedRect(0, 0, SIZE, SIZE, s(112), INK)

// Shell
fillRoundedRect(s(72), s(136), s(368), s(240), s(26), SHELL)
strokeRoundedRect(s(72), s(136), s(368), s(240), s(26), EDGE, s(6))

// Label band
fillRoundedRect(s(104), s(166), s(304), s(104), s(12), LABEL)
fillRoundedRect(s(124), s(192), s(180), s(9), s(4.5), LABEL_LINE)
fillRoundedRect(s(124), s(218), s(116), s(9), s(4.5), LABEL_LINE)

// Window
fillRoundedRect(s(146), s(286), s(220), s(62), s(14), WINDOW)
strokeRoundedRect(s(146), s(286), s(220), s(62), s(14), EDGE, s(5))

// Tape spanning the spools
fillRoundedRect(s(219), s(311), s(74), s(12), 0, WINDOW)
fillRoundedRect(s(219), s(313), s(74), s(4), s(2), TAPE)

// Left spool, nearly unwound
fillCircle(s(198), s(317), s(21), WINDOW)
strokeCircle(s(198), s(317), s(21), LAMP, s(7))
fillCircle(s(198), s(317), s(7), LAMP)

// Right spool, wound full: the played-through side
fillCircle(s(314), s(317), s(21), LAMP, 0.18)
strokeCircle(s(314), s(317), s(21), LAMP, s(7))
fillCircle(s(314), s(317), s(7), LAMP)

// Drive holes
fillCircle(s(122), s(317), s(10), WINDOW)
strokeCircle(s(122), s(317), s(10), EDGE, s(4))
fillCircle(s(390), s(317), s(10), WINDOW)
strokeCircle(s(390), s(317), s(10), EDGE, s(4))

// ---- PNG encoding ----

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body) >>> 0)
  return Buffer.concat([length, body, crc])
}

const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(SIZE, 0)
ihdr.writeUInt32BE(SIZE, 4)
ihdr[8] = 8 // bit depth
ihdr[9] = 6 // RGBA
// 10-12 stay zero: deflate, adaptive filtering, no interlace

// One filter byte per scanline; filter 0 keeps the encoder trivial.
const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1))
for (let y = 0; y < SIZE; y++) {
  raw[y * (SIZE * 4 + 1)] = 0
  canvas.copy(raw, y * (SIZE * 4 + 1) + 1, y * SIZE * 4, (y + 1) * SIZE * 4)
}

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0))
])

mkdirSync(join(process.cwd(), 'build'), { recursive: true })
const out = join(process.cwd(), 'build', SIZE === 512 ? 'icon.png' : `icon-${SIZE}.png`)
writeFileSync(out, png)
console.log(`wrote ${out} (${SIZE}x${SIZE}, ${(png.length / 1024).toFixed(1)} KB)`)
