/* Jarvis change ledger (#3784): did each shipped change move the number it was meant to?

   functions/change-ledger.json lists the changes: the PR, the merge day, the metric it should move and which way.
   A metric is read from the day rollups (jarvis-days), one document per closed day, so a run reads a few dozen
   documents and no raw rows of the full range:

     review.failures   url_review_failures rows (a failed review)
     review.reviews    url_reviews rows
     review.opens      url_review_opens rows (the URL Review was opened)
     site.<name>       site_events rows whose name is <name>, e.g. site.qa_review_vs_cta
                       (the events rollup has been empty since 2026-11-04, when its days passed the document
                       cap; until #3785 is fixed these read "too little data")

   The 14 closed days before the merge are the baseline. The 7 and 28 closed days after it are compared with it, and
   the 28-day window decides once it is complete.

   expect "up"   better when the daily mean rises by at least 10%, worse when it falls by as much
   expect "down" better when it falls by at least 10%, worse when it rises by as much
   expect "hold" a guard: worse when it rises by at least 10%, otherwise "held"

   Without 7 closed days after the merge the status is "too early"; with fewer than 20 events in the windows it is
   "too little data". An entry with no metric is "manual": the ledger names where to look instead of guessing. */

const DAY = 24 * 60 * 60 * 1000;
// A day closes an hour after midnight UTC, as in jarvis-days, so late rows still land before it is read.
const CLOSE_MS = 60 * 60 * 1000;
const BASE_DAYS = 14;
const SHORT_DAYS = 7;
const LONG_DAYS = 28;
const MIN_SAMPLE = 20;
const MOVE = 0.1;
const EXPECT = ["up", "down", "hold"];

const dayStart = (ms) => Math.floor(ms / DAY) * DAY;
const closed = (day, now) => day + DAY + CLOSE_MS <= now;
const round = (n, digits = 2) => (Number.isFinite(n) ? Math.round(n * 10 ** digits) / 10 ** digits : null);

/** The rollup kind and row filter behind a metric key, or null for an unknown key. */
function metricSpec(key) {
  if (key === "review.failures") return { kind: "failures", time: "at", keep: () => true };
  if (key === "review.reviews") return { kind: "reviews", time: "createdAt", keep: () => true };
  if (key === "review.opens") return { kind: "opens", time: "createdAt", keep: () => true };
  const site = /^site\.([A-Za-z0-9_-]{1,40})$/.exec(String(key || ""));
  if (site) return { kind: "events", time: "createdAt", keep: (row) => row.name === site[1] };
  return null;
}

/** Events per UTC day for the rows a metric keeps. toMs turns a stored time into milliseconds. */
function countByDay(rows, spec, toMs) {
  const counts = new Map();
  (rows || []).forEach((row) => {
    if (!spec.keep(row)) return;
    const t = toMs(row[spec.time]);
    if (!Number.isFinite(t)) return;
    const day = dayStart(t);
    counts.set(day, (counts.get(day) || 0) + 1);
  });
  return counts;
}

/** Total and daily mean over `days` days from `first`; complete only when every one of them is closed. */
function windowOf(counts, first, days, now) {
  let total = 0;
  for (let i = 0; i < days; i += 1) {
    const day = first + i * DAY;
    if (!closed(day, now)) return { days, total, complete: false, mean: null };
    total += counts.get(day) || 0;
  }
  return { days, total, complete: true, mean: total / days };
}

function mergeDay(entry) {
  const t = Date.parse(entry.mergedAt);
  return Number.isFinite(t) ? dayStart(t) : NaN;
}

