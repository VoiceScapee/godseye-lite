/**
 * Fork-lite: the wind particle layer needed the server to download and convert
 * GFS GRIB grids — there is no keyless, CORS-clean global wind grid a browser
 * can fetch directly. The layer reports honest unavailability instead of
 * fabricating wind. (Open-Meteo offers point forecasts, not the global grid
 * this layer's streamlines require.)
 */
export function createWindSource({ timeoutMs = 45_000 } = {}) {
  return {
    async getSnapshot({ signal, model = 'gfs', overlay = 'none' } = {}) {
      if (!['gfs', 'ifs'].includes(model))
        throw new Error('Unknown wind model');
      if (!['none', 'temperature', 'pressure'].includes(overlay))
        throw new Error('Unknown weather overlay');
      signal?.throwIfAborted();
      return {
        unavailable: true,
        model,
        overlay,
        reason:
          'Global wind grids need server-side GRIB conversion — unavailable in the static build',
      };
    },
  };
}
