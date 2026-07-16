import { defineConfig } from 'vite'
import { resolve } from 'path'
import { execSync } from 'node:child_process'

function appVersion(): string {
  try {
    return execSync('git describe --tags --always --dirty', { encoding: 'utf8' }).trim()
  } catch {
    return 'dev'
  }
}

export default defineConfig({
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(appVersion()),
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        play: resolve(__dirname, 'play.html'),
        game: resolve(__dirname, 'game.html'),
        home: resolve(__dirname, 'home.html'),
        about: resolve(__dirname, 'about.html'),
        players: resolve(__dirname, 'players.html'),
        watch: resolve(__dirname, 'watch.html'),
      },
    },
  },
})
