import { TLE_PROXY_URL } from '../../config.js';
import { launchLibraryRecentUrl } from '../../data/spaceProviderRequests.js';

/**
 * Read launch records and their optional active-orbit catalog with explicit
 * cancellation.
 * Fork-lite: Launch Library 2 is called directly (it sends
 * Access-Control-Allow-Origin: *); the active-orbit TLE catalog goes through
 * the same-origin TLE proxy (CelesTrak sends no CORS headers).
 */
export function createLaunchSource({
  fetchImpl = (...args) => globalThis.fetch(...args),
} = {}) {
  return {
    async getLaunches({ signal } = {}) {
      signal?.throwIfAborted();
      const url = launchLibraryRecentUrl(new Date());
      const response = await fetchImpl(url.toString(), {
        signal,
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      signal?.throwIfAborted();
      if (!Array.isArray(payload) && !Array.isArray(payload?.results))
        throw new Error('Malformed launch snapshot');
      return payload;
    },
    async getActiveTle({ signal } = {}) {
      signal?.throwIfAborted();
      const response = await fetchImpl(`${TLE_PROXY_URL}?group=stations`, {
        signal,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const text = await response.text();
      signal?.throwIfAborted();
      return text;
    },
  };
}
