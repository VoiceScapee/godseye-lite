/**
 * Fork-lite: Radio Browser is called directly (CORS-clean, keyless).
 * The raw directory rows are transformed into the catalog shape the client
 * ingestion expects, and invalid rows are dropped up front so every returned
 * row passes validation downstream.
 */

const MIRRORS = [
  'https://de1.api.radio-browser.info',
  'https://nl1.api.radio-browser.info',
  'https://at1.api.radio-browser.info',
];

const DIRECTORY_PATH =
  '/json/stations/search?order=clickcount&reverse=true&limit=750&hidebroken=true&has_geo_info=true';

const CODEC_RE = /^(?:MP3|AAC(?:\+|-LC|-HE)?|HE-AAC)$/i;

function clean(value, maxLength) {
  if (typeof value !== 'string') return '';
  const collapsed = value.replace(/\s+/g, ' ').trim();
  return collapsed.length <= maxLength ? collapsed : '';
}

function splitList(value, limit) {
  if (typeof value !== 'string') return [];
  return value
    .split(',')
    .map((item) => item.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, limit);
}

function safeHttps(value) {
  if (typeof value !== 'string' || !value) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    if (!url.hostname) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function transformRow(raw) {
  const streamUrl = safeHttps(raw?.url_resolved);
  const lat = Number(raw?.geo_lat);
  const lon = Number(raw?.geo_long);
  if (!streamUrl) return null;
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) return null;
  if (!Number.isFinite(lon) || lon < -180 || lon > 180) return null;
  const name = clean(raw?.name, 140);
  const codec = clean(raw?.codec, 16);
  if (!name || !CODEC_RE.test(codec)) return null;
  const countryCode = clean(raw?.countrycode, 2);
  const bitrate = raw?.bitrate;
  return {
    id: raw?.stationuuid,
    name,
    lat,
    lon,
    streamUrl,
    homepage: safeHttps(raw?.homepage),
    tags: splitList(raw?.tags, 24),
    languages: splitList(raw?.language, 8),
    state: clean(raw?.state, 80),
    country: clean(raw?.country, 80),
    countryCode: countryCode.length === 2 ? countryCode.toUpperCase() : '',
    metadataTrust: 'untrusted-community',
    codec: codec.toUpperCase(),
    bitrate:
      Number.isInteger(bitrate) && bitrate >= 8 && bitrate <= 1024
        ? bitrate
        : null,
  };
}

/** Supply directory metadata and click reporting; audio stays with the broadcaster. */
export function createRadioSource({
  fetchImpl = (...args) => globalThis.fetch(...args),
} = {}) {
  async function fetchFromMirrors(path, { signal, method = 'GET' } = {}) {
    let lastError = null;
    for (const mirror of MIRRORS) {
      try {
        signal?.throwIfAborted();
        const response = await fetchImpl(mirror + path, { signal, method });
        if (!response.ok)
          throw new Error(`Radio Browser returned ${response.status}`);
        return response;
      } catch (e) {
        lastError = e;
        if (e?.name === 'AbortError') throw e;
      }
    }
    throw lastError ?? new Error('Radio directory unreachable');
  }

  return {
    async getDirectory({ signal } = {}) {
      const response = await fetchFromMirrors(DIRECTORY_PATH, { signal });
      const rows = await response.json();
      signal?.throwIfAborted();
      if (!Array.isArray(rows))
        throw new Error('Radio directory response was malformed');
      const stations = rows.map(transformRow).filter(Boolean);
      if (!stations.length)
        throw new Error('Radio directory returned no usable stations');
      return {
        stations,
        updatedAt: new Date().toISOString(),
        stale: false,
        degraded: false,
        acceptedGeneration: 1,
        catalogInstance: 'radio-browser.info',
      };
    },
    async recordClick(id, { signal } = {}) {
      // Radio Browser counts a click when the stream URL is resolved.
      await fetchFromMirrors(`/json/url/${encodeURIComponent(id)}`, {
        signal,
        method: 'GET',
      });
      signal?.throwIfAborted();
    },
  };
}
