/**
 * A competitor next to the asker's own review: the area scores side by side,
 * and the open problems only one of the two sites has.
 * The competitor's run is the public review: passive checks, no conversation, no form sent.
 */
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

function compareSites(own, rival) {
  const mine = own && own.insights;
  const theirs = rival && rival.insights;
  if (!mine || !theirs || !mine.score || !theirs.score) return null;
  const a = openProblems(mine);
  const b = openProblems(theirs);
  const passive = !!(rival.limits && rival.limits.passive);
  const ownOnly = onlyIn(a, b).filter((item) => !passive || !ACTIVE_KEYS.includes(item.key));
  const rivalOnly = onlyIn(b, a);
  return {
    ownId: own.id || "",
    ownHost: own.host || "",
    ownAt: own.fetchedAt || "",
    rivalHost: rival.host || "",
    passive,
    overall: { own: mine.score.overall || 0, rival: theirs.score.overall || 0 },
    areas: AREAS.map((name) => ({ area: name, own: areaScore(mine.score, name), rival: areaScore(theirs.score, name) })),
    ownOnly: ownOnly.slice(0, LIST_MAX),
    ownOnlyCount: ownOnly.length,
    rivalOnly: rivalOnly.slice(0, LIST_MAX),
    rivalOnlyCount: rivalOnly.length,
    shared: [...a.keys()].filter((key) => b.has(key)).length
  };
}

module.exports = { AREAS, LIST_MAX, ACTIVE_KEYS, sameSite, cleanId, baseProblem, compareSites };
