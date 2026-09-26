import { createOverpassFeatureSource } from '../sources/overpassFeatures.js';
/** Parse bounded retry information from a service response. */
function retryAfterMs(value) {
  if (value == null || String(value).trim() === '') return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0)
    return Math.ceil(seconds * 1000);
  const at = Date.parse(String(value));
  return Number.isFinite(at) ? Math.max(0, at - Date.now()) : null;
}

/** Construct independent request services for compatible application protocols. */
export function createApplicationRequestServices({
  fetchImpl = (...args) => fetch(...args),
  signal: lifetime,
  endpoints = {},
  features,
} = {}) {
  const urls = {
    boundaries: 'https://overpass-api.de/api/interpreter',
    terrain: '/api/terrain/heights',
    regional: '/api/regional-brief',
    weather: '/api/weather-effects',
    summary: '/api/openai/hud-summary',
    ...endpoints,
  };
  async function request(endpoint, { signal, ...init } = {}) {
    signal = AbortSignal.any([lifetime, signal].filter(Boolean));
    signal.throwIfAborted();
    const response = await fetchImpl(endpoint, {
      ...init,
      signal,
      redirect: 'error',
    });
    signal.throwIfAborted();
    let data = null;
    try {
      data = await response.json();
    } catch {
      /* Status remains authoritative for non-JSON errors. */
    }
    signal.throwIfAborted();
    return {
      ok: response.ok,
      status: response.status,
      headers: response.headers,
      data,
    };
  }
  function pointUrl(endpoint, latitude, longitude) {
    if (
      !Number.isFinite(latitude) ||
      latitude < -90 ||
      latitude > 90 ||
      !Number.isFinite(longitude) ||
      longitude < -180 ||
      longitude > 180
    )
      throw new TypeError('Valid coordinates are required');
    return `${endpoint}?${new URLSearchParams({ latitude: latitude.toFixed(5), longitude: longitude.toFixed(5) })}`;
  }
  function requireOk(response, label) {
    if (!response.ok)
      throw new Error(`${label} unavailable (${response.status})`);
    return response.data;
  }
  const services = {
    boundaries: {
      async query(query, { signal } = {}) {
        const response = await request(urls.boundaries, {
          method: 'POST',
          signal,
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `data=${encodeURIComponent(query)}`,
        });
        const retry = response.headers?.get?.('Retry-After');
        if (
          response.status === 429 ||
          (response.status === 503 && retry != null)
        )
          return { rateLimited: true, retryAfterMs: retryAfterMs(retry) };
        if (!response.ok) return null;
        const remark = String(response.data?.remark || '').toLowerCase();
        if (/runtime error|timed out|out of memory/.test(remark)) return null;
        return Array.isArray(response.data?.elements)
          ? response.data.elements
          : null;
      },
    },
    terrain: {
      // Fork-lite: sample the globe's own terrain provider directly —
      // no /api/terrain/heights proxy. Falls back to geoid math in the
      // createTerrainHeights wrapper when the provider is not ready.
      async getHeights(points, { signal } = {}) {
        const { createCesiumTerrainSource } = await import(
          '../sources/cesiumTerrain.js'
        );
        return createCesiumTerrainSource().getHeights(points, { signal });
      },
    },
    regional: {
      // Fork-lite: the server-generated regional brief is excluded from v1.
      async getBrief() {
        throw new Error('Regional brief unavailable in this build');
      },
    },
    weather: {
      // Fork-lite: the server weather-effects feed is excluded from v1.
      async getConditions() {
        throw new Error('Weather effects unavailable in this build');
      },
    },
    summary: {
      // Fork-lite: the OpenAI HUD summary is excluded from v1.
      async summarize() {
        throw new Error('AI summary unavailable in this build');
      },
    },
  };
  services.features =
    features ??
    createOverpassFeatureSource({
      boundarySource: services.boundaries,
      signal: lifetime,
    });
  return services;
}
