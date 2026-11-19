"use strict";

/* Commercial-safe attack, exploit, C2, network-block, certificate and breach-news checks (#3816):
   - CISA KEV (CC0-1.0) matched against detected front-end/WordPress CVE IDs & software
   - OSV.dev batch API (npm JS libraries, filtering out CC-BY-NC-ND sources) + FIRST EPSS
   - DROP / ASN-DROP hijacked/cybercrime network blocks (commercial-safe; no marketing brand name used)
   - Feodo Tracker (CC0-1.0) & Tor Bulk Exit List (CC0-1.0)
   - GDELT Project 2.0 15-minute cyber-attack feeds (commercial-safe with required citation)
   - Live certificate checks + optional CertSpotter CT API (when CERTSPOTTER_KEY is configured)
   - Unified with existing site findings (Safe Browsing, threat lists, hack signs, exposed, lookalikes, blocklists)
     into `report.targeted` (paid reports and internal desk only; stripped from previews, Live Reports, owner mail). */

const zlib = require("zlib");
const { registrable } = require("./url-review-suffix");
const { say, some } = require("./url-review-findings-en");
const hostGeo = require("./url-review-host-geo");

const BUCKET = hostGeo.BUCKET;
const FEEDS_OBJECT = "threats/feeds.json.gz";
const MAP_GLOBAL_OBJECT = "threats/map-global.json.gz";

const CISA_KEV_URL = "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json";
const DROP_V4_URL = "https://www.spamhaus.org/drop/drop_v4.json";
const ASN_DROP_URL = "https://www.spamhaus.org/drop/asndrop.json";
const FEODO_URL = "https://feodotracker.abuse.ch/downloads/ipblocklist_recommended.json";
const TOR_EXIT_URL = "https://check.torproject.org/torbulkexitlist";
const GDELT_LASTUPDATE_URL = "https://data.gdeltproject.org/gdeltv2/lastupdate.txt";
const OSV_BATCH_URL = "https://api.osv.dev/v1/querybatch";
const OSV_VULN_URL = "https://api.osv.dev/v1/vulns/";
const EPSS_URL = "https://api.first.org/data/v1/epss";
const CERTSPOTTER_URL = "https://api.certspotter.com/v1/issuances";

const FEEDS_TTL_MS = 4 * 3600 * 1000;
const STORAGE_REFRESH_MS = 25 * 60 * 1000;
const CALL_TIMEOUT_MS = 7000;
const CHECK_DEADLINE_MS = 9000;

const OSV_BLOCKED_PREFIX = /^(CHAINGUARD|WOLFI)-/i;
const NPM_ALIAS = {
  "angular": "angular",
  "angularjs": "angular",
  "axios": "axios",
  "backbone.js": "backbone",
  "bootstrap": "bootstrap",
  "chart.js": "chart.js",
  "ckeditor 4": "ckeditor4",
  "ckeditor 5": "@ckeditor/ckeditor5-core",
  "dojo": "dojo",
  "dompurify": "dompurify",
  "echarts": "echarts",
  "ember": "ember-source",
  "handlebars": "handlebars",
  "highcharts": "highcharts",
  "highlight.js": "highlight.js",
  "jquery": "jquery",
  "jquery migrate": "jquery-migrate",
  "jquery ui": "jquery-ui",
  "lodash": "lodash",
  "moment.js": "moment",
  "mustache.js": "mustache",
  "preact": "preact",
  "react": "react",
  "requirejs": "requirejs",
  "underscore.js": "underscore",
  "vue.js": "vue",
  "yui": "yui"
};

let memFeeds = null;
let memFeedsUntil = 0;

function withTimeout(promise, ms, fallback) {
  let timer = null;
  return Promise.race([
    promise,
    new Promise((resolve) => {
      timer = setTimeout(() => resolve(fallback), ms);
    })
  ]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function cleanText(value, max) {
  const s = String(value == null ? "" : value).replace(/\s+/g, " ").trim();
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

function hostOf(url) {
  try {
    return new URL(String(url || "")).hostname.toLowerCase().replace(/\.$/, "");
  } catch (error) {
    return "";
  }
}

function npmNameFor(libName) {
  const raw = String(libName || "").trim().toLowerCase();
  if (!raw) return "";
  if (NPM_ALIAS[raw]) return NPM_ALIAS[raw];
  if (/^[a-z0-9._-]+$/.test(raw)) return raw;
  return "";
}

function cidrToRange(cidr) {
  const m = String(cidr || "").trim().match(/^(\d{1,3}(?:\.\d{1,3}){3})\/(\d{1,2})$/);
  if (!m) return null;
  const base = hostGeo.ip4ToInt(m[1]);
  const bits = Number(m[2]);
  if (base < 0 || !Number.isInteger(bits) || bits < 0 || bits > 32) return null;
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  const start = (base & mask) >>> 0;
  const end = (start | (~mask >>> 0)) >>> 0;
  return [start, end];
}

function parseCisaKev(data) {
  const vulns = Array.isArray(data && data.vulnerabilities) ? data.vulnerabilities : [];
  const byCve = {};
  vulns.forEach((v) => {
    if (!v || !v.cveID) return;
    const cve = String(v.cveID).toUpperCase().trim();
    byCve[cve] = {
      cve,
      vendor: cleanText(v.vendorProject, 60),
      product: cleanText(v.product, 60),
      name: cleanText(v.vulnerabilityName, 140),
      added: cleanText(v.dateAdded, 16),
      ransomware: String(v.knownRansomwareCampaignUse || "") === "Known",
      triage: String(v.forensicTriage || "") === "Yes"
    };
  });
  return {
    version: cleanText(data && data.catalogVersion, 32),
    released: cleanText(data && data.dateReleased, 32),
    count: Object.keys(byCve).length,
    byCve
  };
}

function parseDropV4(ndjsonText) {
  const ranges = [];
  let copyright = "";
  String(ndjsonText || "").split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    try {
      const row = JSON.parse(trimmed);
      if (row && row.type === "metadata") {
        copyright = cleanText(row.copyright || "", 120);
        return;
      }
      if (!row || !row.cidr) return;
      const r = cidrToRange(row.cidr);
      if (r) ranges.push([r[0], r[1], cleanText(row.sblid || "", 24), cleanText(row.cidr, 24)]);
    } catch (error) { /* ignore malformed line */ }
  });
  ranges.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  return { copyright, count: ranges.length, ranges };
}

function parseAsnDrop(ndjsonText) {
  const asns = {};
  let copyright = "";
  String(ndjsonText || "").split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    try {
      const row = JSON.parse(trimmed);
      if (row && row.type === "metadata") {
        copyright = cleanText(row.copyright || "", 120);
        return;
      }
      const asn = Number(row && row.asn);
      if (Number.isInteger(asn) && asn > 0) {
        asns[asn] = { asn, asname: cleanText(row.asname, 80), cc: cleanText(row.cc, 4) };
      }
    } catch (error) { /* ignore */ }
  });
  return { copyright, count: Object.keys(asns).length, asns };
}

