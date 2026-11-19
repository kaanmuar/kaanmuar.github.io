/* Jarvis > URL Review: what happens after a review fails, what clients ask us to fix, and the newer checks (#3329).
   The web panels and the Android app read the same three sources:

   rescue   failed reviews by cause (url_review_failures), re-runs (url_review_reruns), rescues and the Mac's share
            (url_review_rescues), the AI diagnoses by provider, the 48-hour report promises (promise.* on the failures),
            the SORRY- apology codes (url_review_coupons, source "inconclusive"), and the finished-report re-run
            (#3458): one new review per site, then one mail, at url_review_campaigns/rerun-past-2026
   fixes    the fix requests by way (url_review_fix_requests kind self, quote, package; walkthrough bookings with
            ref "fix"), the status pipeline, package revenue paid through PayPal and the free re-checks
   checks   hits per newer check (url_reviews.checks, written from 10 Nov 2026), the quotas they spend
            (webrisk_usage, threatlist_usage), the Wordfence feed (ops_runs/wordfenceFeed) and each outside source's health */
const core = require("./jarvis-core");
const linkedRisk = require("./url-review-linked-risk");
const promise = require("./url-review-promise");
const fixOffers = require("./url-review-fix-offers");
const pastRerun = require("./url-review-rerun-past");
const reviewMap = require("./url-review-map");

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

function rescueSummary({ failures, rescues, macWaiting, reruns, coupons, open, past }, { now, days }) {
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
    macList: waiting.slice(0, SHOWN),
    pastRerun: pastRerun.describe(past)
  };
}

