/* The owner notice: one short email telling a site's owner that a public Live Report of it exists,
   with its health score and a way to claim the blurred report or take the site off Live Reports.

   A finished review queues one notice per registrable domain in Firestore
   url_review_owner_notices/<domain>, with every address found for the site, ranked. Nothing is sent
   until a person picks an address and sends it from the desk, and the desk sends it only once the
   host's card is on assets/live-reports/index.json. The notice never names or describes the asker,
   and never goes through a contact form. */

const core = require("./url-review-core");
const publish = require("./url-review-publish");

const LANGS = ["en", "es", "pt", "de", "fr", "it"];
const QUIET_MS = 182 * 864e5;
// §7 UWG in Germany and Austria asks for consent before advertising mail, even between businesses.
const CONSENT_TLDS = /\.(de|at)$/i;
const SOURCE_POINTS = { "contact-page": 40, schema: 38, "security.txt": 32, page: 30, "page-text": 26, llms: 24, rdap: 22, github: 18, search: 14, dmarc: 8, soa: 6 };
// DMARC report and SOA hostmaster addresses on another domain belong to a vendor, not the owner.
const OWN_DOMAIN_ONLY = ["dmarc", "soa"];
const ROLE = /^(contact|contacto|contato|contatti|kontakt|info|informacion|hello|hola|ola|office|oficina|admin|webmaster|web|marketing|comunicaciones|press|prensa|support|soporte|servicio|atencion|customer|clientes|ventas|sales)\b/;
const JUNK_LOCAL = /^(no-?reply|do-?not-?reply|mailer-daemon|bounces?|example|test|user|usuario|name|nombre|email|correo|you|your|tu|su)$/;
const JUNK_DOMAIN = /(^|\.)(example\.(com|org|net)|domain\.com|email\.com|yourdomain\.com|tudominio\.com|sentry\.io|wixpress\.com|sentry-next\.wixpress\.com)$/;

function criticalSecurity(report) {
  return ((report && report.insights && report.insights.findings) || [])
    .some((item) => item && item.area === "Security" && item.verdict === "fail" && item.severity === "critical");
}

function domainOf(host) {
  return core.registrable(publish.bare(host));
}

// Every address found, best first: { email, sources, url, points, onDomain }.
function rankContacts(found, host) {
  const domain = domainOf(host);
  const byEmail = new Map();
  (found || []).forEach((row) => {
    const email = String((row && row.email) || "").trim().toLowerCase();
    if (!core.emailSyntax(email) || SOURCE_POINTS[row.source] == null) return;
    const [local, mailDomain] = email.split("@");
    if (JUNK_LOCAL.test(local) || JUNK_DOMAIN.test(mailDomain)) return;
    const onDomain = core.registrable(mailDomain) === domain;
    if (!onDomain && OWN_DOMAIN_ONLY.indexOf(row.source) !== -1) return;
    const entry = byEmail.get(email) || { email, sources: [], url: "", points: 0, onDomain };
    if (entry.sources.indexOf(row.source) === -1) entry.sources.push(row.source);
    if (!entry.url && row.url) entry.url = String(row.url);
    byEmail.set(email, entry);
  });
  return [...byEmail.values()].map((entry) => {
    const best = Math.max(...entry.sources.map((source) => SOURCE_POINTS[source]));
    const points = best + (entry.sources.length - 1) * 3 + (entry.onDomain ? 20 : 0) + (ROLE.test(entry.email.split("@")[0]) ? 8 : 0);
    entry.sources.sort((a, b) => SOURCE_POINTS[b] - SOURCE_POINTS[a]);
    return Object.assign(entry, { points });
  }).sort((a, b) => b.points - a.points || a.email.localeCompare(b.email));
}

function pickContact(report) {
  return rankContacts(report && report.contacts && report.contacts.found, report && report.host)[0] || null;
}

function noticeLang(report) {
  const lang = String((report && report.observed && report.observed.lang) || "").slice(0, 2).toLowerCase();
  return LANGS.indexOf(lang) === -1 ? "en" : lang;
}

// A domain is due when it has no pending notice and none was sent or dropped in the last six months.
function due(notice, now) {
  if (!notice) return true;
  if (notice.status === "pending" || notice.status === "sending") return false;
  const at = Date.parse(notice.sentAt || notice.decidedAt || notice.createdAt || "") || 0;
  return (now || Date.now()) - at >= QUIET_MS;
}

