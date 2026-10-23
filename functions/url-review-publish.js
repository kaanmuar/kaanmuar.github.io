/* Which user reviews go public, and in what shape.

   The daily Live Reports job (scripts/auto-live-reports.js) reads GET /publishable on reviewUrl.
   It gets the newest complete review per host since a date, already filtered and trimmed: no
   requester name, email, reason, IP, device, page list, log, or engine internals ever leave here.
   A host whose owner asked to be left out goes in Firestore url_review_unlisted/<host>; an asker who
   ticked "Don't publish" leaves `unlisted: true` on that one record. */

const MIN_PAGES = 2;
const OWN_HOSTS = ["carlosandmunoz.com", "kaanmuar.github.io", "carlosm-interactive-cv.web.app", "carlosm-interactive-cv.firebaseapp.com"];
const RESERVED = /(^|\.)(localhost|local|test|invalid|example|internal|home\.arpa|onion)$|^example\.(com|net|org)$/i;

function bare(host) {
  return String(host || "").toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
}

function under(host, list) {
  const h = bare(host);
  return list.some((item) => { const x = bare(item); return x && (h === x || h.endsWith("." + x)); });
}

// Returns why a record is held back, or "" when it can go public.
function heldReason(record, unlisted) {
  const report = (record && record.report) || {};
  const host = bare(report.host);
  if ((record.status || report.status || "complete") !== "complete" || report.status === "stopped") return "not-complete";
  if (!host || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(host) || /^\d+(\.\d+){3}$/.test(host)) return "not-public";
  if (RESERVED.test(host) || under(host, OWN_HOSTS)) return "own-or-test";
  if (record.test === true) return "test-run";
  if (record.unlisted === true) return "asker-opted-out";
  if (under(host, unlisted || [])) return "unlisted";
  const score = report.insights && report.insights.score;
  if (!score || typeof score.overall !== "number" || !score.areas) return "no-score";
  if ((report.insights.findings || []).some((f) => f.key === "sec-safebrowsing" && f.verdict === "fail")) return "safe-browsing-flagged";
  const limits = report.limits || {};
  if (limits.timedOut) return "timed-out";
  if ((limits.pagesRead || (report.pages || []).length) < MIN_PAGES) return "too-few-pages";
  const start = (report.pages || [])[0] || {};
  if (start.challenge || start.error || !(start.status >= 200 && start.status < 300)) return "start-page-blocked";
  const shell = (report.insights.findings || []).find((f) => f.key === "geo-js-only" && f.verdict === "fail");
  if (shell) return "javascript-shell";
  return "";
}

function pick(obj, keys) {
  const out = {};
  keys.forEach((k) => { if (obj && obj[k] !== undefined) out[k] = obj[k]; });
  return out;
}

function cleanUrl(value) {
  try { const u = new URL(value); return u.origin + u.pathname; } catch (error) { return ""; }
}

// Only what scripts/build-live-reports.js and the social cards read.
function publicReport(report) {
  const ins = report.insights || {};
  const geo = ins.geo || {};
  const psi = report.pagespeed || {};
  const field = psi.field || {};
  const metric = (m) => m ? { p75: m.p75, category: m.category } : null;
  return {
    id: report.id,
    fetchedAt: report.fetchedAt,
    finalUrl: cleanUrl(report.finalUrl),
    host: String(report.host || "").toLowerCase(),
    limits: { pagesRead: (report.limits && report.limits.pagesRead) || (report.pages || []).length },
    technologies: (report.technologies || []).map((t) => pick(t, ["name", "group"])),
    counts: { cases: (report.counts && report.counts.cases) || 0, byLayer: (report.counts && report.counts.byLayer) || {} },
    observed: { lang: (report.observed && report.observed.lang) || "", signals: pick((report.observed && report.observed.signals) || {}, ["hreflang"]) },
    pagespeed: psi.ok ? {
      ok: true,
      score: psi.score,
      lab: psi.lab ? pick(psi.lab, ["lcp", "tbt", "cls"]) : null,
      field: psi.field ? { overall: field.overall || "", lcp: metric(field.lcp), inp: metric(field.inp), cls: metric(field.cls) } : null
    } : { ok: false },
    insights: {
      score: ins.score,
      summary: ins.summary || "",
      findings: (ins.findings || []).map((f) => pick(f, ["key", "verdict", "area", "severity", "rank", "title", "evidence", "fix", "effort"])),
      geo: {
        crawlers: (geo.crawlers || []).map((c) => pick(c, ["role", "allowed", "token"])),
        llms: { ok: !!(geo.llms && geo.llms.ok) },
        schemaTypes: geo.schemaTypes || [],
        aiView: { words: (geo.aiView && geo.aiView.words) || 0 }
      },
      seo: { schemaTypes: (ins.seo && ins.seo.schemaTypes) || [] },
      security: { headers: ((ins.security && ins.security.headers) || []).map((h) => pick(h, ["label", "state"])) },
      analytics: { tags: ((ins.analytics && ins.analytics.tags) || []).map((t) => pick(t, ["name"])), consentTools: (ins.analytics && ins.analytics.consentTools) || [] },
      fixkit: { hosting: (ins.fixkit && ins.fixkit.hosting) || "" }
    }
  };
}

// Newest publishable review per host, oldest first, plus a count of what was held and why.
function selectPublishable(records, unlisted) {
  const held = {};
  const byHost = new Map();
  for (const record of records) {
    const reason = heldReason(record, unlisted);
    if (reason) { held[reason] = (held[reason] || 0) + 1; continue; }
    const host = bare(record.report.host);
    const prev = byHost.get(host);
    if (!prev || String(record.createdAt) > String(prev.createdAt)) byHost.set(host, record);
  }
  const reports = [...byHost.values()]
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
    .map((r) => ({ createdAt: r.createdAt, source: r.source === "sweep" ? "sweep" : "request", report: publicReport(r.report) }));
  return { reports, held };
}

module.exports = { MIN_PAGES, heldReason, publicReport, selectPublishable, bare };
