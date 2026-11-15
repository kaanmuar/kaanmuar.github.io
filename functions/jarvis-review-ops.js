/* Jarvis > URL Review: what happens after a review fails, what clients ask us to fix, and the newer checks (#3329).
   The web panels and the Android app read the same three sources:

   rescue   failed reviews by cause (url_review_failures), re-runs (url_review_reruns), rescues and the Mac's share
            (url_review_rescues), the AI diagnoses by provider, the 48-hour report promises (promise.* on the failures)
            and the SORRY- apology codes (url_review_coupons, source "inconclusive")
   fixes    the fix requests by way (url_review_fix_requests kind self, quote, package; walkthrough bookings with
            ref "fix"), the status pipeline, package revenue paid through PayPal and the free re-checks
   checks   hits per newer check (url_reviews.checks, written from 10 Nov 2026), the quotas they spend
            (webrisk_usage, threatlist_usage), the Wordfence feed (ops_runs/wordfenceFeed) and each outside source's health */
const core = require("./jarvis-core");
const linkedRisk = require("./url-review-linked-risk");
const promise = require("./url-review-promise");
const fixOffers = require("./url-review-fix-offers");

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;
const SHOWN = 12;
const URLSCAN_PER_MONTH = 5000;
const CHECKS_SINCE = "2026-11-10";
const CUSTOMER = (source) => !["sweep", "rivals", "jarvis", "outreach"].includes(String(source || ""));

const ms = (value) => { const d = core.toDate(value); return d ? d.getTime() : 0; };
const iso = (value) => { const t = ms(value); return t ? new Date(t).toISOString() : ""; };
const count = (map, key) => { const k = String(key || "unknown"); map[k] = (map[k] || 0) + 1; };
const top = (map, n) => Object.keys(map).map((label) => ({ label, value: map[label] })).sort((a, b) => b.value - a.value || a.label.localeCompare(b.label)).slice(0, n || 8);
const pct = (n, of) => (of ? Math.round((n / of) * 1000) / 10 : 0);
const causeOf = (row) => (row.cause && typeof row.cause === "object" ? String(row.cause.label || row.cause.id || "unknown") : String(row.cause || "unknown"));
const rowsOf = (snap) => snap.docs.map((doc) => Object.assign({ id: doc.id }, doc.data()));

// --- rescue -------------------------------------------------------------------------------------------------

const FINAL = ["delivered", "sent-late", "given-up", "apologized", "own-run", "held", "open"];

// One promise per code: a retry of the same address shares the first failure's code and deadline.
function promiseGroups(failures) {
  const by = new Map();
  failures.filter((row) => row && row.promise && row.promise.state).forEach((row) => {
    const key = row.promise.coupon || row.id;
    by.set(key, (by.get(key) || []).concat(row));
  });
  return Array.from(by.values()).map((list) => {
    const sorted = list.slice().sort((a, b) => ms(a.at) - ms(b.at));
    const states = sorted.map((row) => row.promise.state);
    const state = FINAL.find((s) => states.includes(s)) || states[0];
    const closed = sorted.map((row) => ms(row.promise.closedAt)).filter(Boolean);
    return { code: sorted[0].promise.coupon || "", host: sorted[sorted.length - 1].host || "", failedAt: iso(sorted[0].at), state, closedAt: closed.length ? new Date(Math.max(...closed)).toISOString() : "", tries: Math.max(0, ...sorted.map((row) => Number(row.promise.tries) || 0)) };
  });
}

