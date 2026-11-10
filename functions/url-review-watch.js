"use strict";

/* Watch cases for the Cases card (#3391): retests that exist only while the matching finding is open, built from the raw
   results of the newer checks, and the regression pins a paid fix's re-review leaves behind. Only facts are kept here;
   js/qa-review-watch.js writes the words in six languages and the scripts for each tool. Firestore refuses nested arrays,
   so every list holds objects or strings. */

const blocklists = require("./url-review-blocklists");
const { registryDomain } = require("./url-review-suffix");

const OPEN = ["fail", "risk"];
const MAX_ROWS = 12;
const MAX_PAGES = 6;
const MAX_TERMS = 8;
const SAFE_BROWSING_REVIEW = "https://search.google.com/search-console/security-issues";
const LIST_NAMES = { urlhaus: "URLhaus", phishstats: "PhishStats", cloudflare: "Cloudflare URL Scanner" };
const HACK_KEYS = ["sec-seo-spam", "sec-cloaking", "sec-spam-links"];
// The flagged headers and cookies OWASP ZAP's baseline scan and Nuclei's misconfiguration templates also report.
const HEADER_KEYS = ["sec-csp", "sec-hsts", "sec-frame", "sec-nosniff", "sec-permissions", "sec-cookies", "sec-mixed", "sec-mixed-live", "sec-version", "sec-coop", "sec-isolation"];
const TLS_KEYS = ["sec-tls", "sec-tls-chain"];
// The accessibility findings axe-core and Pa11y can confirm on a rendered page.
const A11Y_KEYS = ["a11y-alt", "a11y-contrast", "a11y-frames", "a11y-h1", "a11y-labels", "a11y-lang", "a11y-main", "a11y-tabindex", "a11y-targets", "a11y-zoom"];
const KIND_TOOLS = {
  lists: ["curl"],
  linked: ["Playwright", "curl"],
  hacked: ["curl", "Playwright"],
  lookalike: ["dig"],
  exposed: ["curl", "Nuclei"],
  mail: ["checkdmarc", "dig"],
  blocklist: ["dig"],
  headers: ["OWASP ZAP", "Nuclei"],
  tls: ["curl"],
  a11y: ["axe", "Pa11y"]
};

function isOpen(finding) {
  return !!finding && OPEN.indexOf(finding.verdict) !== -1;
}

const SEVERITY = { info: 0, low: 1, medium: 2, high: 3, critical: 4 };

function worst(list) {
  return list.slice().sort((a, b) => (b.verdict === "fail") - (a.verdict === "fail") || (SEVERITY[b.severity] || 0) - (SEVERITY[a.severity] || 0))[0];
}

function kindOf(key) {
  const k = String(key || "");
  if (k === "sec-threatlists" || k === "sec-safebrowsing") return "lists";
  if (k === "sec-linked-script" || k === "sec-linked-risk") return "linked";
  if (HACK_KEYS.indexOf(k) !== -1) return "hacked";
  if (k === "sec-lookalike") return "lookalike";
  if (/^sec-exposed-/.test(k)) return "exposed";
  if (/^sec-(spf|dmarc)(-|$)/.test(k)) return "mail";
  if (/^sec-blocklist-\d+$/.test(k)) return "blocklist";
  if (HEADER_KEYS.indexOf(k) !== -1) return "headers";
  if (TLS_KEYS.indexOf(k) !== -1) return "tls";
  if (A11Y_KEYS.indexOf(k) !== -1 || (/^ax-/.test(k) && k !== "ax-clean")) return "a11y";
  return "";
}

function uniq(list, max) {
  const out = [];
  (list || []).forEach((item) => { if (item && out.indexOf(item) === -1) out.push(item); });
  return out.slice(0, max || MAX_ROWS);
}

function listsData(extras, opened, host) {
  const rows = [];
  const sources = (extras && extras.threatLists && extras.threatLists.sources) || [];
  if (opened.some((f) => f.key === "sec-threatlists")) {
    sources.filter((row) => row && row.ok && row.listed).forEach((row) => {
      rows.push(Object.assign({ id: row.source, name: LIST_NAMES[row.source] || row.source, review: String(row.delist || "") }, row.report ? { scan: String(row.report) } : {}));
    });
  }
  if (opened.some((f) => f.key === "sec-safebrowsing")) {
    rows.push({ id: "google", name: "Google Safe Browsing", review: SAFE_BROWSING_REVIEW, scan: "https://transparencyreport.google.com/safe-browsing/search?url=" + encodeURIComponent(host) });
  }
  return { host, lists: rows };
}

