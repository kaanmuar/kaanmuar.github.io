/**
 * The free re-review after a fix: queued when the desk marks a request done (or the client asks for the free re-check
 * on a paid report), run server-side on the same address with the original options, then compared finding by finding.
 */
const fixOffers = require("./url-review-fix-offers");

const COLLECTION = fixOffers.COLLECTION;
const OPEN = ["fail", "risk"];
const NEW_MAX = 5;

function queued(now) {
  return { status: "queued", at: new Date(now || Date.now()).toISOString() };
}

/** True once per queueing: the trigger runs when a request's re-review becomes queued. */
function due(before, after) {
  const next = after && after.rereview;
  const prior = before && before.rereview;
  return !!(next && next.status === "queued" && !(prior && prior.status === "queued" && prior.at === next.at));
}

/** The request patch the desk adds when it marks a fix done, or asks to run a failed re-review again. */
function queuePatch(record, patch, input, now) {
  const run = record && record.rereview;
  const busy = run && (run.status === "queued" || run.status === "running");
  if (busy) return {};
  const markedDone = patch && patch.status === "done" && (record && record.status) !== "done" && !(run && run.status === "done");
  const again = input && input.rereview === true && run && run.status === "failed";
  return markedDone || again ? { rereview: queued(now) } : {};
}

/** The address and options of the original run, so the re-review checks the same pages. */
function target(original) {
  const row = original || {};
  const report = row.report || {};
  const url = row.requestedUrl || report.finalUrl || report.url || (report.host ? "https://" + report.host + "/" : "");
  return {
    url,
    name: row.name || "",
    email: row.email || "",
    lang: row.lang || "",
    options: {
      frameworks: row.frameworks || [],
      pages: row.pages || undefined,
      depth: row.depth || undefined,
      pageLang: row.pageLang || "",
      section: row.section === true
    }
  };
}

function findingsOf(report) {
  return (report && report.insights && report.insights.findings) || [];
}

function scoreOf(report) {
  const score = (report && report.insights && report.insights.score) || {};
  return { overall: Number(score.overall) || 0, grade: score.grade || "" };
}

/**
 * Each finding the client asked to fix, before and after: fixed when the check now passes or no longer fires,
 * open when it still fails or is a risk, check when it now needs a person. Plus problems the new run found that were not open before.
 */
function beforeAfter(beforeReport, afterReport, asked) {
  const before = findingsOf(beforeReport);
  const after = findingsOf(afterReport);
  const byKey = new Map(after.map((f) => [f.key, f]));
  const items = (asked || []).map((f) => {
    const now = byKey.get(f.key);
    const state = !now || now.verdict === "pass" ? "fixed" : now.verdict === "person" ? "check" : "open";
    return Object.assign({ id: f.id, key: f.key, title: f.title, before: f.verdict || "", state }, f.titleMsg ? { titleMsg: f.titleMsg } : {});
  });
  const openBefore = new Set(before.filter((f) => OPEN.indexOf(f.verdict) !== -1).map((f) => f.key));
  const fresh = after.filter((f) => OPEN.indexOf(f.verdict) !== -1 && !openBefore.has(f.key));
  const was = scoreOf(beforeReport);
  const now = scoreOf(afterReport);
  return {
    scoreBefore: was.overall,
    gradeBefore: was.grade,
    scoreAfter: now.overall,
    gradeAfter: now.grade,
    fixed: items.filter((item) => item.state === "fixed").length,
    open: items.filter((item) => item.state !== "fixed").length,
    items,
    newCount: fresh.length,
    newProblems: fresh.slice(0, NEW_MAX).map((f) => Object.assign({ id: f.id, key: f.key, title: f.title, severity: f.severity || "" }, f.msg && f.msg.title ? { titleMsg: f.msg.title } : {}))
  };
}

/** The new report saved for the client: free, paid like the report it re-checks, tied to the request. */
function rereviewRecord(record, original, fixId, now) {
  return Object.assign({}, record, {
    createdAt: new Date(now || Date.now()).toISOString(),
    paid: original && original.paid === true,
    free: true,
    priceUsd: 0,
    lang: (original && original.lang) || record.lang || "",
    fixRequest: fixId,
    rereviewOf: (original && original.report && original.report.id) || ""
  });
}

function finishedPatch(request, reportId, result, now) {
  const at = new Date(now || Date.now()).toISOString();
  return {
    status: "re-reviewed",
    updatedAt: at,
    rereview: { status: "done", at, reportId, result },
    history: ((request && request.history) || []).concat([{ status: "re-reviewed", at, by: "re-review" }]).slice(-20)
  };
}

function failedPatch(error, now) {
  return { rereview: { status: "failed", at: new Date(now || Date.now()).toISOString(), error: String((error && error.message) || error || "failed").slice(0, 300) } };
}

/** The free re-check a client asks for on a paid report: a request already done, over every open finding. */
function selfRecord(row, email, lang, now) {
  const report = (row && row.report) || {};
  const open = findingsOf(report).filter((f) => OPEN.indexOf(f.verdict) !== -1);
  if (!open.length) return { error: "This report has no open findings to re-check." };
  const record = fixOffers.requestRecord({ findings: open.map((f) => f.id), lang }, row, email, now);
  if (record.error) return record;
  const at = record.createdAt;
  return Object.assign(record, {
    kind: "self",
    status: "done",
    history: [{ status: "done", at, by: "client" }],
    rereview: queued(now)
  });
}

function ownerNotice(request, reportId, result, deskUrl) {
  return {
    subject: "Fix re-review: " + (request.host || "a site") + " · " + result.fixed + " of " + result.items.length + " fixed",
    intro: "The free re-review of " + (request.host || "the site") + " ran and the before/after went to " + request.email + ".",
    rows: [
      { label: "Site", value: request.host },
      { label: "Kind", value: request.kind === "self" ? "Client's own fix (free re-check)" : "Our fix package" },
      { label: "Score", value: result.scoreBefore + " → " + result.scoreAfter },
      { label: "Fixed", value: result.fixed + " of " + result.items.length },
      { label: "New problems", value: String(result.newCount) },
      { label: "New report", value: fixOffers.reportUrl({ reportId }) }
    ],
    body: result.items.filter((item) => item.state !== "fixed").map((item) => "Still " + item.state + ": " + item.id + " " + item.title).join("\n"),
    respondUrl: deskUrl,
    buttonLabel: "Open the review desk"
  };
}

module.exports = { COLLECTION, queued, due, queuePatch, target, beforeAfter, rereviewRecord, finishedPatch, failedPatch, selfRecord, ownerNotice };
