"use strict";

/* Cloudflare Radar attack traffic, the last 24 hours (#3935), for the internal Jarvis cyber map only.
   - Data: Cloudflare Radar attacks API (layer 3 and layer 7, top origin and target countries).
   - Licence: Radar API data is CC BY-NC 4.0. Owner decision (Carlos, Nov 19 2026): personal use at his own risk.
     So this is written to its own Storage object and read only by the Jarvis checks source. It must never feed
     customer reports, paid pages, owner mail, the public map or any bundled product code.
   - Window: Radar's shortest window is 24 hours (the API rejects 1h); Radar refreshes about every 15 minutes. */

const RADAR_BASE = "https://api.cloudflare.com/client/v4/radar/attacks/";
const RADAR_OBJECT = "threats/radar-now.json.gz";
const RADAR_ATTRIBUTION = "Cloudflare Radar (CC BY-NC 4.0). Personal internal use only.";
const RADAR_TOP = 10;
const RADAR_TIMEOUT_MS = 15000;

// The four top lists the internal panel shows. Each: endpoint, the field that holds the country, the unit.
const LISTS = [
  { key: "layer3Origin", path: "layer3/top/locations/origin", field: "originCountryAlpha2", name: "originCountryName", unit: "bytes" },
  { key: "layer3Target", path: "layer3/top/locations/target", field: "targetCountryAlpha2", name: "targetCountryName", unit: "bytes" },
  { key: "layer7Origin", path: "layer7/top/locations/origin", field: "originCountryAlpha2", name: "originCountryName", unit: "requests" },
  { key: "layer7Target", path: "layer7/top/locations/target", field: "targetCountryAlpha2", name: "targetCountryName", unit: "requests" }
];

const clean = (value, max) => String(value == null ? "" : value).replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);

// One Radar top list, as { cc, name, share, rank } rows. Share is a percentage of the window's attack traffic.
function parseRadarTop(json, field, nameField) {
  const rows = json && json.result && Array.isArray(json.result.top_0) ? json.result.top_0 : [];
  return rows
    .map((row) => ({
      cc: clean(row && row[field], 8).toUpperCase(),
      name: clean(row && row[nameField], 60),
      share: Math.round((Number(row && row.value) || 0) * 100) / 100,
      rank: Number(row && row.rank) || 0
    }))
    .filter((row) => /^[A-Z]{2}$/.test(row.cc))
    .slice(0, RADAR_TOP);
}

function radarMeta(json) {
  const meta = json && json.result && json.result.meta;
  return { lastUpdated: clean(meta && meta.lastUpdated, 32), normalization: clean(meta && meta.normalization, 32) };
}

// Fetch the four lists. A list that fails is left out and named, so one bad call does not blank the panel.
async function fetchRadarNow(options) {
  const opts = options || {};
  const fetchImpl = opts.fetch || global.fetch;
  const token = String(opts.token || "").trim();
  if (!token) return { ok: false, error: "No Cloudflare token for Radar." };
  const failed = [];
  const parts = {};
  let lastUpdated = "";
  await Promise.all(LISTS.map(async (list) => {
    const url = RADAR_BASE + list.path + "?dateRange=1d&limit=" + RADAR_TOP;
    try {
      const res = await fetchImpl(url, { headers: { Authorization: "Bearer " + token }, signal: AbortSignal.timeout(RADAR_TIMEOUT_MS) });
      if (!res || !res.ok) throw new Error("HTTP " + (res ? res.status : "0"));
      const json = await res.json();
      const meta = radarMeta(json);
      if (meta.lastUpdated && meta.lastUpdated > lastUpdated) lastUpdated = meta.lastUpdated;
      parts[list.key] = { unit: list.unit, rows: parseRadarTop(json, list.field, list.name) };
    } catch (error) {
      failed.push(list.key);
      parts[list.key] = { unit: list.unit, rows: [] };
    }
  }));
  if (failed.length === LISTS.length) return { ok: false, error: "Every Radar call failed." };
  return { ok: true, asOf: lastUpdated, window: "24 h", failed, parts };
}

// The object the Jarvis panel reads. Kept small: at most four lists of ten countries.
function buildRadarNow(fetched, nowIso) {
  const p = fetched.parts || {};
  const out = {
    fetchedAt: nowIso,
    asOf: fetched.asOf || "",
    window: "24 h",
    attribution: RADAR_ATTRIBUTION,
    failed: fetched.failed || []
  };
  LISTS.forEach((list) => { out[list.key] = (p[list.key] && p[list.key].rows) || []; });
  return out;
}

// Refresh the stored object. Never throws: a failed refresh returns the reason and leaves the old object alone.
async function refreshRadar(options) {
  const opts = options || {};
  const now = opts.now || Date.now();
  const storage = opts.storage;
  const fetched = await fetchRadarNow(opts);
  if (!fetched.ok) return { ok: false, error: fetched.error };
  const bundle = buildRadarNow(fetched, new Date(now).toISOString());
  if (storage) {
    const zlib = require("zlib");
    const file = storage.bucket(opts.bucket).file(RADAR_OBJECT);
    await file.save(zlib.gzipSync(Buffer.from(JSON.stringify(bundle))), { contentType: "application/gzip", resumable: false });
  }
  return { ok: true, asOf: bundle.asOf, failed: bundle.failed, layer3Origin: bundle.layer3Origin.length };
}

// The Jarvis checks source reads this; null when it has never been written.
async function loadRadarNow(storage, bucketName) {
  try {
    const file = storage.bucket(bucketName).file(RADAR_OBJECT);
    const [exists] = await file.exists();
    if (!exists) return null;
    const zlib = require("zlib");
    const [raw] = await file.download();
    return JSON.parse(zlib.gunzipSync(raw).toString("utf8"));
  } catch (error) {
    return null;
  }
}

// What the panel shows: four short lists plus the age and the licence line.
function radarSummary(bundle) {
  if (!bundle || typeof bundle !== "object") return null;
  const pick = (rows) => (Array.isArray(rows) ? rows : []).slice(0, RADAR_TOP).map((row) => ({ cc: clean(row.cc, 2), name: clean(row.name, 60), share: Number(row.share) || 0, rank: Number(row.rank) || 0 }));
  return {
    asOf: clean(bundle.asOf, 32),
    window: clean(bundle.window, 8),
    attribution: RADAR_ATTRIBUTION,
    layer3Origin: pick(bundle.layer3Origin),
    layer3Target: pick(bundle.layer3Target),
    layer7Origin: pick(bundle.layer7Origin),
    layer7Target: pick(bundle.layer7Target),
    failed: Array.isArray(bundle.failed) ? bundle.failed.slice(0, 4).map((x) => clean(x, 24)) : []
  };
}

module.exports = {
  RADAR_OBJECT,
  RADAR_ATTRIBUTION,
  LISTS,
  parseRadarTop,
  fetchRadarNow,
  buildRadarNow,
  refreshRadar,
  loadRadarNow,
  radarSummary
};
