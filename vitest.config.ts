import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts', 'test/**/*.test.tsx'],
    // Server/shared tests run in plain node; client tests (RTL + jsdom, e.g. Task 2+)
    // need a DOM. Keep node as the default and opt test/client/** into jsdom only.
    environment: 'node',
    environmentMatchGlobs: [['test/client/**', 'jsdom']],
  },
});