/** One ledger entry against its daily counts. Pure: no reads, no clock other than `now`. */
function evaluate(entry, counts, now) {
  const base = { id: entry.id, pr: entry.pr || null, ticket: entry.ticket || null, title: entry.title, mergedAt: entry.mergedAt, metric: entry.metric || null, expect: entry.expect || null };
  if (!entry.metric) return Object.assign(base, { status: "manual", check: entry.check || "" });
  const spec = metricSpec(entry.metric);
  if (!spec) return Object.assign(base, { status: "unknown metric", check: entry.metric });
  if (!EXPECT.includes(entry.expect)) return Object.assign(base, { status: "unknown expect", check: String(entry.expect) });
  const day0 = mergeDay(entry);
  if (!Number.isFinite(day0)) return Object.assign(base, { status: "bad mergedAt" });
  const before = windowOf(counts, day0 - BASE_DAYS * DAY, BASE_DAYS, now);
  const shortAfter = windowOf(counts, day0, SHORT_DAYS, now);
  const longAfter = windowOf(counts, day0, LONG_DAYS, now);
  const out = Object.assign(base, {
    before: { days: BASE_DAYS, mean: round(before.mean) },
    after: { days: shortAfter.complete ? SHORT_DAYS : 0, mean: round(shortAfter.mean) }
  });
  if (!before.complete || !shortAfter.complete) return Object.assign(out, { status: "too early", reason: "needs " + BASE_DAYS + " closed days before and " + SHORT_DAYS + " after the merge" });
  const verdictWindow = longAfter.complete ? longAfter : shortAfter;
  out.after = { days: verdictWindow.days, mean: round(verdictWindow.mean) };
  // A baseline with no events is no baseline: a rate against zero would call every change a regression.
  if (before.total < MIN_SAMPLE || verdictWindow.total < MIN_SAMPLE) return Object.assign(out, { status: "too little data", reason: "needs at least " + MIN_SAMPLE + " events in the baseline and the windows" });
  const delta = (verdictWindow.mean - before.mean) / Math.max(before.mean, 1);
  out.deltaPct = round(delta * 100, 1);
  let status = "flat";
  if (entry.expect === "up") status = delta >= MOVE ? "better" : delta <= -MOVE ? "worse" : "flat";
  if (entry.expect === "down") status = delta <= -MOVE ? "better" : delta >= MOVE ? "worse" : "flat";
  if (entry.expect === "hold") status = delta >= MOVE ? "worse" : "held";
  return Object.assign(out, { status });
}

/** Every entry, against the counts of its metric (metric key -> Map of day -> count). */
function evaluateAll(entries, countsFor, now) {
  return (entries || []).map((entry) => evaluate(entry, entry.metric ? countsFor(entry.metric) : new Map(), now));
}

/** The earliest day any entry's baseline needs, for the one read of the day rollups. */
function readFrom(entries) {
  const days = (entries || []).map(mergeDay).filter(Number.isFinite);
  return days.length ? Math.min(...days) - BASE_DAYS * DAY : 0;
}

/**
 * Reads the day rollups once, counts each metric and evaluates the ledger.
 * dayRows is jarvis-days (rows, toMs); the rows it returns are the same ones the Jarvis snapshot counts.
 */
async function run(db, entries, now, dayRows) {
  const keys = (entries || []).map((entry) => entry.metric).filter(Boolean);
  const specs = {};
  keys.forEach((key) => { if (metricSpec(key)) specs[key] = metricSpec(key); });
  const kinds = Array.from(new Set(Object.values(specs).map((spec) => spec.kind)));
  const from = readFrom(entries);
  const read = kinds.length ? await dayRows.rows(db, kinds, { from, now }) : {};
  const cache = {};
  const countsFor = (key) => {
    if (!specs[key]) return new Map();
    if (!cache[key]) cache[key] = countByDay(read[specs[key].kind] || [], specs[key], dayRows.toMs);
    return cache[key];
  };
  return { at: new Date(now).toISOString(), results: evaluateAll(entries, countsFor, now) };
}

module.exports = { metricSpec, countByDay, windowOf, evaluate, evaluateAll, readFrom, run, dayStart, closed, BASE_DAYS, SHORT_DAYS, LONG_DAYS, MIN_SAMPLE, MOVE };
