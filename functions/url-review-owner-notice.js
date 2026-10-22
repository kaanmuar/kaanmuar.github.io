/* The owner notice: one short email telling a site's owner that a public Live Report of it exists,
   with a way to claim the full report or take the site off Live Reports.

   A finished review queues one notice per registrable domain in Firestore
   url_review_owner_notices/<domain>. Nothing is sent until a person sends it from the desk, and the
   desk sends it only once the host's card is on assets/live-reports/index.json. The notice never
   names or describes the asker. Contacts come only from what the site publishes (url-review-core.js
   ownerContacts), never from a contact form. */

const core = require("./url-review-core");
const publish = require("./url-review-publish");

const LANGS = ["en", "es", "pt", "de", "fr", "it"];
const QUIET_MS = 182 * 864e5;
// §7 UWG in Germany and Austria asks for consent before advertising mail, even between businesses.
const CONSENT_TLDS = /\.(de|at)$/i;
const SOURCES = ["security.txt", "schema", "page"];

function criticalSecurity(report) {
  return ((report && report.insights && report.insights.findings) || [])
    .some((item) => item && item.area === "Security" && item.verdict === "fail" && item.severity === "critical");
}

// security.txt is for reporting flaws, so it is used only when the review found a critical one.
function pickContact(report) {
  const found = (report && report.contacts) || {};
  const security = (found.securityTxt || [])[0];
  if (security && criticalSecurity(report)) return { email: security, source: "security.txt", url: "" };
  const schema = (found.schema || [])[0];
  if (schema) return { email: schema, source: "schema", url: "" };
  const page = (found.pages || [])[0];
  if (page && page.email) return { email: page.email, source: "page", url: String(page.url || "") };
  return null;
}

function noticeLang(report) {
  const lang = String((report && report.observed && report.observed.lang) || "").slice(0, 2).toLowerCase();
  return LANGS.indexOf(lang) === -1 ? "en" : lang;
}

function domainOf(host) {
  return core.registrable(publish.bare(host));
}

// A domain is due when it has no pending notice and none was sent or dropped in the last six months.
function due(notice, now) {
  if (!notice) return true;
  if (notice.status === "pending" || notice.status === "sending") return false;
  const at = Date.parse(notice.sentAt || notice.decidedAt || notice.createdAt || "") || 0;
  return (now || Date.now()) - at >= QUIET_MS;
}

// Why no notice is queued for this review, or "" when one is.
// ctx: { unlisted: [host], stopped: Set of emails and "@domain", notice: the domain's last notice, now }.
function skipReason(record, ctx) {
  const opts = ctx || {};
  const report = (record && record.report) || {};
  const held = publish.heldReason(record || {}, opts.unlisted || []);
  if (held) return held;
  const host = publish.bare(report.host);
  if (record.reasonCode === "own" && core.mailboxMatchesHost(record.email, host)) return "own";
  if (CONSENT_TLDS.test(host)) return "needs-consent";
  const contact = pickContact(report);
  if (!contact) return "no-contact";
  if (String(record.email || "").trim().toLowerCase() === contact.email) return "asker-is-contact";
  const stopped = opts.stopped || new Set();
  if (stopped.has(contact.email) || stopped.has("@" + domainOf(host))) return "stopped";
  if (!due(opts.notice, opts.now)) return "recent";
  return "";
}

function noticeRow(record, now) {
  const report = record.report;
  const host = publish.bare(report.host);
  const contact = pickContact(report);
  return {
    status: "pending",
    host,
    domain: domainOf(host),
    reviewId: String(report.id || ""),
    email: contact.email,
    source: contact.source,
    sourceUrl: contact.url,
    critical: criticalSecurity(report),
    lang: noticeLang(report),
    reviewedAt: String(report.fetchedAt || record.createdAt || ""),
    createdAt: new Date(now || Date.now()).toISOString()
  };
}

// The Live Report card for a host in assets/live-reports/index.json, or null when it is not public.
function liveCard(index, host) {
  const target = publish.bare(host);
  return ((index && index.reports) || []).find((card) => card && publish.bare(card.host) === target) || null;
}

// Why a queued notice cannot go out now, or "" when it can.
function sendBlock(notice, ctx) {
  const opts = ctx || {};
  if (!notice || notice.status !== "pending") return "That notice is not waiting to be sent.";
  if (!String(opts.postal || "").trim()) return "Set OWNER_NOTICE_POSTAL in functions/.env first. Every notice carries a postal address.";
  const stopped = opts.stopped || new Set();
  if (stopped.has(notice.email) || stopped.has("@" + notice.domain)) return "This address or domain asked for no notices.";
  if (publish.heldReason({ status: "complete", report: { host: notice.host } }, opts.unlisted || []) === "unlisted") return notice.host + " is already off Live Reports.";
  if (!opts.card) return notice.host + " is not on Live Reports yet. Send it after the daily publish lands.";
  return "";
}

module.exports = { LANGS, QUIET_MS, SOURCES, criticalSecurity, pickContact, noticeLang, domainOf, due, skipReason, noticeRow, liveCard, sendBlock };
