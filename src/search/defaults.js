import { createNominatimProvider } from './nominatim.js';
import { createGeospatialServices } from './geospatial.js';
import { createHttpGeospatialProvider } from './http.js';
import { createPlaceSearch } from './placeSearch.js';
import { createPhotonGeocoder } from '../keylessGeocoder.js';
import { createCoordinateGeocoder } from './coordinateGeocoder.js';
import { createPresetGeocoder } from './presetGeocoder.js';

/**
 * Coordinates and bundled names first — both answer offline and with no key —
 * then keyless Photon, then direct Nominatim as a last resort.
 *
 * `presets` is the caller's bundled place data. It is passed in rather than
 * imported so this package keeps reading no application state; with none
 * supplied there is simply no bundled-name provider.
 */
export function createDefaultPlaceSearch({
  resolveApiKey,
  fetchImpl = (...args) => fetch(...args),
  signal,
  endpoints = {},
  providers = {},
  presets = null,
  geocoding = null,
} = {}) {
  if (geocoding && geocoding.provider !== 'nominatim')
    throw new TypeError('Unsupported geocoding provider');
  const selected = geocoding
    ? createNominatimProvider({ ...geocoding, fetchImpl })
    : null;
  if (selected && !selected.geocode)
    throw new TypeError('Nominatim searchEndpoint is required');
  // Fork-lite: Google geocoding is excluded from v1. Keyless Photon first,
  // then direct Nominatim — both answer with no key.
  const forward = createPlaceSearch({
    signal,
    providers: providers.geocode || [
      createCoordinateGeocoder(),
      ...(presets ? [createPresetGeocoder({ presets })] : []),
      ...(selected
        ? [selected]
        : [
            createPhotonGeocoder({ fetchImpl, endpoint: endpoints.photon }),
            createNominatimProvider({
              fetchImpl,
              searchEndpoint:
                endpoints.nominatimSearch ||
                'https://nominatim.openstreetmap.org/search',
              reverseEndpoint:
                endpoints.nominatimReverse ||
                'https://nominatim.openstreetmap.org/reverse',
            }),
          ]),
    ],
  });
  const operations = createHttpGeospatialProvider({
    fetchImpl,
    resolveApiKey,
    endpoints,
  });
  return {
    ...forward,
    ...createGeospatialServices({
      signal,
      providers: {
        ...operations,
        ...(selected
          ? {
              reverseGeocode: selected.reverseGeocode,
              attribution: {
                ...operations.attribution,
                ...selected.attribution,
              },
            }
          : {}),
        ...providers,
      },
    }),
  };
}

// Compatibility for direct module callers. Application composition supplies its own instance.
export const defaultGeospatial = createDefaultPlaceSearch({});
