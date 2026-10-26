"use strict";
/*
 * Jarvis business pushes (#1420): a live PayPal payment, a finished customer review, and outreach
 * notices waiting for approval. Each returns a jarvis-push message, or null when it should stay quiet.
 */
const jarvisReview = require("./jarvis-review");

const PAID = { paid: "Report", "run-paid": "Run", "addon-paid": "Add-on", "pass-paid": "30-day pass" };
const NOTICES_EVERY_MS = 3600 * 1000;

const usd = (n) => "$" + (Math.round(n * 100) % 100 ? n.toFixed(2) : String(Math.round(n)));
const plural = (n, w) => n + " " + w + (n === 1 ? "" : "s");

function hostOf(url) {
  try { return new URL(/^https?:/i.test(url) ? url : "https://" + url).hostname.replace(/^www\./, ""); } catch (error) { return ""; }
}

/** note is what reviewDesk.alertFrom made of the same event: name, email, url. */
function paymentMessage(kind, source, note) {
  const what = PAID[kind];
  const price = Number(source && source.priceUsd) || 0;
  if (!what || !source || source.test === true || price <= 0) return null;
  const n = note || {};
  const host = hostOf(n.url || "");
  const who = [n.name || source.name, n.email || source.email].filter(Boolean).join(" · ");
  const extra = source.competitors > 1 ? plural(source.competitors, "competitor run") : source.purpose && source.purpose !== "report" ? String(source.purpose) : "";
  return {
    kind: "money",
    title: usd(price) + " · " + what + " paid" + (host ? " · " + host : ""),
    body: who || "A PayPal payment came in.",
    lines: [what + " · " + usd(price), who, host, extra, source.via ? "Via " + source.via : ""].filter(Boolean).map((s) => String(s).slice(0, 120)),
    tab: "business",
    tag: "jarvis-pay-" + String(source.id || source.reference || source.sessionId || Date.now()).slice(0, 60)
  };
}

/** Customer runs carry no source; sweep, rivals and Jarvis runs do, and test runs say so. */
function isCustomer(record) {
  return !!(record && record.report && !record.source && record.test !== true);
}

function reviewMessage(kind, record) {
  if ((kind !== "report" && kind !== "stopped") || !isCustomer(record)) return null;
  const done = jarvisReview.doneMessage(record.report, "");
  const plan = record.passId ? "30-day pass" : record.free ? "free" : Number(record.priceUsd) > 0 ? "paid " + usd(Number(record.priceUsd)) : "";
  const who = [record.name, record.email].filter(Boolean).join(" · ");
  return {
    kind: "reviews",
    title: done.title.replace(/^Review done/, kind === "stopped" ? "Review stopped early" : "New review"),
    body: [who, plan].filter(Boolean).join(" · ") + (who || plan ? ". " : "") + done.body.replace(/ Tap to open the report\.$/, ""),
    lines: done.lines,
    tab: "products:review",
    tag: "jarvis-review-" + String(record.id || (record.report && record.report.host) || "").slice(0, 60)
  };
}

/** Pending owner notices created since the last push, at most one push an hour. */
function noticesDue(pending, lastAt, now) {
  if (lastAt && now - Date.parse(lastAt) < NOTICES_EVERY_MS) return [];
  const since = lastAt ? Date.parse(lastAt) : 0;
  return pending.filter((n) => n && n.status === "pending" && Date.parse(n.createdAt || 0) > since);
}

function noticesMessage(fresh, pendingTotal) {
  const hosts = fresh.map((n) => n.host || n.domain).filter(Boolean);
  const critical = fresh.filter((n) => n.critical).length;
  return {
    kind: "outreach",
    title: plural(pendingTotal, "outreach notice") + " waiting for you",
    body: (fresh.length === pendingTotal ? "" : fresh.length + " new: ") + hosts.slice(0, 4).join(", ") + (hosts.length > 4 ? " and " + (hosts.length - 4) + " more" : "") +
      (critical ? ". " + plural(critical, "critical security finding") : "") + ". Send or drop each one.",
    lines: fresh.slice(0, 6).map((n) => (n.host || n.domain) + " → " + (n.email || "?") + (n.critical ? " · critical" : "")),
    tab: "products:outreach",
    tag: "jarvis-outreach"
  };
}

module.exports = { PAID, NOTICES_EVERY_MS, paymentMessage, isCustomer, reviewMessage, noticesDue, noticesMessage };
