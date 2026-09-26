import {
  epoch,
  finite,
  httpError,
  LiveSourceError,
  readResponse,
} from './contract.js';
import {
  normalizeAircraftTrack,
  readsbSnapshot,
  readsbIdentities,
} from './aircraft.js';
import { ADSB_PROXY_URL } from '../../config.js';

const defaultFetch = (...args) => globalThis.fetch(...args);
const header = (response, name) => response.headers?.get?.(name);

/**
 * Fork-lite: adsb.lol is the primary (and only) flight source. OpenSky was
 * dropped — its license is non-commercial and cannot ship on a commercial
 * page. adsb.lol data is ODbL (commercial OK), keyless, and free.
 *
 * api.adsb.lol sends no CORS headers, so the browser cannot call it directly.
 * All calls go through the same-origin serverless proxy (see /api/adsb.js),
 * which forwards to api.adsb.lol and caches aggressively to respect the
 * upstream's dynamic rate limiting.
 */
export function createAdsbLolFlightSource({
  fetchImpl = defaultFetch,
  now = () => Date.now(),
  proxyUrl = ADSB_PROXY_URL,
} = {}) {
  return {
    label: 'adsb.lol',
    async getSnapshot(query = {}, { signal } = {}) {
      if (
        !Number.isFinite(query.latitude) ||
        !Number.isFinite(query.longitude)
      ) {
        throw new LiveSourceError(
          'unavailable',
          'Zoom in for live traffic — no global civilian feed in v1',
          { source: 'adsb.lol' },
        );
      }
      const url =
        `${proxyUrl}?path=` +
        encodeURIComponent(
          `/v2/lat/${query.latitude.toFixed(4)}/lon/${query.longitude.toFixed(4)}/dist/250`,
        );
      const { response, payload } = await readResponse(
        fetchImpl,
        url,
        { signal },
        'adsb.lol',
      );
      if (!response.ok) throw httpError(response, 'adsb.lol');
      const observedAtMs = epoch(payload?.now, 1000);
      return {
        ...readsbSnapshot(payload, {
          observedAtMs: observedAtMs ?? now(),
          source: 'adsb.lol',
          coverage: 'regional 250 nm snapshot',
          now: now(),
          stale: observedAtMs == null,
        }),
        status: response.status,
      };
    },
    async getTrack(reference, { signal } = {}) {
      const { response, payload } = await readResponse(
        fetchImpl,
        `${proxyUrl}?path=` +
          encodeURIComponent('/trace') +
          `&hex=` +
          encodeURIComponent(reference),
        { signal },
        'adsb.lol',
      );
      if (!response.ok) throw httpError(response, 'adsb.lol');
      const baseTimeMs = epoch(payload?.timestamp, 1000);
      return {
        records:
          baseTimeMs == null
            ? []
            : normalizeAircraftTrack(payload?.trace, {
                baseTimeMs,
                readsb: true,
              }),
        complete: false,
      };
    },
    async getEnrichment(query, { signal } = {}) {
      // api.adsbdb.com sends Access-Control-Allow-Origin: * — direct is fine.
      if (!['type', 'route'].includes(query.kind))
        throw new LiveSourceError('unsupported', 'Enrichment unavailable');
      const path =
        query.kind === 'type'
          ? `/v0/aircraft/${encodeURIComponent(query.id)}`
          : `/v0/callsign/${encodeURIComponent(query.id)}`;
      const { response, payload } = await readResponse(
        fetchImpl,
        'https://api.adsbdb.com' + path,
        { signal },
        'adsbdb',
      );
      if (!response.ok) throw httpError(response, 'adsbdb');
      return payload;
    },
  };
}

/**
 * Military aircraft via adsb.lol's worldwide /v2/mil feed (ODbL), through the
 * same same-origin proxy (no CORS on api.adsb.lol).
 */
export function createAdsbLolSource({
  fetchImpl = defaultFetch,
  now = () => Date.now(),
  proxyUrl = ADSB_PROXY_URL,
} = {}) {
  return {
    label: 'adsb.lol',
    async getIdentities(_query = {}, { signal } = {}) {
      const { response, payload } = await readResponse(
        fetchImpl,
        `${proxyUrl}?path=` + encodeURIComponent('/v2/mil'),
        { signal },
        'adsb.lol',
      );
      if (!response.ok) throw httpError(response, 'adsb.lol');
      return readsbIdentities(payload);
    },
    async getSnapshot(_query = {}, { signal } = {}) {
      const { response, payload } = await readResponse(
        fetchImpl,
        `${proxyUrl}?path=` + encodeURIComponent('/v2/mil'),
        { signal },
        'adsb.lol',
      );
      if (!response.ok) throw httpError(response, 'adsb.lol');
      const age = finite(header(response, 'x-ads-b-cache-age-ms'));
      const observedAtMs = epoch(payload?.now, 1000);
      return {
        ...readsbSnapshot(payload, {
          observedAtMs: observedAtMs ?? now() - (age != null && age > 0 ? age : 0),
          source: 'adsb.lol',
          coverage: 'worldwide military snapshot',
          now: now(),
          stale: header(response, 'x-ads-b-cache') === 'STALE',
        }),
        status: response.status,
      };
    },
    async getTrack(reference, { signal } = {}) {
      const { response, payload } = await readResponse(
        fetchImpl,
        `${proxyUrl}?path=` +
          encodeURIComponent('/trace') +
          `&hex=` +
          encodeURIComponent(reference),
        { signal },
        'adsb.lol',
      );
      if (!response.ok) throw httpError(response, 'adsb.lol');
      const baseTimeMs = epoch(payload?.timestamp, 1000);
      return {
        records:
          baseTimeMs == null
            ? []
            : normalizeAircraftTrack(payload?.trace, {
                baseTimeMs,
                readsb: true,
              }),
        complete: false,
      };
    },
  };
}
