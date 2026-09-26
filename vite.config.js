import { defineConfig } from 'vite';
import cesium from 'vite-plugin-cesium';

/**
 * Fork-lite build: a pure static bundle. The upstream dev-server middlewares
 * (all /api/* routes) are gone — this config only builds the client.
 * Same-origin /api/adsb and /api/tle are Vercel serverless functions
 * (see /api/*.js), not dev-server routes; they are called at runtime.
 */
export default defineConfig({
  plugins: [cesium()],
  base: './',
  build: {
    chunkSizeWarningLimit: 4000,
  },
});
