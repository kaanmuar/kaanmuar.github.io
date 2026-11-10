"use strict";

/* Phishing and malware lists beyond Google's (#3083): abuse.ch URLhaus, PhishStats and Cloudflare's URL Scanner.
   Quad9, company web filters and mail filters block what these lists hold, often before Google does.
   Each source has its own secret and is left out, with a log line, while that secret is missing (or not yet bound in
   functions/secrets.js): URLHAUS_AUTH_KEY (auth.abuse.ch), PHISHSTATS_KEY (a psk_ key from phishstats.info) and
   CLOUDFLARE_URLSCAN_TOKEN (an API token with URL Scanner read and write on CLOUDFLARE_ACCOUNT_ID).
   A Cloudflare scan is public on Radar, and the free plan allows one scan every 10 seconds and 5,000 a month, so a
   scan of the host from the last day is read before a new one is asked for. PhishStats terms forbid passing on its
   raw feed: the report names only the reviewed host's entries.

   threatlist_usage/<YYYY-MM> = { <source>: { calls, scans, errors, skipped, days: { "<DD>": { calls, scans, errors } },
   lastOkAt, lastErrorAt, lastError } }   one write per review, so Jarvis shows the quotas and which source is down (#3329). */

const { registrable } = require("./url-review-suffix");
const { say, some } = require("./url-review-findings-en");

const URLHAUS_API = "https://urlhaus-api.abuse.ch/v1/host/";
const PHISHSTATS_API = "https://api.phishstats.info/api/phishing";
const CLOUDFLARE_API = "https://api.cloudflare.com/client/v4/accounts/";
const CACHE_MS = 6 * 3600 * 1000;
const PENDING_MS = 30 * 60 * 1000;
const CALL_MS = 8000;
const SCAN_WAIT_MS = 30000;
const POLL_MS = 10000;
// PhishStats scores each entry from 0 to 10; low scores and old entries are logged, not reported.
const PHISHSTATS_MIN_SCORE = 5;
const PHISHSTATS_DAYS = 90;
const NAMES = { urlhaus: "URLhaus", phishstats: "PhishStats", cloudflare: "Cloudflare URL Scanner" };

const cache = new Map();
const USAGE = "threatlist_usage";
let backing = null;

function use(getDb, FieldValue) {
  backing = typeof getDb === "function" && FieldValue ? { getDb, FieldValue } : null;
}

// The usage write for one check: what each source was asked, from the rows and the new Cloudflare scans.
function usagePatch(rows, scans, now, inc) {
  const at = new Date(now).toISOString();
  const dd = at.slice(8, 10);
  const out = {};
  rows.forEach((row) => {
    if (!row.asked && !row.skipped) return;
    const n = { calls: row.asked ? 1 : 0, scans: row.source === "cloudflare" ? scans : 0, errors: row.asked && !row.ok ? 1 : 0 };
    const entry = { calls: inc(n.calls), scans: inc(n.scans), errors: inc(n.errors), skipped: inc(row.skipped ? 1 : 0), days: { [dd]: { calls: inc(n.calls), scans: inc(n.scans), errors: inc(n.errors) } } };
    if (row.asked && row.ok) entry.lastOkAt = at;
    if (row.asked && !row.ok) Object.assign(entry, { lastErrorAt: at, lastError: String(row.error || "failed").slice(0, 120) });
    out[row.source] = entry;
  });
  return out;
}

async function recordUsage(rows, scans, now) {
  if (!backing) return;
  try {
    const patch = usagePatch(rows, scans, now, (n) => backing.FieldValue.increment(n));
    if (Object.keys(patch).length) await backing.getDb().collection(USAGE).doc(new Date(now).toISOString().slice(0, 7)).set(patch, { merge: true });
  } catch (error) { /* usage is a count, never a reason to fail the review */ }
}

function remember(key, value, ms) {
  cache.set(key, { until: Date.now() + ms, value });
  if (cache.size > 500) cache.delete(cache.keys().next().value);
  return value;
}

