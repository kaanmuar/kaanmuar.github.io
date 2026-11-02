"use strict";
/* The daily PageSpeed routine's decisions (#1978), apart from the network and the disk so tests can run them.

   needsFix   a page with a file in this repo whose mobile or desktop score is under THRESHOLD
   toFix      the PER_RUN worst of those: a run fixes and measures only these, so it stays well inside the job's time
              limit (Lighthouse takes about 5 minutes a page); the other pages are fixed on later days
   affected   the pages a fix branch changes: their HTML changed, or they reference a changed asset
   verdict    the branch may merge on its own when no page and mode fell more than DROP points and one rose RISE or more
              (medians of the local Lighthouse runs; a single run moves by a point or two on its own)
   latest     data/pagespeed/latest.json: every page's scores and what it fails, for Jarvis's Page health
   record     data/pagespeed/runs.json: one row per run, newest first, KEEP rows */

const THRESHOLD = 90;
const DROP = 2;
const RISE = 3;
const KEEP = 60;
const PER_RUN = 6;
const MODES = ["mobile", "desktop"];

const ok = (r) => r && r.ok !== false && Number.isFinite(r.score);
const low = (page) => Math.min(...MODES.map((m) => (ok(page[m]) ? page[m].score : 101)));

function needsFix(page) {
  return !!page.file && MODES.some((m) => ok(page[m])) && low(page) < THRESHOLD;
}

/** Worst first: the lower of the two scores, then mobile. */
function worstFirst(a, b) {
  return low(a) - low(b) || ((a.mobile || {}).score || 0) - ((b.mobile || {}).score || 0);
}

function toFix(pages) {
  return (pages || []).filter(needsFix).sort(worstFirst).slice(0, PER_RUN);
}

function affected(changed, pages, readText) {
  const set = new Set(changed);
  const assets = changed.filter((f) => !/\.html$/i.test(f));
  return pages.filter((p) => p.file && (set.has(p.file) || (assets.length && (() => {
    const html = readText(p.file) || "";
    return assets.some((a) => html.includes(a) || html.includes(encodeURI(a)));
  })()))).sort(worstFirst);
}

function verdict(rows) {
  const measured = (rows || []).flatMap((row) => MODES.filter((m) => row[m]).map((m) => Object.assign({ file: row.file, mode: m }, row[m])));
  const missing = measured.filter((x) => !Number.isFinite(x.before) || !Number.isFinite(x.after));
  const scored = measured.filter((x) => Number.isFinite(x.before) && Number.isFinite(x.after));
  const drops = scored.filter((x) => x.after < x.before - DROP);
  const rises = scored.filter((x) => x.after >= x.before + RISE);
  const name = (x) => x.file + " (" + x.mode + " " + x.before + " → " + x.after + ")";
  let reason;
  if (!scored.length) reason = "Lighthouse could not score the pages.";
  else if (drops.length) reason = "Score fell on " + drops.slice(0, 3).map(name).join(", ") + (drops.length > 3 ? " and " + (drops.length - 3) + " more" : "") + ".";
  else if (!rises.length) reason = "No page rose " + RISE + " points or more.";
  else reason = "Rose on " + rises.slice(0, 3).map(name).join(", ") + (rises.length > 3 ? " and " + (rises.length - 3) + " more" : "") + "; nothing fell more than " + DROP + ".";
  return { up: scored.length > 0 && !drops.length && rises.length > 0, reason, drops: drops.length, rises: rises.length, missing: missing.length };
}

const metric = (r) => (ok(r) ? { score: r.score, lcp: r.lcp, tbt: r.tbt, cls: r.cls, fcp: r.fcp } : { error: String((r && r.error) || "no answer").slice(0, 160) });

// The resources PageSpeed says are cached too briefly, across pages, longest saving first. Report only: GitHub Pages
// cannot set the headers.
function cacheNotes(pages) {
  const by = new Map();
  pages.forEach((p) => MODES.forEach((m) => (((p[m] || {}).audits || {})["cache-insight"] || { items: [] }).items.forEach((i) => {
    if (!i.url) return;
    const was = by.get(i.url) || { url: i.url, ttlMs: i.cacheLifetimeMs || 0, wastedBytes: 0, pages: 0 };
    was.wastedBytes = Math.max(was.wastedBytes, i.wastedBytes || 0);
    was.pages += 1;
    by.set(i.url, was);
  })));
  return Array.from(by.values()).sort((a, b) => b.wastedBytes * b.pages - a.wastedBytes * a.pages).slice(0, 20);
}

function latest(check) {
  const pages = (check.pages || []).map((p) => ({
    url: p.url, file: p.file, sitemap: p.sitemap,
    mobile: metric(p.mobile), desktop: metric(p.desktop),
    fails: Array.from(new Set(MODES.flatMap((m) => Object.keys((p[m] || {}).audits || {})))).slice(0, 12)
  }));
  return { at: check.at, run: check.run || null, threshold: THRESHOLD, pages, cache: cacheNotes(check.pages || []) };
}

function averages(pages) {
  return MODES.reduce((m, mode) => {
    const s = pages.map((p) => p[mode]).filter(ok).map((r) => r.score);
    m[mode] = s.length ? Math.round(s.reduce((a, b) => a + b, 0) / s.length) : null;
    return m;
  }, {});
}

/** One run's row: the check's totals, and per branch what it changed, how it measured and whether it may merge. */
function runRow({ check, safe, ai, run, at, error }) {
  const pages = (check && check.pages) || [];
  const scored = pages.filter((p) => MODES.some((m) => ok(p[m])));
  const fix = (f) => (f ? {
    branch: f.branch || null, files: (f.files || []).slice(0, 60), fixes: (f.fixes || []).slice(0, 80), pages: (f.measured || []).slice(0, PER_RUN),
    verdict: f.verdict || null, note: f.note || "", error: f.error || ""
  } : null);
  return {
    at: at || (check && check.at) || new Date().toISOString(), run: run || null, status: error ? "failed" : "ok", error: error || "",
    pages: pages.length, scored: scored.length, failed: pages.length - scored.length, below: scored.filter((p) => low(p) < THRESHOLD).length,
    avg: averages(pages), safe: fix(safe), ai: fix(ai)
  };
}

function record(runs, row) {
  return [row].concat((runs || []).filter((r) => !(row.run && r.run && r.run.id === row.run.id))).slice(0, KEEP);
}

module.exports = { THRESHOLD, DROP, RISE, KEEP, PER_RUN, MODES, low, needsFix, worstFirst, toFix, affected, verdict, cacheNotes, latest, averages, runRow, record };
