import { validCoordinate } from './geospatial.js';
import {
  normalizeNominatimResult,
  normalizeNominatimReverse,
} from '../sources/nominatim.js';
import { normalizeGooglePlace } from './google.js';

/**
 * Fork-lite: all geospatial HTTP operations are direct and keyless.
 * Google geocoding/places are excluded from v1; Nominatim (OSM) serves
 * reverse geocoding and text search directly (it sends CORS headers).
 * Nearby-places has no keyless direct replacement — it reports honestly.
 * Routing lives in the directions layer (direct OSRM).
 */
const NOMINATIM_SEARCH = 'https://nominatim.openstreetmap.org/search';
const NOMINATIM_REVERSE = 'https://nominatim.openstreetmap.org/reverse';

/** Existing JSON protocols with application-selected endpoints and transport. */
export function createHttpGeospatialProvider({
  fetchImpl = (...args) => fetch(...args),
  endpoints = {},
} = {}) {
  const urls = {
    reverse: NOMINATIM_REVERSE,
    textSearch: NOMINATIM_SEARCH,
    ...endpoints,
  };
  async function json(endpoint, params, { signal } = {}) {
    if (!endpoint) return null;
    const separator = endpoint.includes('?') ? '&' : '?';
    const response = await fetchImpl(
      `${endpoint}${separator}${new URLSearchParams({
        format: 'jsonv2',
        addressdetails: '1',
        ...params,
      })}`,
      { signal, headers: { Accept: 'application/json' } },
    );
    signal?.throwIfAborted();
    if (!response.ok) {
      await response.body?.cancel?.().catch(() => {});
      throw new Error('Geospatial service unavailable');
    }
    const data = await response.json();
    signal?.throwIfAborted();
    return data;
  }
  const places = (data) =>
    (Array.isArray(data) ? data : [])
      .map((hit) => normalizeGooglePlace(normalizeNominatimResult(hit)))
      .filter(Boolean)
      .filter((place) => validCoordinate([place.lng, place.lat]))
      .slice(0, 20);
  return {
    attribution: {
      reverseGeocode: 'OpenStreetMap / Nominatim',
      textSearch: 'OpenStreetMap / Nominatim',
      nearby: 'unavailable',
      route: 'OpenStreetMap / OSRM',
    },
    routeProfiles: ['foot', 'car', 'bike'],
    async reverseGeocode(latitude, longitude, options) {
      const data = await json(
        urls.reverse,
        { lat: latitude, lon: longitude },
        options,
      );
      return data ? normalizeNominatimReverse(data) : null;
    },
    async textSearch(query, _bias, options) {
      // _bias (lat/lon/radiusM) is accepted for interface compatibility;
      // Nominatim ranks by relevance without a viewbox in v1.
      return places(
        await json(urls.textSearch, { q: query, limit: 20 }, options),
      );
    },
    async nearby() {
      // Fork-lite: no keyless direct nearby-places feed in v1.
      return [];
    },
    async route() {
      // Fork-lite: routing is handled by the directions layer (direct OSRM).
      throw new Error('Routing unavailable through this provider');
    },
  };
}
