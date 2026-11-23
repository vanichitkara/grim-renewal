import { defineConfig, loadEnv } from 'vite';
import { resolve } from 'path';
import { bridgeDefine, communityDefine } from './src/server/dev-env.ts';

export default defineConfig(({ command, mode }) => ({
  root: 'src/ui',
  // The local bridge key (from .env) goes to the page only while developing. Never into a build.
  define: (() => {
    const env = loadEnv(mode, __dirname, '');
    return { ...bridgeDefine(command, env), ...communityDefine(env) };
  })(),
  // Relative paths so the built site works from any folder, e.g. GitHub Pages at /grim-renewal/.
  base: './',
  publicDir: resolve(__dirname, 'public'),
  resolve: {
    alias: { '@': resolve(__dirname, 'src') },
  },
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'src/ui/index.html'), // landing page: the first thing visitors see
        app: resolve(__dirname, 'src/ui/app.html'),
      },
    },
  },
  server: {
    port: 5173,
    open: true, // opens the landing page at /
  },
}));