function rescueSummary({ failures, rescues, macWaiting, reruns, coupons, open }, { now, days }) {
  const start = now - days * DAY;
  const failed = (failures || []).filter((row) => row && row.kind !== "stopped" && ms(row.at) >= start);
  const causes = {};
  failed.forEach((row) => count(causes, causeOf(row)));
  const rr = (reruns || []).filter((row) => ms(row.at) >= start);
  const rerunStatus = {};
  rr.forEach((row) => count(rerunStatus, row.status));
  const rs = (rescues || []).filter((row) => ms(row.failedAt || row.at) >= start);
  const rescueStatus = {};
  rs.forEach((row) => count(rescueStatus, row.status));
  const macTried = rs.filter((row) => (row.attempts || []).some((a) => a && a.strategy === "mac"));
  const diag = (row) => row.diagnosis || {};
  const groups = promiseGroups(failed);
  const deadline = promise.PROMISE_DEADLINE_H * HOUR;
  const openNow = promiseGroups((open || []).filter((row) => row.promise && row.promise.state === "open")).filter((g) => g.state === "open").map((g) => {
    const left = Math.round(((ms(g.failedAt) + deadline - now) / HOUR) * 10) / 10;
    return Object.assign(g, { hoursLeft: left });
  }).sort((a, b) => a.hoursLeft - b.hoursLeft);
  const delivered = groups.filter((g) => g.state === "delivered");
  const sorry = (coupons || []).filter((row) => row && row.source === "inconclusive" && ms(row.createdAt) >= start);
  const waiting = (macWaiting || []).map((row) => ({ host: row.host || "", failedAt: iso(row.failedAt), at: iso(row.at), promised: row.promised === true }))
    .sort((a, b) => Number(b.promised) - Number(a.promised) || ms(a.failedAt) - ms(b.failedAt));
  return {
    ok: true,
    deadlineHours: promise.PROMISE_DEADLINE_H,
    triesAtHours: promise.PROMISE_TRIES_AT_H,
    giveUpDays: promise.PROMISE_GIVE_UP_DAYS,
    apologyPercent: promise.APOLOGY_PERCENT,
    failures: { total: failed.length, causes: top(causes, 8), promised: failed.filter((row) => row.promise).length },
    reruns: { total: rr.length, status: top(rerunStatus, 6), sent: rerunStatus.sent || 0, held: rerunStatus.held || 0, failed: rerunStatus.failed || 0 },
    rescues: {
      total: rs.length,
      status: top(rescueStatus, 8),
      rescued: rescueStatus.rescued || 0,
      exhausted: rescueStatus.exhausted || 0,
      siteSide: rescueStatus.site || 0,
      macDone: macTried.filter((row) => row.status === "rescued" && row.strategy === "mac").length,
      macTried: macTried.length,
      macPending: waiting.length,
      macPromised: waiting.filter((row) => row.promised).length
    },
    diagnoses: {
      vertex: rs.filter((row) => diag(row).by === "gemini" && diag(row).via === "vertex").length,
      studio: rs.filter((row) => diag(row).by === "gemini" && diag(row).via !== "vertex").length,
      rules: rs.filter((row) => diag(row).by === "rules").length
    },
    promises: {
      made: groups.length,
      open: openNow.length,
      atRisk: openNow.filter((g) => g.hoursLeft <= 8).length,
      delivered: delivered.length,
      within48h: delivered.filter((g) => g.closedAt && ms(g.closedAt) - ms(g.failedAt) <= deadline).length,
      apologized: groups.filter((g) => ["apologized", "sent-late", "given-up"].includes(g.state)).length,
      stillTrying: groups.filter((g) => g.state === "apologized").length,
      sentLate: groups.filter((g) => g.state === "sent-late").length,
      givenUp: groups.filter((g) => g.state === "given-up").length,
      ownRun: groups.filter((g) => g.state === "own-run").length,
      held: groups.filter((g) => g.state === "held").length
    },
    codes: { sent: sorry.length, redeemed: sorry.filter((row) => (Number(row.uses) || 0) > 0).length },
    openList: openNow.slice(0, SHOWN),
    macList: waiting.slice(0, SHOWN)
  };
}

async function rescueSource(ctx) {
  const { db, now } = ctx;
  const days = ctx.days || 7;
  const since = new Date(now - days * DAY).toISOString();
  const read = (query) => query.get().then(rowsOf).catch(() => []);
  const [failures, rescues, macWaiting, reruns, coupons, open] = await Promise.all([
    read(db.collection("url_review_failures").where("at", ">=", since).select("at", "kind", "host", "cause", "source", "promise").limit(3000)),
    read(db.collection("url_review_rescues").where("failedAt", ">=", since).select("at", "failedAt", "host", "status", "strategy", "promised", "diagnosis.by", "diagnosis.via", "attempts").limit(2000)),
    read(db.collection("url_review_rescues").where("status", "==", "mac-wanted").select("at", "failedAt", "host", "promised").limit(200)),
    read(db.collection("url_review_reruns").where("at", ">=", since).select("at", "status").limit(2000)),
    read(db.collection("url_review_coupons").where("createdAt", ">=", since).select("createdAt", "source", "uses").limit(2000)),
    read(db.collection("url_review_failures").where("promise.state", "==", "open").select("at", "host", "promise").limit(300))
  ]);
  return rescueSummary({ failures, rescues, macWaiting, reruns, coupons, open }, { now, days });
}

