"use strict";
/*
 * Share-to-review (#1417): a URL shared to the Jarvis app is queued here as the owner's own review.
 * jarvisReviewRun picks the row up, runs it the way the sweep does, saves it under the owner's email
 * (so it opens in full in their account) and pushes the score to the phone that asked.
 */
const LANGS = ["en", "es", "pt", "de", "fr", "it"];
const LIMIT_MS = 420 * 1000;

const queue = (db) => db.collection("jarvis_reviews");

function cleanUrl(input) {
  let raw = String(input || "").trim();
  const found = raw.match(/https?:\/\/[^\s<>"']+/i);
  if (found) raw = found[0];
  raw = raw.replace(/[).,;!?]+$/, "");
  if (!/^https?:\/\//i.test(raw)) raw = "https://" + raw;
  let url;
  try { url = new URL(raw); } catch (error) { throw new Error("That is not a web address."); }
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(url.hostname)) throw new Error("That is not a web address.");
  return url.toString();
}

const cleanLang = (lang) => (LANGS.includes(String(lang || "").slice(0, 2).toLowerCase()) ? String(lang).slice(0, 2).toLowerCase() : "en");

async function enqueue(db, { url, lang, token }, by, now) {
  const row = {
    url: cleanUrl(url),
    lang: cleanLang(lang),
    token: String(token || "").slice(0, 4096),
    by: String(by || ""),
    status: "queued",
    at: new Date(now).toISOString()
  };
  const ref = await queue(db).add(row);
  return { id: ref.id, url: row.url, lang: row.lang, host: new URL(row.url).hostname };
}

/** The intake intakeRecord stores: the owner's own run, priced as one framework like every run. */
function intake(row) {
  return {
    url: row.url,
    name: "Carlos Munoz",
    email: row.by,
    reason: "Shared from the Jarvis app",
    reasonCode: "release",
    frameworks: ["Playwright"],
    lang: cleanLang(row.lang)
  };
}

function doneMessage(report, link) {
  const score = (report && report.insights && report.insights.score) || {};
  const totals = score.totals || {};
  const findings = report && report.insights && Array.isArray(report.insights.findings) ? report.insights.findings : [];
  const host = (report && report.host) || "the site";
  const pages = Number(report && report.limits && report.limits.pagesRead) || 0;
  const plural = (n, w) => (Number(n) || 0) + " " + w + (Number(n) === 1 ? "" : "s");
  return {
    kind: "review",
    title: "Review done: " + host + (score.overall != null ? " scored " + score.overall + (score.grade ? " (" + score.grade + ")" : "") : ""),
    body: plural(pages, "page") + " read: " + (Number(totals.fail) || 0) + " failing, " + (Number(totals.risk) || 0) + " at risk, " + (Number(totals.pass) || 0) + " passing. Tap to open the report.",
    lines: findings.filter((f) => f && (f.verdict === "fail" || f.verdict === "risk")).slice(0, 5).map((f) => String(f.title || "").slice(0, 120)).filter(Boolean),
    url: link,
    tag: "jarvis-review-" + host
  };
}

function failedMessage(url, reason) {
  let host = url;
  try { host = new URL(url).hostname; } catch (error) { host = String(url || ""); }
  return {
    kind: "review",
    title: "Review failed: " + host,
    body: String(reason || "The review did not finish.").slice(0, 200),
    lines: [],
    tab: "systems",
    tag: "jarvis-review-" + host
  };
}

module.exports = { LANGS, LIMIT_MS, cleanUrl, cleanLang, enqueue, intake, doneMessage, failedMessage };