async function rescueSource(ctx) {
  const { db, now } = ctx;
  const days = ctx.days || 7;
  const since = new Date(now - days * DAY).toISOString();
  const read = (query) => query.get().then(rowsOf).catch(() => []);
  const [failures, rescues, macWaiting, reruns, coupons, open, pastSnap] = await Promise.all([
    read(db.collection("url_review_failures").where("at", ">=", since).select("at", "kind", "host", "cause", "source", "promise").limit(3000)),
    read(db.collection("url_review_rescues").where("failedAt", ">=", since).select("at", "failedAt", "host", "status", "strategy", "promised", "diagnosis.by", "diagnosis.via", "attempts").limit(2000)),
    read(db.collection("url_review_rescues").where("status", "==", "mac-wanted").select("at", "failedAt", "host", "promised").limit(200)),
    read(db.collection("url_review_reruns").where("at", ">=", since).select("at", "status").limit(2000)),
    read(db.collection("url_review_coupons").where("createdAt", ">=", since).select("createdAt", "source", "uses").limit(2000)),
    read(db.collection("url_review_failures").where("promise.state", "==", "open").select("at", "host", "promise").limit(300)),
    db.collection(pastRerun.COLLECTION).doc(pastRerun.ID).get().then((snap) => (snap.exists ? snap.data() : null)).catch(() => null)
  ]);
  return rescueSummary({ failures, rescues, macWaiting, reruns, coupons, open, past: pastSnap }, { now, days });
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
  { id: "blocklist", label: "Spam and DNS blocklists", test: /^sec-blocklist/ },
  { id: "kev", label: "CISA KEV exploited CVEs", test: /^sec-kev/ },
  { id: "osv", label: "OSV vulnerable libraries", test: /^sec-osv/ },
  { id: "drop", label: "Hijacked prefixes (DROP)", test: /^sec-drop/ },
  { id: "feodo", label: "Feodo botnet C2 IPs", test: /^sec-feodo/ },
  { id: "breachNews", label: "Breach news (GDELT)", test: /^sec-breach-news/ },
  { id: "certAnomaly", label: "Certificate anomalies", test: /^sec-cert-anomaly/ },
  { id: "targeted", label: "Attack sources (clear pass)", test: /^sec-targeted$/ }
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

function threatFeedsState(run) {
  const r = run || {};
  const at = r.endedAt || r.startedAt || "";
  if (!at) return { stored: false, state: "quiet", detail: "never ran", at: "" };
  const note = String(r.note || "");
  if (r.ok === false) return { stored: false, state: "down", detail: String(r.error || "failed").slice(0, 160), at };
  if (!r.endedAt) return { stored: false, state: "running", detail: note.slice(0, 160) || "running", at };
  if (/^off\b/i.test(note)) return { stored: false, state: "off", detail: note.slice(0, 160), at };
  return { stored: true, state: "ok", detail: note.slice(0, 160) || "stored", at };
}

function threatsSummary(threatRows, globalMap, { now, days, mapRanges }) {
  const start = now - (days || 7) * DAY;
  const rows = (Array.isArray(threatRows) ? threatRows : []).filter(Boolean);
  const byLevel = { critical: 0, high: 0, watch: 0, info: 0 };
  const byKind = {};
  const byCountry = {};
  let inRange = 0;
  let pendingDelist = 0;
  let criticalOpen = 0;
  rows.forEach((item) => {
    const lv = String(item.level || "info").toLowerCase();
    if (byLevel[lv] !== undefined) byLevel[lv] += 1;
    if (ms(item.observed_at) >= start) inRange += 1;
    if (item.kind) count(byKind, item.kind);
    if (item.hosting_country) count(byCountry, String(item.hosting_country).toUpperCase());
    if (item.delist_status === "pending") pendingDelist += 1;
    if (lv === "critical" && item.delist_status !== "resolved" && item.delist_status !== "false_positive") criticalOpen += 1;
  });
  const rank = { critical: 4, high: 3, watch: 2, info: 1 };
  const recentCritical = rows
    .filter((item) => item.level === "critical" || item.level === "high")
    .slice()
    .sort((a, b) => (rank[b.level] || 0) - (rank[a.level] || 0) || ms(b.observed_at) - ms(a.observed_at))
    .slice(0, 8)
    .map((item) => ({
      id: item.id || "",
      host: item.host || item.subject || "",
      kind: item.kind || "",
      level: item.level || "info",
      country: item.hosting_country || "",
      source: item.source || "",
      delistStatus: item.delist_status || "none",
      observedAt: iso(item.observed_at)
    }));
  const g = globalMap && typeof globalMap === "object" ? globalMap : null;
  const rangeOf = (payload) => payload ? {
    total: Number(payload.totalMentions) || 0,
    countries: (Array.isArray(payload.countries) ? payload.countries : []).slice(0, 80).map((c) => ({ cc: c.cc, count: Number(c.count) || 0, share: Number(c.share) || 0 }))
  } : null;
  const ranges = {};
  Object.keys(mapRanges || {}).forEach((k) => { const r = rangeOf(mapRanges[k]); if (r) ranges[k] = r; });
  if (g && !ranges.live) ranges.live = rangeOf(g);
  const map = g ? {
    updatedAt: String(g.updatedAt || ""),
    slice: String(g.slice || ""),
    mentionsLive: Number((g.totalsByRange && g.totalsByRange.live) || g.totalMentions) || 0,
    mentions7d: Number(g.totalsByRange && g.totalsByRange["7d"]) || 0,
    mentions30d: Number(g.totalsByRange && g.totalsByRange["30d"]) || 0,
    mentions90d: Number(g.totalsByRange && g.totalsByRange["90d"]) || 0,
    countryCount: Number(g.countryCount) || 0,
    kevCount: Number(g.kevSummary && g.kevSummary.count) || 0,
    kevVersion: String((g.kevSummary && g.kevSummary.version) || ""),
    dropRanges: Number(g.dropSummary && g.dropSummary.v4Ranges) || 0,
    historyDays: Number(g.historyDays) || 0,
    botnetNow: g.botnetNow || null,
    attributions: (Array.isArray(g.attributions) ? g.attributions : []).slice(0, 6).map((a) => String(a).slice(0, 160)),
    ranges,
    events: (Array.isArray(g.events) ? g.events : []).slice(0, 30).map((e) => ({
      date: String(e.date || ""), source: String(e.source || ""), host: String(e.host || ""), url: String(e.url || ""),
      themes: Array.isArray(e.themes) ? e.themes.slice(0, 4) : [], countries: Array.isArray(e.countries) ? e.countries.slice(0, 6) : []
    })),
    topCountries: (Array.isArray(g.countries) ? g.countries : []).slice(0, 6).map((c) => ({ label: c.cc, value: Number(c.count) || 0 }))
  } : null;
  return {
    threats: {
      total: rows.length,
      inRange,
      byLevel,
      pendingDelist,
      criticalOpen,
      topKinds: top(byKind, 6),
      topCountries: top(byCountry, 8),
      recentCritical
    },
    map
  };
}

// Who might be impacted: customers' and users' reports with a site finding in the internal ledger (direct), and reports on sites
// hosted or based in the countries the live feed is busiest in (context only: the same country is not proof of a hit).
const LEVEL_RANK = { critical: 3, high: 2, watch: 1 };
const clip = (value, n) => String(value || "").slice(0, n);
const hostOf = (value) => { try { return new URL(/^[a-z]+:\/\//i.test(String(value)) ? String(value) : "https://" + value).hostname.replace(/^www\./, ""); } catch (error) { return clip(value, 120).toLowerCase(); } };
const ccOf = (value) => { const cc = String(value || "").trim().toUpperCase(); return /^[A-Z]{2}$/.test(cc) ? cc : ""; };

function reviewView(r) {
  const report = r.report || {};
  const targeted = report.targeted || {};
  const email = String(r.email || "").trim().toLowerCase();
  return {
    reviewId: r.id || "",
    host: hostOf(report.host || r.requestedUrl || r.url || ""),
    url: clip(r.requestedUrl || r.url, 200),
    email,
    customer: CUSTOMER(r.source) && !!email,
    paid: r.paid === true,
    test: r.test === true || (!!email && core.isTestEmail(email)),
    source: String(r.source || ""),
    status: String(r.status || ""),
    reviewedAt: iso(r.createdAt),
    hosting: ccOf((targeted.hosting || {}).country || r.hostingCountry),
    company: ccOf(targeted.companyCountry || (r.sweep || {}).cc)
  };
}

function exposureSummary(threatRows, reviews, mapRanges, { now, days }) {
  const start = now - (days || 7) * DAY;
  const byId = new Map();
  const views = [];
  (reviews || []).filter(Boolean).forEach((r) => {
    if (r.id && byId.has(r.id)) return;
    const v = reviewView(r);
    views.push(v);
    if (r.id) byId.set(r.id, v);
  });
  const groups = new Map();
  (threatRows || []).filter((t) => t && LEVEL_RANK[t.level] && t.role !== "context" && ms(t.observed_at) >= start).forEach((t) => {
    const key = t.review_id || "host:" + (t.host || t.subject || "");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(t);
  });
  const direct = [];
  groups.forEach((list, key) => {
    const rv = byId.get(String(key)) || null;
    if (rv && rv.test) return;
    const sorted = list.slice().sort((a, b) => (LEVEL_RANK[b.level] - LEVEL_RANK[a.level]) || ms(b.observed_at) - ms(a.observed_at));
    const seen = new Set();
    const findings = [];
    sorted.forEach((t) => {
      const id = t.kind + "|" + (t.subject || t.host) + "|" + t.source;
      if (seen.has(id) || findings.length >= 5) return;
      seen.add(id);
      findings.push({ kind: t.kind || "", level: t.level, source: clip(t.source, 60), evidence: clip(t.evidence, 160), delistStatus: t.delist_status || "none", observedAt: iso(t.observed_at) });
    });
    const top = sorted[0];
    direct.push({
      reviewId: rv ? rv.reviewId : String(top.review_id || ""),
      host: (rv && rv.host) || top.host || top.subject || "",
      url: rv ? rv.url : "",
      email: rv ? rv.email : "",
      customer: rv ? rv.customer : false,
      known: !!rv,
      paid: rv ? rv.paid : false,
      source: rv ? rv.source : "",
      reviewedAt: rv ? rv.reviewedAt : iso(top.observed_at),
      country: ccOf(top.hosting_country) || (rv && rv.hosting) || "",
      level: top.level,
      findings,
      findingCount: sorted.length
    });
  });
  direct.sort((a, b) => (LEVEL_RANK[b.level] - LEVEL_RANK[a.level]) || (Number(b.customer) - Number(a.customer)) || ms(b.reviewedAt) - ms(a.reviewedAt));
  const customers = new Map();
  direct.filter((d) => d.email).forEach((d) => {
    const c = customers.get(d.email) || { email: d.email, reports: 0, paid: 0, level: d.level, hosts: [] };
    c.reports += 1;
    if (d.paid) c.paid += 1;
    if (LEVEL_RANK[d.level] > LEVEL_RANK[c.level]) c.level = d.level;
    if (!c.hosts.includes(d.host) && c.hosts.length < 4) c.hosts.push(d.host);
    customers.set(d.email, c);
  });
  const rangesIn = mapRanges || {};
  const hotRange = rangesIn.live && rangesIn.live.total ? "live" : rangesIn["7d"] && rangesIn["7d"].total ? "7d" : "live";
  const hotSrc = rangesIn[hotRange];
  const hot = ((hotSrc && hotSrc.countries) || []).slice(0, 5).map((c) => ({ cc: c.cc, count: Number(c.count) || 0 }));
  const hotBy = new Map(hot.map((h) => [h.cc, h.count]));
  const directIds = new Set(direct.map((d) => d.reviewId).filter(Boolean));
  const directHosts = new Set(direct.map((d) => d.host));
  const regional = [];
  let regionalSweep = 0;
  const seenRegional = new Set();
  views.filter((r) => !r.test && ms(r.reviewedAt) >= start && !directIds.has(r.reviewId) && !directHosts.has(r.host))
    .sort((a, b) => ms(b.reviewedAt) - ms(a.reviewedAt)).forEach((r) => {
      const cc = hotBy.has(r.hosting) ? r.hosting : hotBy.has(r.company) ? r.company : "";
      if (!cc) return;
      if (!r.customer) { regionalSweep += 1; return; }
      const key = r.email + "|" + r.host;
      if (seenRegional.has(key)) return;
      seenRegional.add(key);
      regional.push({ reviewId: r.reviewId, host: r.host, email: r.email, paid: r.paid, reviewedAt: r.reviewedAt, country: cc, basis: cc === r.hosting ? "hosted in" : "company in", liveCount: hotBy.get(cc) });
    });
  const customerList = [...customers.values()].sort((a, b) => (LEVEL_RANK[b.level] - LEVEL_RANK[a.level]) || b.reports - a.reports);
  return {
    windowDays: days || 7,
    hotRange,
    hot,
    totals: {
      directReports: direct.length,
      directCustomers: customerList.length,
      directPaid: direct.filter((d) => d.paid).length,
      directSweep: direct.filter((d) => d.known && !d.customer).length,
      directCritical: direct.filter((d) => d.level === "critical").length,
      regionalReports: regional.length,
      regionalCustomers: new Set(regional.map((r) => r.email)).size,
      regionalSweep
    },
    direct: direct.slice(0, 40),
    customers: customerList.slice(0, 20),
    regional: regional.slice(0, 30)
  };
}

function checksSummary({ reviews, webrisk, threat, wordfence, threatFeeds, threats, globalMap, mapRanges, threatReviews }, { now, days }) {
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
  const hasThreatFeeds = threatFeeds !== undefined;
  const tf = hasThreatFeeds ? threatFeedsState(threatFeeds) : null;
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
  if (tf) sources.push({ key: "threatfeeds", name: "Threat feeds (KEV, DROP, Feodo, GDELT, DB-IP)", state: tf.state, detail: tf.detail, at: tf.at });
  const intel = threats !== undefined || globalMap !== undefined ? threatsSummary(threats, globalMap, { now, days, mapRanges }) : null;
  const exposure = intel ? exposureSummary(threats, (reviews || []).concat(threatReviews || []), intel.map && intel.map.ranges, { now, days }) : null;
  return Object.assign(
    {
      ok: true,
      since: CHECKS_SINCE,
      totals: { reviews: real.length, counted: counted.length, withHits: counted.filter((r) => r.checks.some(HIT)).length },
      families,
      quotas,
      nearCap: quotas.filter((q) => q.pct !== null && q.pct >= 80).map((q) => q.id),
      wordfence: feed,
      sources
    },
    tf ? { threatFeeds: tf } : {},
    intel ? { threats: intel.threats, map: intel.map, exposure } : {}
  );
}

async function checksSource(ctx) {
  const { db, now } = ctx;
  const days = ctx.days || 7;
  const since = new Date(now - days * DAY).toISOString();
  const month = new Date(now).toISOString().slice(0, 7);
  const one = (ref) => ref.get().then((snap) => (snap.exists ? snap.data() : null)).catch(() => null);
  const storage = ctx.storage !== undefined ? ctx.storage : (() => {
    try { return require("firebase-admin/storage").getStorage(); } catch (error) { return null; }
  })();
  const [reviews, webrisk, threat, wordfence, threatFeeds, threats, globalMap] = await Promise.all([
    db.collection("url_reviews").where("createdAt", ">=", since).orderBy("createdAt", "desc").select("createdAt", "test", "source", "checks", "email", "paid", "status", "requestedUrl", "hostingCountry", "sweep.cc", "report.host", "report.targeted.hosting.country", "report.targeted.companyCountry").limit(5000).get().then(rowsOf).catch(() => []),
    one(db.collection("webrisk_usage").doc(month)),
    one(db.collection("threatlist_usage").doc(month)),
    one(db.collection("ops_runs").doc("wordfenceFeed")),
    one(db.collection("ops_runs").doc("threatFeeds")),
    db.collection("url_review_threats").orderBy("observed_at", "desc").select("id", "observed_at", "level", "kind", "host", "subject", "hosting_country", "source", "delist_status", "time_window", "review_id", "role", "evidence").limit(1000).get().then(rowsOf).catch(() => []),
    reviewMap.loadGlobalMapPayload({ storage, fetch: false, query: { range: "live" } }).catch(() => null)
  ]);
  // The other ranges come from the same stored object, already held in memory by the first read.
  const others = await Promise.all(["7d", "30d", "90d"].map((range) => reviewMap.loadGlobalMapPayload({ storage, fetch: false, query: { range } }).catch(() => null)));
  const mapRanges = { live: globalMap, "7d": others[0], "30d": others[1], "90d": others[2] };
  // Threat rows whose review is older than the window: read just those reviews, so the customer behind a finding is still named.
  const have = new Set(reviews.map((r) => r.id));
  const missing = [...new Set((threats || []).filter((t) => t.review_id && !have.has(t.review_id) && (t.level === "critical" || t.level === "high" || t.level === "watch")).map((t) => t.review_id))].slice(0, 40);
  const threatReviews = missing.length && typeof db.getAll === "function"
    ? await db.getAll(...missing.map((id) => db.collection("url_reviews").doc(id)), { fieldMask: ["createdAt", "test", "source", "email", "paid", "status", "requestedUrl", "hostingCountry", "sweep.cc", "report.host", "report.targeted.hosting.country", "report.targeted.companyCountry"] })
      .then((snaps) => snaps.filter((snap) => snap.exists).map((snap) => Object.assign({ id: snap.id }, snap.data()))).catch(() => [])
    : [];
  return checksSummary({ reviews, webrisk, threat, wordfence, threatFeeds, threats, globalMap, mapRanges, threatReviews }, { now, days });
}

// --- Ask -----------------------------------------------------------------------------------------------------

// The three sources in a few hundred tokens for Ask and the briefing's Gemini text (shared with the web page).
const ask = (e) => {
  const view = core.reviewOpsAsk(e);
  const rescue = e && e.rescue;
  view.urlReviewPastRerun = (rescue && rescue.pastRerun) || pastRerun.describe();
  return view;
};

module.exports = { exposureSummary, FAMILIES, URLSCAN_PER_MONTH, promiseGroups, rescueSummary, rescueSource, fixesSummary, fixesSource, sourceState, wordfenceState, threatFeedsState, threatsSummary, checksSummary, checksSource, ask, pastRerunLine: pastRerun.line };
