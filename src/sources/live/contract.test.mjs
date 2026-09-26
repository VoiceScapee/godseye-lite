import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createAdsbLolFlightSource,
  createAdsbLolSource,
  normalizeReadsbAircraft,
  readsbSnapshot,
  readsbIdentities,
} from './index.js';

const now = 1800000000000;
const response = (payload, headers = {}, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });

test('readsb aircraft normalization keeps identity and position distinct', () => {
  const row = normalizeReadsbAircraft(
    {
      hex: 'AbC123',
      flight: 'TEST123',
      lat: 30,
      lon: -97,
      alt_baro: 10000,
      gs: 250,
      track: 90,
      seen_pos: 15,
      extra: 'discard',
    },
    now,
  );
  assert.equal(row.id, 'abc123');
  assert.equal(row.callsign, 'TEST123');
  assert.equal(row.latitude, 30);
  assert.equal(row.longitude, -97);
  assert.equal('extra' in row, false);
  assert.equal(normalizeReadsbAircraft({ hex: 'x', lat: null, lon: null }), null);
});

test('construction is inert; adapters use the same-origin proxy with query-param paths', async () => {
  const requests = [];
  const fetchImpl = async (url, init) => {
    requests.push({ url, init });
    const parsed = new URL(url, 'https://app.test');
    const path = parsed.searchParams.get('path');
    if (path === '/v2/mil')
      return response(
        { ac: [{ hex: 'abc123', lat: 30, lon: -97, seen_pos: 15 }] },
        { 'x-ads-b-cache-age-ms': '60000', 'x-ads-b-cache': 'STALE' },
      );
    if (path?.startsWith('/v2/lat/'))
      return response({
        now: now / 1000,
        ac: [{ hex: 'abc123', lat: 30, lon: -97, seen_pos: 2 }],
      });
    if (path === '/trace')
      return response({
        timestamp: now / 1000 - 60,
        trace: [[10, 30, -97, 1000]],
      });
    throw new Error(`unexpected request: ${url}`);
  };
  const civil = createAdsbLolFlightSource({ fetchImpl, now: () => now });
  const military = createAdsbLolSource({ fetchImpl, now: () => now });
  assert.equal(requests.length, 0);
  const signal = new AbortController().signal;
  const snapshot = await civil.getSnapshot(
    { latitude: 30.123456, longitude: -97 },
    { signal },
  );
  const civilUrl = new URL(requests[0].url, 'https://app.test');
  assert.equal(civilUrl.pathname, '/api/adsb');
  assert.equal(
    civilUrl.searchParams.get('path'),
    '/v2/lat/30.1235/lon/-97.0000/dist/250',
  );
  assert.equal(requests[0].init.signal, signal);
  assert.equal(snapshot.source, 'adsb.lol');
  assert.equal(snapshot.coverage, 'regional 250 nm snapshot');
  assert.equal((await civil.getTrack('abc123')).records[0].baroAltitudeM, 304.8);
  const mil = await military.getSnapshot();
  const milUrl = new URL(requests[2].url, 'https://app.test');
  assert.equal(milUrl.searchParams.get('path'), '/v2/mil');
  assert.equal(mil.observedAtMs, now - 60000);
  assert.equal(mil.records[0].positionTimeMs, now - 75000);
  assert.equal(mil.stale, true);
  const track = await military.getTrack('abc123');
  assert.equal(track.complete, false);
  assert.equal(track.records[0].observedAtMs, now - 50000);
  assert.equal(track.records[0].baroAltitudeM, 304.8);
  assert.equal(track.records[0].ellipsoidAltitudeM, null);
});

test('regional flight source requires a viewport and never fabricates a global feed', async () => {
  const source = createAdsbLolFlightSource({
    fetchImpl: async () => {
      throw new Error('must not fetch without coordinates');
    },
  });
  await assert.rejects(
    source.getSnapshot({}),
    /Zoom in for live traffic/,
  );
});

test('cancellation after slow body parsing rejects even with a transport that ignores abort', async () => {
  let release;
  const controller = new AbortController();
  const source = createAdsbLolFlightSource({
    fetchImpl: async () => ({
      ok: true,
      json: () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    }),
  });
  const pending = source.getSnapshot(
    { latitude: 30, longitude: -97 },
    { signal: controller.signal },
  );
  await new Promise((resolve) => setImmediate(resolve));
  controller.abort();
  release({ now: now / 1000, ac: [] });
  await assert.rejects(pending, { name: 'AbortError' });
});

test('denials and outages never start another source and do not echo arbitrary response bodies', async () => {
  for (const status of [401, 403, 429, 502]) {
    let calls = 0;
    const source = createAdsbLolFlightSource({
      fetchImpl: async () => {
        calls++;
        return response({ error: 'sensitive upstream detail' }, {}, status);
      },
    });
    await assert.rejects(
      source.getSnapshot({ latitude: 30, longitude: -97 }),
      (error) => {
        assert.equal(error.status, status);
        assert.equal(error.message.includes('sensitive'), false);
        assert.ok(error.retryAfterMs >= 20000);
        return true;
      },
    );
    assert.equal(calls, 1);
  }
});