function parseFeodo(json) {
  const rows = Array.isArray(json) ? json : [];
  const ips = {};
  rows.forEach((row) => {
    const ip = String((row && (row.ip_address || row.ip)) || "").trim();
    if (!ip) return;
    ips[ip] = {
      ip,
      malware: cleanText(row.malware || "Botnet C2", 60),
      port: Number(row.port) || 0,
      lastOnline: cleanText(row.last_online || row.first_seen || "", 32),
      online: String(row.status || "").toLowerCase() === "online",
      country: /^[A-Z]{2}$/.test(String(row.country || "")) ? String(row.country) : ""
    };
  });
  return { count: Object.keys(ips).length, ips };
}

function parseTorExits(text) {
  const ips = [];
  String(text || "").split(/\r?\n/).forEach((line) => {
    const t = line.trim();
    if (!t || t.startsWith("#")) return;
    if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(t)) ips.push(t);
  });
  return { count: ips.length, ips };
}

// Extract a single file from a standard ZIP buffer without external dependencies.
function extractZipText(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 22) return "";
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0 || eocd + 20 > buf.length) return "";
  const cdOffset = buf.readUInt32LE(eocd + 16);
  if (cdOffset + 46 > buf.length || buf.readUInt32LE(cdOffset) !== 0x02014b50) return "";
  const compMethod = buf.readUInt16LE(cdOffset + 10);
  const compSize = buf.readUInt32LE(cdOffset + 20);
  const localHeaderOffset = buf.readUInt32LE(cdOffset + 42);
  if (localHeaderOffset + 30 > buf.length) return "";
  const fnameLen = buf.readUInt16LE(localHeaderOffset + 26);
  const extraLen = buf.readUInt16LE(localHeaderOffset + 28);
  const dataStart = localHeaderOffset + 30 + fnameLen + extraLen;
  if (dataStart + compSize > buf.length) return "";
  const slice = buf.subarray(dataStart, dataStart + compSize);
  const raw = compMethod === 8 ? zlib.inflateRawSync(slice) : slice;
  return raw.toString("utf8");
}

const CYBER_THEME_RE = /\b(CYBER_ATTACK|DATA_BREACH|RANSOMWARE|WB_2463_CYBER_SECURITY|WB_678_DIGITAL_SECURITY)\b/i;

function parseGdeltGkg(tsvText) {
  const byCountry = {};
  const mentions = [];
  const lines = String(tsvText || "").split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line || !CYBER_THEME_RE.test(line)) continue;
    const cols = line.split("\t");
    if (cols.length < 10) continue;
    const dateRaw = cols[1] || "";
    const isoDate = /^\d{14}/.test(dateRaw)
      ? dateRaw.slice(0, 4) + "-" + dateRaw.slice(4, 6) + "-" + dateRaw.slice(6, 8) + "T" + dateRaw.slice(8, 10) + ":" + dateRaw.slice(10, 12) + ":" + dateRaw.slice(12, 14) + "Z"
      : "";
    const source = cleanText(cols[3], 80);
    const url = cleanText(cols[4], 320);
    const themes = (cols[7] || "").split(";").filter((t) => /CYBER|HACK|RANSOM|BREACH|DDOS|MALWARE|PHISH/i.test(t)).slice(0, 6);
    const locs = new Set();
    (cols[9] || "").split(";").forEach((loc) => {
      const fips = (loc.split("#")[2] || "").trim().toUpperCase();
      const iso = hostGeo.fipsToIso2(fips);
      if (iso) locs.add(iso);
    });
    const countries = [...locs];
    countries.forEach((cc) => {
      byCountry[cc] = (byCountry[cc] || 0) + 1;
    });
    const orgs = (cols[13] || "").split(";").map((o) => cleanText(o.split(",")[0], 60)).filter(Boolean).slice(0, 6);
    if (url && mentions.length < 300) {
      mentions.push({
        date: isoDate,
        source,
        url,
        themes,
        countries,
        orgs
      });
    }
  }
  return { byCountry, mentions };
}

function matchDropIp(ip, dropV4) {
  const num = hostGeo.ip4ToInt(ip);
  const ranges = (dropV4 && dropV4.ranges) || [];
  if (num < 0 || !ranges.length) return null;
  let lo = 0;
  let hi = ranges.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const row = ranges[mid];
    if (num < row[0]) hi = mid - 1;
    else if (num > row[1]) lo = mid + 1;
    else return { ip, sblid: row[2], cidr: row[3] };
  }
  return null;
}

async function fetchJson(fetchImpl, url, init) {
  const res = await fetchImpl(url, Object.assign({ signal: AbortSignal.timeout(CALL_TIMEOUT_MS) }, init));
  if (!res || !res.ok) throw new Error("HTTP " + (res ? res.status : "0"));
  return res.json();
}

async function fetchText(fetchImpl, url, init) {
  const res = await fetchImpl(url, Object.assign({ signal: AbortSignal.timeout(CALL_TIMEOUT_MS) }, init));
  if (!res || !res.ok) throw new Error("HTTP " + (res ? res.status : "0"));
  return res.text();
}

