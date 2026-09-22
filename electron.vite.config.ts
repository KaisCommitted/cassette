import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

const root = process.cwd()
const shared = { '@shared': resolve(root, 'src/shared') }

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: shared },
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
