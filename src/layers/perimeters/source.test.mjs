import test from 'node:test';
import assert from 'node:assert/strict';
import { createWfigsPerimeterSource } from './source.js';

const ring = [
  [-108.1, 35.2],
  [-108.0, 35.2],
  [-108.0, 35.3],
  [-108.1, 35.2],
];
const validPayload = {
  features: [
    {
      id: 1,
      geometry: { type: 'Polygon', coordinates: [ring] },
      properties: { attr_UniqueFireIdentifier: '2026-NMGNF-000123' },
    },
  ],
};

test('a successful response queries WFIGS directly and yields normalized rows', async () => {
  let requested;
  const source = createWfigsPerimeterSource({
    fetchImpl: async (url) => {
      requested = String(url);
      return Response.json(validPayload);
    },
  });
  const rows = await source.getSnapshot();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].stableId, '2026-NMGNF-000123');
  const parsed = new URL(requested);
  assert.equal(
    parsed.origin + parsed.pathname,
    'https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/WFIGS_Interagency_Perimeters_Current/FeatureServer/0/query',
  );
  assert.equal(parsed.searchParams.get('f'), 'geojson');
  assert.equal(parsed.searchParams.get('resultOffset'), '0');
});

test('a truncated response pages past the transfer limit', async () => {
  const pageRing = (id) => ({
    id,
    geometry: { type: 'Polygon', coordinates: [ring] },
    properties: { attr_UniqueFireIdentifier: `fire-${id}` },
  });
  const offsets = [];
  const source = createWfigsPerimeterSource({
    fetchImpl: async (url) => {
      const params = new URL(String(url)).searchParams;
      offsets.push(params.get('resultOffset'));
      const page = offsets.length;
      return Response.json({
        features: [pageRing(page)],
        exceededTransferLimit: page < 3,
      });
    },
  });
  const rows = await source.getSnapshot();
  assert.deepEqual(
    rows.map((row) => row.stableId),
    ['fire-1', 'fire-2', 'fire-3'],
  );
  assert.deepEqual(offsets, ['0', '1', '2']);
});

test('an upstream failure surfaces its HTTP status', async () => {
  const source = createWfigsPerimeterSource({
    fetchImpl: async () => ({ ok: false, status: 503 }),
  });
  await assert.rejects(source.getSnapshot(), /WFIGS HTTP 503/);
});

test('a malformed successful response is never accepted as an empty snapshot', async () => {
  for (const payload of [{}, { features: null }, { features: {} }]) {
    const source = createWfigsPerimeterSource({
      fetchImpl: async () => Response.json(payload),
    });
    await assert.rejects(source.getSnapshot(), /Malformed perimeter snapshot/);
  }
});

test('response-body completion honors cancellation without replacing records', async () => {
  const abort = new AbortController();
  const source = createWfigsPerimeterSource({
    fetchImpl: async () => ({
      ok: true,
      headers: new Headers(),
      text: async () => {
        abort.abort();
        return JSON.stringify(validPayload);
      },
    }),
  });
  await assert.rejects(source.getSnapshot({ signal: abort.signal }), {
    name: 'AbortError',
  });
});