async function fetchLatestGdelt(fetchImpl) {
  const listText = await fetchText(fetchImpl, GDELT_LASTUPDATE_URL);
  const gkgLine = listText.split(/\r?\n/).find((l) => l.includes(".gkg.csv.zip"));
  if (!gkgLine) return { byCountry: {}, mentions: [], slice: "" };
  const primaryUrl = gkgLine.trim().split(/\s+/).pop();
  const urls = [primaryUrl];
  // If the brand-new 15-min file has not propagated yet, step back 15 minutes.
  const m = primaryUrl.match(/(\d{14})\.gkg\.csv\.zip$/);
  if (m) {
    const s = m[1];
    const ms = Date.UTC(Number(s.slice(0, 4)), Number(s.slice(4, 6)) - 1, Number(s.slice(6, 8)), Number(s.slice(8, 10)), Number(s.slice(10, 12)), Number(s.slice(12, 14))) - 15 * 60000;
    const prev = new Date(ms).toISOString().replace(/[-:T]/g, "").slice(0, 14);
    urls.push(primaryUrl.replace(s, prev));
  }
  for (const url of urls) {
    try {
      const res = await fetchImpl(url, { signal: AbortSignal.timeout(15000) });
      if (!res || !res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      const tsv = extractZipText(buf);
      if (!tsv) continue;
      const parsed = parseGdeltGkg(tsv);
      return Object.assign({ slice: (url.match(/(\d{14})\.gkg/) || [])[1] || "" }, parsed);
    } catch (error) { /* try fallback slice */ }
  }
  return { byCountry: {}, mentions: [], slice: "" };
}

// Botnet C2 servers online right now, from Feodo Tracker (CC0), by the country each one sits in (#3910).
function botnetNowSummary(feodo, asOfIso) {
  const rows = Object.values((feodo && feodo.ips) || {}).filter((row) => row.online);
  const byCc = {};
  rows.forEach((row) => { const cc = row.country || "??"; byCc[cc] = (byCc[cc] || 0) + 1; });
  const countries = Object.keys(byCc).map((cc) => ({ cc, count: byCc[cc] })).sort((a, b) => b.count - a.count).slice(0, 40);
  return { asOf: asOfIso, online: rows.length, countries, source: "Feodo Tracker by abuse.ch (CC0 1.0)" };
}

function updateGlobalMapHistory(prevMap, gdelt, kev, dropV4, nowMs, feodo) {
  const now = Number.isFinite(nowMs) ? nowMs : Date.now();
  const at = new Date(now).toISOString();
  const day = at.slice(0, 10);
  const prev = prevMap && typeof prevMap === "object" ? prevMap : {};
  const history = Object.assign({}, prev.history || {});
  const sliceKey = gdelt.slice || day;
  const seenSlices = new Set(Array.isArray(prev.seenSlices) ? prev.seenSlices.slice(-96) : []);
  const dayRow = Object.assign({}, history[day] || {});
  if (!seenSlices.has(sliceKey)) {
    Object.keys(gdelt.byCountry || {}).forEach((cc) => {
      dayRow[cc] = (dayRow[cc] || 0) + gdelt.byCountry[cc];
    });
    seenSlices.add(sliceKey);
  }
  history[day] = dayRow;
  // Keep rolling 90 days.
  const keptDays = Object.keys(history).sort().slice(-90);
  const prunedHistory = {};
  keptDays.forEach((d) => { prunedHistory[d] = history[d]; });

  const recentEvents = [];
  const seenUrls = new Set();
  (gdelt.mentions || []).concat(Array.isArray(prev.recentEvents) ? prev.recentEvents : []).forEach((ev) => {
    if (!ev || !ev.url || seenUrls.has(ev.url)) return;
    seenUrls.add(ev.url);
    recentEvents.push(ev);
  });

  return {
    version: 1,
    updatedAt: at,
    attributions: [
      "GDELT Project (https://www.gdeltproject.org/)",
      "CISA Known Exploited Vulnerabilities Catalog (CC0 1.0)"
    ],
    seenSlices: [...seenSlices].slice(-96),
    liveSlice: {
      slice: gdelt.slice || "",
      byCountry: gdelt.byCountry || {}
    },
    history: prunedHistory,
    botnetNow: feodo ? botnetNowSummary(feodo, at) : (prev.botnetNow || null),
    recentEvents: recentEvents.slice(0, 120),
    kevSummary: {
      version: (kev && kev.version) || "",
      count: (kev && kev.count) || 0
    },
    dropSummary: {
      v4Ranges: (dropV4 && dropV4.count) || 0
    }
  };
}

async function refreshFeeds(options) {
  const opts = options || {};
  const now = opts.now || Date.now();
  const fetchImpl = opts.fetch || global.fetch;
  const storage = opts.storage || require("firebase-admin/storage").getStorage();
  const bucket = storage.bucket(BUCKET);
  const feedFile = bucket.file(FEEDS_OBJECT);
  const mapFile = bucket.file(MAP_GLOBAL_OBJECT);

  if (!opts.force) {
    try {
      const [exists] = await feedFile.exists();
      if (exists) {
        const [meta] = await feedFile.getMetadata();
        const age = now - Date.parse(meta.updated || 0);
        if (age < STORAGE_REFRESH_MS) return { skipped: "fresh", minutes: Math.round(age / 60000) };
      }
    } catch (error) { /* continue */ }
  }

  const [kevRaw, drop4Raw, asnRaw, feodoRaw, torRaw, gdelt, prevMapRaw] = await Promise.all([
    fetchJson(fetchImpl, CISA_KEV_URL).catch(() => null),
    fetchText(fetchImpl, DROP_V4_URL).catch(() => ""),
    fetchText(fetchImpl, ASN_DROP_URL).catch(() => ""),
    fetchJson(fetchImpl, FEODO_URL).catch(() => []),
    fetchText(fetchImpl, TOR_EXIT_URL).catch(() => ""),
    fetchLatestGdelt(fetchImpl).catch(() => ({ byCountry: {}, mentions: [], slice: "" })),
    mapFile.exists().then(async ([ok]) => (ok ? JSON.parse(zlib.gunzipSync((await mapFile.download())[0]).toString("utf8")) : null)).catch(() => null)
  ]);

  const kev = parseCisaKev(kevRaw);
  const dropV4 = parseDropV4(drop4Raw);
  const asnDrop = parseAsnDrop(asnRaw);
  const feodo = parseFeodo(feodoRaw);
  const tor = parseTorExits(torRaw);

  const bundle = {
    updatedAt: new Date(now).toISOString(),
    kev,
    dropV4,
    asnDrop,
    feodo,
    tor,
    gdelt
  };
  const payload = zlib.gzipSync(Buffer.from(JSON.stringify(bundle)));
  await feedFile.save(payload, { contentType: "application/gzip", resumable: false });

  const globalMap = updateGlobalMapHistory(prevMapRaw, gdelt, kev, dropV4, now, feodo);
  await mapFile.save(zlib.gzipSync(Buffer.from(JSON.stringify(globalMap))), { contentType: "application/gzip", resumable: false });

  memFeeds = bundle;
  memFeedsUntil = now + FEEDS_TTL_MS;
  return {
    ok: true,
    kev: kev.count,
    dropV4: dropV4.count,
    asnDrop: asnDrop.count,
    feodo: feodo.count,
    tor: tor.count,
    gdeltMentions: (gdelt.mentions || []).length,
    bytes: payload.length
  };
}

async function loadFeeds(options) {
  const opts = options || {};
  if (opts.feeds) return opts.feeds;
  const now = opts.now || Date.now();
  if (memFeeds && now < memFeedsUntil) return memFeeds;
  try {
    const storage = opts.storage || require("firebase-admin/storage").getStorage();
    const file = storage.bucket(BUCKET).file(FEEDS_OBJECT);
    const [exists] = await file.exists();
    if (exists) {
      const [buf] = await file.download();
      const parsed = JSON.parse(zlib.gunzipSync(buf).toString("utf8"));
      memFeeds = parsed;
      memFeedsUntil = now + FEEDS_TTL_MS;
      return parsed;
    }
  } catch (error) { /* fallback to direct lightweight fetch */ }

  if (opts.fetch === false) return null;
  const fetchImpl = opts.fetch || global.fetch;
  if (typeof fetchImpl !== "function") return null;
  const [kevRaw, drop4Raw, asnRaw, feodoRaw] = await Promise.all([
    fetchJson(fetchImpl, CISA_KEV_URL).catch(() => null),
    fetchText(fetchImpl, DROP_V4_URL).catch(() => ""),
    fetchText(fetchImpl, ASN_DROP_URL).catch(() => ""),
    fetchJson(fetchImpl, FEODO_URL).catch(() => [])
  ]);
  if (!kevRaw && !drop4Raw) return null;
  const bundle = {
    updatedAt: new Date(now).toISOString(),
    kev: parseCisaKev(kevRaw),
    dropV4: parseDropV4(drop4Raw),
    asnDrop: parseAsnDrop(asnRaw),
    feodo: parseFeodo(feodoRaw),
    tor: { count: 0, ips: [] },
    gdelt: { byCountry: {}, mentions: [] }
  };
  memFeeds = bundle;
  memFeedsUntil = now + FEEDS_TTL_MS;
  return bundle;
}

async function queryOsvBatch(librariesList, fetchImpl) {
  const fn = fetchImpl || global.fetch;
  if (typeof fn !== "function" || !Array.isArray(librariesList) || !librariesList.length) return [];
  const candidates = [];
  const seen = new Set();
  librariesList.forEach((lib) => {
    const pkg = npmNameFor(lib && lib.name);
    const version = String((lib && lib.version) || "").replace(/^v/i, "").trim();
    if (!pkg || !/^\d+\.\d+/.test(version)) return;
    const key = pkg + "@" + version;
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push({ name: lib.name, npm: pkg, version });
  });
  if (!candidates.length) return [];

  const res = await fetchJson(fn, OSV_BATCH_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      queries: candidates.slice(0, 20).map((c) => ({ package: { name: c.npm, ecosystem: "npm" }, version: c.version }))
    })
  });
  const results = Array.isArray(res && res.results) ? res.results : [];
  const hits = [];
  const detailIds = new Set();
  results.forEach((entry, idx) => {
    const cand = candidates[idx];
    const vulns = (Array.isArray(entry && entry.vulns) ? entry.vulns : [])
      .filter((v) => v && v.id && !OSV_BLOCKED_PREFIX.test(String(v.id)));
    if (!vulns.length) return;
    vulns.slice(0, 8).forEach((v) => detailIds.add(String(v.id)));
    hits.push({
      name: cand.name,
      npm: cand.npm,
      version: cand.version,
      ids: vulns.map((v) => String(v.id)).slice(0, 8)
    });
  });

  // Fetch aliases (CVE IDs) for up to 10 OSV advisories in parallel so we can cross-check CISA KEV.
  const aliasMap = {};
  await Promise.all([...detailIds].slice(0, 10).map(async (id) => {
    try {
      const detail = await fetchJson(fn, OSV_VULN_URL + encodeURIComponent(id));
      const cves = (Array.isArray(detail && detail.aliases) ? detail.aliases : [])
        .concat(/^CVE-/i.test(id) ? [id] : [])
        .filter((a) => /^CVE-\d{4}-\d+$/i.test(String(a)))
        .map((a) => String(a).toUpperCase());
      aliasMap[id] = {
        cves: [...new Set(cves)],
        summary: cleanText((detail && detail.summary) || "", 160)
      };
    } catch (error) { /* skip */ }
  }));

  return hits.map((h) => {
    const cves = new Set();
    let summary = "";
    h.ids.forEach((id) => {
      const d = aliasMap[id];
      if (!d) return;
      d.cves.forEach((c) => cves.add(c));
      if (!summary && d.summary) summary = d.summary;
    });
    return Object.assign({}, h, { cves: [...cves], summary });
  });
}

