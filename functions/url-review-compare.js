/**
 * A competitor next to the asker's own review: the area scores and head-to-head indicators side by side,
 * who wins each one, the open problems only one of the two sites has and the ones both have,
 * both score histories, and how present each site is in its market.
 * The competitor's run is the public review: passive checks, no conversation, no form sent.
 */
const market = require("./url-review-market");

const AREAS = ["SEO", "GEO", "Analytics", "Security", "Accessibility", "Performance"];
const LIST_MAX = 12;
const SEVERITY_RANK = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };
// Checks that need typing into a field or opening the chat, which a competitor run never does.
const ACTIVE_KEYS = ["sec-typed", "a11y-chat-focus", "a11y-chat-trap", "an-chat-privacy"];

function bare(host) {
  return String(host || "").trim().toLowerCase().replace(/\.$/, "").replace(/^www\./, "");
}

function hostOf(url) {
  try { return new URL(url).hostname; } catch (error) { return ""; }
}

function sameSite(left, right) {
  return !!bare(left) && bare(left) === bare(right);
}

function cleanId(value) {
  return String(value || "").replace(/[^a-f0-9]/g, "").slice(0, 32);
}

// The base is the asker's own finished review, and the competitor is another site.
function baseProblem(base, email, rivalUrl) {
  const report = base && base.report;
  if (!report || !report.insights || !report.insights.score) return "That review is not saved with scores, so there is nothing to compare with.";
  if (!email || String(base.email || "").trim().toLowerCase() !== String(email).trim().toLowerCase()) return "Only the account that ran a review can compare it with a competitor.";
  if (base.status === "stopped" || report.status === "stopped") return "That review stopped early. Compare a finished review.";
  if (sameSite(report.host, hostOf(rivalUrl))) return "That is the same site. Enter a competitor's address.";
  return "";
}

function openProblems(insights) {
  const map = new Map();
  ((insights && insights.findings) || []).forEach((item) => {
    if (item && item.key && (item.verdict === "fail" || item.verdict === "risk") && !map.has(item.key)) map.set(item.key, item);
  });
  return map;
}

function onlyIn(mine, theirs) {
  return [...mine.values()]
    .filter((item) => !theirs.has(item.key))
    .sort((a, b) => (SEVERITY_RANK[b.severity] || 0) - (SEVERITY_RANK[a.severity] || 0) || (a.rank || 999) - (b.rank || 999))
    .map((item) => ({ key: item.key, title: item.title || "", area: item.area || "", verdict: item.verdict, severity: item.severity || "" }));
}

function areaScore(score, name) {
  const area = ((score && score.areas) || {})[name];
  return area && typeof area.score === "number" ? area.score : null;
}

function num(value) {
  return typeof value === "number" && isFinite(value) ? value : null;
}

// Head-to-head indicators. better: which way wins; close: the gap under which the two are level.
const KPIS = [
  { key: "overall", label: "Health score", unit: "/100", better: "high", close: 2, read: (r) => num(r.insights.score.overall) },
  { key: "passRate", label: "Checks passing", unit: "%", better: "high", close: 2, read: (r) => passRate(r.insights.score.totals) },
  { key: "open", label: "Open problems", unit: "", better: "low", close: 0, read: (r) => totalsOf(r, ["fail", "risk"]) },
  { key: "urgent", label: "Critical and high problems", unit: "", better: "low", close: 0, read: (r) => severityOf(r, ["critical", "high"]) },
  { key: "lighthouse", label: "Lighthouse performance (mobile)", unit: "/100", better: "high", close: 2, read: (r) => num(r.pagespeed && r.pagespeed.score) },
  { key: "lcp", label: "Largest contentful paint", unit: "ms", better: "low", close: 0.05, read: (r) => num(r.pagespeed && r.pagespeed.lab && r.pagespeed.lab.lcp) },
  { key: "tbt", label: "Total blocking time", unit: "ms", better: "low", close: 0.05, read: (r) => num(r.pagespeed && r.pagespeed.lab && r.pagespeed.lab.tbt) },
  { key: "cls", label: "Layout shift", unit: "", better: "low", close: 0.01, read: (r) => num(r.pagespeed && r.pagespeed.lab && r.pagespeed.lab.cls) },
  { key: "response", label: "Start page response", unit: "ms", better: "low", close: 0.05, read: (r) => num(r.observed && r.observed.ms) },
  { key: "weight", label: "Start page weight", unit: "bytes", better: "low", close: 0.05, read: (r) => num(r.observed && r.observed.bytes) },
  { key: "thirdParty", label: "Third-party hosts", unit: "", better: "low", close: 0, read: (r) => listLength(r.observed && r.observed.signals && r.observed.signals.thirdParty) },
  { key: "pagesFound", label: "Pages found", unit: "", better: "high", close: 0.05, read: (r) => num(r.limits && r.limits.pagesFound) || null },
  { key: "languages", label: "Language versions", unit: "", better: "high", close: 0, read: (r) => num(r.observed && r.observed.signals && r.observed.signals.hreflang) }
];
// Area scores closer than this are level.
const LEVEL_GAP = 5;
const SHARED_MAX = 8;

