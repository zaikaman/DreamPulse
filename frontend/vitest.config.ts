import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'resolve-js-to-ts',
      resolveId(source, importer) {
        if (source.endsWith('.js') && importer && !source.includes('node_modules')) {
          const basePath = source.slice(0, -3);
          const dir = path.dirname(importer);
          const candidateTs = path.resolve(dir, `${basePath}.ts`);
          const candidateTsx = path.resolve(dir, `${basePath}.tsx`);
          if (fs.existsSync(candidateTs)) return candidateTs;
          if (fs.existsSync(candidateTsx)) return candidateTsx;
        }
        return null;
      },
    },
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['src/test-setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: [
        'node_modules/',
        'dist/',
        'src/**/*.test.{ts,tsx}',
        'src/vite-env.d.ts',
        'src/main.tsx',
        'vitest.config.ts',
      ],
    },
  },
});