// Why this review gets no notice whatever addresses turn up, or "".
// ctx: { unlisted: [host], stopped: Set with "@domain" when the domain asked for none, notice: the domain's last notice, now }.
function heldBack(record, ctx) {
  const opts = ctx || {};
  const report = (record && record.report) || {};
  const held = publish.heldReason(record || {}, opts.unlisted || []);
  if (held) return held;
  const host = publish.bare(report.host);
  if (record.reasonCode === "own" && core.mailboxMatchesHost(record.email, host)) return "own";
  if (CONSENT_TLDS.test(host)) return "needs-consent";
  if ((opts.stopped || new Set()).has("@" + domainOf(host))) return "stopped";
  if (!due(opts.notice, opts.now)) return "recent";
  return "";
}

// The ranked addresses a notice may go to: not the asker's, not one that asked for no notices.
function usableContacts(record, ranked, stopped) {
  const asker = String((record && record.email) || "").trim().toLowerCase();
  const stops = stopped || new Set();
  return (ranked || []).filter((row) => row.email !== asker && !stops.has(row.email));
}

// ctx as heldBack, plus contacts (extra found rows) and stopped emails.
function skipReason(record, ctx) {
  const opts = ctx || {};
  const held = heldBack(record, opts);
  if (held) return held;
  const report = record.report;
  const found = ((report.contacts && report.contacts.found) || []).concat(opts.contacts || []);
  const ranked = rankContacts(found, report.host);
  if (!ranked.length) return "no-contact";
  if (!usableContacts(record, ranked).length) return "asker-is-contact";
  if (!usableContacts(record, ranked, opts.stopped).length) return "stopped";
  return "";
}

function noticeRow(record, usable, now) {
  const report = record.report;
  const host = publish.bare(report.host);
  const candidates = usable.slice(0, 8).map((row) => ({ email: row.email, sources: row.sources, url: row.url, onDomain: row.onDomain }));
  const top = candidates[0];
  return {
    status: "pending",
    host,
    domain: domainOf(host),
    reviewId: String(report.id || ""),
    email: top.email,
    source: top.sources[0],
    sourceUrl: top.url,
    candidates,
    critical: criticalSecurity(report),
    lang: noticeLang(report),
    reviewedAt: report.fetchedAt ? String(report.fetchedAt)
      : new Date(record.createdAt && record.createdAt.toDate ? record.createdAt.toDate() : (now || Date.now())).toISOString(),
    createdAt: new Date(now || Date.now()).toISOString()
  };
}

// The notice addressed to one of its candidates, or null when that address is not one of them.
function addressed(notice, email) {
  const chosen = String(email || notice.email || "").trim().toLowerCase();
  const row = (notice.candidates || []).find((item) => item.email === chosen);
  if (!row) return chosen === notice.email ? notice : null;
  return Object.assign({}, notice, { email: row.email, source: row.sources[0], sourceUrl: row.url || "" });
}

// The Live Report card for a host in assets/live-reports/index.json, or null when it is not public.
function liveCard(index, host) {
  const target = publish.bare(host);
  return ((index && index.reports) || []).find((card) => card && publish.bare(card.host) === target) || null;
}

// Why a queued notice cannot go out now, or "" when it can.
function sendBlock(notice, ctx) {
  const opts = ctx || {};
  if (!notice || (notice.status !== "pending" && notice.status !== "sending")) return "That notice is not waiting to be sent.";
  const stopped = opts.stopped || new Set();
  if (stopped.has(notice.email) || stopped.has("@" + notice.domain)) return "This address or domain asked for no notices.";
  if (publish.heldReason({ status: "complete", report: { host: notice.host } }, opts.unlisted || []) === "unlisted") return notice.host + " is already off Live Reports.";
  if (!opts.card) return notice.host + " is not on Live Reports yet. Send it after the daily publish lands.";
  return "";
}

module.exports = { LANGS, QUIET_MS, SOURCE_POINTS, criticalSecurity, domainOf, rankContacts, pickContact, noticeLang, due, heldBack, usableContacts, skipReason, noticeRow, addressed, liveCard, sendBlock };
