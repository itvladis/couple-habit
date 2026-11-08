import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      { test: { name: 'node', include: ['packages/*/src/**/*.test.ts', 'apps/server/src/**/*.test.ts', 'apps/relay/src/**/*.test.ts'] } },
      'apps/web',
    ],
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**', 'apps/*/src/**'],
      exclude: ['**/*.test.{ts,tsx}', '**/main.ts', '**/main.tsx', '**/index.ts', 'apps/web/src/test/**'],
    },
  },
});
