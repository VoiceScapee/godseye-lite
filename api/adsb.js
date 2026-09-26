/**
 * Vercel serverless proxy for adsb.lol flight data.
 *
 * Why it exists: api.adsb.lol sends no CORS headers, so browsers cannot call
 * it directly. This function forwards allowlisted paths, caches aggressively
 * (the upstream rate-limits dynamically under load), and adds no secrets —
 * adsb.lol is keyless and its data is ODbL (commercial use OK).
 *
 * Routes (query-param form, so Vercel file routing always reaches this handler):
 *   GET /api/adsb?path=/v2/mil                      -> https://api.adsb.lol/v2/mil
 *   GET /api/adsb?path=/v2/lat/<lat>/lon/<lon>/dist/<nm>
 *                                                   -> https://api.adsb.lol/v2/...
 *   GET /api/adsb?path=/trace&hex=<icao24>           -> https://adsb.lol/data/traces/<hex>.json
 *
 * $0: fits the Vercel free tier (no key, no billing, tiny bandwidth).
 */

const UPSTREAM = 'https://api.adsb.lol';
const TRACES_UPSTREAM = 'https://adsb.lol/data/traces';
const USER_AGENT =
  'GodseyeForkLite/1.0 (+https://voicescape.vercel.app) adsb.lol proxy';

const HEX_RE = /^[0-9a-fA-F]{6}$/;

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'method not allowed' });
  }

  // Query-param routing: Vercel maps api/adsb.js to exactly /api/adsb, so
  // subpaths in the URL would 404 at the routing layer. The client sends the
  // forwarded path as ?path=.
  const url = new URL(req.url, 'http://localhost');
  const forwardPath = url.searchParams.get('path');
  let upstreamBase = UPSTREAM;
  let forward = null;

  if (forwardPath === '/v2/mil') {
    forward = forwardPath;
  } else if (
    forwardPath &&
    /^\/v2\/lat\/-?\d+(\.\d+)?\/lon\/-?\d+(\.\d+)?\/dist\/\d+$/.test(forwardPath)
  ) {
    forward = forwardPath;
  } else if (forwardPath === '/trace') {
    const hex = String(url.searchParams.get('hex') || '').toLowerCase();
    if (!HEX_RE.test(hex)) {
      return res.status(400).json({ error: 'hex must be 6 hex chars' });
    }
    upstreamBase = TRACES_UPSTREAM;
    forward = `/${hex}.json`;
  } else {
    return res.status(404).json({ error: 'not found' });
  }

  const upstreamUrl = upstreamBase + forward;
  let upstream;
  try {
    upstream = await fetch(upstreamUrl, {
      signal: AbortSignal.timeout(15000),
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    });
  } catch {
    return res.status(502).json({ error: 'upstream unreachable' });
  }

  const body = await upstream.text();
  res.setHeader('Content-Type', 'application/json');
  // Short cache: positions go stale in seconds; CDN + browser may reuse briefly.
  res.setHeader(
    'Cache-Control',
    upstream.ok
      ? 'public, max-age=30, stale-while-revalidate=60'
      : 'no-store',
  );
  res.setHeader('Access-Control-Allow-Origin', '*');
  return res.status(upstream.status).send(body);
}
