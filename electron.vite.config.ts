import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

const root = process.cwd()
const shared = { '@shared': resolve(root, 'src/shared') }

/**
 * API keys compiled into the main process, so a fresh install works with no
 * setup. They come from the environment — the release workflow's secrets — and
 * are never written in source, because this repository is public.
 *
 * A build without them produces an app that asks for keys in settings, which
 * is what anyone building this themselves gets.
 */
const bundledKeys = {
  __BUNDLED_TMDB_KEY__: JSON.stringify(process.env.CASSETTE_TMDB_KEY ?? ''),
  __BUNDLED_SUBDL_KEY__: JSON.stringify(process.env.CASSETTE_SUBDL_KEY ?? ''),
  __BUNDLED_OPENSUBTITLES_KEY__: JSON.stringify(
    process.env.CASSETTE_OPENSUBTITLES_KEY ?? ''
  )
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: shared },
    define: bundledKeys,
    build: { lib: { entry: resolve(root, 'src/main/index.ts') } }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: shared },
    build: { lib: { entry: resolve(root, 'src/preload/index.ts') } }
  },
  renderer: {
    root: resolve(root, 'src/renderer'),
    plugins: [react()],
    resolve: { alias: shared },
    build: {
      rollupOptions: {
        input: {
          index: resolve(root, 'src/renderer/index.html'),
          overlay: resolve(root, 'src/renderer/overlay.html')
        }
      }
    }
  }
})