function linkedData(extras) {
  const hits = (extras && extras.linkedRisk && extras.linkedRisk.hits) || [];
  return {
    hosts: hits.slice(0, MAX_ROWS).map((hit) => ({ host: String(hit.host || ""), element: String(hit.element || ""), page: String(hit.page || "/") })),
    pages: uniq(hits.map((hit) => hit.page || "/"), MAX_PAGES)
  };
}

function hackData(extras, opened, domain) {
  const signs = (extras && extras.hackSigns) || {};
  const keys = opened.map((f) => f.key);
  const search = (signs.search && signs.search.rows) || [];
  const spamPages = keys.indexOf("sec-seo-spam") !== -1 ? search.filter((row) => (row.signs || []).length) : [];
  const cloaked = keys.indexOf("sec-cloaking") !== -1 ? (signs.pages || []).filter((page) => page.verdict === "spam" || page.verdict === "differs") : [];
  const links = keys.indexOf("sec-spam-links") !== -1 ? (signs.links || []) : [];
  const terms = uniq([].concat(...spamPages.map((row) => row.terms || []), ...cloaked.map((page) => page.terms || []), ...links.map((row) => row.terms || [])).map((term) => String(term).toLowerCase()), MAX_TERMS);
  const pathOf = (f) => (f.pages || []);
  return {
    domain: signs.domain || domain,
    search: keys.indexOf("sec-seo-spam") !== -1,
    cloaking: uniq(cloaked.map((page) => page.path).concat(...opened.filter((f) => f.key === "sec-cloaking").map(pathOf)), MAX_PAGES),
    links: uniq(links.map((row) => row.path).concat(...opened.filter((f) => f.key === "sec-spam-links").map(pathOf)), MAX_PAGES),
    hidden: links.some((row) => row.hidden),
    terms
  };
}

function lookalikeData(extras, domain) {
  const found = (extras && extras.lookalikes) || {};
  return {
    domain: found.domain || domain,
    rows: (found.rows || []).slice(0, MAX_ROWS).map((row) => Object.assign({ domain: String(row.domain || ""), web: !!row.web, mx: !!row.mx }, row.shown ? { shown: String(row.shown) } : {}))
  };
}

function mailData(extras, opened, domain) {
  const dns = (extras && extras.dns) || {};
  const auth = dns.mailAuth || {};
  return {
    domain: dns.domain || domain,
    keys: uniq(opened.map((f) => f.key)),
    spfRecords: auth.spfRecords == null ? -1 : auth.spfRecords,
    lookups: auth.lookups == null ? -1 : auth.lookups
  };
}

function blocklistData(extras, domain) {
  const result = (extras && extras.dns && extras.dns.blocklists) || {};
  return {
    domain: result.domain || domain,
    targets: (result.targets || []).slice(0, 4).map((row) => ({ ip: String(row.ip || ""), mail: (row.hosts || []).length > 0, web: !!row.web })),
    listed: (result.listed || []).slice(0, MAX_ROWS).map((hit) => ({ list: hit.list, target: String(hit.target || "") })),
    lists: blocklists.LISTS.map((list) => ({ id: list.id, name: list.name, zone: list.zone, kind: list.kind }))
  };
}

function a11yData(browser, opened) {
  const axePages = ((browser && browser.axe && browser.axe.pages) || []).filter((page) => (page.violations || []).length).map((page) => page.path);
  const rules = uniq(opened.filter((f) => /^ax-/.test(f.key)).map((f) => f.key.slice(3)), 10);
  return { paths: uniq(axePages.concat(...opened.map((f) => f.pages || [])).concat(["/"]), MAX_PAGES), rules };
}

/**
 * The watch cases for one review. findings: insights findings (with ids); extras: the raw check results the review kept
 * (threatLists, linkedRisk, hackSigns, lookalikes, exposed, dns with mailAuth and blocklists, tls); ctx: { host, base, browser }.
 * A case is written only when one of its findings fails or is at risk. Null when none is.
 */