// --- fixes --------------------------------------------------------------------------------------------------

const STATUSES = ["new", "quoted", "accepted", "in-progress", "done", "re-reviewed"];
const WAYS = ["self", "quote", "package", "call"];

const paidOf = (row) => (row.paid && row.paid.test !== true ? row.paid : null);

function fixesSummary({ requests, calls }, { now, days }) {
  const start = now - days * DAY;
  const all = (requests || []).filter(Boolean);
  const inRange = all.filter((row) => ms(row.createdAt) >= start);
  const ways = { self: 0, quote: 0, package: 0, call: 0 };
  inRange.forEach((row) => { const k = row.kind === "self" ? "self" : row.kind === "package" ? "package" : "quote"; ways[k] += 1; });
  ways.call = (calls || []).filter((row) => ms(row.createdAt) >= start).length;
  const pipeline = STATUSES.reduce((m, s) => { m[s] = 0; return m; }, {});
  inRange.filter((row) => row.kind !== "self").forEach((row) => { if (pipeline[row.status] !== undefined) pipeline[row.status] += 1; });
  const paid = all.filter((row) => paidOf(row) && ms(row.paidAt) >= start);
  const byPackage = {};
  paid.forEach((row) => { const k = row.package || "quote"; byPackage[k] = (byPackage[k] || 0) + (Number(row.paid.priceUsd) || 0); });
  const providers = {};
  paid.forEach((row) => count(providers, row.paid.provider || "paypal"));
  const waitingWork = all.filter((row) => paidOf(row) && ["accepted", "in-progress"].includes(row.status)).map((row) => {
    const pack = row.package ? fixOffers.packageById(row.package) : null;
    const paidAt = ms(row.paidAt);
    const due = pack && paidAt ? paidAt + Math.ceil((pack.days * 7) / 5) * DAY : 0;
    return { id: row.id, host: row.host || "", package: row.package || "", status: row.status, priceUsd: Number(row.paid.priceUsd) || 0, paidAt: iso(row.paidAt), deadline: row.deadline || "", daysWaiting: paidAt ? Math.floor((now - paidAt) / DAY) : 0, due: due ? new Date(due).toISOString() : "", late: !!due && due < now };
  }).sort((a, b) => ms(a.paidAt) - ms(b.paidAt));
  const quoteWaiting = all.filter((row) => row.kind !== "self" && row.status === "new").map((row) => ({ id: row.id, host: row.host || "", kind: row.kind || "quote", package: row.package || "", createdAt: iso(row.createdAt), daysWaiting: Math.floor((now - ms(row.createdAt)) / DAY) }))
    .sort((a, b) => ms(a.createdAt) - ms(b.createdAt));
  const self = inRange.filter((row) => row.kind === "self");
  const rereviewed = all.filter((row) => row.kind !== "self" && row.rereview && row.rereview.status === "done" && ms(row.rereview.at) >= start);
  return {
    ok: true,
    ways,
    total: inRange.length + ways.call,
    pipeline,
    revenue: { usd: Math.round(paid.reduce((n, row) => n + (Number(row.paid.priceUsd) || 0), 0) * 100) / 100, count: paid.length, byPackage: top(byPackage, 8), providers: top(providers, 3) },
    rechecks: { total: self.length, done: self.filter((row) => row.rereview && row.rereview.status === "done").length, failed: self.filter((row) => row.rereview && row.rereview.status === "failed").length },
    rereviews: { total: rereviewed.length, fixed: rereviewed.reduce((n, row) => n + (Number(((row.rereview || {}).result || {}).fixed) || 0), 0) },
    waiting: { paid: waitingWork.length, late: waitingWork.filter((row) => row.late).length, quotes: quoteWaiting.length, quoted: all.filter((row) => row.status === "quoted").length },
    paidList: waitingWork.slice(0, SHOWN),
    quoteList: quoteWaiting.slice(0, SHOWN)
  };
}

