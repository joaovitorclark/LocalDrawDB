import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Frontend dev server (5173) faz proxy de /api -> Fastify (5174).
// Build sai em dist/, servido pelo Fastify em produção.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:5174',
    },
  },
  build: {
    outDir: 'dist',
  },
});
