"use strict";

/* Attack-source evidence PDF for paid reports only (#3925). */

const targeted = require("./url-review-targeted");
const watchCases = require("./url-review-watch");
const findingsCopy = require("./url-review-findings-copy");
const customerMail = require("./url-review-customer-mail");

const FINDING_KEYS = watchCases.TARGETED_KEYS.slice();

// Names must match `sourcesRead` in url-review-targeted.js — never invent others.
const SOURCE_HINTS = {
  "sec-kev": ["CISA KEV", "FIRST EPSS"],
  "sec-osv": ["OSV.dev", "FIRST EPSS"],
  "sec-drop": ["Network DROP"],
  "sec-feodo": ["Feodo Tracker"],
  "sec-breach-news": ["GDELT Project"],
  "sec-cert-anomaly": ["CertSpotter CT"],
  "sec-targeted": []
};

const LABEL = {
  en: {
    title: "Attack-source evidence",
    host: "Host",
    runDate: "Review run (UTC)",
    checksRead: "Sources checked",
    colFinding: "Finding",
    colLevel: "Level",
    colSource: "Source",
    colTime: "Observed (UTC)",
    colDetail: "Detail",
    attribution: "Attribution",
    footer: "QA-lab URL Review · paid report only",
    file: "attack-evidence",
    sev: { critical: "critical", high: "high", medium: "medium", low: "low", info: "info" }
  },
  es: {
    title: "Evidencia de fuentes de ataque",
    host: "Sitio",
    runDate: "Revisión (UTC)",
    checksRead: "Fuentes consultadas",
    colFinding: "Hallazgo",
    colLevel: "Nivel",
    colSource: "Fuente",
    colTime: "Observado (UTC)",
    colDetail: "Detalle",
    attribution: "Atribución",
    footer: "QA-lab URL Review · solo informe de pago",
    file: "evidencia-ataque",
    sev: { critical: "crítico", high: "alto", medium: "medio", low: "bajo", info: "informativo" }
  },
  pt: {
    title: "Evidências de fontes de ataque",
    host: "Site",
    runDate: "Revisão (UTC)",
    checksRead: "Fontes consultadas",
    colFinding: "Achado",
    colLevel: "Nível",
    colSource: "Fonte",
    colTime: "Observado (UTC)",
    colDetail: "Detalhe",
    attribution: "Atribuição",
    footer: "QA-lab URL Review · apenas relatório pago",
    file: "evidencia-ataque",
    sev: { critical: "crítico", high: "alto", medium: "médio", low: "baixo", info: "informativo" }
  },
  de: {
    title: "Angriffsquellen-Nachweise",
    host: "Website",
    runDate: "Prüfung (UTC)",
    checksRead: "Gelesene Quellen",
    colFinding: "Befund",
    colLevel: "Stufe",
    colSource: "Quelle",
    colTime: "Beobachtet (UTC)",
    colDetail: "Einzelheiten",
    attribution: "Quellenangabe",
    footer: "QA-lab URL Review · nur kostenpflichtiger Bericht",
    file: "angriffs-nachweis",
    sev: { critical: "kritisch", high: "hoch", medium: "mittel", low: "niedrig", info: "Info" }
  },
  fr: {
    title: "Preuves des sources d’attaque",
    host: "Site",
    runDate: "Analyse (UTC)",
    checksRead: "Sources lues",
    colFinding: "Constat",
    colLevel: "Niveau",
    colSource: "Source",
    colTime: "Observé (UTC)",
    colDetail: "Détail",
    attribution: "Attribution",
    footer: "QA-lab URL Review · rapport payant uniquement",
    file: "preuves-attaque",
    sev: { critical: "critique", high: "élevé", medium: "moyen", low: "faible", info: "informatif" }
  },
  it: {
    title: "Evidenze dalle fonti di attacco",
    host: "Sito",
    runDate: "Revisione (UTC)",
    checksRead: "Fonti lette",
    colFinding: "Rilievo",
    colLevel: "Livello",
    colSource: "Fonte",
    colTime: "Osservato (UTC)",
    colDetail: "Dettaglio",
    attribution: "Attribuzione",
    footer: "QA-lab URL Review · solo rapporto a pagamento",
    file: "evidenza-attacco",
    sev: { critical: "critico", high: "alto", medium: "medio", low: "basso", info: "informativo" }
  }
};