function recall(key) {
  const hit = cache.get(key);
  if (hit && hit.until > Date.now()) return hit.value;
  cache.delete(key);
  return null;
}

const day = (value) => {
  const parsed = Date.parse(String(value || "").replace(" UTC", "Z").replace(" ", "T"));
  return isNaN(parsed) ? "" : new Date(parsed).toISOString().slice(0, 10);
};

async function getJson(fetchImpl, url, init) {
  const res = await fetchImpl(url, Object.assign({ signal: AbortSignal.timeout(CALL_MS) }, init));
  if (!res.ok) {
    const error = new Error("status " + res.status);
    error.status = res.status;
    throw error;
  }
  return res.json();
}

const hostOf = (url) => {
  try { return new URL(String(url || "")).hostname.toLowerCase().replace(/\.$/, ""); } catch (error) { return ""; }
};

function hostsOf(host) {
  return [...new Set([host, registrable(host)].filter(Boolean))].slice(0, 2);
}

async function urlhaus(host, key, fetchImpl) {
  const rows = [];
  let reference = "https://urlhaus.abuse.ch/host/" + host + "/";
  let named = false;
  for (const name of hostsOf(host)) {
    const data = await getJson(fetchImpl, URLHAUS_API, {
      method: "POST",
      headers: { "Auth-Key": key, "Content-Type": "application/x-www-form-urlencoded" },
      body: "host=" + encodeURIComponent(name)
    });
    const status = data && (data.query_status || data.query_staus);
    if (status !== "ok" && status !== "no_results" && status !== "invalid_host") throw new Error(String(status || "no answer"));
    if (status !== "ok") continue;
    const active = (data.urls || []).filter((row) => row.url_status !== "offline");
    if (data.urlhaus_reference && !named && active.length) { reference = String(data.urlhaus_reference); named = true; }
    (data.urls || []).forEach((row) => rows.push(row));
  }
  const active = rows.filter((row) => row.url_status !== "offline");
  const dates = active.map((row) => day(row.date_added)).filter(Boolean).sort();
  return {
    source: "urlhaus", ok: true, listed: active.length > 0, host,
    count: active.length, offline: rows.length - active.length, since: dates[0] || "",
    urls: active.map((row) => String(row.url || "")).filter(Boolean).slice(0, 3),
    delist: reference
  };
}

async function phishstats(host, key, fetchImpl, now) {
  const where = hostsOf(host).map((name) => "(host,eq," + name + ")").join("~or");
  const data = await getJson(fetchImpl, PHISHSTATS_API + "?_where=" + encodeURIComponent(where) + "&_sort=-date&_size=20", { headers: { "X-API-Key": key } });
  const rows = Array.isArray(data) ? data : [];
  const recent = rows.filter((row) => Number(row.score) >= PHISHSTATS_MIN_SCORE && now - Date.parse(row.date) <= PHISHSTATS_DAYS * 86400000);
  return {
    source: "phishstats", ok: true, listed: recent.length > 0, host,
    count: recent.length, older: rows.length - recent.length, last: day(recent[0] && recent[0].date),
    score: recent.length ? Math.max(...recent.map((row) => Number(row.score))) : 0,
    urls: recent.map((row) => String(row.url || "")).filter(Boolean).slice(0, 3),
    delist: "https://phishstats.info/"
  };
}

function scanVerdict(result, host) {
  const task = result.task || {};
  const overall = (result.verdicts && result.verdicts.overall) || {};
  const phishing = (((result.meta || {}).processors || {}).phishing || {}).data || [];
  const categories = (overall.categories || []).map((item) => String((item && item.name) || item || "")).filter(Boolean);
  phishing.map(String).forEach((name) => { if (name && !categories.includes(name)) categories.push(name); });
  return {
    source: "cloudflare", ok: true, listed: overall.malicious === true, host,
    url: String(task.url || ""), date: day(task.time), categories: categories.slice(0, 4),
    report: String(task.reportURL || "https://radar.cloudflare.com/scan/" + task.uuid),
    delist: "https://radar.cloudflare.com/domains/feedback/" + (registrable(host) || host)
  };
}

