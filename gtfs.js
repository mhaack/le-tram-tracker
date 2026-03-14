import { existsSync, createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import AdmZip from 'adm-zip';
import { parse } from 'csv-parse/sync';

const GTFS_URL = 'https://www.mdv.de/media/file/817b7b11';
const GTFS_CACHE = './gtfs_mdv.zip';
const LVB_AGENCY_ID = '01130';
const LVB_TRAM_LINES = new Set(['1','2','3','4','7','8','9','10','11','12','14','15','16']);

/** Map<lineNum, { outbound?: RouteDir, inbound?: RouteDir }>
 *  RouteDir = { stops: [{id, name, lat, lon}], shape: [[lat,lon],...] }
 */
export const tramRouteData = new Map();

export async function loadGtfs() {
  await ensureDownloaded();
  parseGtfs();
}

async function ensureDownloaded() {
  if (existsSync(GTFS_CACHE)) {
    console.log('GTFS: using cached gtfs_mdv.zip');
    return;
  }
  console.log('GTFS: downloading from MDV (~12 MB)…');
  const res = await fetch(GTFS_URL);
  if (!res.ok) throw new Error(`GTFS download failed: HTTP ${res.status}`);
  await pipeline(res.body, createWriteStream(GTFS_CACHE));
  console.log('GTFS: download complete');
}

function parseCsv(zip, filename) {
  return parse(zip.readAsText(filename), {
    columns: true, skip_empty_lines: true, trim: true, bom: true,
  });
}

function parseGtfs() {
  console.log('GTFS: parsing…');
  const zip = new AdmZip(GTFS_CACHE);

  // 1. Routes → LVB tram route_ids
  const tramRouteMap = new Map(); // routeId → lineNum
  for (const r of parseCsv(zip, 'routes.txt')) {
    if (r.agency_id === LVB_AGENCY_ID && r.route_type === '0' && LVB_TRAM_LINES.has(r.route_short_name.trim())) {
      tramRouteMap.set(r.route_id, r.route_short_name.trim());
    }
  }
  console.log(`GTFS: found ${tramRouteMap.size} LVB tram routes`);

  // 2. Trips → collect ALL trips per route+direction
  const routeDirTrips = new Map(); // `${routeId}-${dirId}` → [{tripId, lineNum, dirId}]
  for (const t of parseCsv(zip, 'trips.txt')) {
    if (!tramRouteMap.has(t.route_id)) continue;
    const key = `${t.route_id}-${t.direction_id}`;
    if (!routeDirTrips.has(key)) routeDirTrips.set(key, []);
    routeDirTrips.get(key).push({
      tripId:  t.trip_id,
      lineNum: tramRouteMap.get(t.route_id),
      dirId:   t.direction_id,
    });
  }

  const allTramTripIds = new Set([...routeDirTrips.values()].flatMap(arr => arr.map(t => t.tripId)));

  // 3. Stop times — single read, two purposes:
  //    a) count stops per trip to find the longest (most complete) service
  //    b) store stop sequences for the eventually-selected trips
  const stopCount  = new Map(); // tripId → int
  const stopSeqs   = new Map(); // tripId → [{stopId, seq}]

  for (const st of parseCsv(zip, 'stop_times.txt')) {
    if (!allTramTripIds.has(st.trip_id)) continue;
    stopCount.set(st.trip_id, (stopCount.get(st.trip_id) ?? 0) + 1);
    if (!stopSeqs.has(st.trip_id)) stopSeqs.set(st.trip_id, []);
    stopSeqs.get(st.trip_id).push({ stopId: st.stop_id, seq: +st.stop_sequence });
  }
  for (const arr of stopSeqs.values()) arr.sort((a, b) => a.seq - b.seq);

  // Select the trip with the most stops per route+direction
  const repTrips = new Map(); // key → {tripId, lineNum, dirId}
  for (const [key, trips] of routeDirTrips) {
    const best = trips.reduce((a, b) =>
      (stopCount.get(a.tripId) ?? 0) >= (stopCount.get(b.tripId) ?? 0) ? a : b
    );
    repTrips.set(key, best);
  }

  // 4. Stops → id → {name, lat, lon}
  const stopsMap = new Map();
  for (const s of parseCsv(zip, 'stops.txt')) {
    stopsMap.set(s.stop_id, { name: s.stop_name, lat: +s.stop_lat, lon: +s.stop_lon });
  }

  // 5. Build tramRouteData index (no shapes.txt in this GTFS feed)
  for (const { tripId, lineNum, dirId } of repTrips.values()) {
    if (!tramRouteData.has(lineNum)) tramRouteData.set(lineNum, {});

    const stops = (stopSeqs.get(tripId) ?? []).flatMap(({ stopId }) => {
      const s = stopsMap.get(stopId);
      return s ? [{ id: stopId, name: s.name, lat: s.lat, lon: s.lon }] : [];
    });

    // Shape = ordered stop coordinates (no shapes.txt available)
    const shape = stops.map(s => [s.lat, s.lon]);

    const dir = dirId === '0' ? 'outbound' : 'inbound';
    tramRouteData.get(lineNum)[dir] = { stops, shape };
  }

  const lines = [...tramRouteData.keys()].sort((a, b) => +a - +b).join(', ');
  console.log(`GTFS: indexed lines: ${lines}`);
}