function build(findings, extras, ctx) {
  const opts = ctx || {};
  const host = String(opts.host || "");
  const domain = (extras && extras.dns && extras.dns.domain) || registryDomain(host) || host;
  const byKind = {};
  (findings || []).filter(isOpen).forEach((f) => {
    const kind = kindOf(f.key);
    if (kind) (byKind[kind] = byKind[kind] || []).push(f);
  });
  const cases = [];
  Object.keys(KIND_TOOLS).forEach((kind) => {
    const opened = byKind[kind];
    if (!opened) return;
    let data;
    if (kind === "lists") data = listsData(extras, opened, host);
    else if (kind === "linked") data = linkedData(extras);
    else if (kind === "hacked") data = hackData(extras, opened, domain);
    else if (kind === "lookalike") data = lookalikeData(extras, domain);
    else if (kind === "exposed") data = { paths: uniq([].concat(...opened.map((f) => f.pages || []))) };
    else if (kind === "mail") data = mailData(extras, opened, domain);
    else if (kind === "blocklist") data = blocklistData(extras, domain);
    else if (kind === "headers") data = { keys: uniq(opened.map((f) => f.key)) };
    else if (kind === "tls") data = Object.assign({ host }, extras && extras.tls && extras.tls.validTo ? { validTo: extras.tls.validTo, daysLeft: extras.tls.daysLeft } : {}, { chain: opened.some((f) => f.key === "sec-tls-chain") });
    else data = a11yData(opts.browser, opened);
    const top = worst(opened);
    cases.push(Object.assign({
      id: "WT-" + String(cases.length + 1).padStart(2, "0"),
      kind,
      findings: opened.map((f) => f.id).filter(Boolean),
      keys: uniq(opened.map((f) => f.key)),
      verdict: top.verdict,
      severity: top.severity || "info",
      tools: KIND_TOOLS[kind].slice(),
      data
    }, kind === "exposed" ? { owners: true } : {}));
  });
  return cases.length ? { host, base: String(opts.base || (host ? "https://" + host : "")), domain, cases } : null;
}

// What a frosted preview keeps: the kind, the verdict and the size of each case, never the hosts, paths or terms.
function preview(watch) {
  if (!watch) return watch;
  const size = (item) => {
    const data = item.data || {};
    return (data.lists || data.hosts || data.rows || data.paths || data.targets || data.keys || []).length;
  };
  return Object.assign({ host: watch.host, cases: (watch.cases || []).map((item) => ({ id: item.id, kind: item.kind, verdict: item.verdict, severity: item.severity, tools: item.tools, count: size(item) })) },
    watch.regressions ? { regressions: watch.regressions.map((item) => ({ id: item.id, key: item.key, kind: item.kind, before: item.before, tools: item.tools })) } : {});
}

/**
 * Regression pins for a paid fix (#3391): every finding the re-review marked fixed, with the cases of the new report
 * that assert it and, for the newer checks, the facts the watch scripts need from the report before the fix.
 * result: fixRereview.beforeAfter(); before and after: the two reports.
 */
function regressions(beforeReport, afterReport, result) {
  const findingsOf = (report) => (report && report.insights && report.insights.findings) || [];
  const casesOf = (report) => (report && report.cases) || [];
  const beforeWatch = (beforeReport && beforeReport.watch && beforeReport.watch.cases) || [];
  const afterIds = new Set(casesOf(afterReport).map((item) => item.id));
  const pins = [];
  ((result && result.items) || []).filter((item) => item.state === "fixed").forEach((item) => {
    const was = findingsOf(beforeReport).find((f) => f.key === item.key);
    const now = findingsOf(afterReport).find((f) => f.key === item.key);
    const ids = new Set([was && was.id, now && now.id].filter(Boolean));
    const linked = casesOf(beforeReport).filter((c) => c.finding && was && c.finding === was.id).map((c) => c.id)
      .concat(casesOf(afterReport).filter((c) => c.finding && now && c.finding === now.id).map((c) => c.id))
      .concat(...findingsOf(beforeReport).filter((f) => ids.has(f.id)).map((f) => f.cases || []));
    const kind = kindOf(item.key);
    const source = kind ? beforeWatch.find((c) => c.kind === kind) : null;
    pins.push(Object.assign({
      id: "RG-" + String(pins.length + 1).padStart(2, "0"),
      key: item.key,
      title: String(item.title || ""),
      before: item.before || "fail",
      after: now ? now.verdict || "pass" : "gone",
      cases: uniq(linked.filter((id) => afterIds.has(id))),
      kind,
      tools: kind ? KIND_TOOLS[kind].slice() : []
    }, item.titleMsg ? { titleMsg: item.titleMsg } : {}, source ? { data: source.data } : {}));
  });
  return pins;
}

// The re-review report with its pins, for the record saved before the client is mailed.
function withRegressions(report, pins) {
  if (!report || !(pins || []).length) return report;
  const host = report.host || "";
  let base = "https://" + host;
  try { base = new URL(report.finalUrl).origin; } catch (error) { /* the host stands in */ }
  const watch = report.watch || { host, base, domain: registryDomain(host) || host, cases: [] };
  return Object.assign({}, report, { watch: Object.assign({}, watch, { regressions: pins }) });
}

module.exports = { build, preview, regressions, withRegressions, kindOf, KIND_TOOLS, HEADER_KEYS, SAFE_BROWSING_REVIEW };