const FINDING_COPY = {};

function label(lang, key) {
  const code = customerMail.langOf(lang);
  const row = LABEL[code] || LABEL.en;
  return row[key] == null ? (LABEL.en[key] || key) : row[key];
}

function sevLabel(lang, severity) {
  const code = customerMail.langOf(lang);
  const row = (LABEL[code] || LABEL.en).sev || LABEL.en.sev;
  const key = String(severity || "low").toLowerCase();
  return row[key] || LABEL.en.sev[key] || key;
}

function findingLine(lang, item, part) {
  const code = customerMail.langOf(lang);
  if (!FINDING_COPY[code]) FINDING_COPY[code] = findingsCopy.forLang(code);
  return FINDING_COPY[code].line(item && item.msg && item.msg[part], String((item && item[part]) || ""));
}

function toUtcIso(value) {
  if (!value) return "";
  const when = new Date(value);
  if (!isNaN(when)) return when.toISOString();
  const raw = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw + "T00:00:00.000Z";
  return raw.slice(0, 19) + (raw.endsWith("Z") ? "" : "Z");
}

function sourcesForKey(key, targeted) {
  const read = Array.isArray(targeted && targeted.sourcesRead) ? targeted.sourcesRead : [];
  if (!read.length) return [];
  if (key === "sec-targeted") return read.slice();
  const hints = SOURCE_HINTS[key] || [];
  return hints.filter((name) => read.indexOf(name) !== -1);
}

function timeForKey(key, targeted) {
  const checked = toUtcIso(targeted && targeted.checkedAt);
  if (!targeted) return checked;
  if (key === "sec-kev") {
    const dates = (targeted.kevHits || []).map((row) => row.added).filter(Boolean).sort();
    if (dates.length) return toUtcIso(dates[0]);
  }
  if (key === "sec-feodo" && targeted.feodoHit && targeted.feodoHit.lastOnline) {
    return toUtcIso(targeted.feodoHit.lastOnline);
  }
  if (key === "sec-breach-news") {
    const stamps = (targeted.breachNews || []).map((row) => row.seen || row.date).filter(Boolean).sort();
    if (stamps.length) return toUtcIso(stamps[0]);
  }
  if (key === "sec-cert-anomaly" && targeted.certCheck && Array.isArray(targeted.certCheck.anomalies)) {
    const stamps = targeted.certCheck.anomalies.map((row) => row.seen || row.at).filter(Boolean).sort();
    if (stamps.length) return toUtcIso(stamps[0]);
  }
  const items = (targeted.items || []).filter((row) => row && row.last_seen);
  if (items.length) {
    const stamps = items.map((row) => row.last_seen).sort();
    return toUtcIso(stamps[0]);
  }
  return checked;
}

function attackFindings(report) {
  const findings = report && report.insights && Array.isArray(report.insights.findings) ? report.insights.findings : [];
  return findings.filter((row) => row && FINDING_KEYS.indexOf(String(row.key || "")) !== -1);
}

function rows(record, lang) {
  const report = (record && record.report) || {};
  const targetedBlock = report.targeted;
  if (!targetedBlock || typeof targetedBlock !== "object") return [];
  return attackFindings(report).map((finding) => ({
    key: finding.key,
    title: findingLine(lang, finding, "title"),
    level: finding.severity || "low",
    evidence: findingLine(lang, finding, "evidence"),
    source: sourcesForKey(finding.key, targetedBlock).join(", "),
    time: timeForKey(finding.key, targetedBlock)
  }));
}

function paidReport(record) {
  return !!record && record.paid === true && record.status !== "stopped";
}

function meta(record) {
  if (!paidReport(record)) {
    return { ok: false, reason: "This evidence PDF is only for a paid report.", rows: [] };
  }
  const list = rows(record, record.lang);
  if (!list.length) {
    return { ok: false, reason: "This report has no attack-source findings to list.", rows: [] };
  }
  return { ok: true, rows: list };
}

function checksRead(targetedBlock) {
  return targeted.lines(targetedBlock || null);
}

