import { defineConfig } from 'vitest/config';
import path from 'node:path';
export default defineConfig({
  test: { globals: true, include: ['src/**/*.test.ts'], environment: 'node' },
  resolve: {
    alias: {
      '@core': path.resolve(__dirname, 'src/core'),
      '@ui': path.resolve(__dirname, 'src/ui'),
      '@modules': path.resolve(__dirname, 'src/modules'),
    },
  },
});
