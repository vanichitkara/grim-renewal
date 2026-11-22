import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: 'src/ui',
  publicDir: resolve(__dirname, 'public'),
  resolve: {
    alias: { '@': resolve(__dirname, 'src') },
  },
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'src/ui/index.html'),
        landing: resolve(__dirname, 'src/ui/landing.html'),
      },
    },
  },
  server: {
    port: 5173,
    open: '/landing.html',
  },
});
