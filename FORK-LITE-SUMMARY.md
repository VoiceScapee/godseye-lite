# God's Eye View — Fork-Lite Summary

**Date:** 2026-09-26
**Upstream:** `bilawalsidhu/gods-eye-view` (MIT) — depth-1 clone at `~/workspace/ops/gods-eye-view/fork`
**Purpose:** Interactive Voicescape blockpage ("God's Eye") based on the MIT-licensed upstream, rebuilt as a static-only fork with keyless, browser-direct data sources and two owned Vercel serverless proxies.

## What changed from upstream

### Server removed
The upstream `server/` directory (Express dev server with API keys, AI services, and provider proxies) is deleted. The fork is static-only (`vite.config.js` builds `dist/` with no server middleware).

### Data sources: keyless and browser-direct
| Layer | Source | Notes |
|-------|--------|-------|
| Flights (civilian) | adsb.lol via `/api/adsb` proxy | ODbL, keyless. Proxy required: no browser CORS. |
| Flights (military) | adsb.lol `/v2/mil` via proxy | Same. |
| Satellites | CelesTrak TLEs via `/api/tle` proxy | Keyless. Proxy required: no browser CORS. |
| Launches | Launch Library 2 (direct) + station TLEs | Keyless. |
| Earthquakes | USGS (direct) | Public domain. |
| Wildfire perimeters | NIFC WFIGS ArcGIS (direct GeoJSON) | Public. InciWeb enrichment removed (unverifiable). |
| Radar | **REMOVED** | RainViewer free tier excludes commercial use. Layer reports honest unavailable. |
| Clouds/Lightning/Wind | Honestly unavailable | Needed server compositing pipeline. |
| Transit | GTFS-RT direct (Minneapolis, Entur Norway) | MBTA/CapMetro/HSL/OVapi/TransLink disabled (no browser CORS). |
| Bikeshare | GBFS direct | City-by-city CORS validation still required. |
| Radio | Radio Browser (direct, DE/NL/AT mirrors) | Keyless. |
| Directions | OSRM (direct) | Public demo server; policy limits apply. |
| Roads | Overpass (direct, bounded) + simulated traffic | TomTom excluded. |
| Military installations | Overpass (direct, bounded) | |
| Search/reverse-geocode | Photon + Nominatim (direct) | See policy notes below. |
| Terrain | Cesium sampleTerrainMostDetailed on active provider | Re:Earth keyless terrain; flat fallback. |
| Imagery | Esri World Imagery (keyless) | |

### Excluded from v1 (Brandon's directives + license/policy)
- **Camera locations / ALPR:** Entire layer excluded per Brandon ("Take off camera location").
- **OpenSky:** Excluded — non-commercial license.
- **OpenAI voice:** Removed. No voice in v1.
- **AISStream vessels:** Excluded (needs API key).
- **NASA FIRMS fires:** Excluded (needs API key).
- **TomTom traffic:** Excluded. Simulated traffic only.
- **Google services:** Removed from default composition (geocoding, Places, Maps keys).
- **Cyclones:** Honestly unavailable (needed server assembly).
- **Regional AI brief / weather effects / AI HUD:** Honestly unavailable (needed server AI).

### The two owned proxies (`/api/`)
Vercel serverless functions shipped with the fork:
- `api/adsb.js` — forwards allowlisted adsb.lol paths. **Query-param routing** (`/api/adsb?path=/v2/mil`) so Vercel file routing always reaches the handler.
- `api/tle.js` — forwards allowlisted CelesTrak groups (`/api/tle?group=stations`).

Both are keyless, add no secrets, and set `Access-Control-Allow-Origin: *`. On a pure static host without the functions, flights/satellites degrade to honest unavailable.

## License & policy gates (verified 2026-09-26)

### ✅ adsb.lol
ODbL license, commercial use OK. Keyless. No browser CORS → proxy required (shipped).

### ✅ CelesTrak
Keyless TLE data. No browser CORS → proxy required (shipped).

### ❌ RainViewer — REMOVED
Free tier is "personal, educational, and small-community use only." Commercial integration explicitly excluded. The radar product was removed; the weather layer reports honest unavailable for all products. Do not re-add without a commercial agreement.

