const fs = require("fs");
const path = require("path");

const SIRI_STOPS_URL = "https://transport.tallinn.ee/data/stops.txt";

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

async function* readCsv(filePath) {
  const stream = fs.createReadStream(filePath, { encoding: "utf-8" });
  let leftover = "";

  for await (const chunk of stream) {
    let data = leftover + chunk;
    const lines = data.split(/\r?\n/);
    leftover = lines.pop();
    for (const line of lines) {
      yield line;
    }
  }
  if (leftover) yield leftover;
}

async function parseCsvRows(filePath) {
  const gen = readCsv(filePath);
  let headers = null;
  const records = [];

  for await (const rawLine of gen) {
    let line = rawLine;
    if (!headers) {
      if (line.charCodeAt(0) === 0xfeff) line = line.slice(1);
      headers = line.split(",");
      continue;
    }
    if (!line.trim()) continue;
    const values = line.split(",");
    const rec = {};
    for (let i = 0; i < headers.length && i < values.length; i++) {
      rec[headers[i]] = values[i];
    }
    records.push(rec);
  }

  return records;
}

async function fetchSiriStopsRows() {
  console.log(`Fetching stops from ${SIRI_STOPS_URL} ...`);
  const res = await fetch(SIRI_STOPS_URL);
  if (!res.ok) {
    throw new Error(`Failed to fetch SIRI stops: ${res.status}`);
  }

  const text = await res.text();
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length <= 1) return [];

  const headers = lines[0].replace(/^\uFEFF/, "").split(";");
  const idx = {
    id: headers.indexOf("ID"),
    siriId: headers.indexOf("SiriID"),
    lat: headers.indexOf("Lat"),
    lng: headers.indexOf("Lng"),
    name: headers.indexOf("Name"),
    info: headers.indexOf("Info"),
    area: headers.indexOf("Area"),
  };

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(";");
    const siriId = (values[idx.siriId] || "").trim();
    const rawId = (values[idx.id] || "").trim();
    if (!siriId) continue;
    const latRaw = parseFloat(values[idx.lat] || "");
    const lngRaw = parseFloat(values[idx.lng] || "");
    if (!Number.isFinite(latRaw) || !Number.isFinite(lngRaw)) continue;

    rows.push({
      // GTFS stop_times uses numeric ids matching SIRI's SiriID column.
      stop_id: siriId,
      source_id: rawId,
      stop_name: (values[idx.name] || "").trim(),
      // SIRI file stores coords as fixed-point integers.
      stop_lat: String(latRaw / 100000),
      stop_lon: String(lngRaw / 100000),
      stop_desc: (values[idx.info] || "").trim(),
      stop_area: (values[idx.area] || "").trim(),
    });
  }

  return rows;
}

