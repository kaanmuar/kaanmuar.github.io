"use strict";

/* Request waterfall check (#3830). The review's headless browser already loads the start page once; this listens to the
   Chrome DevTools network events of that same load and keeps one row per request (address without its query string,
   type, status, timings, bytes). It adds no request to the site. From the rows it builds a HAR 1.2 file (toHar) that a
   waterfall viewer such as cloudflare/telescope's @cloudflare/waterfall (Apache-2.0) can draw, and a summary the
   findings use: how long the load ran, the slowest request, and the longest chain of requests that each waited for the
   one before. The viewer itself is not embedded yet. */

const { say } = require("./url-review-findings-en");

const MAX_ROWS = 200;
const SLOW_MS = 2000;
const CHAIN_DEPTH = 5;
const MIN_ROWS = 5;
// Streams and beacons stay open on purpose, so they never count as the slowest request.
const LOAD_TYPES = new Set(["Document", "Stylesheet", "Image", "Media", "Font", "Script", "XHR", "Fetch", "Manifest", "Other"]);

// The address without its query string and fragment, which can carry tokens; null for anything that is not http(s).
function stripUrl(raw) {
  const text = String(raw || "");
  if (!/^https?:\/\//i.test(text)) return "";
  return text.replace(/[?#](?<![?#][^\n\r\u2028\u2029?#]*[?#]).*$/, "").slice(0, 200);
}

function initiatorUrl(initiator) {
  if (!initiator) return "";
  const frames = (initiator.stack && initiator.stack.callFrames) || [];
  return stripUrl(initiator.url || (frames[0] && frames[0].url) || "");
}

function createLog(max) {
  const limit = max || MAX_ROWS;
  const open = new Map();
  const rows = [];
  let wall0 = 0;
  let t0 = null;
  const close = (row, end, extra) => {
    open.delete(row.id);
    row.end = end;
    Object.assign(row, extra || {});
    if (rows.length < limit && row.url) rows.push(row);
  };
  return {
    request(event) {
      if (!event || !event.requestId || !event.request) return;
      const previous = open.get(event.requestId);
      if (previous && event.redirectResponse) close(previous, event.timestamp, { status: event.redirectResponse.status || 0 });
      if (t0 === null) {
        t0 = event.timestamp;
        wall0 = (event.wallTime || 0) * 1000;
      }
      open.set(event.requestId, {
        id: event.requestId,
        url: stripUrl(event.request.url),
        method: String(event.request.method || "GET"),
        type: String(event.type || "Other"),
        from: initiatorUrl(event.initiator),
        t: event.timestamp,
        status: 0,
        mime: "",
        protocol: "",
        wait: 0,
        bytes: 0,
        failed: false
      });
    },
    response(event) {
      const row = event && open.get(event.requestId);
      if (!row || !event.response) return;
      const timing = event.response.timing;
      row.status = event.response.status || 0;
      row.mime = String(event.response.mimeType || "").slice(0, 60);
      row.protocol = String(event.response.protocol || "").slice(0, 12);
      row.wait = timing && timing.receiveHeadersEnd > 0
        ? Math.max(0, Math.round(timing.receiveHeadersEnd - (timing.sendEnd || 0)))
        : Math.max(0, Math.round((event.timestamp - row.t) * 1000));
    },
    finished(event) {
      const row = event && open.get(event.requestId);
      if (row) close(row, event.timestamp, { bytes: Math.max(0, Math.round(event.encodedDataLength || 0)) });
    },
    failed(event) {
      const row = event && open.get(event.requestId);
      if (row) close(row, event.timestamp, { failed: true });
    },
    entries() {
      return rows.slice().sort((a, b) => a.t - b.t).map((row) => ({
        url: row.url,
        method: row.method,
        type: row.type,
        from: row.from,
        status: row.status,
        mime: row.mime,
        protocol: row.protocol,
        startMs: Math.round((row.t - t0) * 1000),
        waitMs: row.wait,
        totalMs: Math.max(0, Math.round((row.end - row.t) * 1000)),
        bytes: row.bytes,
        failed: row.failed
      }));
    },
    startedAt() {
      return wall0 ? new Date(wall0).toISOString() : "";
    }
  };
}

// HAR 1.2 from the rows. Headers and cookies are never kept, so the file holds no secret.
function toHar(entries, options) {
  const opts = options || {};
  const started = opts.startedAt ? Date.parse(opts.startedAt) : Date.now();
  return {
    log: {
      version: "1.2",
      creator: { name: "QA-lab URL Review", version: "1" },
      pages: [{ startedDateTime: new Date(started).toISOString(), id: "page_1", title: String(opts.title || ""), pageTimings: {} }],
      entries: (entries || []).map((row) => ({
        pageref: "page_1",
        startedDateTime: new Date(started + row.startMs).toISOString(),
        time: row.totalMs,
        request: { method: row.method, url: row.url, httpVersion: row.protocol || "unknown", headers: [], queryString: [], cookies: [], headersSize: -1, bodySize: -1 },
        response: { status: row.status, statusText: "", httpVersion: row.protocol || "unknown", headers: [], cookies: [], content: { size: row.bytes, mimeType: row.mime }, redirectURL: "", headersSize: -1, bodySize: row.bytes },
        cache: {},
        timings: { blocked: -1, dns: -1, connect: -1, ssl: -1, send: 0, wait: row.waitMs, receive: Math.max(0, row.totalMs - row.waitMs) },
        _resourceType: row.type
      }))
    }
  };
}

function pathOf(url) {
  try { return new URL(url).pathname.slice(0, 80) || "/"; } catch (error) { return url.slice(0, 80); }
}

function summarize(entries) {
  const rows = (entries || []).filter((row) => row && row.url);
  if (!rows.length) return null;
  const byUrl = new Map();
  rows.forEach((row) => { if (!byUrl.has(row.url)) byUrl.set(row.url, row); });
  const memo = new Map();
  const depth = (row, seen) => {
    if (memo.has(row)) return memo.get(row);
    const parent = row.from && row.from !== row.url ? byUrl.get(row.from) : null;
    let value = 1;
    if (parent && !seen.has(parent)) {
      seen.add(parent);
      value = 1 + depth(parent, seen);
    }
    memo.set(row, value);
    return value;
  };
  let chain = null;
  rows.forEach((row) => {
    const value = depth(row, new Set([row]));
    if (!chain || value > chain.depth) chain = { depth: value, row };
  });
  const timed = rows.filter((row) => LOAD_TYPES.has(row.type));
  const slowest = timed.reduce((best, row) => (!best || row.totalMs > best.totalMs ? row : best), null);
  const largest = rows.reduce((best, row) => (!best || row.bytes > best.bytes ? row : best), null);
  return {
    count: rows.length,
    endMs: rows.reduce((max, row) => Math.max(max, row.startMs + row.totalMs), 0),
    bytes: rows.reduce((sum, row) => sum + row.bytes, 0),
    slowest: slowest ? { path: pathOf(slowest.url), ms: slowest.totalMs, type: slowest.type } : null,
    largest: largest ? { path: pathOf(largest.url), bytes: largest.bytes } : null,
    chain: chain ? { depth: chain.depth, end: pathOf(chain.row.url) } : { depth: 0, end: "" }
  };
}

function findings(entries, add) {
  const summary = summarize(entries);
  if (!summary || summary.count < MIN_ROWS) return summary;
  const seconds = Math.round(summary.endMs / 100) / 10;
  const gaps = [];
  if (summary.chain.depth >= CHAIN_DEPTH) gaps.push(say("perf-waterfall.gapChain", { n: summary.chain.depth }));
  if (summary.slowest && summary.slowest.ms >= SLOW_MS) gaps.push(say("perf-waterfall.gapSlow", { ms: summary.slowest.ms }));
  const vars = { n: summary.count, seconds, path: summary.slowest ? summary.slowest.path : "/", ms: summary.slowest ? summary.slowest.ms : 0, depth: summary.chain.depth, end: summary.chain.end || "/" };
  if (gaps.length) {
    add("Performance", "risk", "low", "perf-waterfall", say("perf-waterfall.title", { gaps: { items: gaps, join: "and" } }),
      say("perf-waterfall.evidence", vars), say("perf-waterfall.fix"), { effort: "hours" });
  } else {
    add("Performance", "pass", "info", "perf-waterfall", say("perf-waterfall.pass.title"), say("perf-waterfall.pass.evidence", vars), "", { effort: "hours" });
  }
  return summary;
}

module.exports = { createLog, toHar, summarize, findings, stripUrl, MAX_ROWS };