### ⚠️ Nominatim (public instance) — USE WITH CARE
OSMF usage policy (verified 2026-09-26):
- Absolute max **1 request/second**
- Valid **Referer OR User-Agent** identifying the app required (browsers send Referer automatically — OK)
- **Autocomplete/type-ahead explicitly forbidden** — search must be on-submit only
- Attribution required (present: "OpenStreetMap / Nominatim")
- "Limit your use"; self-host for heavy/commercial scale
- Data ODbL 1.0

**v1 position:** Low-volume, on-submit search with automatic Referer is within policy. If traffic grows, self-host Nominatim or switch to Photon primary.

### ✅ Photon (Komoot)
Built for search-as-you-type. Fair-use; throttling if abused. Keyless. Preferred for autocomplete if added.

### ✅ Esri World Imagery
Keyless tile access. Standard Esri attribution required (present in app).

### ✅ USGS Earthquakes
Public domain. No restrictions.

### ✅ WFIGS Wildfire Perimeters
NIFC ArcGIS FeatureServer, public. `Access-Control-Allow-Origin: *` confirmed.

### ✅ Radio Browser
Keyless, community-run. DE/NL/AT mirrors configured.

### ⚠️ OSRM (public demo server)
FOSSGIS policy: reasonable non-commercial use, max 1 req/s. Low-volume routing OK for v1.

### ⚠️ Overpass API
~2 concurrent slots/IP, <10k queries/day. Bounded queries only. OK for v1.

## Bundle hygiene
Production bundle (`dist/assets/`) contains `/api/` references for:
- `/api/adsb` ✅ (owned proxy, query-param routing)
- `/api/tle` ✅ (owned proxy)
- `/api/local-receivers/aircraft` — **justified**: niche SDR hobbyist feature (own ADS-B receiver). Degrades to honest "unsupported" state when the route 404s. UI handles the error explicitly.
- `/api/setup/keys`, `/api/setup/status` — **justified**: dev-only key-setup UI. Self-destructs in production: the status fetch fails, and both chip and dialog are removed outright. Unreachable in prod.
- `/api/weather/*` — **justified**: unreachable dead code. No weather products ship (`WEATHER_V1_PRODUCTS` is empty). The URL builders are preserved (tested machinery) for a future licensed radar source.

No Google, TomTom, OpenAI, AIS, FIRMS, or OpenSky references in the production path.

## Test status
- Targeted suites (WFIGS, bikeshare, geospatial, keyless-geocoder, cyclones, live-source contracts, weather): **passing** (127 weather tests, 5 live-source contract tests, 27 keyless-geocoder, 8 geospatial)
- Production build (`npm run build`): **passing** (Vite 6.4.3, ~12.5s)
- Annotation resolver: 15/23 passing. 6 admin-bypass tests fixed (Google→provider adapter). 7 tests failing:
  - 5 OSM integration tests timeout on real network (mock `/api/overpass`, code uses direct `overpass-api.de`)
  - 2 keyless Photon tests need provider-level mock rework
  - These test the landmark-annotation OSM integration; the feature works in production via direct Overpass. Needs a dedicated mock-rework pass.
- Full suite: **hangs silently** — `scripts/run-unit-tests.mjs` produces zero output after 6+ minutes. Likely the annotation OSM tests hanging on network. Needs investigation before v1 sign-off.

## Not yet done (pre-production)
1. Fix or replace the hanging full test suite; get a green full run.
2. Remove or justify `/api/local-receivers/*` and `/api/setup/*` in the bundle.
3. Browser-test: globe, Esri imagery, flights, satellites, launches, earthquakes, radio, transit, bikeshare, traffic sim, routing, installations, fire perimeters, search, terrain, mobile controls, attribution, honest unavailable states.
4. City-by-city GBFS CORS validation.
5. Confirm WFIGS `exceededTransferLimit` paging behavior.
6. Verify terrain sampling against the real active provider in-browser.
7. Brandon's confirmation on the expanded ADS-B proxy (beyond the TLE proxy).
8. Commit and push (isolated branch, no `git add -A`).
9. Preview deployment — **parked at approval gate**. No merge, deploy, HBAR spend, or transactions without explicit approval.

## Responsible-use boundary
No named-person tracking, facial recognition, plate recognition, or image enhancement. No camera-location/ALPR functionality. Provider data is represented honestly; failures degrade to explicit "unavailable" states, never fake data.