async function cloudflare(url, host, token, account, fetchImpl, opts) {
  const base = CLOUDFLARE_API + encodeURIComponent(account) + "/urlscanner/v2/";
  const headers = { Authorization: "Bearer " + token };
  const result = (uuid) => getJson(fetchImpl, base + "result/" + encodeURIComponent(uuid), { headers });
  const pendingKey = "cloudflare-pending " + host;
  let uuid = recall(pendingKey);
  if (!uuid) {
    const found = await getJson(fetchImpl, base + "search?size=5&q=" + encodeURIComponent("page.domain:\"" + host + "\" AND date:>now-1d"), { headers });
    const done = ((found && found.results) || []).filter((row) => row.task && row.task.success !== false && row.task.uuid && hostOf(row.page && row.page.url) === host);
    const pick = done.find((row) => row.verdicts && row.verdicts.malicious === true) || done[0];
    if (pick) return scanVerdict(await result(pick.task.uuid), host);
    const asked = await getJson(fetchImpl, base + "scan", {
      method: "POST",
      headers: Object.assign({ "Content-Type": "application/json" }, headers),
      body: JSON.stringify({ url, visibility: "Public" })
    });
    uuid = asked && asked.uuid;
    if (!uuid) throw new Error("no scan id");
    if (opts.onScan) opts.onScan();
    remember(pendingKey, uuid, PENDING_MS);
  }
  const until = Date.now() + opts.wait;
  for (;;) {
    const left = until - Date.now();
    if (left <= 0 || opts.stop()) break;
    await opts.pause(Math.min(POLL_MS, left));
    try {
      const verdict = scanVerdict(await result(uuid), host);
      cache.delete(pendingKey);
      return verdict;
    } catch (error) {
      if (error.status !== 404) throw error;
    }
  }
  return { source: "cloudflare", ok: true, pending: true, listed: false, host, report: "https://radar.cloudflare.com/scan/" + uuid };
}

function line(row) {
  const name = NAMES[row.source];
  if (row.skipped) return name + " was not asked: " + row.skipped + " is not set.";
  if (!row.ok) return name + " could not be read (" + row.error + ").";
  if (row.source === "urlhaus") return row.listed
    ? "URLhaus lists " + row.count + " active malware address" + (row.count === 1 ? "" : "es") + " on " + row.host + ", the first added " + row.since + "."
    : "URLhaus has no active malware address on " + row.host + (row.offline ? "; " + row.offline + " older one" + (row.offline === 1 ? " is" : "s are") + " offline" : "") + ".";
  if (row.source === "phishstats") return row.listed
    ? "PhishStats lists " + row.count + " recent phishing page" + (row.count === 1 ? "" : "s") + " on " + row.host + ", the last seen " + row.last + " (score up to " + row.score + " of 10)."
    : "PhishStats has no recent phishing entry for " + row.host + (row.older ? "; " + row.older + " older or low-score entr" + (row.older === 1 ? "y was" : "ies were") + " left out" : "") + ".";
  if (row.pending) return "Cloudflare's URL Scanner had not finished its scan in time; the result will be at " + row.report + ".";
  return "Cloudflare's URL Scanner judged " + row.url + " " + (row.listed ? "malicious" : "not malicious") + " on " + row.date + (row.categories.length ? " (" + row.categories.join(", ") + ")" : "") + ": " + row.report + ".";
}

