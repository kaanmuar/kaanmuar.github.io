import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    root: fileURLToPath(new URL('.', import.meta.url)),
    include: ['catalog.test.mjs'],
    testTimeout: 120000,
    hookTimeout: 120000,
    fileParallelism: false
  }
});
