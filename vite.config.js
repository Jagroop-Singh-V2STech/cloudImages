import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The linked-accounts Worker runs separately in development (`npm run dev:worker`,
// port 8787). Vite forwards its routes so the app can call it on the same origin.
const worker = { target: 'http://localhost:8787', changeOrigin: false, ws: true }; // ws: phone pairing rooms

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: true, proxy: { '/api': worker, '/link': worker } },
  preview: { port: 5173, strictPort: true, proxy: { '/api': worker, '/link': worker } },
});
