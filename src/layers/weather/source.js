export const WEATHER_PRODUCTS = Object.freeze([
  'radar',
  'clouds',
  'clouds-regional',
  'lightning',
]);

/**
 * Fork-lite product availability (2026-09-26). No weather products ship in v1.
 *
 * The upstream server composited clouds/lightning radar frames server-side;
 * that pipeline is gone, so they were already honestly unavailable. The radar
 * product briefly used the RainViewer public API directly, but RainViewer's
 * free tier is licensed for personal, educational, and small-community use
 * only — commercial integration (Voicescape) is explicitly excluded by their
 * terms. Rather than ship on a license we do not hold, radar now degrades to
 * the same honest "unavailable" state the layer already renders.
 *
 * This is the conservative, honest v1 call. If a commercial-safe radar source
 * is licensed later (e.g. a bespoke RainViewer commercial agreement, or a
 * public-domain NOAA mosaic), restore it here behind WEATHER_V1_PRODUCTS.
 */
export const WEATHER_V1_PRODUCTS = Object.freeze([]);

/** Only bounded, explicit observations may become imagery requests. */
export function validateWeatherSnapshot(value, product) {
  if (!value || value.schemaVersion !== 1 || value.product !== product)
    throw new Error('Malformed weather manifest');
  if (value.unavailable) return value;
  const { bounds, times } = value;
  if (
    !bounds ||
    !['west', 'south', 'east', 'north'].every((key) =>
      Number.isFinite(bounds[key]),
    ) ||
    bounds.west < -180 ||
    bounds.east > 180 ||
    bounds.south < -90 ||
    bounds.north > 90 ||
    bounds.west >= bounds.east ||
    bounds.south >= bounds.north ||
    !Array.isArray(times) ||
    times.length < 1 ||
    times.length > 13 ||
    times.some(
      (time, i) =>
        typeof time !== 'string' ||
        !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(time) ||
        !Number.isFinite(Date.parse(time)) ||
        new Date(time).toISOString() !== time ||
        (i > 0 && time <= times[i - 1]),
    ) ||
    value.latest !== times.at(-1) ||
    value.tileSize !== 256 ||
    value.maxLevel !== 6 ||
    !['geographic', 'web-mercator'].includes(value.tilingScheme)
  )
    throw new Error('Malformed weather manifest');
  return value;
}

/**
 * Imagery URL builders (generic manifest -> URL machinery, not provider
 * specific). No weather products ship in v1 so these never run in production;
 * they exist so the rendering machinery keeps a valid, tested contract for a
 * future commercial-safe radar source. The /api/weather/* paths they build
 * reference the retired upstream server proxy and are unreachable dead code
 * until a licensed source restores getSnapshot above.
 */
export const WEATHER_IMAGE_SIZES = Object.freeze({
  radar: Object.freeze({ width: 4096, height: 2048 }),
  'clouds-regional': Object.freeze({ width: 4096, height: 2048 }),
  clouds: Object.freeze({ width: 2048, height: 1024 }),
  lightning: Object.freeze({ width: 4096, height: 2048 }),
});
export const WEATHER_DETAIL_SIZE = Object.freeze({ width: 4096, height: 2048 });

export function weatherImageUrl(
  product,
  time,
  { width, height } = {},
  bbox = null,
) {
  if (!WEATHER_PRODUCTS.includes(product) || !Number.isFinite(Date.parse(time)))
    throw new Error('Invalid weather frame');
  let box = '';
  if (bbox !== null) {
    const edges = [bbox.west, bbox.south, bbox.east, bbox.north];
    if (
      !edges.every(Number.isFinite) ||
      edges[0] >= edges[2] ||
      edges[1] >= edges[3]
    )
      throw new Error('Invalid weather window');
    box = `&bbox=${edges.join(',')}`;
  }
  const largest =
    bbox === null ? WEATHER_IMAGE_SIZES[product] : WEATHER_DETAIL_SIZE;
  let size = '';
  if (width !== undefined || height !== undefined) {
    if (
      ![1024, 2048, 4096].includes(width) ||
      height !== width / 2 ||
      width > largest.width
    )
      throw new Error('Invalid weather image size');
    if (width !== largest.width) size = `&size=${width}x${height}`;
  }
  return `/api/weather/image?product=${product}&time=${encodeURIComponent(time)}${box}${size}`;
}

export function weatherTileUrl(product, time, { size } = {}) {
  if (!WEATHER_PRODUCTS.includes(product) || !Number.isFinite(Date.parse(time)))
    throw new Error('Invalid weather frame');
  if (size !== undefined && ![256, 512, 1024].includes(size))
    throw new Error('Invalid weather tile size');
  return `/api/weather/tile?product=${product}&time=${encodeURIComponent(time)}&z={z}&x={x}&y={y}${size === undefined ? '' : `&size=${size}`}`;
}

/** Acquisition is lazy and shares the application's existing source contract. */
export function createWeatherSource() {
  return {
    async getSnapshot({ product = 'radar' } = {}) {
      if (!WEATHER_PRODUCTS.includes(product))
        throw new Error('Unknown weather product');
      // Honest unavailability for every product in v1 (see header comment).
      return {
        schemaVersion: 1,
        product,
        unavailable: true,
      };
    },
  };
}
