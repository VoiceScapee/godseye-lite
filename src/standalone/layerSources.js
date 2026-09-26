import {
  createAdsbLolFlightSource,
  createAdsbLolSource,
} from '../sources/live/standalone.js';
import { createCctvSource } from '../layers/cctv/source.js';
import { createRadioSource } from '../layers/radio/source.js';
import { createTransitSource } from '../layers/transit/source.js';
import { createTrafficSource } from '../layers/traffic/source.js';
import { createBikeshareSource } from '../layers/bikeshare/source.js';
import { createInstallationSource } from '../layers/installations/source.js';
import { createSatelliteSource } from '../layers/satellites/source.js';
import { createLaunchSource } from '../layers/launches/source.js';
import { createWeatherSource } from '../layers/weather/source.js';
import { createCycloneSource } from '../layers/cyclones/source.js';
import { createWindSource } from '../layers/wind/source.js';
import { createReferenceSources } from '../sources/reference.js';
export { createReferenceSources as createStandaloneReferenceSources } from '../sources/reference.js';

/**
 * Select standalone providers without starting their acquisition.
 * Fork-lite: flights are adsb.lol-primary (OpenSky dropped — non-commercial
 * license); vessels (AISStream key), ALPR cameras (removed), and FIRMS fires
 * (server key) are excluded from v1.
 */
export function createStandaloneLayerSources() {
  return {
    ...createReferenceSources(),
    flights: createAdsbLolFlightSource(),
    military: createAdsbLolSource(),
    cctv: createCctvSource(),
    radio: createRadioSource(),
    traffic: createTrafficSource(),
    transit: createTransitSource(),
    bikeshare: createBikeshareSource(),
    installations: createInstallationSource(),
    satellites: createSatelliteSource(),
    launches: createLaunchSource(),
    wind: createWindSource(),
    weather: createWeatherSource(),
    cyclones: createCycloneSource(),
  };
}
