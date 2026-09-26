import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGeospatialServices,
  createHttpGeospatialProvider,
  createDefaultPlaceSearch,
} from './index.js';

const point = { latitude: 30, longitude: -97, radiusM: 250 };
const coordinates = [
  [-97, 30],
  [-97.001, 30.001],
];
const route = { geometry: coordinates, distanceM: 120, durationS: 90 };
const json = (data) =>
  new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json' },
  });

const nominatimHit = {
  place_id: 1,
  lat: '30.1',
  lon: '-97.1',
  display_name: 'Library, Town, Country',
  class: 'amenity',
  type: 'library',
  address: { city: 'Town', country: 'Country', road: 'Main St' },
};

test('each operation can use an independent provider without coupling forward search', async () => {
  const calls = [];
  const service = createDefaultPlaceSearch({
    providers: {
      geocode: [
        {
          geocode: async () => ({
            place: { lat: 30, lng: -97 },
            answered: true,
          }),
        },
      ],
      reverseGeocode: async (lat, lon) => {
        calls.push([lat, lon]);
        return { locality: 'Town' };
      },
      textSearch: async (q) => [{ name: q, ...point }],
      nearby: async (p) => [p],
      route: async () => route,
      routeProfiles: ['foot'],
    },
  });
  assert.equal((await service.geocode('Town')).place.lat, 30);
  assert.equal((await service.reverseGeocode(30, -97)).locality, 'Town');
  assert.equal((await service.textSearch('Library', point))[0].name, 'Library');
  assert.deepEqual(await service.nearby(point), [point]);
  assert.deepEqual(await service.route(coordinates), {
    ...route,
    ok: true,
    profile: 'foot',
  });
  assert.equal(await service.route(coordinates, 'car'), null);
  assert.deepEqual(calls, [[30, -97]]);
});

test('unsupported operations and invalid coordinates never initiate a request', async () => {
  let calls = 0;
  const service = createGeospatialServices({
    providers: {
      route: () => {
        calls++;
      },
    },
  });
  assert.equal(service.capabilities.reverseGeocode, false);
  assert.equal(await service.reverseGeocode(30, -97), null);
  assert.equal(
    await service.route([
      [999, 30],
      [-97, 30],
    ]),
    null,
  );
  assert.equal(await service.route(coordinates, 'spaceship'), null);
  assert.equal(calls, 0);
  const invalid = createGeospatialServices({
    providers: { route: async () => ({ ...route, durationS: NaN }) },
  });
  assert.equal(await invalid.route(coordinates), null);
});

test('HTTP provider queries Nominatim directly for reverse geocoding', async () => {
  const urls = [];
  const provider = createHttpGeospatialProvider({
    fetchImpl: async (url) => {
      urls.push(String(url));
      return json(nominatimHit);
    },
  });
  const result = await provider.reverseGeocode(30, -97);
  assert.ok(urls[0].startsWith('https://nominatim.openstreetmap.org/reverse'));
  assert.ok(urls[0].includes('lat=30'));
  assert.equal(result.locality, 'Town');
  assert.equal(result.country, 'Country');
  assert.deepEqual(provider.attribution.reverseGeocode, 'OpenStreetMap / Nominatim');
});

test('HTTP provider queries Nominatim directly for text search', async () => {
  const urls = [];
  const provider = createHttpGeospatialProvider({
    fetchImpl: async (url) => {
      urls.push(String(url));
      return json([nominatimHit]);
    },
  });
  const results = await provider.textSearch('Library', point);
  assert.ok(urls[0].startsWith('https://nominatim.openstreetmap.org/search'));
  assert.ok(urls[0].includes('q=Library'));
  assert.equal(results.length, 1);
  assert.ok(Number.isFinite(results[0].lat));
  assert.ok(Number.isFinite(results[0].lng));
});

test('HTTP provider reports nearby as unavailable and routes through the directions layer', async () => {
  let calls = 0;
  const provider = createHttpGeospatialProvider({
    fetchImpl: async () => {
      calls++;
      return json({});
    },
  });
  assert.deepEqual(await provider.nearby(point), []);
  assert.equal(calls, 0);
  await assert.rejects(provider.route(coordinates, 'car'), /unavailable through this provider/);
});

test('HTTP refusal cancels its response body', async () => {
  let cancelled = 0;
  const provider = createHttpGeospatialProvider({
    fetchImpl: async () => ({
      ok: false,
      body: {
        async cancel() {
          cancelled++;
        },
      },
    }),
  });
  await assert.rejects(provider.reverseGeocode(30, -97), /unavailable/);
  assert.equal(cancelled, 1);
});

test('Photon configuration changes its endpoint without changing its normalized result', async () => {
  const service = createDefaultPlaceSearch({
    endpoints: { photon: 'https://search.example/api/' },
    fetchImpl: async (url) => {
      assert.equal(new URL(url).origin, 'https://search.example');
      return json({
        features: [
          {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [-97, 30] },
            properties: { name: 'Town' },
          },
        ],
      });
    },
  });
  assert.equal((await service.geocode('Town')).place.lat, 30);
});

test('direct Nominatim fallback answers with no key when Photon misses', async () => {
  const urls = [];
  const service = createDefaultPlaceSearch({
    fetchImpl: async (url) => {
      urls.push(String(url));
      // Photon returns nothing; Nominatim answers.
      if (String(url).includes('photon')) return json({ features: [] });
      return json([nominatimHit]);
    },
  });
  const result = await service.geocode('Library');
  assert.ok(result.place);
  assert.ok(
    urls.some((url) => url.startsWith('https://nominatim.openstreetmap.org/search')),
  );
});