function distanceMeters(lat1, lng1, lat2, lng2) {
  const toRad = (v) => (v * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function findNearestStopName(gtfsStops, lat, lng, maxDistanceMeters = 40) {
  let best = null;
  let bestDist = Infinity;
  for (const stop of gtfsStops) {
    if (!stop.stopName) continue;
    const d = distanceMeters(lat, lng, stop.latitude, stop.longitude);
    if (d < bestDist) {
      bestDist = d;
      best = stop;
    }
  }
  if (!best || bestDist > maxDistanceMeters) return null;
  return best.stopName;
}

async function build(gtfsDir, outDir) {
  ensureDir(outDir);

  console.log("Loading GTFS routes...");
  const routesRows = await parseCsvRows(path.join(gtfsDir, "routes.txt"));
  const routes = routesRows.map((r) => ({
    routeId: r.route_id,
    shortName: r.route_short_name,
    routeType: parseInt(r.route_type || "0", 10),
  }));
  console.log(`  ${routes.length} routes`);

  console.log("Loading GTFS ZIP stops for name fallback...");
  const zipStopsRows = await parseCsvRows(path.join(gtfsDir, "stops.txt"));
  const zipStops = zipStopsRows
    .map((s) => ({
      stopId: s.stop_id,
      stopCode: s.stop_code,
      stopName: s.stop_name,
      stopDesc: (s.stop_desc || "").trim(),
      latitude: parseFloat(s.stop_lat),
      longitude: parseFloat(s.stop_lon),
    }))
    .filter((s) => Number.isFinite(s.latitude) && Number.isFinite(s.longitude));
  const zipStopsById = new Map(zipStops.map((s) => [String(s.stopId), s]));
  const zipStopsByCode = new Map(zipStops.map((s) => [String(s.stopCode), s]));
  console.log(`  ${zipStops.length} ZIP stops`);

  console.log("Loading GTFS stops...");
  const stopsRows = await fetchSiriStopsRows();
  const stops = stopsRows.map((s) => ({
    stopId: s.stop_id,
    stopName:
      (s.stop_name || "").trim() ||
      findNearestStopName(
        zipStops,
        parseFloat(s.stop_lat),
        parseFloat(s.stop_lon),
      ) ||
      s.stop_id,
    latitude: parseFloat(s.stop_lat),
    longitude: parseFloat(s.stop_lon),
    // Use actual GTFS stop_desc; leave blank when absent.
    stopDesc:
      zipStopsById.get(String(s.stop_id))?.stopDesc ||
      zipStopsByCode.get(String(s.source_id || ""))?.stopDesc ||
      undefined,
    stopArea: s.stop_area || undefined,
  }));
  console.log(`  ${stops.length} stops`);

  console.log("Loading GTFS trips...");
  const tripsRows = await parseCsvRows(path.join(gtfsDir, "trips.txt"));
  const trips = tripsRows.map((t) => ({
    tripId: t.trip_id,
    routeId: t.route_id,
    directionId: parseInt(t.direction_id || "0", 10),
    shapeId: t.shape_id,
  }));
  console.log(`  ${trips.length} trips`);

  console.log("Loading GTFS stop_times...");
  const stopTimesRows = await parseCsvRows(path.join(gtfsDir, "stop_times.txt"));
  console.log(`  ${stopTimesRows.length} stop_times`);

  console.log("Loading GTFS shapes...");
  const shapesRows = await parseCsvRows(path.join(gtfsDir, "shapes.txt"));
  console.log(`  ${shapesRows.length} shape points`);

  // Build helper maps
  const stopsById = new Map(stops.map((s) => [s.stopId, s]));
  const tripsById = new Map(trips.map((t) => [t.tripId, t]));

  // stop_times by trip
  const stopTimesByTrip = new Map();
  for (const st of stopTimesRows) {
    const tripId = st.trip_id;
    const entry = {
      tripId,
      stopId: st.stop_id,
      stopSequence: parseInt(st.stop_sequence || "0", 10),
      shapeDistTraveled: parseFloat(st.shape_dist_traveled || "0"),
      departureTime: st.departure_time || "",
    };
    if (!stopTimesByTrip.has(tripId)) stopTimesByTrip.set(tripId, []);
    stopTimesByTrip.get(tripId).push(entry);
  }
  for (const list of stopTimesByTrip.values()) list.sort((a, b) => a.stopSequence - b.stopSequence);

  // shapes by shape_id
  const shapesById = new Map();
  for (const s of shapesRows) {
    const id = s.shape_id;
    const pt = {
      latitude: parseFloat(s.shape_pt_lat),
      longitude: parseFloat(s.shape_pt_lon),
      sequence: parseInt(s.shape_pt_sequence || "0", 10),
      distTraveled: parseFloat(s.shape_dist_traveled || "0"),
    };
    if (!shapesById.has(id)) shapesById.set(id, []);
    shapesById.get(id).push(pt);
  }
  for (const list of shapesById.values()) list.sort((a, b) => a.sequence - b.sequence);

  // Build patterns: group trips by routeId_directionId and pick trip with most stop_times
  console.log("Building route patterns...");
  const groups = new Map();
  for (const t of trips) {
    const key = `${t.routeId}_${t.directionId}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(t);
  }

  const patterns = [];
  for (const [key, tripGroup] of groups) {
    let bestTrip = null;
    let bestCount = 0;
    for (const trip of tripGroup) {
      const list = stopTimesByTrip.get(trip.tripId) || [];
      if (list.length > bestCount) {
        bestTrip = trip;
        bestCount = list.length;
      }
    }
    if (!bestTrip || bestCount === 0) continue;
    const stopTimes = stopTimesByTrip.get(bestTrip.tripId) || [];
    const orderedStops = [];
    for (const st of stopTimes) {
      const stop = stopsById.get(st.stopId);
      if (!stop) continue;
      orderedStops.push({
        stopId: st.stopId,
        stopName: stop.stopName,
        latitude: stop.latitude,
        longitude: stop.longitude,
        distAlongRoute: st.shapeDistTraveled,
      });
    }
    const shapePoints = [];
    const rawShape = shapesById.get(bestTrip.shapeId) || [];
    for (const sp of rawShape) {
      shapePoints.push({ latitude: sp.latitude, longitude: sp.longitude, distTraveled: sp.distTraveled });
    }
    if (orderedStops.length > 0 && shapePoints.length > 0) {
      const lastUnderscore = key.lastIndexOf("_");
      patterns.push({
        routeId: key.substring(0, lastUnderscore),
        directionId: parseInt(key.substring(lastUnderscore + 1), 10),
        orderedStops,
        shapePoints,
      });
    }
  }
  console.log(`  ${patterns.length} patterns`);

  // GPS→route map (simplified)
  console.log("Building GPS→route map...");
  const gpsMap = {};
  for (const r of routes) {
    const lineNumber = r.shortName;
    if (!lineNumber) continue;
    if (r.routeId.includes("_bus_")) {
      gpsMap[`2_${lineNumber}`] = r.routeId;
      gpsMap[`7_${lineNumber}`] = r.routeId;
      gpsMap[`1_${lineNumber}`] = r.routeId;
    } else if (r.routeId.includes("_tram_")) {
      gpsMap[`3_${lineNumber}`] = r.routeId;
    } else if (r.routeId.includes("_train_") || r.routeId.includes("_rail_")) {
      gpsMap[`10_${lineNumber}`] = r.routeId;
    }
  }
  console.log(`  ${Object.keys(gpsMap).length} mappings`);

  // Build schedule index
  console.log("Building schedule index...");
  const schedule = {};
  for (const [tripId, stopTimes] of stopTimesByTrip) {
    const trip = tripsById.get(tripId);
    if (!trip) continue;
    for (const st of stopTimes) {
      if (!st.departureTime) continue;
      const key = `${trip.routeId}_${st.stopId}`;
      if (!schedule[key]) schedule[key] = [];
      schedule[key].push({ tripId, directionId: trip.directionId, departureTime: st.departureTime });
    }
  }
  for (const k of Object.keys(schedule)) {
    schedule[k].sort((a, b) => a.departureTime.localeCompare(b.departureTime));
  }
  console.log(`  ${Object.keys(schedule).length} route-stop combinations`);

  // Write outputs
  console.log("Writing preprocessed GTFS to disk...");
  ensureDir(path.join(outDir));
  fs.writeFileSync(path.join(outDir, "routes.json"), JSON.stringify(routes));
  fs.writeFileSync(path.join(outDir, "stops.json"), JSON.stringify(stops));
  fs.writeFileSync(path.join(outDir, "patterns.json"), JSON.stringify(patterns));
  // shapes: convert map to object
  const shapesObj = {};
  for (const [k, v] of shapesById.entries()) shapesObj[k] = v.map((p) => ({ latitude: p.latitude, longitude: p.longitude, distTraveled: p.distTraveled }));
  fs.writeFileSync(path.join(outDir, "shapes.json"), JSON.stringify(shapesObj));
  fs.writeFileSync(path.join(outDir, "gpsMap.json"), JSON.stringify(gpsMap));
  fs.writeFileSync(path.join(outDir, "schedule.json"), JSON.stringify(schedule));

  console.log("GTFS preprocessing complete.");
}

const gtfsDir = path.join(__dirname, "..", "data", "tallinn");
const outDir = path.join(__dirname, "..", "public", "gtfs-preprocessed");
const { execSync } = require("child_process");

function downloadAndExtractGtfs(gtfsDir, url) {
  if (!url) return;
  console.log(`GTFS URL configured: ${url}`);

  // If GTFS already exists, skip download
  if (fs.existsSync(path.join(gtfsDir, "routes.txt"))) {
    console.log("GTFS appears present locally — skipping download.");
    return;
  }

  ensureDir(gtfsDir);

  try {
    if (process.platform === "win32") {
      const tmp = path.join(__dirname, "..", "tmp_gtfs.zip");
      console.log("Downloading GTFS (PowerShell)...");
      execSync(`powershell -Command "Invoke-WebRequest -Uri '${url}' -OutFile '${tmp}'"`, { stdio: "inherit" });
      console.log("Extracting GTFS (PowerShell)...");
      execSync(`powershell -Command "Expand-Archive -Path '${tmp}' -DestinationPath '${gtfsDir}' -Force"`, { stdio: "inherit" });
      fs.unlinkSync(tmp);
    } else {
      const tmp = "/tmp/gtfs.zip";
      console.log("Downloading GTFS (curl)...");
      execSync(`curl -L '${url}' -o ${tmp}`, { stdio: "inherit" });
      console.log("Extracting GTFS (unzip)...");
      execSync(`unzip -o ${tmp} -d ${gtfsDir}`, { stdio: "inherit" });
      fs.unlinkSync(tmp);
    }
    console.log("GTFS download and extract complete.");
  } catch (err) {
    console.warn("Failed to download or extract GTFS:", err && err.message ? err.message : err);
    throw err;
  }
}

// Default to the Tallinn GTFS source if no env var provided
const GTFS_ZIP_URL = process.env.GTFS_ZIP_URL || "https://eu-gtfs.remix.com/tallinn.zip";

try {
  downloadAndExtractGtfs(gtfsDir, GTFS_ZIP_URL);
  build(gtfsDir, outDir).catch((err) => {
    console.error(err);
    process.exit(1);
  });
} catch (err) {
  console.error("Prebuild failed:", err);
  process.exit(1);
}
