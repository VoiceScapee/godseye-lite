import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createWeatherSource,
  validateWeatherSnapshot,
  WEATHER_PRODUCTS,
  WEATHER_V1_PRODUCTS,
} from './source.js';

const time = '2026-09-16T02:00:00.000Z';

test('no weather products ship in v1 (RainViewer free tier excludes commercial use)', () => {
  assert.deepEqual([...WEATHER_V1_PRODUCTS], []);
  assert.ok(WEATHER_PRODUCTS.includes('radar'));
});

test('observed source accepts bounded exact times and refuses malformed frames', () => {
  const snapshot = () => ({
    schemaVersion: 1,
    product: 'radar',
    bounds: { west: -130, south: 20, east: -60, north: 55 },
    times: [time],
    latest: time,
    tileSize: 256,
    maxLevel: 6,
    tilingScheme: 'geographic',
  });
  assert.equal(validateWeatherSnapshot(snapshot(), 'radar').latest, time);
  for (const bad of [
    { times: [time, time] },
    { product: 'other' },
    { times: Array(14).fill(time) },
    { latest: 'tomorrow' },
    { maxLevel: 20 },
    { bounds: { west: -999, south: 0, east: 1, north: 1 } },
  ]) {
    assert.throws(
      () => validateWeatherSnapshot({ ...snapshot(), ...bad }, 'radar'),
      /Malformed weather manifest/,
    );
  }
});

test('every product returns honest unavailability without touching the network', async () => {
  const source = createWeatherSource({
    fetchImpl: async () => {
      throw new Error('must not fetch');
    },
  });
  for (const product of WEATHER_PRODUCTS) {
    const snapshot = await source.getSnapshot({ product });
    assert.equal(snapshot.schemaVersion, 1);
    assert.equal(snapshot.product, product);
    assert.equal(snapshot.unavailable, true);
    assert.equal(validateWeatherSnapshot(snapshot, product).unavailable, true);
  }
});

test('unknown products still throw', async () => {
  const source = createWeatherSource();
  await assert.rejects(source.getSnapshot({ product: 'snow' }), /Unknown/);
});
