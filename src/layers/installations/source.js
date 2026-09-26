import { normalizeMilitaryInstallations } from '../../data/militaryInstallationData.js';

/**
 * Fork-lite: Overpass is called directly (overpass-api.de sends
 * Access-Control-Allow-Origin: *). The viewport-bounded, allow-listed query
 * matches the old server proxy: military=airfield|naval_base|range|barracks|base
 * plus landuse=military, max 10 degrees, 700 features.
 *
 * The Google Places nearby search is excluded from v1 (Google services are
 * out of scope), so searchNearby returns an empty candidate list — the mapped
 * OSM sites still render.
 */
const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

function buildQuery({ south, west, north, east }) {
  const bbox = `${south.toFixed(5)},${west.toFixed(5)},${north.toFixed(5)},${east.toFixed(5)}`;
  return `[out:json][timeout:25];
(
  nwr["military"~"^(airfield|naval_base|range|barracks|base)$"](${bbox});
  nwr["landuse"="military"](${bbox});
);
out center 700;`;
}

/** Preserve legacy cache admission even when the explicit saturation flag is absent. */
export function installationResponseSaturated(payload) {
  if (typeof payload?.saturated === 'boolean') return payload.saturated;
  const cap = Number(payload?.elementCap);
  if (!Number.isFinite(cap) || cap <= 0) return false;
  return Array.isArray(payload?.elements) && payload.elements.length >= cap;
}

/** Read mapped installations through the fixed public Overpass endpoint. */
export function createInstallationSource({
  fetchImpl = (...args) => globalThis.fetch(...args),
} = {}) {
  return {
    async getMappedSites(box, { exact = false, signal } = {}) {
      const { south, west, north, east } = box || {};
      if (
        ![south, west, north, east].every(Number.isFinite) ||
        south < -90 ||
        north > 90 ||
        west < -180 ||
        east > 180 ||
        north <= south ||
        east <= west ||
        north - south > 10 ||
        east - west > 10
      )
        throw new TypeError('A bounded installation viewport is required');
      signal?.throwIfAborted();
      const response = await fetchImpl(OVERPASS_URL, {
        method: 'POST',
        signal,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(buildQuery({ south, west, north, east })),
      });
      const body = await response.json().catch(() => null);
      signal?.throwIfAborted();
      if (!response.ok)
        throw Object.assign(
          new Error(`Installation feed HTTP ${response.status}`),
          { failureReason: response.status === 429 ? 'rate_limited' : 'unavailable' },
        );
      if (!Array.isArray(body?.elements))
        throw new Error('Malformed installation snapshot');
      const retrievedAt = new Date().toISOString();
      return {
        ...normalizeMilitaryInstallations(
          { elements: body.elements, elementCap: 700 },
          retrievedAt,
        ),
        status: response.status,
        saturated: body.elements.length >= 700,
      };
    },
    async searchNearby() {
      // Google Places is out of scope for v1 — no candidate enrichment.
      return { places: [] };
    },
  };
}
