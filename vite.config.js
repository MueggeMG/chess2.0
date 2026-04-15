import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  base: '/chess2.0/',
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        game: resolve(__dirname, 'game.html'),
      },
    },
  },
});