// One answer per source, each cached for six hours per host. Null when no source has its secret.
async function check(url, options) {
  const opts = Object.assign({ env: process.env, fetch: global.fetch, note: () => {}, stop: () => false, wait: SCAN_WAIT_MS, pause: (ms) => new Promise((resolve) => setTimeout(resolve, ms)), now: Date.now() }, options);
  const env = opts.env || {};
  const host = hostOf(url);
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(host)) return null;
  const sources = [
    ["urlhaus", ["URLHAUS_AUTH_KEY"], () => urlhaus(host, env.URLHAUS_AUTH_KEY, opts.fetch)],
    ["phishstats", ["PHISHSTATS_KEY"], () => phishstats(host, env.PHISHSTATS_KEY, opts.fetch, opts.now)],
    ["cloudflare", ["CLOUDFLARE_URLSCAN_TOKEN", "CLOUDFLARE_ACCOUNT_ID"], () => cloudflare(url, host, env.CLOUDFLARE_URLSCAN_TOKEN, env.CLOUDFLARE_ACCOUNT_ID, opts.fetch, opts)]
  ];
  const missing = (names) => names.find((name) => !env[name]);
  if (sources.every(([, names]) => missing(names))) {
    opts.note("No phishing or malware list beyond Google's was asked: URLHAUS_AUTH_KEY, PHISHSTATS_KEY and CLOUDFLARE_URLSCAN_TOKEN are not set.");
    return null;
  }
  let scans = 0;
  opts.onScan = () => { scans += 1; };
  const asked = new Set();
  const rows = await Promise.all(sources.map(async ([source, names, ask]) => {
    let row;
    if (missing(names)) row = { source, ok: false, skipped: missing(names), listed: false };
    else {
      const key = source + " " + host;
      row = recall(key);
      if (!row) {
        asked.add(source);
        try {
          row = await ask();
          if (!row.pending) remember(key, row, CACHE_MS);
        } catch (error) {
          row = { source, ok: false, listed: false, error: String((error && error.message) || error).slice(0, 120) };
        }
      }
    }
    opts.note(line(row));
    return row;
  }));
  await recordUsage(rows.map((row) => Object.assign({ asked: asked.has(row.source) }, row)), scans, opts.now);
  return { host, checkedAt: new Date(opts.now).toISOString(), sources: rows };
}

const listName = (row) => NAMES[row.source];

// The sec-threatlists finding: critical when a list holds the host, a pass naming the lists that were read otherwise.
function addFindings(result, add) {
  const read = ((result && result.sources) || []).filter((row) => row.ok && !row.pending);
  const listed = read.filter((row) => row.listed);
  if (listed.length) {
    const lines = listed.map((row) => {
      if (row.source === "urlhaus") return say("threatlist.urlhaus", { n: row.count, host: row.host, date: row.since, urls: some(row.urls, 3) });
      if (row.source === "phishstats") return say("threatlist.phishstats", { n: row.count, host: row.host, date: row.last, urls: some(row.urls, 3) });
      return row.categories.length
        ? say("threatlist.cloudflare", { url: row.url, date: row.date, categories: { items: row.categories }, report: row.report })
        : say("threatlist.cloudflare.bare", { url: row.url, date: row.date, report: row.report });
    });
    const links = listed.map((row) => say("threatlist.link." + row.source, { link: row.delist }));
    add("Security", "fail", "critical", "sec-threatlists",
      say("sec-threatlists.title", { n: listed.length, lists: { items: listed.map(listName), join: "and" } }),
      say("sec-threatlists.evidence", { lines: { items: lines, sep: " " } }),
      say("sec-threatlists.fix", { links: { items: links, sep: "; " } }), { effort: "days" });
    return;
  }
  if (!read.length) return;
  const pending = ((result && result.sources) || []).find((row) => row.pending);
  add("Security", "pass", "info", "sec-threatlists",
    say("sec-threatlists.pass.title", { n: read.length, lists: { items: read.map(listName), join: "and" } }),
    say("sec-threatlists.pass.evidence", { n: read.length, lists: { items: read.map(listName), join: "and" }, host: result.host, pending: pending ? say("threatlist.pending", { report: pending.report }) : "" }), "");
}

module.exports = { check, addFindings, use, usagePatch, USAGE, NAMES, PHISHSTATS_MIN_SCORE, PHISHSTATS_DAYS, _cache: cache };