async function queryEpss(cves, fetchImpl) {
  const fn = fetchImpl || global.fetch;
  const list = [...new Set((cves || []).map((c) => String(c || "").toUpperCase()).filter((c) => /^CVE-\d{4}-\d+$/.test(c)))].slice(0, 10);
  if (typeof fn !== "function" || !list.length) return {};
  try {
    const res = await fetchJson(fn, EPSS_URL + "?cve=" + encodeURIComponent(list.join(",")));
    const out = {};
    (Array.isArray(res && res.data) ? res.data : []).forEach((row) => {
      if (row && row.cve) out[String(row.cve).toUpperCase()] = { epss: Number(row.epss) || 0, percentile: Number(row.percentile) || 0 };
    });
    return out;
  } catch (error) {
    return {};
  }
}

async function checkCertificates(host, cert, certspotterKey, fetchImpl) {
  const anomalies = [];
  if (cert && cert.missingIntermediate) {
    anomalies.push({ kind: "missing-intermediate", detail: "Incomplete TLS certificate chain (" + cleanText(cert.missingIntermediate, 80) + ")" });
  }
  if (cert && cert.validFrom && cert.validTo) {
    const span = Date.parse(cert.validTo) - Date.parse(cert.validFrom);
    if (Number.isFinite(span) && span > 0 && span < 15 * 86400000) {
      anomalies.push({ kind: "short-validity", detail: "Unusually short TLS certificate validity window (" + Math.round(span / 86400000) + " days)" });
    }
  }
  let ctChecked = false;
  let ctIssuances = 0;
  if (certspotterKey && typeof fetchImpl === "function" && host) {
    const domain = registrable(host) || host;
    try {
      const rows = await fetchJson(fetchImpl, CERTSPOTTER_URL + "?domain=" + encodeURIComponent(domain) + "&include_subdomains=true&expand=dns_names", {
        headers: { Authorization: "Bearer " + certspotterKey }
      });
      ctChecked = true;
      if (Array.isArray(rows)) {
        ctIssuances = rows.length;
        const now = Date.now();
        const recent = rows.filter((r) => now - Date.parse(r.not_before || "") <= 7 * 86400000);
        const wildcards = rows.filter((r) => Array.isArray(r.dns_names) && r.dns_names.some((n) => String(n).startsWith("*.")));
        if (recent.length >= 25) {
          anomalies.push({ kind: "issuance-spike", detail: recent.length + " unexpired certificates issued in the last 7 days for " + domain });
        }
        if (wildcards.length >= 5) {
          anomalies.push({ kind: "wildcard-proliferation", detail: wildcards.length + " active wildcard certificates observed in CT logs for " + domain });
        }
      }
    } catch (error) { /* non-fatal */ }
  }
  return { anomalies, ctChecked, ctIssuances };
}

