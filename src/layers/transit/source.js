import { decodeVehiclePositions } from '../../data/gtfsRealtime.js';
import { getRegisteredTransitFeed } from '../../data/transitFeeds.js';
import { LiveSourceError } from '../../sources/live/contract.js';

/**
 * Fork-lite: each registered feed's GTFS-RT protobuf is fetched directly from
 * the operator and decoded in the browser (pbf is already a dependency).
 * Only feeds whose operators send CORS headers work from a static page;
 * CORS-blocked feeds are disabled in transitFeeds.js and never polled.
 *
 * Vehicle trails needed the server's trail store — unavailable in the static
 * build, so getHistory reports honestly instead of fabricating.
 */
export function createTransitSource({
  fetchImpl = (...args) => fetch(...args),
} = {}) {
  return {
    getHistory() {
      return Promise.reject(
        new LiveSourceError(
          'unavailable',
          'Vehicle trails are unavailable in the static build',
        ),
      );
    },
    requestSnapshot(feedId, { signal } = {}) {
      signal?.throwIfAborted();
      if (typeof feedId !== 'string' || !feedId || feedId.length > 160)
        throw new TypeError('A transit feed identifier is required');
      const feed = getRegisteredTransitFeed(feedId);
      if (!feed) throw new TypeError('Unknown transit feed');
      return Promise.resolve(
        fetchImpl(feed.url, {
          signal,
          headers: {
            Accept: 'application/x-protobuf',
            ...(feed.headers || {}),
          },
        }),
      ).then(async (response) => {
        signal?.throwIfAborted();
        if (!response.ok) {
          return {
            ok: false,
            status: response.status,
            headers: response.headers,
            async json() {
              return null;
            },
          };
        }
        const bytes = new Uint8Array(await response.arrayBuffer());
        signal?.throwIfAborted();
        const decoded = decodeVehiclePositions(bytes);
        const body = {
          fetchedAt: Date.now(),
          vehicles: decoded.vehicles,
        };
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          async json() {
            signal?.throwIfAborted();
            return body;
          },
        };
      });
    },
  };
}
