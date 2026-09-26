/**
 * Fork-lite deployment configuration.
 *
 * The two same-origin proxy paths below are Vercel serverless functions
 * SHIPPED WITH THIS FORK (see /api/adsb.js and /api/tle.js) — they are not
 * the upstream project's dev-server middlewares. Both exist because the
 * upstream hosts send no CORS headers, so browsers cannot call them directly:
 *
 * - adsb.lol (api.adsb.lol) — ODbL flight data, no browser CORS.
 * - CelesTrak (celestrak.org) — TLE data, no browser CORS.
 *
 * On a pure static host without the functions deployed, the flights and
 * satellite layers degrade to honest "unavailable" states — no fake data,
 * no crashes. Everything else in v1 is browser-direct and keyless.
 */
export const ADSB_PROXY_URL = '/api/adsb';
export const TLE_PROXY_URL = '/api/tle';
