/* Reports for the live studio (#3140): a Live Reports file, or a fresh run of the URL review streamed from reviewRun.
   showReport() turns either into what show.html draws. A fresh run needs LIVE_REVIEW_NAME and LIVE_REVIEW_EMAIL
   (the account the run is billed to and mailed to); QA_TEST_KEY keeps it out of Live Reports. */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.resolve(__dirname, "../..");
const REPORTS = path.join(ROOT, "assets/live-reports");
const RUN_URL = process.env.REVIEW_RUN_URL || "https://us-central1-carlosm-interactive-cv.cloudfunctions.net/reviewRun";
const AREAS = ["SEO", "GEO", "Analytics", "Security", "Accessibility", "Performance"];
const RUN_TIMEOUT_MS = 8 * 60 * 1000;

let byHost = null;

function liveReport(id) {
  const file = path.join(REPORTS, id + ".json");
  if (!fs.existsSync(file)) throw new Error("No Live Report " + id + " in assets/live-reports");
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function bareHost(host) {
  return String(host || "").toLowerCase().replace(/^www\./, "");
}

// The Live Report already read for a host, if any, so a viewer's link can show at once.
function findByHost(host) {
  if (!byHost) {
    byHost = new Map();
    fs.readdirSync(REPORTS).filter((f) => f.endsWith(".json") && f !== "index.json").forEach((f) => {
      try {
        const r = JSON.parse(fs.readFileSync(path.join(REPORTS, f), "utf8"));
        if (r && r.host && r.score) byHost.set(bareHost(r.host), r.id);
      } catch (error) { /* a file that does not parse is not a report */ }
    });
  }
  const id = byHost.get(bareHost(host));
  return id ? liveReport(id) : null;
}

// The log a scripted run shows, in the clip's language: the steps the review takes, in the order its own log writes them.
// A phrasebook rather than the translator, which turns these steps into nouns ("Eröffnung", "Lektüre").
const LOG = {
  en: ["Opening {url}", "Reading {pages} pages, 2 links deep", "Checking headers, cookies and TLS on {pages} pages", "Reading robots.txt, sitemaps and JSON-LD",
    "Running Lighthouse on the start page", "Checking labels, alt text and zoom", "Scoring six areas"],
  es: ["Abriendo {url}", "Leyendo {pages} páginas, 2 enlaces de profundidad", "Revisando encabezados, cookies y TLS en {pages} páginas", "Leyendo robots.txt, sitemaps y JSON-LD",
    "Ejecutando Lighthouse en la página de inicio", "Revisando etiquetas, texto alternativo y zoom", "Puntuando seis áreas"],
  pt: ["Abrindo {url}", "Lendo {pages} páginas, 2 links de profundidade", "Verificando cabeçalhos, cookies e TLS em {pages} páginas", "Lendo robots.txt, sitemaps e JSON-LD",
    "Rodando o Lighthouse na página inicial", "Verificando rótulos, texto alternativo e zoom", "Pontuando seis áreas"],
  de: ["Öffne {url}", "Lese {pages} Seiten, 2 Links tief", "Prüfe Header, Cookies und TLS auf {pages} Seiten", "Lese robots.txt, Sitemaps und JSON-LD",
    "Starte Lighthouse auf der Startseite", "Prüfe Labels, Alternativtexte und Zoom", "Bewerte sechs Bereiche"],
  fr: ["Ouverture de {url}", "Lecture de {pages} pages, sur 2 niveaux de liens", "Vérification des en-têtes, cookies et TLS sur {pages} pages",
    "Lecture de robots.txt, des sitemaps et du JSON-LD", "Lighthouse sur la page d'accueil", "Vérification des libellés, textes alternatifs et du zoom", "Notation des six domaines"],
  it: ["Apertura di {url}", "Lettura di {pages} pagine, 2 livelli di link", "Controllo di header, cookie e TLS su {pages} pagine", "Lettura di robots.txt, sitemap e JSON-LD",
    "Lighthouse sulla pagina iniziale", "Controllo di etichette, testo alternativo e zoom", "Punteggio delle sei aree"]
};

function runLog(r, lang) {
  const vals = { url: r.url || "https://" + r.host + "/", pages: r.pages || 20 };
  return (LOG[lang] || LOG.en).map((line) => line.replace(/\{(\w+)\}/g, (m, key) => vals[key]));
}

function sortFindings(list) {
  const rank = { fail: 0, risk: 1 };
  const sev = { high: 0, medium: 1, low: 2 };
  return list.filter((f) => f && (f.verdict === "fail" || f.verdict === "risk"))
    .sort((a, b) => (rank[a.verdict] - rank[b.verdict]) || ((sev[a.severity] ?? 3) - (sev[b.severity] ?? 3)));
}

// A Live Report (assets/live-reports/<id>.json) or a run's report (report.insights) as show.html draws it.
function showReport(src, source) {
  const insights = src.insights || {};
  const score = src.score || insights.score || {};
  const areas = score.areas || {};
  const tally = (key) => AREAS.reduce((n, a) => n + ((areas[a] && areas[a][key]) || 0), 0);
  const fix = src.fix || sortFindings(Array.isArray(insights.findings) ? insights.findings : []);
  const host = src.host || (src.url ? new URL(src.url).hostname : "");
  const out = {
    id: src.id || "",
    name: src.name || host,
    host,
    url: src.url || "https://" + host + "/",
    read: src.read || String(src.fetchedAt || "").slice(0, 10),
    pages: typeof src.pages === "number" ? src.pages : Array.isArray(src.pages) ? src.pages.length : 20,
    overall: score.overall == null ? src.overall : score.overall,
    grade: score.grade || src.grade || "",
    areas: AREAS.filter((a) => areas[a] != null).map((a) => [a, typeof areas[a] === "number" ? areas[a] : areas[a].score]),
    fails: tally("fail"),
    risks: tally("risk"),
    passes: tally("pass"),
    fix: fix.slice(0, 3).map((f) => ({ area: f.area, verdict: f.verdict, severity: f.severity, title: f.title, evidence: f.evidence || "", fix: f.fix || "" })),
    source: source || "live"
  };
  out.log = runLog(out);
  return out;
}

function testKey() {
  return process.env.QA_TEST_KEY || "";
}

function termsVersion() {
  const core = fs.readFileSync(path.join(ROOT, "functions/url-review-core.js"), "utf8");
  return (core.match(/const TERMS_VERSION = "([^"]+)"/) || [])[1] || "";
}

// Runs the URL review on url and calls onLog with each line the run writes; resolves with its report.
async function runReview(url, onLog) {
  const name = process.env.LIVE_REVIEW_NAME;
  const email = process.env.LIVE_REVIEW_EMAIL;
  if (!name || !email) throw new Error("Set LIVE_REVIEW_NAME and LIVE_REVIEW_EMAIL to run fresh reviews on stream");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), RUN_TIMEOUT_MS);
  try {
    const res = await fetch(RUN_URL + "/review", {
      method: "POST",
      signal: ctrl.signal,
      headers: { "content-type": "application/json", origin: "https://carlosandmunoz.com" },
      body: JSON.stringify({
        termsAccepted: true, termsVersion: termsVersion(), name, email, reasonCode: "teaching", reason: "",
        url, frameworks: ["Playwright"], tools: [], pages: 20, depth: 2, lang: "en",
        deviceId: crypto.createHash("sha256").update("live-studio:" + email).digest("hex").slice(0, 16),
        runId: crypto.randomBytes(8).toString("hex"), openedAt: Date.now() - 30000, testKey: testKey()
      })
    });
    const type = res.headers.get("content-type") || "";
    if (!res.ok || type.includes("application/json")) {
      const body = await res.json().catch(() => ({}));
      throw Object.assign(new Error(body.error || "review refused (" + res.status + ")"), { paymentRequired: !!body.paymentRequired });
    }
    const decoder = new TextDecoder();
    let buf = "";
    let done = null;
    for await (const chunk of res.body) {
      buf += decoder.decode(chunk, { stream: true });
      const parts = buf.split("\n");
      buf = parts.pop();
      for (const part of parts) {
        if (!part.trim()) continue;
        const msg = JSON.parse(part);
        if (msg.type === "log" && onLog) onLog(msg.text);
        if (msg.type === "error") throw new Error(msg.error || "review failed");
        if (msg.type === "done") done = msg;
      }
    }
    if (!done || !done.report) throw new Error("the review ended without a report");
    return showReport(done.report, "run");
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { liveReport, findByHost, showReport, runReview, runLog };
