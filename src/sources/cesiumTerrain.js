import * as Cesium from 'cesium';

/**
 * Fork-lite: terrain heights resolve directly against the globe's terrain
 * provider via Cesium's sampleTerrainMostDetailed — no server proxy.
 * The map controller registers the active provider here whenever it switches
 * terrain (see src/maps/controller.js).
 */

let activeProvider = null;

export function setSharedTerrainProvider(provider) {
  activeProvider = provider ?? null;
}

export function getSharedTerrainProvider() {
  return activeProvider;
}

/**
 * Source compatible with createTerrainHeights: getHeights(points, {signal})
 * resolves to an array of {ellipsoid} heights aligned with the input points.
 */
export function createCesiumTerrainSource() {
  return {
    async getHeights(points, { signal } = {}) {
      const provider = activeProvider;
      if (!provider)
        throw new Error('Terrain provider not ready — cannot sample heights');
      signal?.throwIfAborted();
      const cartographics = points.map((point) =>
        Cesium.Cartographic.fromDegrees(point.lon, point.lat),
      );
      const sampled = await Cesium.sampleTerrainMostDetailed(
        provider,
        cartographics,
      );
      signal?.throwIfAborted();
      return sampled.map((cartographic, i) => ({
        lat: points[i].lat,
        lon: points[i].lon,
        ellipsoid: Number.isFinite(cartographic.height)
          ? cartographic.height
          : null,
      }));
    },
  };
}