function passRate(totals) {
  const all = totals ? (totals.fail || 0) + (totals.risk || 0) + (totals.pass || 0) : 0;
  return all ? Math.round((totals.pass || 0) / all * 100) : null;
}

function totalsOf(report, keys) {
  const totals = report.insights.score.totals;
  return totals ? keys.reduce((sum, key) => sum + (totals[key] || 0), 0) : null;
}

function severityOf(report, keys) {
  const severities = report.insights.score.severities;
  return severities ? keys.reduce((sum, key) => sum + (severities[key] || 0), 0) : null;
}

function listLength(value) {
  return Array.isArray(value) ? value.length : null;
}

// close under 1 is a share of the larger value, 1 and over is an absolute gap.
function winnerOf(kpi, own, rival) {
  if (own == null || rival == null) return "";
  const gap = Math.abs(own - rival);
  const level = kpi.close < 1 && kpi.close > 0 ? gap <= kpi.close * Math.max(Math.abs(own), Math.abs(rival)) : gap <= kpi.close;
  if (level) return "tie";
  return (kpi.better === "high") === (own > rival) ? "own" : "rival";
}

function kpisOf(own, rival) {
  return KPIS.map((kpi) => {
    const a = kpi.read(own);
    const b = kpi.read(rival);
    return { key: kpi.key, label: kpi.label, unit: kpi.unit, better: kpi.better, own: a, rival: b, winner: winnerOf(kpi, a, b) };
  }).filter((row) => row.own != null || row.rival != null);
}

function mix(score, name, keys) {
  const source = (score && score[name]) || {};
  return keys.reduce((out, key) => Object.assign(out, { [key]: source[key] || 0 }), {});
}

function areaRow(mine, theirs, name) {
  const own = areaScore(mine.score, name);
  const rival = areaScore(theirs.score, name);
  const open = (score) => {
    const area = ((score && score.areas) || {})[name];
    return area ? (area.fail || 0) + (area.risk || 0) : null;
  };
  const lead = own == null || rival == null ? null : own - rival;
  return { area: name, own, rival, lead, level: lead != null && Math.abs(lead) < LEVEL_GAP, ownOpen: open(mine.score), rivalOpen: open(theirs.score) };
}

function trailOf(rows) {
  return (Array.isArray(rows) ? rows : [])
    .filter((row) => row && typeof row.overall === "number" && row.at)
    .map((row) => ({ at: String(row.at).slice(0, 10), overall: row.overall }))
    .slice(-8);
}

function compareSites(own, rival, extra) {
  const mine = own && own.insights;
  const theirs = rival && rival.insights;
  if (!mine || !theirs || !mine.score || !theirs.score) return null;
  const more = extra || {};
  const a = openProblems(mine);
  const b = openProblems(theirs);
  const passive = !!(rival.limits && rival.limits.passive);
  const ownOnly = onlyIn(a, b).filter((item) => !passive || !ACTIVE_KEYS.includes(item.key));
  const rivalOnly = onlyIn(b, a);
  const areas = AREAS.map((name) => areaRow(mine, theirs, name));
  const kpis = kpisOf(own, rival);
  const decided = areas.map((row) => (row.lead == null ? "" : row.level ? "tie" : row.lead > 0 ? "own" : "rival")).concat(kpis.filter((row) => row.key !== "overall").map((row) => row.winner)).filter(Boolean);
  const shared = onlyIn(a, new Map()).filter((item) => b.has(item.key));
  return {
    ownId: own.id || "",
    ownHost: own.host || "",
    ownAt: own.fetchedAt || "",
    rivalHost: rival.host || "",
    passive,
    overall: { own: mine.score.overall || 0, rival: theirs.score.overall || 0 },
    areas,
    kpis,
    dominance: { own: decided.filter((w) => w === "own").length, rival: decided.filter((w) => w === "rival").length, tie: decided.filter((w) => w === "tie").length },
    verdicts: { own: mix(mine.score, "totals", ["fail", "risk", "pass", "person"]), rival: mix(theirs.score, "totals", ["fail", "risk", "pass", "person"]) },
    severities: { own: mix(mine.score, "severities", ["critical", "high", "medium", "low"]), rival: mix(theirs.score, "severities", ["critical", "high", "medium", "low"]) },
    ownOnly: ownOnly.slice(0, LIST_MAX),
    ownOnlyCount: ownOnly.length,
    rivalOnly: rivalOnly.slice(0, LIST_MAX),
    rivalOnlyCount: rivalOnly.length,
    shared: shared.length,
    sharedList: shared.slice(0, SHARED_MAX),
    trail: { own: trailOf(more.trail && more.trail.own), rival: trailOf(more.trail && more.trail.rival) },
    market: market.marketView(own, rival, more.ranks)
  };
}

