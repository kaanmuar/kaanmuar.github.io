"use strict";

// Ties every scored finding and browser observation to a proposed case, then ranks the cases by risk.

const IMPACT = { critical: 10, high: 7, medium: 4, low: 2 };
const VERDICT_WEIGHT = { fail: 1, risk: 0.7, person: 0.5, proposed: 0.35, pass: 0.25 };
const VERDICT_ORDER = { proposed: 0, pass: 0, person: 1, risk: 2, fail: 3 };
const SEVERITY_ORDER = { info: 0, low: 1, medium: 2, high: 3, critical: 4 };
const LAYER_IMPACT = {
  Security: 6, Privacy: 6, Commerce: 6, Forms: 5, Functional: 5, Accessibility: 5, Analytics: 4, Performance: 4, Links: 4, Mobile: 4,
  SEO: 3, Content: 3, Visual: 3, Resilience: 3, Internationalization: 3, Media: 3, Platform: 3, API: 3, Compatibility: 2, GEO: 2, Load: 2
};
const LAYER_ORDER = ["Functional", "Forms", "Security", "Privacy", "Accessibility", "Commerce", "Analytics", "Links", "Performance", "Mobile", "Content", "SEO", "GEO", "Visual", "Internationalization", "Resilience", "Compatibility", "Media", "Platform", "API", "Load"];
// Cases that are written for every site. They rank lower until a finding or the browser backs them.
const GENERIC = new Set(["FN-01", "FN-02", "FN-04", "FN-05", "FN-06", "FN-07", "CT-01", "CT-02", "CT-03", "CT-04", "CT-05", "LK-01", "A11Y-01", "A11Y-02", "A11Y-04", "A11Y-06",
  "SEC-01", "SEC-02", "SEC-03", "SEC-04", "SEC-05", "SEC-07", "SEC-08", "SEC-09", "PR-01", "PR-02", "SEO-03", "GEO-01", "GEO-02", "GEO-03", "GEO-04", "GEO-05", "GEO-06",
  "PF-01", "PF-02", "PF-03", "LD-01", "MB-01", "MB-02", "RS-01", "RS-03", "CMP-01", "CMP-02", "VIS-01"]);
// Cases about the start page alone. A finding on other pages belongs to the site-wide case instead.
const HOME_ONLY = new Set(["FN-02", "FN-05", "CT-05", "A11Y-02"]);
// Retired case ids that findings may still name, and the case that now covers them.
const ALIASES = { "I18N-01": "FN-04", "VIS-02": "MB-01", "A11Y-03": "FN-03", "SEO-01": "CT-03", "LD-02": "LD-01", "LD-03": "LD-01", "FM-02": "FM-01", "LK-02": "LK-01", "RS-02": "PF-01" };
const AXE_SEVERITY = { critical: "critical", serious: "high", moderate: "medium", minor: "low" };
// axe-core rules that an existing case already asserts. The rule's selectors join that case.
const AXE_CASE = {
  "image-alt": "A11Y-01", "role-img-alt": "A11Y-01", "frame-title": "A11Y-05", "html-has-lang": "FN-04", "html-lang-valid": "FN-04", "landmark-one-main": "A11Y-02", "bypass": "A11Y-02",
  "page-has-heading-one": "FN-03", "heading-order": "FN-03", "label": "FM-01", "select-name": "FM-01", "color-contrast": "A11Y-04", "button-name": "FN-05", "document-title": "FN-02", "meta-viewport": "MB-01"
};
const AXE_KEYS = { "color-contrast": "a11y-contrast", "label": "a11y-labels", "image-alt": "a11y-alt", "frame-title": "a11y-frames", "html-has-lang": "a11y-lang", "landmark-one-main": "a11y-main", "tabindex": "a11y-tabindex", "meta-viewport": "a11y-zoom", "page-has-heading-one": "a11y-h1", "target-size": "a11y-targets" };
const MAX_AXE = 10;
const MAX_RETEST = 24;

function worse(a, b) {
  if (!a) return true;
  const va = VERDICT_ORDER[a.verdict] || 0;
  const vb = VERDICT_ORDER[b.verdict] || 0;
  return vb > va || (vb === va && (SEVERITY_ORDER[b.severity] || 0) > (SEVERITY_ORDER[a.severity] || 0));
}

function open(verdict) {
  return verdict === "fail" || verdict === "risk" || verdict === "person";
}