function matchBreachNews(host, gdelt) {
  const domain = registrable(host) || host;
  if (!domain || !gdelt || !Array.isArray(gdelt.mentions)) return [];
  const targets = [...new Set([host, domain].filter(Boolean))];
  const re = new RegExp("(^|[^a-z0-9.-])(" + targets.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")([^a-z0-9.]|$)", "i");
  const hits = [];
  const seenHosts = new Set();
  gdelt.mentions.forEach((m) => {
    if (!m || !m.url) return;
    const pubHost = registrable(hostOf(m.url));
    if (pubHost === domain) return;
    const hay = [m.url, (m.orgs || []).join(" ")].join(" ");
    if (!re.test(hay)) return;
    if (seenHosts.has(pubHost || m.source)) return;
    seenHosts.add(pubHost || m.source);
    hits.push({
      date: m.date || "",
      source: m.source || pubHost || "News",
      url: m.url,
      themes: m.themes || []
    });
  });
  return hits.slice(0, 5);
}

const LEVEL_RANK = { info: 1, watch: 2, high: 3, critical: 4 };

function unifySiteItems(input, checked) {
  const items = [];
  const nowIso = new Date(checked.now || Date.now()).toISOString();
  const host = checked.host;
  const extras = (input && input.extras) || {};
  const addItem = (row) => {
    if (!row || !row.kind) return;
    items.push(Object.assign({
      subject_type: "host",
      subject: host,
      role: "site_hit",
      first_seen: nowIso,
      last_seen: nowIso,
      confidence: "third_party"
    }, row));
  };

  // New commercial-safe findings
  checked.kevHits.forEach((hit) => {
    addItem({
      kind: "known-exploit-software",
      level: hit.ransomware ? "critical" : "high",
      subject_type: "software",
      subject: hit.software + " (" + hit.cve + ")",
      role: "site_hit",
      source: "CISA KEV",
      source_ref: "https://www.cisa.gov/known-exploited-vulnerabilities-catalog",
      first_seen: hit.added ? hit.added + "T00:00:00Z" : nowIso,
      last_seen: nowIso,
      evidence: hit.cve + " (" + hit.name + ")" + (hit.ransomware ? " · known ransomware use" : "") + (hit.epss ? " · EPSS " + Math.round(hit.epss * 100) + "%" : ""),
      confidence: "inferred"
    });
  });

  checked.osvHits.forEach((hit) => {
    if (hit.kevMatched) return;
    const maxEpss = hit.maxEpss || 0;
    addItem({
      kind: "known-exploit-software",
      level: maxEpss >= 0.5 ? "high" : "watch",
      subject_type: "software",
      subject: hit.name + "@" + hit.version,
      role: "site_hit",
      source: "OSV.dev",
      source_ref: "https://osv.dev/vulnerability/" + hit.ids[0],
      evidence: hit.ids.slice(0, 3).join(", ") + (hit.cves.length ? " (" + hit.cves.slice(0, 2).join(", ") + ")" : "") + (maxEpss ? " · EPSS " + Math.round(maxEpss * 100) + "%" : ""),
      confidence: "inferred"
    });
  });

  if (checked.feodoHit) {
    addItem({
      kind: "c2-indicator",
      level: "critical",
      subject_type: "ip",
      subject: checked.feodoHit.ip,
      role: "host_used",
      source: "Feodo Tracker",
      source_ref: "https://feodotracker.abuse.ch/",
      last_seen: checked.feodoHit.lastOnline || nowIso,
      evidence: "Active botnet C2 indicator (" + checked.feodoHit.malware + ", port " + checked.feodoHit.port + ")",
      confidence: "third_party"
    });
  }

  if (checked.dropIpHit || checked.dropAsnHit) {
    const detail = checked.dropIpHit
      ? "Hosting IP " + checked.dropIpHit.ip + " falls inside hijacked/cybercrime prefix " + checked.dropIpHit.cidr
      : "Hosting AS" + checked.dropAsnHit.asn + " is listed on ASN-DROP (" + checked.dropAsnHit.asname + ")";
    addItem({
      kind: "c2-indicator",
      level: "high",
      subject_type: checked.dropIpHit ? "ip" : "host",
      subject: checked.dropIpHit ? checked.dropIpHit.ip : "AS" + checked.dropAsnHit.asn,
      role: "host_used",
      source: "DROP network list",
      evidence: detail,
      confidence: "third_party"
    });
  }

  if (checked.torHit) {
    addItem({
      kind: "c2-indicator",
      level: "info",
      subject_type: "ip",
      subject: checked.torHit,
      role: "context",
      source: "Tor Exit List",
      evidence: "Hosting IP " + checked.torHit + " also serves as a public Tor exit relay.",
      confidence: "third_party"
    });
  }

  checked.certCheck.anomalies.forEach((anom) => {
    addItem({
      kind: "cert-anomaly",
      level: "watch",
      subject_type: "domain",
      subject: host,
      role: "site_hit",
      source: anom.kind === "issuance-spike" || anom.kind === "wildcard-proliferation" ? "CertSpotter CT" : "TLS inspection",
      evidence: anom.detail,
      confidence: "observed"
    });
  });

  checked.breachNews.forEach((news) => {
    addItem({
      kind: "breach-news",
      level: checked.breachNews.length >= 2 ? "high" : "watch",
      subject_type: "company",
      subject: registrable(host) || host,
      role: "company_hit",
      source: "GDELT Project",
      source_ref: news.url,
      last_seen: news.date || nowIso,
      evidence: "Cyber-attack coverage citing " + news.source + " (unverified name/domain match)",
      confidence: "third_party"
    });
  });

  // Existing security signals already collected in extras
  if (extras.safeBrowsing && Array.isArray(extras.safeBrowsing.threats) && extras.safeBrowsing.threats.length) {
    addItem({
      kind: extras.safeBrowsing.threats.some((t) => /SOCIAL_ENGINEERING/i.test(t)) ? "phishing-host" : "malware-host",
      level: "critical",
      role: "host_used",
      source: "Google Web Risk",
      evidence: "Listed on Google Safe Browsing: " + extras.safeBrowsing.threats.join(", "),
      confidence: "third_party"
    });
  }
  if (extras.threatLists && Array.isArray(extras.threatLists.sources)) {
    extras.threatLists.sources.filter((s) => s && s.ok && s.listed).forEach((s) => {
      addItem({
        kind: s.source === "phishstats" ? "phishing-host" : "malware-host",
        level: "critical",
        role: "host_used",
        source: s.source,
        source_ref: s.report || s.delist || "",
        evidence: "Flagged by " + s.source + " on " + (s.host || host),
        confidence: "third_party"
      });
    });
  }
  if (extras.linkedRisk && Array.isArray(extras.linkedRisk.hits) && extras.linkedRisk.hits.length) {
    addItem({
      kind: "malware-host",
      level: "critical",
      role: "site_hit",
      source: "Google Web Risk (linked resource)",
      evidence: extras.linkedRisk.hits.slice(0, 3).map((h) => h.host + " (" + h.element + ")").join(", "),
      confidence: "third_party"
    });
  }
  if (extras.hackSigns) {
    const spamPages = (extras.hackSigns.pages || []).filter((p) => p && (p.verdict === "spam" || p.verdict === "differs"));
    if (spamPages.length) {
      addItem({
        kind: spamPages.some((p) => p.verdict === "spam") ? "cloaking" : "hacked-spam",
        level: spamPages.some((p) => p.verdict === "spam") ? "high" : "watch",
        role: "site_hit",
        source: "Googlebot comparison",
        evidence: "Crawler vs mobile content mismatch or injected spam on " + spamPages.length + " page(s).",
        confidence: "observed"
      });
    }
    if (extras.hackSigns.links && extras.hackSigns.links.length) {
      const hidden = extras.hackSigns.links.some((l) => l && l.hidden);
      addItem({
        kind: "hacked-spam",
        level: hidden ? "high" : "watch",
        role: "site_hit",
        source: "Page link scan",
        evidence: extras.hackSigns.links.length + " suspicious external spam link(s)" + (hidden ? " (hidden)" : ""),
        confidence: "observed"
      });
    }
  }
  if (extras.lookalikes && extras.lookalikes.found) {
    const bad = (extras.lookalikes.rows || []).some((r) => r && (r.flagged || r.clone || r.login));
    addItem({
      kind: "lookalike",
      level: bad ? "high" : "watch",
      subject_type: "domain",
      role: "company_hit",
      source: "Lookalike domain scan",
      evidence: extras.lookalikes.found + " active lookalike domain(s) detected.",
      confidence: "observed"
    });
  }
  if (extras.exposed && Array.isArray(extras.exposed.found) && extras.exposed.found.length) {
    addItem({
      kind: "exposed-secret",
      level: "critical",
      role: "site_hit",
      source: "Exposed files probe",
      evidence: "Exposed sensitive paths: " + extras.exposed.found.slice(0, 4).map((f) => f.path).join(", "),
      confidence: "observed"
    });
  }
  const dnsBl = extras.dns && extras.dns.blocklists;
  if (dnsBl && Array.isArray(dnsBl.listed) && dnsBl.listed.length) {
    addItem({
      kind: "mail-blocklist",
      level: "high",
      role: "host_used",
      source: "DNSBL check",
      evidence: "Listed on " + dnsBl.listed.map((r) => r.list && r.list.name).filter(Boolean).slice(0, 4).join(", "),
      confidence: "third_party"
    });
  }
  if (extras.wordpress && Array.isArray(extras.wordpress.components)) {
    const vulns = extras.wordpress.components.filter((c) => c && Array.isArray(c.vulns) && c.vulns.length);
    if (vulns.length) {
      addItem({
        kind: "outdated-cms",
        level: vulns.some((c) => (c.score || 0) >= 7) ? "high" : "watch",
        subject_type: "software",
        subject: vulns.slice(0, 2).map((c) => c.slug + (c.version ? "@" + c.version : "")).join(", "),
        role: "site_hit",
        source: "Wordfence Intelligence",
        evidence: vulns.length + " vulnerable WordPress component(s) detected.",
        confidence: "inferred"
      });
    }
  }
  return items;
}

