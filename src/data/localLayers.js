import { localGeoJsonServices } from './localGeojson.js';
import { createInfrastructureLayers } from './infrastructure.js';

const [datacenters, dams] = createInfrastructureLayers(localGeoJsonServices);

// Fork-lite: the NASA FIRMS heatmap layer was removed (needs a server-held
// FIRMS_MAP_KEY) and the TeleGeography submarine-cable bundle was removed
// (CC BY-NC-SA 3.0 — not permitted for commercial use).

export default [datacenters, dams];
