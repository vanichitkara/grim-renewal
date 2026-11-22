import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    root: resolve(__dirname, 'src'),
    include: ['**/*.test.ts'],
    environment: 'node',
  },
  resolve: {
    alias: { '@': resolve(__dirname, 'src') },
  },
});
