"use strict";

/* Deep attack-source check (#3946): bought once on one paid report (addon "deep"), run on demand.
   It reads the two sources that are not part of the plain attack-source read: certificate-transparency anomalies
   (CertSpotter, one key) and breach-news matches (GDELT). The result is kept on the report as `deep`, apart from
   `report.targeted`, and says only what those sources returned. */

const targeted = require("./url-review-targeted");
const { english } = require("./url-review-findings-en");

const SOURCES = ["CertSpotter CT", "GDELT Project"];
const HOST_RE = /^[a-z0-9.-]+\.[a-z]{2,}$/;

function bought(record) {
  return !!record && Array.isArray(record.addons) && record.addons.indexOf("deep") !== -1;
}

function done(record) {
  return !!(record && record.deep && record.deep.checkedAt);
}

function hostOf(record) {
  return String((record && record.report && record.report.host) || "").toLowerCase().replace(/\.$/, "");
}

// The same finding shape the report keeps: English text, plus the messages the page translates.
function collector(findings) {
  return (area, verdict, severity, key, title, evidence, fix, opts) => {
    const extra = opts || {};
    const msg = {};
    const text = (value, field) => {
      if (!value || typeof value !== "object") return value || "";
      msg[field] = value;
      return english(value);
    };
    const finding = {
      key,
      area,
      verdict,
      severity: verdict === "pass" ? "info" : severity,
      title: text(title, "title"),
      evidence: text(evidence, "evidence"),
      fix: text(fix, "fix"),
      effort: extra.effort || "hours",
      count: extra.count == null ? 0 : extra.count
    };
    if (Object.keys(msg).length) finding.msg = msg;
    findings.push(finding);
  };
}

const RANK = { info: 0, medium: 1, high: 2, critical: 3 };

async function run(record, options) {
  const opts = options || {};
  const host = hostOf(record);
  if (!HOST_RE.test(host)) return null;
  const now = Number.isFinite(opts.now) ? opts.now : Date.now();
  const fetchImpl = opts.fetch === false ? null : (opts.fetch || global.fetch);
  const key = opts.certspotterKey || (opts.env && opts.env.CERTSPOTTER_KEY) || "";

  const [feeds, certCheck] = await Promise.all([
    targeted.loadFeeds(opts).catch(() => null),
    // No TLS certificate is passed: the chain and validity checks belong to the plain read.
    targeted.checkCertificates(host, null, key, fetchImpl).catch(() => ({ anomalies: [], ctChecked: false, ctIssuances: 0 }))
  ]);
  const breachNews = targeted.matchBreachNews(host, feeds && feeds.gdelt);

  const sourcesRead = [];
  const sourcesSkipped = [];
  if (feeds && feeds.gdelt && feeds.gdelt.mentions) sourcesRead.push("GDELT Project");
  else sourcesSkipped.push("GDELT Project");
  if (certCheck.ctChecked) sourcesRead.push("CertSpotter CT");
  else sourcesSkipped.push(key ? "CertSpotter CT" : "CertSpotter CT (no key)");

  const findings = [];
  targeted.addFindings({ host, certCheck, breachNews, sourcesRead }, collector(findings));
  const level = findings.reduce((top, item) => (RANK[item.severity] > RANK[top] ? item.severity : top), "info");

  return {
    checkedAt: new Date(now).toISOString(),
    host,
    sourcesRead,
    sourcesSkipped,
    attributions: sourcesRead.indexOf("GDELT Project") !== -1 ? ["GDELT Project (https://www.gdeltproject.org/)"] : [],
    certCheck: { anomalies: certCheck.anomalies, ctChecked: certCheck.ctChecked, ctIssuances: certCheck.ctIssuances },
    breachNews,
    findings,
    level
  };
}

module.exports = { SOURCES, bought, done, hostOf, run };
