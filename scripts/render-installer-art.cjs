// Draws the installer's artwork in the app's own look, straight to build/.
//
//   installerSidebar.bmp    164 x 314, the welcome and finish pages
//   uninstallerSidebar.bmp  the same, for the uninstaller
//   installerHeader.bmp     150 x 57, the strip across the other pages
//
// NSIS only takes uncompressed 24-bit BMP, so Chromium renders the art from
// HTML — the same fonts, colours and mark as the app — and the pixels are
// written out as BMP here. No image toolchain beyond the Electron already
// installed.
//
// Run: npx electron scripts/render-installer-art.cjs

const { app, BrowserWindow } = require('electron')
const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { pathToFileURL } = require('node:url')

const root = join(__dirname, '..')
const shared = join(root, 'src', 'renderer', 'shared')
const font = (file) => pathToFileURL(join(shared, 'fonts', file)).href
const svg = (file) =>
  readFileSync(join(shared, 'logo', file), 'utf8').replace('<svg ', '<svg aria-hidden="true" ')

const INK = '#1c1a17'
const CREAM = '#e8e1d3'
const BRASS = '#d9a441'
const MUTED = '#a79f91'

const fonts = `
  @font-face { font-family: 'Space Grotesk'; font-weight: 300 700; src: url('${font('space-grotesk-latin-wght-normal.woff2')}'); }
  @font-face { font-family: 'DM Sans'; font-weight: 100 1000; src: url('${font('dm-sans-latin-wght-normal.woff2')}'); }
  * { margin: 0; box-sizing: border-box; }
  html, body { width: 100%; height: 100%; overflow: hidden; }
  svg { display: block; }
`

// The sidebar is the app's first-run screen in miniature: ink, a brass glow
// from the top, the mark, the name, and one plain line about what it is.
const sidebar = `<!doctype html><style>${fonts}
  body {
    background:
      radial-gradient(120% 60% at 50% -10%, rgba(217, 164, 65, 0.22), transparent 70%),
      radial-gradient(90% 50% at 100% 110%, rgba(153, 70, 58, 0.22), transparent 70%),
      ${INK};
    color: ${CREAM};
    font-family: 'DM Sans', sans-serif;
    display: flex; flex-direction: column; align-items: center;
    padding: 58px 18px 22px;
  }
  .mark { width: 64px; color: ${BRASS}; }
  .mark svg { width: 100%; height: auto; }
  .word { width: 118px; margin-top: 18px; color: ${CREAM}; }
  .word svg { width: 100%; height: auto; }
  .line { margin-top: 14px; width: 34px; height: 2px; border-radius: 2px; background: ${BRASS}; opacity: 0.8; }
  .tag { margin-top: auto; font-size: 11px; line-height: 1.5; color: ${MUTED}; text-align: center; }
  .tag b { display: block; color: ${CREAM}; font-weight: 600; font-family: 'Space Grotesk', sans-serif; font-size: 12px; margin-bottom: 3px; }
</style>
<body>
  <div class="mark">${svg('logo-mark.svg')}</div>
  <div class="word">${svg('logo-wordmark.svg')}</div>
  <div class="line"></div>
  <p class="tag"><b>Your own shelf</b>Your films and series, from your own folder. Nothing is uploaded.</p>
</body>`

// The header sits on the installer's white page strip, so it is drawn on
// white: the brass mark and the name in ink, like a label on the box.
const header = `<!doctype html><style>${fonts}
  body { background: #ffffff; display: flex; align-items: center; justify-content: flex-end; gap: 7px; padding: 0 10px 0 6px; }
  .mark { width: 30px; color: #b8862b; }
  .mark svg, .word svg { width: 100%; height: auto; }
  .word { width: 82px; color: ${INK}; }
</style>
<body>
  <div class="mark">${svg('logo-mark.svg')}</div>
  <div class="word">${svg('logo-wordmark.svg')}</div>
</body>`

/** Uncompressed 24-bit BMP, bottom-up, rows padded to four bytes. */
function bmp(bgra, width, height) {
  const rowSize = Math.ceil((width * 3) / 4) * 4
  const pixels = Buffer.alloc(rowSize * height)
  for (let y = 0; y < height; y++) {
    const src = y * width * 4
    const dst = (height - 1 - y) * rowSize
    for (let x = 0; x < width; x++) {
      pixels[dst + x * 3] = bgra[src + x * 4]
      pixels[dst + x * 3 + 1] = bgra[src + x * 4 + 1]
      pixels[dst + x * 3 + 2] = bgra[src + x * 4 + 2]
    }
  }
  const header = Buffer.alloc(54)
  header.write('BM', 0, 'ascii')
  header.writeUInt32LE(54 + pixels.length, 2)
  header.writeUInt32LE(54, 10)
  header.writeUInt32LE(40, 14)
  header.writeInt32LE(width, 18)
  header.writeInt32LE(height, 22)
  header.writeUInt16LE(1, 26)
  header.writeUInt16LE(24, 28)
  header.writeUInt32LE(pixels.length, 34)
  header.writeInt32LE(2835, 38)
  header.writeInt32LE(2835, 42)
  return Buffer.concat([header, pixels])
}

const scratch = mkdtempSync(join(tmpdir(), 'cassette-art-'))

async function render(window, html, width, height) {
  window.setContentSize(width, height)
  // From a file rather than a data: URL, which is not allowed to load the
  // fonts from disk and quietly falls back to the system face.
  const file = join(scratch, 'art.html')
  writeFileSync(file, html)
  await window.loadFile(file)
  await window.webContents.executeJavaScript('document.fonts.ready.then(() => true)')
  // An offscreen window paints on its own schedule; capturing before the
  // first frame waits forever.
  await new Promise((resolve) => setTimeout(resolve, 400))
  const image = await window.webContents.capturePage({ x: 0, y: 0, width, height })
  const sized = image.resize({ width, height, quality: 'best' })
  return bmp(sized.toBitmap(), width, height)
}

app.whenReady().then(async () => {
  const window = new BrowserWindow({
    show: false,
    width: 400,
    height: 400,
    useContentSize: true,
    webPreferences: { offscreen: true }
  })
  window.webContents.setZoomFactor(1)
  const build = join(root, 'build')

  const side = await render(window, sidebar, 164, 314)
  writeFileSync(join(build, 'installerSidebar.bmp'), side)
  writeFileSync(join(build, 'uninstallerSidebar.bmp'), side)
  writeFileSync(join(build, 'installerHeader.bmp'), await render(window, header, 150, 57))

  rmSync(scratch, { recursive: true, force: true })
  console.log('wrote build/installerSidebar.bmp, build/uninstallerSidebar.bmp, build/installerHeader.bmp')
  app.quit()
})