async function fixesSource(ctx) {
  const { db, now } = ctx;
  const days = ctx.days || 7;
  const read = (query) => query.get().then(rowsOf).catch(() => []);
  const [requests, calls] = await Promise.all([
    read(db.collection("url_review_fix_requests").orderBy("createdAt", "desc").select("createdAt", "kind", "status", "package", "priceUsd", "paid", "paidAt", "host", "deadline", "rereview.status", "rereview.at", "rereview.result.fixed").limit(500)),
    read(db.collection("bookings").where("ref", "==", "fix").select("createdAt", "type").limit(300))
  ]);
  return fixesSummary({ requests, calls }, { now, days });
}

// --- checks -------------------------------------------------------------------------------------------------

const FAMILIES = [
  { id: "phishing", label: "Phishing and malware lists", test: /^sec-threatlists/ },
  { id: "linked", label: "Linked hosts on Web Risk", test: /^sec-linked-/ },
  { id: "hacked", label: "Hacked-site signs", test: /^sec-(seo-spam|cloaking|spam-links)/ },
  { id: "lookalike", label: "Lookalike domains", test: /^sec-lookalike/ },
  { id: "exposed", label: "Exposed files", test: /^sec-exposed/ },
  { id: "wordpress", label: "WordPress vulnerabilities", test: /^sec-wordpress/ },
  { id: "blocklist", label: "Spam and DNS blocklists", test: /^sec-blocklist/ }
];
const HIT = (row) => row.verdict === "fail" || row.verdict === "risk";

function quota(id, label, used, cap, extra) {
  return Object.assign({ id, label, used: Number(used) || 0, cap, pct: cap ? pct(Number(used) || 0, cap) : null }, extra || {});
}

// A threat-list source's state this month: off (no key), down (its last answer was an error), ok, or quiet.
function sourceState(u) {
  const x = u || {};
  if (!x.calls && x.skipped) return { state: "off", detail: "no key set" };
  if (x.lastErrorAt && (!x.lastOkAt || ms(x.lastErrorAt) > ms(x.lastOkAt))) return { state: "down", detail: String(x.lastError || "failed"), at: x.lastErrorAt };
  if (x.lastOkAt) return { state: "ok", detail: (Number(x.calls) || 0).toLocaleString("en-US") + " calls this month", at: x.lastOkAt };
  return { state: "quiet", detail: "not asked this month" };
}

function wordfenceState(run) {
  const r = run || {};
  const at = r.endedAt || r.startedAt || "";
  if (!at) return { stored: false, state: "quiet", detail: "never ran", at: "" };
  const note = String(r.note || "");
  if (r.ok === false) return { stored: false, state: "down", detail: String(r.error || "failed").slice(0, 160), at };
  if (/^skipped/i.test(note)) return { stored: false, state: "off", detail: note.slice(0, 160), at };
  if (/stored/.test(note)) return { stored: true, state: "ok", detail: note.slice(0, 160), at };
  return { stored: false, state: r.endedAt ? "quiet" : "running", detail: note.slice(0, 160) || "no result yet", at };
}