function hostOf(origin) {
  try { return new URL(origin).host; } catch (error) { return String(origin || "").replace(/^https?:\/\//, "").replace(/\/.*$/, ""); }
}

function siteLabel(host, path) {
  const clean = String(path || "/").split("#")[0];
  return host + (clean === "/" ? "" : clean);
}

function listPaths(host, paths, max) {
  const shown = paths.slice(0, max || 3).map((path) => siteLabel(host, path));
  const more = paths.length - shown.length;
  return shown.join(", ") + (more > 0 ? " and " + more + " more" : "");
}

function addPages(item, pages) {
  const all = (item.pages || []).slice();
  (pages || []).forEach((path) => { if (path && all.indexOf(path) === -1) all.push(path); });
  if (all.length) item.pages = all.slice(0, 12);
}

function sentence(text) {
  const value = String(text || "").trim();
  if (!value) return "";
  return /[.!?]$/.test(value) ? value : value + ".";
}

function axeRules(browser) {
  const pages = (browser && browser.ok && browser.axe && browser.axe.ran !== false && browser.axe.pages) || [];
  const rules = new Map();
  pages.forEach((page) => {
    (page.violations || []).forEach((rule) => {
      const row = rules.get(rule.id) || { id: rule.id, impact: rule.impact || "minor", help: rule.help || rule.id, helpUrl: rule.helpUrl || "", nodes: 0, pages: [], targets: [] };
      row.nodes += rule.nodes || 0;
      if (row.pages.indexOf(page.path) === -1) row.pages.push(page.path);
      (rule.targets || []).forEach((target) => { if (target && row.targets.length < 4 && row.targets.indexOf(target) === -1) row.targets.push(target); });
      if ((SEVERITY_ORDER[AXE_SEVERITY[rule.impact]] || 0) > (SEVERITY_ORDER[AXE_SEVERITY[row.impact]] || 0)) row.impact = rule.impact;
      rules.set(rule.id, row);
    });
  });
  return [...rules.values()].sort((a, b) => (SEVERITY_ORDER[AXE_SEVERITY[b.impact]] || 0) - (SEVERITY_ORDER[AXE_SEVERITY[a.impact]] || 0) || b.nodes - a.nodes);
}

function raise(item, verdict, severity) {
  if (worse({ verdict: item.verdict || "proposed", severity: item.severity || "info" }, { verdict, severity })) Object.assign(item, { verdict, severity });
}

function axeCases(cases, byId, browser, host, fw) {
  const version = (browser.axe && browser.axe.version) || "";
  const added = [];
  axeRules(browser).forEach((rule) => {
    const severity = AXE_SEVERITY[rule.impact] || "low";
    const seen = "axe-core" + (version ? " " + version : "") + " found " + rule.nodes + " element" + (rule.nodes === 1 ? "" : "s") + " breaking " + rule.id + " (" + rule.impact + ") on " + listPaths(host, rule.pages) +
      (rule.targets.length ? ", for example " + rule.targets.slice(0, 3).join(", ") : "") + ".";
    const keys = ["ax-" + rule.id].concat(AXE_KEYS[rule.id] || []);
    const existing = byId.get(AXE_CASE[rule.id]);
    if (existing) {
      existing.why = sentence(existing.why) + " " + seen;
      existing.selectors = [...new Set((existing.selectors || []).concat(rule.targets))].slice(0, 6);
      existing.keys = (existing.keys || []).concat(keys);
      addPages(existing, rule.pages);
      raise(existing, "fail", severity);
      return;
    }
    if (added.length >= MAX_AXE) return;
    added.push({
      id: "AXE-" + String(added.length + 1).padStart(2, "0"),
      status: "proposed",
      layer: "Accessibility",
      title: rule.help + " on " + siteLabel(host, rule.pages[0]),
      why: seen + " The case reruns axe-core with only the " + rule.id + " rule on each of those pages and expects no violation." + (rule.helpUrl ? " Rule: " + rule.helpUrl : ""),
      fw,
      also: ["axe-core"],
      verdict: "fail",
      severity,
      path: rule.pages[0],
      pages: rule.pages.slice(0, 12),
      selectors: rule.targets,
      keys
    });
  });
  return cases.concat(added);
}

// The overflow findings carry the wording; the cases keep the elements a script should measure.
function layoutEvidence(byId, browser) {
  [["MB-01", browser.mobile], ["MB-02", browser.tablet]].forEach(([id, view]) => {
    const item = byId.get(id);
    if (!item || !view || view.error || !(view.overflow > 2)) return;
    if ((view.offenders || []).length) item.selectors = view.offenders.slice(0, 4);
    raise(item, "fail", id === "MB-01" ? "medium" : "low");
  });
}

function retestCase(finding, index, host, fw) {
  const person = finding.verdict === "person";
  const where = (finding.pages || []).length ? " on " + listPaths(host, finding.pages, 2) : " on " + host;
  return {
    id: "RT-" + String(index + 1).padStart(2, "0"),
    status: "proposed",
    layer: finding.area,
    title: (person ? "Check by hand" : "Retest") + where + ": " + finding.title,
    why: sentence(finding.evidence) + (finding.fix ? " Expected after the fix: " + sentence(finding.fix) : "") + (person ? " A person confirms it, because a script cannot judge it alone." : " The case fails while the finding is still true."),
    fw,
    verdict: finding.verdict,
    severity: finding.severity,
    finding: finding.id,
    path: (finding.pages || [])[0],
    pages: (finding.pages || []).slice(0, 12)
  };
}

function score(item) {
  const verdict = item.verdict || "proposed";
  const impact = verdict !== "pass" && IMPACT[item.severity] ? IMPACT[item.severity] : (LAYER_IMPACT[item.layer] || 3);
  const reach = 1 + Math.min(0.5, Math.log2(1 + (item.pages || []).length) / 8);
  const evidence = item.finding || (item.selectors || []).length ? 1 : GENERIC.has(item.id) ? 0.6 : 0.8;
  return Math.min(100, Math.round(impact * 10 * (VERDICT_WEIGHT[verdict] || 0.35) * reach * evidence));
}

function priorityOf(risk) {
  return risk >= 45 ? "P1" : risk >= 22 ? "P2" : risk >= 9 ? "P3" : "P4";
}

// cases: from propose() and domainCases(). findings: insights findings with ids. browser: the browser pass.
function refine(cases, options) {
  const opts = options || {};
  const host = hostOf(opts.origin);
  const fw = opts.fw || (cases[0] && cases[0].fw) || [];
  let list = cases.map((item) => Object.assign({}, item));
  const byId = new Map(list.map((item) => [item.id, item]));
  const browser = opts.browser && opts.browser.ok ? opts.browser : null;
  if (browser) {
    list = axeCases(list, byId, browser, host, fw);
    list.forEach((item) => byId.set(item.id, item));
    layoutEvidence(byId, browser);
  }
  const startPath = opts.startPath || "/";
  const fits = (item, finding) => !HOME_ONLY.has(item.id) || !(finding.pages || []).length || finding.pages.indexOf(startPath) !== -1;
  const byKey = new Map();
  list.forEach((item) => (item.keys || []).forEach((key) => { if (!byKey.has(key)) byKey.set(key, item); }));
  const orphans = [];
  const best = new Map();
  (opts.findings || []).forEach((finding) => {
    const targets = new Set();
    (finding.cases || []).forEach((id) => { const target = byId.get(ALIASES[id] || id); if (target && fits(target, finding)) targets.add(target); });
    if (byKey.has(finding.key)) targets.add(byKey.get(finding.key));
    if (!targets.size) {
      if (open(finding.verdict)) orphans.push(finding);
      return;
    }
    targets.forEach((item) => {
      if (open(finding.verdict)) addPages(item, finding.pages);
      if (worse(best.get(item), finding)) best.set(item, finding);
    });
  });
  best.forEach((finding, item) => {
    if (!item.verdict || worse({ verdict: item.verdict, severity: item.severity || "info" }, finding)) Object.assign(item, { verdict: finding.verdict, severity: finding.severity });
    item.finding = finding.id;
    const told = /^ax-/.test(finding.key || "") && (item.keys || []).indexOf(finding.key) !== -1;
    if (open(finding.verdict) && finding.evidence && !told && String(item.why || "").indexOf(finding.evidence) === -1) item.why = sentence(item.why) + " Seen on " + host + ": " + sentence(finding.evidence);
  });
  orphans.sort((a, b) => (a.rank || 999) - (b.rank || 999)).slice(0, MAX_RETEST).forEach((finding, index) => list.push(retestCase(finding, index, host, fw)));
  list.forEach((item, index) => {
    item.order = index;
    if (!item.path && (item.pages || []).length && item.verdict && item.verdict !== "pass") item.path = item.pages[0];
    delete item.keys;
    Object.keys(item).forEach((key) => { if (item[key] === undefined) delete item[key]; });
    item.risk = score(item);
    item.priority = priorityOf(item.risk);
  });
  const layerRank = (layer) => { const at = LAYER_ORDER.indexOf(layer); return at === -1 ? LAYER_ORDER.length : at; };
  list.sort((a, b) => b.risk - a.risk || (VERDICT_ORDER[b.verdict] || 0) - (VERDICT_ORDER[a.verdict] || 0) || layerRank(a.layer) - layerRank(b.layer) || a.order - b.order);
  return list.map((item, index) => {
    delete item.order;
    item.n = index + 1;
    return item;
  });
}

function countLayers(cases) {
  const byLayer = {};
  (cases || []).forEach((item) => { byLayer[item.layer] = (byLayer[item.layer] || 0) + 1; });
  return byLayer;
}

module.exports = { refine, countLayers, score, priorityOf, ALIASES, siteLabel };