const RESERVED_TARGET = /(^|\.)(localhost|local|test|invalid|example|internal|home\.arpa|onion)$|^example\.(com|net|org)$/i;

async function check(input, options) {
  const opts = options || {};
  const now = Number.isFinite(opts.now) ? opts.now : Date.now();
  const fetchImpl = opts.fetch === false ? null : (opts.fetch || global.fetch);
  const url = String((input && (input.url || input.finalUrl)) || "");
  const host = String((input && input.host) || hostOf(url)).toLowerCase().replace(/\.$/, "");
  if (!host) return null;
  if (!opts.allowTestHost && !opts.feeds && (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(host) || RESERVED_TARGET.test(host))) return null;

  const libs = Array.isArray(input && input.libraries) ? input.libraries : [];
  const wp = (input && input.wordpress) || (input && input.extras && input.extras.wordpress) || null;
  const cert = (input && input.cert) || null;
  const certspotterKey = opts.certspotterKey || (opts.env && opts.env.CERTSPOTTER_KEY) || "";

  const work = (async () => {
    const [geo, feeds, osvHits, certCheck] = await Promise.all([
      hostGeo.inspectHostGeo(host, opts).catch(() => ({ ip: "", ips: [], country: "", asn: 0, asName: "", prefix: "", source: "", attribution: "" })),
      loadFeeds(opts).catch(() => null),
      queryOsvBatch(libs, fetchImpl).catch(() => []),
      checkCertificates(host, cert, certspotterKey, fetchImpl).catch(() => ({ anomalies: [], ctChecked: false, ctIssuances: 0 }))
    ]);

    const kevIndex = (feeds && feeds.kev && feeds.kev.byCve) || {};
    const kevHits = [];
    const matchedKevCves = new Set();

    // Cross-match OSV library CVEs with CISA KEV
    osvHits.forEach((hit) => {
      let matched = false;
      (hit.cves || []).forEach((cve) => {
        const entry = kevIndex[cve];
        if (entry) {
          matched = true;
          matchedKevCves.add(cve);
          kevHits.push(Object.assign({ software: hit.name + "@" + hit.version }, entry));
        }
      });
      hit.kevMatched = matched;
    });

    // Cross-match WordPress CVEs with CISA KEV
    if (wp && Array.isArray(wp.components)) {
      wp.components.forEach((comp) => {
        (comp && Array.isArray(comp.cves) ? comp.cves : []).forEach((cveRaw) => {
          const cve = String(cveRaw || "").toUpperCase();
          const entry = kevIndex[cve];
          if (entry && !matchedKevCves.has(cve)) {
            matchedKevCves.add(cve);
            kevHits.push(Object.assign({ software: (comp.slug || "wordpress") + (comp.version ? "@" + comp.version : "") }, entry));
          }
        });
      });
    }

    // Collect up to 10 CVEs to enrich with FIRST EPSS
    const allCves = [];
    kevHits.forEach((k) => allCves.push(k.cve));
    osvHits.forEach((o) => (o.cves || []).forEach((c) => allCves.push(c)));
    const epssMap = allCves.length && fetchImpl ? await queryEpss(allCves, fetchImpl).catch(() => ({})) : {};

    kevHits.forEach((k) => {
      if (epssMap[k.cve]) k.epss = epssMap[k.cve].epss;
    });
    osvHits.forEach((o) => {
      const scores = (o.cves || []).map((c) => (epssMap[c] && epssMap[c].epss) || 0);
      o.maxEpss = scores.length ? Math.max(...scores) : 0;
    });

    const ips = Array.isArray(geo.ips) ? geo.ips : [];
    const dropIpHit = ips.map((ip) => matchDropIp(ip, feeds && feeds.dropV4)).find(Boolean) || null;
    const dropAsnHit = geo.asn && feeds && feeds.asnDrop && feeds.asnDrop.asns ? (feeds.asnDrop.asns[geo.asn] || null) : null;
    const feodoHit = ips.map((ip) => feeds && feeds.feodo && feeds.feodo.ips ? feeds.feodo.ips[ip] : null).find(Boolean) || null;
    const torSet = feeds && feeds.tor && Array.isArray(feeds.tor.ips) ? new Set(feeds.tor.ips) : null;
    const torHit = torSet ? (ips.find((ip) => torSet.has(ip)) || "") : "";
    const breachNews = matchBreachNews(host, feeds && feeds.gdelt);

    const sourcesRead = [];
    const sourcesSkipped = [];
    if (feeds && feeds.kev && feeds.kev.count) sourcesRead.push("CISA KEV");
    else sourcesSkipped.push("CISA KEV");
    if (libs.length && fetchImpl) sourcesRead.push("OSV.dev");
    if (Object.keys(epssMap).length) sourcesRead.push("FIRST EPSS");
    if (feeds && feeds.dropV4 && feeds.dropV4.count) sourcesRead.push("Network DROP");
    if (feeds && feeds.feodo) sourcesRead.push("Feodo Tracker");
    if (feeds && feeds.tor && feeds.tor.count) sourcesRead.push("Tor Exit List");
    if (feeds && feeds.gdelt && feeds.gdelt.mentions) sourcesRead.push("GDELT Project");
    if (certCheck.ctChecked) sourcesRead.push("CertSpotter CT");
    else if (!certspotterKey) sourcesSkipped.push("CertSpotter CT (no key)");

    const items = unifySiteItems(input, {
      now,
      host,
      kevHits,
      osvHits,
      dropIpHit,
      dropAsnHit,
      feodoHit,
      torHit,
      certCheck,
      breachNews
    });

    let maxRank = 1;
    items.forEach((item) => {
      const r = LEVEL_RANK[item.level] || 1;
      if (r > maxRank) maxRank = r;
    });
    const level = maxRank >= 4 ? "critical" : maxRank === 3 ? "high" : maxRank === 2 ? "watch" : "info";
    const status = items.some((i) => i.level !== "info") ? level : "clear";

    const attributions = [];
    if (geo.attribution) attributions.push(geo.attribution);
    if (sourcesRead.includes("FIRST EPSS")) attributions.push("EPSS data provided by FIRST.org");
    if (sourcesRead.includes("GDELT Project")) attributions.push("GDELT Project (https://www.gdeltproject.org/)");

    const countryMentions = geo.country && feeds && feeds.gdelt && feeds.gdelt.byCountry
      ? (feeds.gdelt.byCountry[geo.country] || 0)
      : 0;

    return {
      host,
      checkedAt: new Date(now).toISOString(),
      status,
      level,
      hosting: {
        ip: geo.ip || "",
        ips,
        country: geo.country || "",
        asn: geo.asn || 0,
        asName: geo.asName || "",
        prefix: geo.prefix || "",
        attribution: geo.attribution || ""
      },
      kevHits,
      osvHits: osvHits.filter((o) => !o.kevMatched),
      dropIpHit,
      dropAsnHit,
      feodoHit,
      torHit,
      certCheck,
      breachNews,
      sourcesRead,
      sourcesSkipped,
      attributions,
      context: {
        country: geo.country || "",
        cyberMentions15m: countryMentions,
        kevCatalogCount: (feeds && feeds.kev && feeds.kev.count) || 0
      },
      items
    };
  })();

  return withTimeout(work, opts.timeoutMs || CHECK_DEADLINE_MS, null);
}

