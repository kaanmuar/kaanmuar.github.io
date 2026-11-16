"use strict";
/* PageSpeed Insights (Lighthouse 13 audits) for one page in one mode, cut down to what the fixers, the PR and Jarvis read.
   Lighthouse runs from scripts/pagespeed/lighthouse.js give the same shape through summarize(). */

const API = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";
const MODES = ["mobile", "desktop"];
// The audits worth a line in Page health, the fixers and the Gemini prompt; the rest are metrics or always pass.
const AUDITS = [
  "render-blocking-insight", "image-delivery-insight", "lcp-discovery-insight", "lcp-breakdown-insight", "font-display-insight",
  "cache-insight", "unused-javascript", "unused-css-rules", "unminified-css", "unminified-javascript", "legacy-javascript-insight",
  "duplicated-javascript-insight", "forced-reflow-insight", "dom-size-insight", "third-parties-insight", "cls-culprits-insight",
  "document-latency-insight", "unsized-images", "total-byte-weight", "bootup-time", "mainthread-work-breakdown", "network-dependency-tree-insight"
];
const METRICS = { lcp: "largest-contentful-paint", fcp: "first-contentful-paint", tbt: "total-blocking-time", cls: "cumulative-layout-shift", si: "speed-index" };

const clip = (s, n) => String(s == null ? "" : s).replace(/\s+/g, " ").trim().slice(0, n);
const round = (n, p) => (Number.isFinite(Number(n)) ? Math.round(Number(n) * Math.pow(10, p || 0)) / Math.pow(10, p || 0) : null);

function node(n) {
  return n && n.type === "node" ? { selector: clip(n.selector, 200), snippet: clip(n.snippet, 400), label: clip(n.nodeLabel, 120) } : null;
}

function item(row) {
  const r = row || {};
  const out = {};
  if (r.url) out.url = clip(r.url, 400);
  ["wastedMs", "wastedBytes", "totalBytes", "cacheLifetimeMs", "transferSize"].forEach((k) => { if (Number.isFinite(r[k])) out[k] = Math.round(r[k]); });
  if (r.node) out.node = node(r.node);
  if (r.resourceType) out.type = r.resourceType;
  if (r.subItems && Array.isArray(r.subItems.items)) out.reasons = r.subItems.items.map((s) => clip(s.reason, 160)).filter(Boolean).slice(0, 3);
  return out;
}

// The LCP checklist (priorityHinted, requestDiscoverable, eagerlyLoaded) and the LCP element, wherever 13.x puts them.
function lcpFacts(audits) {
  const out = { checks: {}, node: null };
  const walk = (d) => {
    if (!d || typeof d !== "object") return;
    if (d.type === "checklist" && d.items) Object.keys(d.items).forEach((k) => { out.checks[k] = !!d.items[k].value; });
    if (d.type === "node" && !out.node) out.node = node(d);
    (Array.isArray(d.items) ? d.items : []).forEach(walk);
  };
  walk((audits["lcp-discovery-insight"] || {}).details);
  walk((audits["lcp-breakdown-insight"] || {}).details);
  return out;
}

/** One Lighthouse result -> { score 0-100, metrics, audits {id: {score, title, items}}, lcpEl, fonts, chainFonts }. */
function summarize(lhr) {
  const r = lhr || {};
  const audits = r.audits || {};
  const perf = (r.categories || {}).performance || {};
  const out = { score: perf.score === null || perf.score === undefined ? null : Math.round(perf.score * 100), version: r.lighthouseVersion || "" };
  Object.keys(METRICS).forEach((k) => { const a = audits[METRICS[k]]; out[k] = a ? round(a.numericValue, k === "cls" ? 3 : 0) : null; });
  out.audits = {};
  AUDITS.forEach((id) => {
    const a = audits[id];
    if (!a || a.score === null || a.score === undefined || a.score >= 0.9) return;
    const items = a.details && Array.isArray(a.details.items) ? a.details.items.filter((i) => i && (i.url || i.node || i.wastedMs || i.wastedBytes)).slice(0, 8).map(item) : [];
    out.audits[id] = { score: round(a.score, 2), title: clip(a.title, 140), savings: a.metricSavings || null, items };
  });
  out.lcpEl = lcpFacts(audits);
  const reqs = audits["network-requests"] && audits["network-requests"].details && audits["network-requests"].details.items;
  out.fonts = (Array.isArray(reqs) ? reqs : []).filter((q) => q.resourceType === "Font").map((q) => clip(q.url, 400)).slice(0, 6);
  const tree = audits["network-dependency-tree-insight"];
  const chain = tree && tree.score !== null && tree.score < 0.9 ? JSON.stringify(tree.details || {}) : "";
  out.chainFonts = out.fonts.filter((u) => chain.includes(u));
  return out;
}

async function run(fetchImpl, url, mode, key, opts) {
  const o = opts || {};
  const api = API + "?category=performance&strategy=" + mode + "&url=" + encodeURIComponent(url) + (key ? "&key=" + encodeURIComponent(key) : "");
  let last = "";
  for (let attempt = 1; attempt <= (o.tries || 3); attempt += 1) {
    try {
      const res = await fetchImpl(api, { signal: AbortSignal.timeout(o.timeout || 150000) });
      if (res.ok) {
        const data = await res.json();
        return Object.assign({ ok: true }, summarize(data.lighthouseResult));
      }
      const body = await res.json().catch(() => ({}));
      last = res.status + " " + clip((body.error || {}).message, 160);
      if (res.status !== 429 && res.status < 500) break;
    } catch (error) {
      last = clip(error.message || error, 160);
    }
    if (attempt < (o.tries || 3)) await new Promise((r) => setTimeout(r, (o.backoff === undefined ? 30000 : o.backoff) * attempt));
  }
  return { ok: false, error: last || "no answer" };
}

// Runs fn over list with at most `limit` running at once, in order.
async function pool(list, limit, fn) {
  const out = new Array(list.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, list.length) }, async () => {
    while (next < list.length) {
      const i = next++;
      out[i] = await fn(list[i], i);
    }
  }));
  return out;
}

module.exports = { API, MODES, AUDITS, METRICS, summarize, lcpFacts, run, pool };
