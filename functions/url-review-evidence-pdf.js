"use strict";

/* Attack-source evidence PDF for paid reports only (#3925). */

const targeted = require("./url-review-targeted");
const watchCases = require("./url-review-watch");
const findingsCopy = require("./url-review-findings-copy");
const customerMail = require("./url-review-customer-mail");
const playbooks = require("./url-review-playbooks");

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
    sourcesReadLabel: "Read",
    sourcesSkippedLabel: "Skipped",
    noSources: "No source answered in time.",
    deepTag: "Deep check",
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
    sourcesReadLabel: "Leídas",
    sourcesSkippedLabel: "Omitidas",
    noSources: "Ninguna fuente respondió a tiempo.",
    deepTag: "Revisión profunda",
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
    sourcesReadLabel: "Lidas",
    sourcesSkippedLabel: "Ignoradas",
    noSources: "Nenhuma fonte respondeu a tempo.",
    deepTag: "Verificação profunda",
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
    sourcesReadLabel: "Gelesen",
    sourcesSkippedLabel: "Übersprungen",
    noSources: "Keine Quelle hat rechtzeitig geantwortet.",
    deepTag: "Tiefenprüfung",
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
    sourcesReadLabel: "Lues",
    sourcesSkippedLabel: "Ignorées",
    noSources: "Aucune source n’a répondu à temps.",
    deepTag: "Contrôle approfondi",
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
    sourcesReadLabel: "Lette",
    sourcesSkippedLabel: "Saltate",
    noSources: "Nessuna fonte ha risposto in tempo.",
    deepTag: "Controllo approfondito",
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

// "2026-11-19T00:00:00.000Z" wraps badly in a table cell; the column and the header already say UTC.
function stamp(value) {
  const iso = toUtcIso(value);
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(iso);
  return m ? m[1] + " " + m[2] : iso;
}

