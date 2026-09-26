import { readResponseJsonCapped } from '../../sources/httpBody.js';
import { normalizeFirePerimeterSnapshot } from './records.js';

/**
 * Fork-lite: NIFC WFIGS is queried directly (ArcGIS REST sends
 * Access-Control-Allow-Origin: *). U.S. public domain interagency wildfire
 * data, no key. Pages past the transfer limit with resultOffset.
 */
const WFIGS_URL =
  'https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/WFIGS_Interagency_Perimeters_Current/FeatureServer/0/query';

const OUTFIELDS = [
  'attr_UniqueFireIdentifier',
  'poly_IncidentName',
  'attr_IncidentSize',
  'attr_PercentContained',
  'attr_POOState',
  'attr_IncidentTypeCategory',
  'attr_FireDiscoveryDateTime',
  'poly_DateCurrent',
  'attr_FireCause',
  'attr_FireBehaviorGeneral',
  'attr_TotalIncidentPersonnel',
  'attr_POOCounty',
  'attr_EstimatedCostToDate',
  'attr_IncidentComplexityLevel',
  'attr_CpxName',
].join(',');

/** Request a normalized snapshot directly from the WFIGS feature service. */
export function createWfigsPerimeterSource({
  fetchImpl = (...args) => globalThis.fetch(...args),
} = {}) {
  return {
    async getSnapshot({ signal } = {}) {
      const features = [];
      let offset = 0;
      for (;;) {
        signal?.throwIfAborted();
        const url =
          `${WFIGS_URL}?where=${encodeURIComponent('1=1')}` +
          `&outFields=${encodeURIComponent(OUTFIELDS)}` +
          '&f=geojson&geometryPrecision=4' +
          `&resultOffset=${offset}&resultRecordCount=1000`;
        const response = await fetchImpl(url, { signal });
        if (!response.ok) throw new Error(`WFIGS HTTP ${response.status}`);
        const payload = await readResponseJsonCapped(
          response,
          80 * 1024 * 1024,
          signal,
        );
        signal?.throwIfAborted();
        if (!Array.isArray(payload?.features))
          throw new Error('Malformed perimeter snapshot');
        features.push(...payload.features);
        if (!payload.exceededTransferLimit || !payload.features.length) break;
        offset += payload.features.length;
        if (offset > 10000) break;
      }
      const rows = normalizeFirePerimeterSnapshot({ features });
      if (!rows) throw new Error('Malformed perimeter snapshot');
      return rows;
    },
  };
}
