/**
 * Vercel serverless proxy for CelesTrak TLE data.
 *
 * Why it exists: celestrak.org sends no CORS headers, so browsers cannot
 * fetch TLEs directly. This function forwards allowlisted satellite groups,
 * caches for hours (TLEs update roughly daily), and adds no secrets —
 * CelesTrak is keyless.
 *
 * Route:
 *   GET /api/tle?group=stations
 *     -> https://celestrak.org/NORAD/elements/gp.php?GROUP=stations&FORMAT=tle
 *
 * $0: fits the Vercel free tier (no key, no billing, tiny bandwidth).
 */

const CELESTRAK_TLE =
  'https://celestrak.org/NORAD/elements/gp.php';
const USER_AGENT =
  'GodseyeForkLite/1.0 (+https://voicescape.vercel.app) celestrak proxy';

// CelesTrak's documented element groups. The group parameter is allowlisted
// to prevent this proxy from becoming an open redirect.
const ALLOWED_GROUPS = new Set(
  [
    'stations',
    'visual',
    'analyst',
    'weather',
    'noaa',
    'goes',
    'resource',
    'sarsat',
    'dmc',
    'tdrss',
    'argos',
    'planet',
    'spire',
    'geo',
    'intelsat',
    'ses',
    'iridium',
    'iridium-NEXT',
    'starlink',
    'oneweb',
    'orbcomm',
    'globalstar',
    'amateur',
    'cubesat',
    'gps-ops',
    'glo-ops',
    'galileo',
    'beidou',
    'sbas',
    'nnss',
    'science',
    'geodetic',
    'engineering',
    'education',
    'military',
    'radar',
    'other',
  ].map((g) => g.toLowerCase()),
);

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'method not allowed' });
  }

  const url = new URL(req.url, 'http://localhost');
  const group = String(url.searchParams.get('group') || 'stations').toLowerCase();
  if (!ALLOWED_GROUPS.has(group)) {
    return res.status(400).json({ error: 'unsupported TLE group' });
  }

  const upstreamUrl =
    `${CELESTRAK_TLE}?GROUP=${encodeURIComponent(group)}&FORMAT=tle`;
  let upstream;
  try {
    upstream = await fetch(upstreamUrl, {
      signal: AbortSignal.timeout(20000),
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/plain' },
    });
  } catch {
    return res.status(502).json({ error: 'upstream unreachable' });
  }

  const body = await upstream.text();
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  // TLEs refresh ~daily; a 6h cache keeps the free tier quiet.
  res.setHeader(
    'Cache-Control',
    upstream.ok
      ? 'public, max-age=21600, stale-while-revalidate=3600'
      : 'no-store',
  );
  res.setHeader('Access-Control-Allow-Origin', '*');
  return res.status(upstream.status).send(body);
}