const PDF_STYLE =
  "@page{margin:14mm 16mm 18mm}body{margin:0;font-family:Inter,'Helvetica Neue',Arial,sans-serif;font-size:10pt;color:#243436;line-height:1.45}" +
  "h1{font-family:Georgia,'Times New Roman',serif;font-size:22pt;font-weight:normal;margin:0 0 4mm;color:#0c3539}" +
  ".meta{font-size:9pt;color:#5a7174;margin:0 0 6mm}.meta code{font-family:Menlo,Consolas,monospace;font-size:8.5pt}" +
  "h2{font-size:9pt;letter-spacing:.12em;text-transform:uppercase;color:#16656c;margin:7mm 0 3mm}" +
  "table{width:100%;border-collapse:collapse;font-size:9pt}th,td{border:1px solid #d4e2e3;padding:2.2mm 2.6mm;vertical-align:top;text-align:left}" +
  "th{background:#eef6f7;font-size:8pt;text-transform:uppercase;letter-spacing:.06em;color:#3f5c60}" +
  "tr:nth-child(even) td{background:#fafcfc}.lvl{font-weight:700;text-transform:uppercase;font-size:8pt;letter-spacing:.04em}" +
  ".checks{font-size:9pt;color:#3f5c60;margin:0 0 2mm}.foot{margin-top:6mm;padding-top:3mm;border-top:1px solid #d4e2e3;font-size:8pt;color:#5a7174}";

function page(record, options) {
  const opts = options || {};
  const lang = customerMail.langOf(opts.lang || (record && record.lang));
  const report = (record && record.report) || {};
  const targetedBlock = report.targeted || {};
  const list = rows(record, lang);
  const runAt = toUtcIso(report.fetchedAt || targetedBlock.checkedAt || (record && record.createdAt));
  const host = String(report.host || "");
  const id = String(report.id || (record && record.id) || "");
  const checks = checksRead(targetedBlock);
  const attr = Array.isArray(targetedBlock.attributions) ? targetedBlock.attributions : [];
  const tableRows = list.map((row) =>
    "<tr><td>" + customerMail.esc(row.title) + "</td><td class=\"lvl\">" + customerMail.esc(sevLabel(lang, row.level)) +
    "</td><td>" + customerMail.esc(row.source) + "</td><td>" + customerMail.esc(row.time) + "</td><td>" + customerMail.esc(row.evidence) + "</td></tr>"
  ).join("");
  const html = "<!DOCTYPE html><html lang=\"" + lang + "\"><head><meta charset=\"utf-8\"><title>" +
    customerMail.esc(label(lang, "title")) + " · " + customerMail.esc(host) + "</title><style>" + PDF_STYLE + "</style></head><body>" +
    "<h1>" + customerMail.esc(label(lang, "title")) + "</h1>" +
    "<p class=\"meta\"><strong>" + customerMail.esc(label(lang, "host")) + ":</strong> " + customerMail.esc(host) +
    " · <strong>" + customerMail.esc(label(lang, "runDate")) + ":</strong> " + customerMail.esc(runAt) +
    (id ? " · <code>" + customerMail.esc(id) + "</code>" : "") + "</p>" +
    "<h2>" + customerMail.esc(label(lang, "checksRead")) + "</h2>" +
    checks.map((line) => "<p class=\"checks\">" + customerMail.esc(line) + "</p>").join("") +
    "<table><thead><tr><th>" + customerMail.esc(label(lang, "colFinding")) + "</th><th>" + customerMail.esc(label(lang, "colLevel")) +
    "</th><th>" + customerMail.esc(label(lang, "colSource")) + "</th><th>" + customerMail.esc(label(lang, "colTime")) +
    "</th><th>" + customerMail.esc(label(lang, "colDetail")) + "</th></tr></thead><tbody>" + tableRows + "</tbody></table>" +
    (attr.length ? "<div class=\"foot\"><strong>" + customerMail.esc(label(lang, "attribution")) + ":</strong> " +
      customerMail.esc(attr.join(" · ")) + "</div>" : "") +
    "<div class=\"foot\">" + customerMail.esc(label(lang, "footer")) + "</div></body></html>";
  const slug = host.replace(/[^a-z0-9.-]/gi, "-").replace(/-+/g, "-").slice(0, 60) || "site";
  return { html, filename: "qa-lab-" + slug + "-" + label(lang, "file") + ".pdf" };
}

module.exports = {
  FINDING_KEYS,
  SOURCE_HINTS,
  rows,
  meta,
  page,
  paidReport,
  checksRead,
  sourcesForKey
};