function checksSummary({ reviews, webrisk, threat, wordfence }, { now, days }) {
  const start = now - days * DAY;
  const real = (reviews || []).filter((r) => r && r.test !== true && ms(r.createdAt) >= start);
  const counted = real.filter((r) => Array.isArray(r.checks));
  const families = FAMILIES.map((f) => {
    const runs = counted.map((r) => ({ customer: CUSTOMER(r.source), rows: r.checks.filter((c) => c && f.test.test(c.key || "")) })).filter((x) => x.rows.length);
    const hits = runs.filter((x) => x.rows.some(HIT));
    return {
      id: f.id, label: f.label, checked: runs.length, hits: hits.length, customerHits: hits.filter((x) => x.customer).length,
      critical: runs.filter((x) => x.rows.some((c) => HIT(c) && (c.severity === "critical" || c.severity === "high"))).length,
      unchecked: runs.filter((x) => x.rows.some((c) => c.unchecked)).length
    };
  });
  const dd = new Date(now).toISOString().slice(8, 10);
  const w = webrisk || {};
  const wDay = Number((w.days || {})[dd]) || 0;
  const wSweep = Number((w.sweeps || {})[dd]) || 0;
  const t = threat || {};
  const day = (src) => Number((((t[src] || {}).days || {})[dd] || {}).calls) || 0;
  const quotas = [
    quota("webrisk-day", "Web Risk linked hosts today", wDay, linkedRisk.PER_DAY, { customer: Math.max(0, wDay - wSweep), sweep: wSweep, sweepCap: linkedRisk.SWEEP_PER_DAY }),
    quota("webrisk-month", "Web Risk linked hosts this month", w.lookups, linkedRisk.PER_MONTH),
    quota("urlscan-month", "Cloudflare URL Scanner scans this month", (t.cloudflare || {}).scans, URLSCAN_PER_MONTH, { calls: Number((t.cloudflare || {}).calls) || 0 })
  ];
  const phish = sourceState(t.phishstats);
  if (phish.state !== "off") quotas.push(quota("phishstats-day", "PhishStats lookups today", day("phishstats"), null));
  const feed = wordfenceState(wordfence);
  const seo = families.find((f) => f.id === "hacked");
  const sources = [
    Object.assign({ key: "webrisk", name: "Google Web Risk (linked hosts)" }, w.lookups ? { state: "ok", detail: Number(w.lookups).toLocaleString("en-US") + " lookups this month" } : { state: "quiet", detail: "no lookups this month" }),
    Object.assign({ key: "cloudflare", name: "Cloudflare URL Scanner" }, sourceState(t.cloudflare)),
    Object.assign({ key: "phishstats", name: "PhishStats" }, phish),
    Object.assign({ key: "urlhaus", name: "URLhaus" }, sourceState(t.urlhaus)),
    Object.assign({ key: "brave", name: "Brave Search (hacked-site signs)" }, !seo.checked ? { state: "quiet", detail: "no counted reviews yet" }
      : seo.unchecked >= Math.max(3, seo.checked / 2) ? { state: "down", detail: seo.unchecked + " of " + seo.checked + " reviews could not search" } : { state: "ok", detail: seo.unchecked + " of " + seo.checked + " reviews could not search" }),
    { key: "wordfence", name: "Wordfence feed (WordPress)", state: feed.state, detail: feed.detail, at: feed.at }
  ];
  return {
    ok: true,
    since: CHECKS_SINCE,
    totals: { reviews: real.length, counted: counted.length, withHits: counted.filter((r) => r.checks.some(HIT)).length },
    families,
    quotas,
    nearCap: quotas.filter((q) => q.pct !== null && q.pct >= 80).map((q) => q.id),
    wordfence: feed,
    sources
  };
}

async function checksSource(ctx) {
  const { db, now } = ctx;
  const days = ctx.days || 7;
  const since = new Date(now - days * DAY).toISOString();
  const month = new Date(now).toISOString().slice(0, 7);
  const one = (ref) => ref.get().then((snap) => (snap.exists ? snap.data() : null)).catch(() => null);
  const [reviews, webrisk, threat, wordfence] = await Promise.all([
    db.collection("url_reviews").where("createdAt", ">=", since).orderBy("createdAt", "desc").select("createdAt", "test", "source", "checks").limit(5000).get().then(rowsOf).catch(() => []),
    one(db.collection("webrisk_usage").doc(month)),
    one(db.collection("threatlist_usage").doc(month)),
    one(db.collection("ops_runs").doc("wordfenceFeed"))
  ]);
  return checksSummary({ reviews, webrisk, threat, wordfence }, { now, days });
}

// --- Ask -----------------------------------------------------------------------------------------------------

// The three sources in a few hundred tokens for Ask and the briefing's Gemini text (shared with the web page).
const ask = (e) => core.reviewOpsAsk(e);

module.exports = { FAMILIES, URLSCAN_PER_MONTH, promiseGroups, rescueSummary, rescueSource, fixesSummary, fixesSource, sourceState, wordfenceState, checksSummary, checksSource, ask };
