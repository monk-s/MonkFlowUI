import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The portal's pages live at site-root paths (/sign-in, /dashboard/...), but
// its built files are published under /portal/ so they never collide with the
// public site's files. vercel.json rewrites the page paths to
// /portal/index.html; scripts/build-site.mjs puts this build in dist/portal.
//
// Dev: `npm run dev` serves on :5173 and proxies /api to the local API.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/portal/' : '/',
  plugins: [react()],
  build: {
    outDir: '../dist/portal',
    emptyOutDir: true,
    sourcemap: false,
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: { '/api': { target: process.env.API_TARGET || 'http://127.0.0.1:8080', changeOrigin: false } },
  },
}));
