import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
const buildOutDir = process.env.STORY_BRIDGE_BUILD_DIR || 'dist';

export default defineConfig({
  plugins: [react()],
  build: { outDir: buildOutDir },
  server: {
    host: process.env.HOST || '127.0.0.1',
    proxy: { '/api': process.env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:3000' },
  },
});
