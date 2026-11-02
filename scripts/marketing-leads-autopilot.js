/* Jarvis settles the outreach leads by itself (#2016), from scripts/jarvis-marketing-sync.js, at most once an hour:
     - translates a top finding still in English into the lead's language;
     - queues a fresh review (jarvis_reviews, the owner's 7-minute run) for a lead whose site has no Live Report,
       at most twice per host and two days apart and three per pass (more at once and the browser answers "busy"),
       on www. when the bare host does not resolve, then rebuilds the week once the report is published;
     - approves every lead with nothing missing that Carlos has not turned down (approved = "no").
   Upload stays with Carlos. A row it cannot settle gets `ask`: why, for the buttons in Jarvis > Marketing. */

const fs = require("fs");
const path = require("path");

const OWNER = "kaanmuar@gmail.com";
const SITE = "https://carlosandmunoz.com";
const EVERY_MS = 60 * 60 * 1000;
const RERUN_TRIES = 2;
const RERUN_GAP_MS = 2 * 24 * 60 * 60 * 1000;
const RERUNS_PER_PASS = 3;
const YES = /^(yes|y|x|1)$/i;
const NO = /^no$/i;
const TRANSLATE = "top_finding (translate)";
const NO_REPORT = "report (not published yet)";
const PERSONAL = "email (personal address)";
// Fields Carlos may set from Jarvis; the leads build keeps hand edits.
const EDITABLE = ["first_name", "last_name", "title", "top_finding", "best_point", "peer_1", "peer_2", "regulation_line", "course_or_programme", "month", "one_line_from_lecture_kit"];

