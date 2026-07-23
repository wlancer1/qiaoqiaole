import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/**/*.test.ts', 'apps/api/src/**/*.test.mjs', 'apps/h5/src/**/*.test.ts'],
  },
});
