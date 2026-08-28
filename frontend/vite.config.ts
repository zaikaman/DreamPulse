import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';

// https://vitejs.dev/config/
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
  server: {
    port: 5174,
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        secure: false,
      },
      '/ws': {
        target: 'ws://localhost:5000',
        ws: true,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: process.env.VITE_SOURCEMAP === 'true',
    target: 'esnext',
    minify: 'esbuild',
    cssCodeSplit: true,
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
          'vendor-web3': ['viem'],
          'vendor-three': ['three', '@react-three/fiber'],
          'vendor-supabase': ['@supabase/supabase-js'],
        },
      },
    },
  },
});