const missingOf = (row) => String(row.missing || "").split(";").map((m) => m.trim()).filter(Boolean);
const bareHost = (host) => String(host || "").toLowerCase().replace(/^https?:\/\//, "").split("/")[0].replace(/^www\./, "");

function dropMissing(row, items) {
  row.missing = missingOf(row).filter((m) => !items.includes(m) && !items.includes(m.split(" (")[0])).join("; ");
}

function settled(row) {
  return !!row.uploaded || YES.test(String(row.approved || "").trim()) || NO.test(String(row.approved || "").trim());
}

/** What Jarvis does with a row now: approve, translate, rerun, wait, ask (with why), or nothing. */
function decide(row, reruns, now) {
  if (settled(row)) return { kind: "none" };
  const miss = missingOf(row);
  if (!miss.length) return { kind: "approve" };
  const asks = [];
  const auto = [];
  let wait = "";
  miss.forEach((m) => {
    if (m === TRANSLATE) auto.push("translate");
    else if (m === NO_REPORT) {
      const r = reruns[bareHost(row.host)] || { tries: 0, at: "" };
      const since = r.at ? now - Date.parse(r.at) : Infinity;
      if (r.tries < RERUN_TRIES && since >= RERUN_GAP_MS) auto.push("rerun");
      else if (since < RERUN_GAP_MS) wait = "Review re-run " + r.tries + " of " + RERUN_TRIES + " queued " + r.at.slice(0, 10) + "; waiting for its Live Report.";
      else asks.push("No Live Report after " + r.tries + " review re-runs (the site times out or is not publishable)");
    } else if (m === PERSONAL) asks.push("Personal address: allow it or drop the lead");
    else asks.push("Needs " + m.split(" (")[0]);
  });
  const reportVars = ["live_report_url", "score", "best_point", "top_finding"];
  const onlyReport = asks.every((a) => reportVars.some((v) => a === "Needs " + v));
  if (miss.includes(NO_REPORT) && onlyReport) asks.length = 0;
  if (asks.length) return { kind: "ask", why: asks.join("; ") + ".", auto };
  if (auto.length) return { kind: auto[0], auto };
  return { kind: "wait", why: wait };
}

/** Google's free translator; "" when it does not answer. Keeps a lowercase start, since the copy puts it mid-sentence. */
async function translate(text, lang, fetchImpl) {
  if (!text || !lang || lang === "en") return "";
  const url = "https://translate.googleapis.com/translate_a/single?" + new URLSearchParams({ client: "gtx", sl: "en", tl: lang, dt: "t", q: text });
  try {
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return "";
    const data = await res.json();
    const out = (data[0] || []).map((part) => part[0] || "").join("").trim().replace(/\.$/, "");
    if (!out || out.toLowerCase() === text.toLowerCase()) return "";
    return /^[a-z]/.test(text) && /^\p{Lu}\p{Ll}/u.test(out) ? out[0].toLowerCase() + out.slice(1) : out;
  } catch (error) {
    return "";
  }
}

/** The leads keep bare hosts, but some sites (sena.edu.co, itm.edu.co, ufpe.br) only answer on www. */
async function siteUrl(host, lookup) {
  try {
    await lookup(host);
    return "https://" + host + "/";
  } catch (error) {
    return "https://www." + host + "/";
  }
}

const readJson = (file, fallback) => { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch (error) { return fallback; } };

/**
 * One pass over every week's leads file. deps: { parseCsv, toCsv, leadFiles(dir) -> [{ week, file }], tool(dir, args),
 * fetch, db (Firestore, or null in a dry run), now, force }. Returns notes, or null when the last pass was under an hour ago.
 */
async function run(dir, state, deps) {
  const now = deps.now || Date.now();
  const stamp = path.join(state, "leads-autopilot.json");
  const last = readJson(stamp, {});
  if (!deps.force && last.at && now - Date.parse(last.at) < EVERY_MS) return null;
  const rerunFile = path.join(state, "lead-reruns.json");
  const reruns = readJson(rerunFile, {});
  const notes = [];
  const lookup = deps.lookup || require("dns").promises.lookup;
  let rerunsLeft = RERUNS_PER_PASS;
  let published = null;
  const index = async () => {
    if (!published) {
      const res = await deps.fetch(SITE + "/assets/live-reports/index.json", { signal: AbortSignal.timeout(15000) });
      published = new Set(((await res.json()).reports || []).map((r) => bareHost(r.host)));
    }
    return published;
  };
  for (const { week, file } of deps.leadFiles(dir)) {
    let csv = deps.parseCsv(fs.readFileSync(file, "utf8"));
    const waiting = csv.rows.filter((r) => !r.uploaded && missingOf(r).includes(NO_REPORT));
    if (waiting.length && reruns && Object.keys(reruns).length) {
      const live = await index().catch(() => new Set());
      if (waiting.some((r) => live.has(bareHost(r.host)) && reruns[bareHost(r.host)])) {
        deps.tool(dir, ["leads", "--week", week]);
        csv = deps.parseCsv(fs.readFileSync(file, "utf8"));
        notes.push(week + " rebuilt with new Live Reports");
      }
    }
    let changed = false;
    const queued = new Set();
    let translated = 0, approved = 0;
    for (const row of csv.rows) {
      const d = decide(row, reruns, now);
      if (d.kind === "none") continue;
      if ((d.auto || []).includes("translate")) {
        const text = await translate(row.top_finding_en || row.top_finding, row.language, deps.fetch);
        if (text) { row.top_finding = text; dropMissing(row, [TRANSLATE]); changed = true; translated++; }
      }
      const host = bareHost(row.host);
      if ((d.auto || []).includes("rerun") && host && !queued.has(host) && deps.db && rerunsLeft > 0) {
        rerunsLeft--;
        await deps.db.collection("jarvis_reviews").add({ url: await siteUrl(host, lookup), lang: row.language || "en", token: "", quiet: true, by: OWNER, status: "queued", at: new Date(now).toISOString(), source: "leads " + week });
        const r = reruns[host] || { tries: 0 };
        reruns[host] = { tries: r.tries + 1, at: new Date(now).toISOString() };
        queued.add(host);
      }
      if (!missingOf(row).length && !settled(row)) { row.approved = "yes"; changed = true; approved++; }
    }
    if (changed) fs.writeFileSync(file, deps.toCsv(csv.header, csv.rows, csv.eol));
    if (translated || approved || queued.size) notes.push(`${week}: ${translated} translated, ${queued.size} reviews re-run, ${approved} approved`);
  }
  fs.writeFileSync(rerunFile, JSON.stringify(reruns, null, 1));
  fs.writeFileSync(stamp, JSON.stringify({ at: new Date(now).toISOString(), notes }));
  return notes;
}

module.exports = { OWNER, EDITABLE, TRANSLATE, NO_REPORT, PERSONAL, RERUN_TRIES, RERUNS_PER_PASS, missingOf, dropMissing, decide, translate, run, bareHost };
