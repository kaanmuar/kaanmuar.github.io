"use strict";
/*
 * Owner emails as Jarvis pushes (#1669): each owner email that moves to Jarvis also pushes, so the
 * phone hears it first. "inbox" is what people wrote to Carlos, "desk" is the URL review desk, and the
 * backup and ops failures go to "alerts". Each builder returns a jarvis-push message, or null.
 * "ref" names the thing a notification button acts on (#1670).
 */
const clip = (value, n) => String(value == null ? "" : value).replace(/\s+/g, " ").trim().slice(0, n);
const plural = (n, w) => n + " " + w + (n === 1 ? "" : "s");

// Run events that need Carlos push loud, each on its own; the rest update one quiet notification per run.
const PROBLEMS = new Set(["blocked", "failed", "payment-due", "payment-unmatched", "payment-refunded", "payment-disputed", "credit-returned"]);
const STAGE = {
  started: "Review running",
  report: "Review done",
  stopped: "Review stopped early",
  checkout: "Checkout opened",
  capture: "Report copied or printed",
  credit: "Run credit used",
  monthly: "30-day pass granted",
  "follow-stop": "Follow-up notes stopped"
};

function hostOf(url) {
  try { return new URL(/^https?:/i.test(url) ? url : "https://" + url).hostname.replace(/^www\./, ""); } catch (error) { return ""; }
}

const rowLines = (rows) => (Array.isArray(rows) ? rows : []).filter((r) => r && r.label && r.value).slice(0, 6).map((r) => clip(r.label + ": " + r.value, 120));
const httpsOnly = (url) => (/^https:\/\//.test(String(url || "")) ? String(url) : "");

function messageMessage(id, data, topic) {
  const d = data || {};
  const who = clip(d.name, 60) || "Someone";
  return {
    kind: "inbox",
    title: "CV message · " + who + (topic ? " · " + clip(topic, 40) : ""),
    body: clip(d.message, 220) || "(no text)",
    lines: [clip(d.email, 120), d.fileURL ? "Has an attachment" : ""].filter(Boolean),
    tab: "products:inbox",
    tag: "jarvis-message-" + clip(id, 60),
    ref: "message:" + clip(id, 60)
  };
}

function ratingMessage(id, data) {
  const d = data || {};
  const score = Math.min(5, Math.max(0, Number(d.rating) || 0));
  return {
    kind: "inbox",
    title: "CV feedback · " + score + "/5 · " + (clip(d.name, 60) || "Someone"),
    body: clip(d.comment, 220) || "(no comment)",
    lines: [clip(d.email, 120)].filter(Boolean),
    tab: "products:inbox",
    tag: "jarvis-rating-" + clip(id, 60),
    ref: "rating:" + clip(id, 60)
  };
}

function ownerReplyMessage(id, row, summary, decideUrl) {
  const r = row || {};
  return {
    kind: "inbox",
    title: "Owner reply · " + (clip(r.host, 60) || clip(r.from, 60) || "a site owner"),
    body: clip(summary, 220),
    lines: [clip(r.from, 120), clip(r.words, 120)].filter(Boolean),
    tab: "products:outreach",
    tag: "jarvis-owner-reply-" + clip(id, 40),
    url: httpsOnly(decideUrl),
    ref: "owner-reply:" + clip(id, 40)
  };
}

function rerunMessage(done, deskUrl) {
  const list = Array.isArray(done) ? done : [];
  if (!list.length) return null;
  const count = (status) => list.filter((row) => row.status === status).length;
  const held = count("held");
  const swept = count("swept");
  const failed = count("failed");
  return {
    kind: "desk",
    title: held ? plural(held, "re-run") + " held for you" : "URL review re-runs",
    body: [held ? held + " held: send or drop each" : "", swept ? swept + " saved by the sweep" : "", failed ? failed + " failed again" : ""].filter(Boolean).join(", ") + ".",
    lines: list.slice(0, 6).map((row) => clip(row.status + " · " + (row.host || "?") + (row.name ? " for " + row.name : ""), 120)),
    tab: "products:review",
    tag: "jarvis-reruns",
    url: httpsOnly(deskUrl),
    ref: "rerun-held"
  };
}

function comparisonMessage(notice) {
  if (!notice || !notice.subject) return null;
  return {
    kind: "desk",
    title: clip(notice.subject, 120),
    body: clip(notice.intro, 220),
    lines: rowLines(notice.rows),
    tab: "products:review",
    tag: "jarvis-compare-" + clip(notice.subject, 60),
    url: httpsOnly(notice.respondUrl)
  };
}

/** note is what reviewDesk.alertFrom made of the event. Sweep, rival and test runs push only their problems. */
function runMessage(source, note) {
  const s = source || {};
  const n = note || {};
  const problem = PROBLEMS.has(n.kind);
  if (!problem && (s.source || s.test === true || !n.runId)) return null;
  const host = hostOf(n.url || "");
  return {
    kind: "desk",
    title: (problem ? n.title : STAGE[n.kind] || n.title || "Review event") + (host ? " · " + host : ""),
    body: [n.name, n.email].filter(Boolean).join(" · ") || clip(n.title, 220),
    lines: rowLines(n.rows),
    tab: "products:review",
    tag: problem ? "jarvis-desk-" + n.kind + "-" + (n.runId || n.at || "") : "jarvis-review-" + n.runId,
    quiet: !problem,
    ref: problem && n.runId ? "run:" + n.runId : ""
  };
}

function backupMessage(day, error) {
  return {
    kind: "alerts",
    title: "Firestore backup did not start",
    body: clip(day, 20) + ": " + (clip(error, 200) || "Export failed"),
    tab: "systems",
    tag: "jarvis-backup"
  };
}

function opsMessage(problems) {
  const list = Array.isArray(problems) ? problems : [];
  if (!list.length) return null;
  return {
    kind: "alerts",
    title: plural(list.length, "scheduled job") + " missed or failed",
    body: clip(list.map((p) => p.job).join(", "), 220),
    lines: list.slice(0, 6).map((p) => clip(p.job + ": " + p.why, 120)),
    tab: "systems",
    tag: "jarvis-ops",
    ref: "ops:" + clip(list.map((p) => p.job).join(","), 200)
  };
}

module.exports = { PROBLEMS, messageMessage, ratingMessage, ownerReplyMessage, rerunMessage, comparisonMessage, runMessage, backupMessage, opsMessage };