// One line per comparison: enough to name and link it from its base review and the account page.
function compareLine(row) {
  const cmp = row && row.report && row.report.compare;
  if (!cmp || !cmp.overall) return null;
  return {
    id: cleanId(row.id || row.report.id),
    at: String(row.createdAt || ""),
    baseId: cleanId(row.compareWith || cmp.ownId),
    ownHost: cmp.ownHost || "",
    rivalHost: cmp.rivalHost || row.report.host || "",
    own: num(cmp.overall.own),
    rival: num(cmp.overall.rival),
    dominance: cmp.dominance || null
  };
}

// The comparisons the owner of a base review ran from it, newest first.
function comparisonsOf(rows, baseId, email) {
  const id = cleanId(baseId);
  const address = String(email || "").trim().toLowerCase();
  if (!id || !address) return [];
  return (rows || [])
    .filter((row) => row && String(row.email || "").trim().toLowerCase() === address)
    .map(compareLine)
    .filter((line) => line && line.id && line.baseId === id)
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, LIST_MAX);
}

// Saved reviews of one account side by side: the first id is the base, and each other one is compared with it
// from the reports already stored, with no new run. A report that does not open in full for the account
// is named but not compared, so a comparison never shows what its report would keep under the frost.
const SAVED_MAX = 5;

function savedComparison(records, email, ids, isOpen) {
  const address = String(email || "").trim().toLowerCase();
  const wanted = [...new Set((Array.isArray(ids) ? ids : []).map(cleanId).filter(Boolean))].slice(0, SAVED_MAX);
  if (wanted.length < 2) return { error: "Pick at least two of your reviews to compare.", code: "pickTwo" };
  const mine = new Map((records || [])
    .filter((row) => row && row.report && row.report.insights && String(row.email || "").trim().toLowerCase() === address)
    .map((row) => [cleanId(row.id), row]));
  const base = mine.get(wanted[0]);
  if (!base) return { error: "That review is not saved under this account.", code: "reviewNotSaved" };
  const host = base.report.host || "";
  if (base.status === "stopped" || base.report.status === "stopped") return { error: "The review of " + host + " stopped early. Compare from a finished review.", code: "stoppedBase", host };
  if (!isOpen(base)) return { error: "The report of " + host + " is not open in full yet. Unlock it to compare from it.", code: "notOpen", host, locked: wanted[0] };
  const own = Object.assign({}, base.report, { id: wanted[0] });
  const list = wanted.slice(1).map((id) => {
    const row = mine.get(id);
    if (!row) return { id, missing: true };
    const out = { id, host: row.report.host || "", at: String(row.createdAt || "") };
    if (sameSite(host, out.host)) return Object.assign(out, { same: true });
    if (row.status === "stopped" || row.report.status === "stopped") return Object.assign(out, { stopped: true });
    if (!isOpen(row)) return Object.assign(out, { locked: true });
    return Object.assign(out, { compare: compareSites(own, row.report) });
  });
  return { base: { id: wanted[0], host, at: String(base.createdAt || "") }, list };
}

module.exports = { AREAS, KPIS, LIST_MAX, LEVEL_GAP, ACTIVE_KEYS, SAVED_MAX, sameSite, cleanId, baseProblem, winnerOf, compareSites, compareLine, comparisonsOf, savedComparison };