// The review log's lines for what check() read (#3848). The page's progress meter matches them by their start.
// They name the sources only: the level and the findings stay in the paid report (#3818).
function lines(result) {
  if (!result) return ["The attack and exploit sources did not answer in time."];
  const read = result.sourcesRead || [];
  const skipped = result.sourcesSkipped || [];
  const out = ["Attack and exploit sources read: " + (read.length ? read.join(", ") : "none") + "."];
  if (skipped.length) out.push("Attack and exploit sources skipped: " + skipped.join(", ") + ".");
  return out;
}

function addFindings(result, add) {
  if (!result || typeof add !== "function") return;
  const kevHits = Array.isArray(result.kevHits) ? result.kevHits : [];
  const osvHits = Array.isArray(result.osvHits) ? result.osvHits : [];
  const dropHit = result.dropIpHit || result.dropAsnHit;
  const feodo = result.feodoHit;
  const news = Array.isArray(result.breachNews) ? result.breachNews : [];
  const certAnoms = (result.certCheck && Array.isArray(result.certCheck.anomalies)) ? result.certCheck.anomalies : [];

  if (kevHits.length) {
    const ransom = kevHits.some((k) => k.ransomware);
    const list = some(kevHits.map((k) => k.cve + " (" + k.software + ")"), 3);
    add("Security", "fail", ransom ? "critical" : "high", "sec-kev",
      say("sec-kev.title", { n: kevHits.length }),
      say("sec-kev.evidence", { list }),
      say("sec-kev.fix"), { effort: "hours", count: kevHits.length, cases: ["SEC-10"] });
  }

  if (osvHits.length) {
    const highRisk = osvHits.some((o) => (o.maxEpss || 0) >= 0.5);
    const list = some(osvHits.map((o) => o.name + " " + o.version + " (" + o.ids[0] + ")"), 3);
    add("Security", highRisk ? "fail" : "risk", highRisk ? "high" : "medium", "sec-osv",
      say("sec-osv.title", { n: osvHits.length }),
      say("sec-osv.evidence", { list }),
      say("sec-osv.fix"), { effort: "hours", count: osvHits.length, cases: ["SEC-10"] });
  }

  if (feodo) {
    add("Security", "fail", "critical", "sec-feodo",
      say("sec-feodo.title"),
      say("sec-feodo.evidence", { ip: feodo.ip, malware: feodo.malware }),
      say("sec-feodo.fix"), { effort: "days", cases: ["SEC-11"] });
  }

  if (dropHit) {
    const target = result.dropIpHit ? result.dropIpHit.ip + " (" + result.dropIpHit.cidr + ")" : "AS" + result.dropAsnHit.asn;
    add("Security", "fail", "high", "sec-drop",
      say("sec-drop.title"),
      say("sec-drop.evidence", { target }),
      say("sec-drop.fix"), { effort: "days", cases: ["SEC-11"] });
  }

  if (news.length) {
    add("Security", "risk", news.length >= 2 ? "high" : "medium", "sec-breach-news",
      say("sec-breach-news.title", { n: news.length }),
      say("sec-breach-news.evidence", { host: result.host, sources: some(news.map((n) => n.source), 3) }),
      say("sec-breach-news.fix"), { effort: "hours", count: news.length });
  }

  if (certAnoms.length) {
    add("Security", "risk", "medium", "sec-cert-anomaly",
      say("sec-cert-anomaly.title", { n: certAnoms.length }),
      say("sec-cert-anomaly.evidence", { details: some(certAnoms.map((a) => a.detail), 3) }),
      say("sec-cert-anomaly.fix"), { effort: "hours", count: certAnoms.length });
  }

  if (!kevHits.length && !osvHits.length && !feodo && !dropHit && !news.length && !certAnoms.length && (result.sourcesRead || []).length) {
    add("Security", "pass", "info", "sec-targeted",
      say("sec-targeted.pass.title"),
      say("sec-targeted.pass.evidence", { host: result.host, sources: some(result.sourcesRead, 6) }),
      "");
  }
}

module.exports = {
  lines,
  BUCKET,
  FEEDS_OBJECT,
  MAP_GLOBAL_OBJECT,
  CISA_KEV_URL,
  DROP_V4_URL,
  parseCisaKev,
  parseDropV4,
  parseAsnDrop,
  parseFeodo,
  parseTorExits,
  parseGdeltGkg,
  extractZipText,
  matchDropIp,
  matchBreachNews,
  fetchLatestGdelt,
  updateGlobalMapHistory,
  botnetNowSummary,
  refreshFeeds,
  loadFeeds,
  queryOsvBatch,
  queryEpss,
  checkCertificates,
  check,
  addFindings
};