// The sources read and skipped, in the report's language. targeted.lines() is English only.
function sourceLines(lang, block) {
  const read = Array.isArray(block && block.sourcesRead) ? block.sourcesRead : [];
  const skipped = Array.isArray(block && block.sourcesSkipped) ? block.sourcesSkipped : [];
  if (!read.length && !skipped.length) return [label(lang, "noSources")];
  const out = [];
  if (read.length) out.push(label(lang, "sourcesReadLabel") + ": " + read.join(", ") + ".");
  if (skipped.length) out.push(label(lang, "sourcesSkippedLabel") + ": " + skipped.join(", ") + ".");
  return out;
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

// The Deep check bought on this report (#3946): its findings that are hits, tagged so they read apart from the plain read.
function deepRows(record, lang) {
  const block = record && record.deep;
  if (!block || typeof block !== "object" || !Array.isArray(block.findings)) return [];
  const tag = label(lang, "deepTag");
  return block.findings.filter((finding) => finding && finding.verdict !== "pass" && FINDING_KEYS.indexOf(String(finding.key || "")) !== -1).map((finding) => ({
    key: finding.key,
    deep: true,
    title: tag + ": " + findingLine(lang, finding, "title"),
    level: finding.severity || "low",
    evidence: findingLine(lang, finding, "evidence"),
    source: sourcesForKey(finding.key, block).join(", "),
    time: stamp(timeForKey(finding.key, block))
  }));
}

function rows(record, lang) {
  const report = (record && record.report) || {};
  const targetedBlock = report.targeted;
  const base = !targetedBlock || typeof targetedBlock !== "object" ? [] : attackFindings(report).map((finding) => ({
    key: finding.key,
    title: findingLine(lang, finding, "title"),
    level: finding.severity || "low",
    evidence: findingLine(lang, finding, "evidence"),
    source: sourcesForKey(finding.key, targetedBlock).join(", "),
    time: stamp(timeForKey(finding.key, targetedBlock))
  }));
  return base.concat(deepRows(record, lang));
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

// Trust grade block (#3958). Non-English strings are machine-assisted; native review is tracked in #3952.
const TRUST_LABEL = {
  en: { title: "Customer trust grade", points: "points", fixFirst: "Fix these first", cost: "costs", helmet: "Helmet setup for the missing headers (Node and Express)", capped: "A planted backdoor caps the grade at F." },
  es: { title: "Nota de confianza del cliente", points: "puntos", fixFirst: "Arregla esto primero", cost: "resta", helmet: "Configuración de helmet para los encabezados que faltan (Node y Express)", capped: "Una puerta trasera plantada limita la nota a F." },
  pt: { title: "Nota de confiança do cliente", points: "pontos", fixFirst: "Corrija isto primeiro", cost: "tira", helmet: "Configuração do helmet para os cabeçalhos em falta (Node e Express)", capped: "Uma porta dos fundos plantada limita a nota a F." },
  de: { title: "Vertrauensnote für Kunden", points: "Punkte", fixFirst: "Das zuerst beheben", cost: "kostet", helmet: "Helmet-Einrichtung für die fehlenden Header (Node und Express)", capped: "Eine eingeschleuste Hintertür begrenzt die Note auf F." },
  fr: { title: "Note de confiance client", points: "points", fixFirst: "À corriger en premier", cost: "retire", helmet: "Configuration de helmet pour les en-têtes manquants (Node et Express)", capped: "Une porte dérobée plantée plafonne la note à F." },
  it: { title: "Voto di fiducia per i clienti", points: "punti", fixFirst: "Correggi prima questi", cost: "toglie", helmet: "Configurazione di helmet per le intestazioni mancanti (Node ed Express)", capped: "Una backdoor piantata limita il voto a F." }
};

function trustLabel(lang, key) {
  const code = customerMail.langOf(lang);
  return (TRUST_LABEL[code] || TRUST_LABEL.en)[key] || TRUST_LABEL.en[key];
}

function trustBlock(report, lang) {
  const ins = report && report.insights;
  const trust = ins && ins.trust;
  if (!trust || !trust.grade) return "";
  const byKey = {};
  (Array.isArray(ins.findings) ? ins.findings : []).forEach((item) => { if (item && !byKey[item.key]) byKey[item.key] = item; });
  const esc = customerMail.esc;
  const fix = (Array.isArray(trust.rows) ? trust.rows : []).slice(0, 5).filter((row) => byKey[row.key]).map((row) =>
    "<li>" + esc(findingLine(lang, byKey[row.key], "title")) + " <span class=\"muted\">(" + esc(trustLabel(lang, "cost")) + " " + esc(row.points) + ")</span></li>").join("");
  const helmet = ins.fixkit && ins.fixkit.helmet ? String(ins.fixkit.helmet) : "";
  return "<h2>" + esc(trustLabel(lang, "title")) + "</h2>" +
    "<p class=\"trust\"><span class=\"grade\">" + esc(trust.grade) + "</span> " + esc(trust.score) + " " + esc(trustLabel(lang, "points")) +
    (trust.capped ? " · " + esc(trustLabel(lang, "capped")) : "") + "</p>" +
    (fix ? "<h3>" + esc(trustLabel(lang, "fixFirst")) + "</h3><ol class=\"fixrows\">" + fix + "</ol>" : "") +
    (helmet ? "<h3>" + esc(trustLabel(lang, "helmet")) + "</h3><pre>" + esc(helmet) + "</pre>" : "");
}

// The IR playbooks for the attack-source findings this report raised (#3958).
function playbookBlock(list, lang) {
  const esc = customerMail.esc;
  const books = playbooks.forKeys(list.map((row) => row.key), lang);
  if (!books.length) return "";
  const head = playbooks.heading(lang);
  return "<h2>" + esc(head.section) + "</h2>" +
    (playbooks.native(lang) ? "" : "<p class=\"checks\">" + esc(head.note || "") + "</p>") +
    books.map((book) => "<div class=\"book\"><h3>" + esc(book.title) + " <span class=\"muted\">(" + esc(head.irm) + " " + esc(book.irm) + ")</span></h3>" +
      playbooks.PHASES.map((phase) => "<p class=\"phase\"><strong>" + esc(head.phases[phase]) + "</strong></p><ul>" +
        book.steps[phase].map((step) => "<li>" + esc(step) + "</li>").join("") + "</ul>").join("") + "</div>").join("");
}

const PDF_STYLE =
  "@page{margin:14mm 16mm 18mm}body{margin:0;font-family:Inter,'Helvetica Neue',Arial,sans-serif;font-size:10pt;color:#243436;line-height:1.45}" +
  "h1{font-family:Georgia,'Times New Roman',serif;font-size:22pt;font-weight:normal;margin:0 0 4mm;color:#0c3539}" +
  ".meta{font-size:9pt;color:#5a7174;margin:0 0 6mm}.meta code{font-family:Menlo,Consolas,monospace;font-size:8.5pt}" +
  "h2{font-size:9pt;letter-spacing:.12em;text-transform:uppercase;color:#16656c;margin:7mm 0 3mm}" +
  "table{width:100%;border-collapse:collapse;font-size:9pt}th,td{border:1px solid #d4e2e3;padding:2.2mm 2.6mm;vertical-align:top;text-align:left}" +
  "th{background:#eef6f7;font-size:8pt;text-transform:uppercase;letter-spacing:.06em;color:#3f5c60}" +
  "tr:nth-child(even) td{background:#fafcfc}.lvl{font-weight:700;text-transform:uppercase;font-size:8pt;letter-spacing:.04em}" +
  ".trust{font-size:11pt;margin:0 0 3mm}.grade{font-family:Georgia,serif;font-size:26pt;color:#0c3539;margin-right:3mm}.muted{color:#5a7174}" +
  "h3{font-size:10pt;margin:4mm 0 1.5mm;color:#0c3539}pre{font-family:Menlo,Consolas,monospace;font-size:8pt;background:#eef6f7;padding:3mm;white-space:pre-wrap;word-break:break-all}" +
  ".book{break-inside:avoid}.phase{margin:2mm 0 0}ul,ol{margin:1mm 0 0;padding-left:5mm}" +
  ".checks{font-size:9pt;color:#3f5c60;margin:0 0 2mm}.foot{margin-top:6mm;padding-top:3mm;border-top:1px solid #d4e2e3;font-size:8pt;color:#5a7174}";

function page(record, options) {
  const opts = options || {};
  const lang = customerMail.langOf(opts.lang || (record && record.lang));
  const report = (record && record.report) || {};
  const targetedBlock = report.targeted || {};
  const list = rows(record, lang);
  const runAt = stamp(report.fetchedAt || targetedBlock.checkedAt || (record && record.createdAt));
  const host = String(report.host || "");
  const id = String(report.id || (record && record.id) || "");
  const deepBlock = record && record.deep && typeof record.deep === "object" ? record.deep : null;
  const checks = sourceLines(lang, targetedBlock).concat(deepBlock ? sourceLines(lang, deepBlock).map((line) => label(lang, "deepTag") + " · " + line) : []);
  const attr = (Array.isArray(targetedBlock.attributions) ? targetedBlock.attributions : [])
    .concat((deepBlock && Array.isArray(deepBlock.attributions) ? deepBlock.attributions : []).filter((line) => (targetedBlock.attributions || []).indexOf(line) === -1));
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
    trustBlock(report, lang) + playbookBlock(list, lang) +
    (list.length ? "<div class=\"foot\"><strong>" + customerMail.esc(label(lang, "attribution")) + " (IRM):</strong> " + customerMail.esc(playbooks.attribution(lang)) + "</div>" : "") +
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