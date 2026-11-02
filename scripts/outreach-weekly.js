#!/usr/bin/env node
/* The weekly outreach cycle of #1278 with no Cursor agent (#1980). The private kaanmuar/qa-lab-outreach repo holds the
   outreach folder and runs this from its GitHub Action (.github/workflows/outreach.yml there):
     node scripts/outreach-weekly.js <mode> --dir <outreach folder> [--dry] [--since YYYY-MM-DD] [--week W2]
   prospects  Friday     next week's prospects from the seed lists, with addresses their own sites publish; the sweep
                         queue; the week's draft campaigns; seasonal first-email drafts for Carlos
   leads      Monday     rebuilds every open week's leads and fills what `missing` asks that a model can answer
   replies    weekdays   fetches, sorts and drafts answers to replies; blocks opt-outs and bounces; drafts what is left
                         from yesterday, or from every day since --since
   holidays   every run  pauses campaigns on their countries' public holidays
   sync                  runs Jarvis > Marketing's queued commands and uploads the folder (scripts/jarvis-marketing-sync.js)
   The model is Workers AI through the pre-flight Worker (PREFLIGHT_TOKEN, PREFLIGHT_URL). A field the model is unsure
   of stays in `missing` for Carlos. Each job writes tracker/logs/last-<mode>.txt, which the sync shows in Jarvis, and
   pushes its NOTIFY line, or its failure, to Jarvis as an outreach push. --dry reads and prints without writing, pushing
   or calling Instantly. */
const fs = require("fs");
const path = require("path");
const Module = require("module");
const { execFileSync } = require("child_process");
const { parseCsv, toCsv } = require("./jarvis-marketing-sync");

const PROJECT = "carlosm-interactive-cv";
const FN = path.join(__dirname, "..", "functions");
const CFG = (() => { try { return JSON.parse(fs.readFileSync(path.join(require("os").homedir(), ".cursor/preflight/config.json"), "utf8")); } catch { return {}; } })();
const AI_URL = process.env.PREFLIGHT_URL || CFG.url || "https://preflight.carlosandmunoz.com";
const BOOKING = "https://carlosandmunoz.com/book.html";
const JOBS = ["prospects", "leads", "replies"];
const PER_SEGMENT = 10;
const UA = "Mozilla/5.0 (compatible; QA-lab-outreach/1.0; +https://carlosandmunoz.com)";
const PROSPECT_HEADER = ["segment", "org", "host", "cc", "country", "language", "contact_name", "contact_title", "email", "linkedin_url", "source", "sequence", "sender", "trigger", "status"];
const COUNTRY = { co: "Colombia", mx: "Mexico", pe: "Peru", ar: "Argentina", cl: "Chile", ec: "Ecuador", br: "Brazil", es: "Spain", pt: "Portugal", us: "United States", gb: "United Kingdom", ie: "Ireland", au: "Australia", fr: "France", it: "Italy" };
const LANG = { br: "pt", pt: "pt", us: "en", gb: "en", ie: "en", au: "en", fr: "fr", it: "it" };
// Ten countries per segment a week, weighted to Colombia and Latin America; the last slot rotates through the rest.
const SLOTS = ["co", "co", "co", "mx", "pe", "cl", "ar", "br", "es"];
const ROTATE = ["pt", "us", "gb", "ie", "au", "ec"];
const SKIP_INBOX = /^(support|soporte|suporte|help|ayuda|news|newsletter|noreply|no-reply|donotreply|privacy|privacidad|rgpd|gdpr|dpo|abuse|postmaster|webmaster|jobs|careers|empleo|rrhh|hr)@/i;
const FREE_MAIL = /@(gmail|googlemail|hotmail|outlook|live|yahoo|icloud|me|aol|proton(mail)?|gmx|uol|bol|terra)\./i;
const CONTACT_LINK = /contact|contacto|contato|nosotros|about|equipo|team|quienes|sobre|prensa|imprensa|press|comunicaci|directorio|directory/i;
const ANSWER = new Set(["interested", "question", "not_now", "wrong_person"]);
const CATEGORIES = ["interested", "question", "not_now", "wrong_person", "opt_out", "out_of_office", "bounce", "auto_reply"];
const FILLABLE = new Set(["top_finding (translate)", "peer_1", "peer_2", "title", "month", "one_line_from_lecture_kit", "course_or_programme"]);

let DIR = "";
let DRY = false;
let SINCE = "";
let WEEK = "";
const read = (rel, fallback = "") => { try { return fs.readFileSync(path.join(DIR, rel), "utf8"); } catch { return fallback; } };
const write = (rel, text) => {
  if (DRY) return;
  fs.mkdirSync(path.dirname(path.join(DIR, rel)), { recursive: true });
  fs.writeFileSync(path.join(DIR, rel), text);
};
const readJson = (rel, fallback) => { try { return JSON.parse(read(rel)); } catch { return fallback; } };
const csvOf = (rel, header) => {
  const c = parseCsv(read(rel));
  if (!c.header.length) c.header = header || [];
  return c;
};
const saveCsv = (rel, c) => write(rel, toCsv(c.header, c.rows, c.eol));
const tool = (...args) => execFileSync("python3", [path.join(DIR, "tools", "instantly_campaigns.py"), ...args], { cwd: DIR, encoding: "utf8", timeout: 20 * 60000 });
const utcDay = (offset = 0) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
const bare = (host) => String(host || "").toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "");

// --- Workers AI ---------------------------------------------------------------------------------------------------
async function ai(system, prompt, { json = true, max = 800 } = {}) {
  const token = process.env.PREFLIGHT_TOKEN || CFG.token;
  if (!token) throw new Error("PREFLIGHT_TOKEN is not set.");
  for (let tries = 1; ; tries += 1) {
    const res = await fetch(AI_URL + "/complete", {
      method: "POST", headers: { authorization: "Bearer " + token, "content-type": "application/json" },
      body: JSON.stringify({ system, prompt, json, max_tokens: max }), signal: AbortSignal.timeout(120000)
    }).catch(() => ({ ok: false, status: 0 }));
    if (res.ok) {
      const out = await res.json();
      return json ? out.json || {} : String(out.text || "");
    }
    if (tries >= 3) throw new Error("Workers AI failed (" + res.status + ").");
    await new Promise((r) => setTimeout(r, tries * 5000));
  }
}

// --- Jarvis push --------------------------------------------------------------------------------------------------
async function push(title, body) {
  if (DRY || !process.env.GOOGLE_APPLICATION_CREDENTIALS) return console.log("push skipped: " + title + ": " + body);
  const fnRequire = Module.createRequire(path.join(FN, "index.js"));
  const { initializeApp, getApps } = fnRequire("firebase-admin/app");
  const { getFirestore } = fnRequire("firebase-admin/firestore");
  const { getMessaging } = fnRequire("firebase-admin/messaging");
  if (!getApps().length) initializeApp({ projectId: PROJECT });
  const jarvisPush = require("../functions/jarvis-push");
  const db = getFirestore();
  await jarvisPush.send(getMessaging(), db, await jarvisPush.targets(db, "outreach"),
    { kind: "outreach", title, body, tab: "products:marketing", tag: "jarvis-outreach-weekly" });
}

// --- Replies ------------------------------------------------------------------------------------------------------
function leadIndex() {
  const out = {};
  for (const f of fs.readdirSync(path.join(DIR, "prospects")).filter((n) => /^week\d+-leads\.csv$/.test(n))) {
    for (const r of csvOf("prospects/" + f).rows) out[String(r.email).toLowerCase()] = r;
  }
  return out;
}

function addDnc(value, reason) {
  const c = csvOf("prospects/do-not-contact.csv", ["email_or_domain", "added_utc", "reason"]);
  if (c.rows.some((r) => String(r.email_or_domain).toLowerCase() === value)) return;
  c.rows.push({ email_or_domain: value, added_utc: utcDay(), reason });
  saveCsv("prospects/do-not-contact.csv", c);
}

async function replies(log) {
  if (!DRY) log(tool("replies").trim());
  const signatures = JSON.parse(tool("signatures"));
  const facts = read("collateral/prices-and-facts.md").slice(0, 5000);
  const leads = leadIndex();
  const counts = {};
  const named = [];
  const days = [];
  for (let d = SINCE || utcDay(-1); d <= utcDay(); d = new Date(Date.parse(d) + 86400000).toISOString().slice(0, 10)) days.push(d);
  for (const day of days) {
    const items = readJson(`tracker/replies/${day}.json`, []);
    const draftsRel = `tracker/replies/${day}.drafts.json`;
    const drafts = readJson(draftsRel, []);
    const done = new Set(drafts.map((d) => d.id));
    const fresh = items.filter((r) => r && r.id && !done.has(r.id));
    if (!fresh.length) continue;
    const md = [read(`tracker/replies/${day}.md`) || `# Replies ${day}\n`];
    const logCsv = csvOf("tracker/replies-log.csv", ["date", "from", "org", "campaign", "category", "next_step"]);
    for (const r of fresh) {
      const from = String(r.from || "").toLowerCase();
      const lead = leads[from] || {};
      const seq = (String(r.campaign).match(/\b([A-E])-([a-z]{2})\b/) || [])[1] || lead.sequence || "A";
      const sender = seq === "D" ? "brand" : "carlos";
      let out;
      try {
        out = await ai(
          "You sort replies to QA-lab URL Review cold emails and draft Carlos's answers. QA-lab URL Review gives six scores (SEO, visibility in AI search, analytics, security, accessibility, performance), a fix list and test cases from one URL; each prospect has a public Live Report. "
          + `Categories: ${CATEGORIES.join(", ")}. A hard bounce is "bounce"; a delivery delay or a ticket acknowledgement is "auto_reply". `
          + "Draft only for interested, question, not_now and wrong_person, in the reply's language, plain text, 3 to 6 short sentences, using the same form of address they used (usted in Spanish unless they wrote tú). "
          + `Interested: offer the 15-minute walkthrough with ${BOOKING}. Question: answer briefly from the facts given (the only source for prices and numbers), write [Carlos: <what to add, e.g. price and turnaround>] for anything you don't know, and offer the walkthrough. Not now: thank them and say you'll write after the date they gave. Wrong person: thank them and ask for the right contact, or ask whether you may write to the person they named. `
          + "Never promise a price, a date or a result that is not given. End with a blank line, then the signature given, one line each. "
          + 'Reply with JSON only: {"category": "...", "lang": "two-letter code", "summary": "two short lines in English", "next_step": "under 12 words", "draft": "the answer, or empty"}.',
          JSON.stringify({ facts, from: r.from, subject: r.subject, campaign: r.campaign, org: lead.org || "", live_report: lead.live_report_url || "", text: String(r.text || "").slice(0, 3500),
            signature: (signatures[(lead.language || "en") + " " + sender] || signatures["en " + sender]).slice(0, 3) }),
          { max: 900 }
        );
      } catch (error) {
        log(`could not sort ${from}: ${error.message}`);
        continue;
      }
      const category = CATEGORIES.includes(out.category) ? out.category : "question";
      const draft = ANSWER.has(category) ? String(out.draft || "").trim() : "";
      counts[category] = (counts[category] || 0) + 1;
      if (DRY) log(`${from}: ${category} (${out.lang})\n${draft}\n`);
      if (ANSWER.has(category)) named.push(lead.org || from.split("@")[1]);
      if ((category === "opt_out" || category === "bounce") && from) {
        if (!DRY) log(tool("block", from).trim());
        addDnc(from, category === "opt_out" ? "opted out by reply" : "hard bounce");
      }
      drafts.push({ id: r.id, category, summary: String(out.summary || "").slice(0, 400), lang: String(out.lang || lead.language || "en").slice(0, 2), draft });
      md.push(`\n## ${r.from} · ${lead.org || "?"} · ${r.campaign || "?"}\n**${category}**: ${String(out.summary || "").trim()}\n` + (draft ? "\n```\n" + draft + "\n```\n" : ""));
      logCsv.rows.push({ date: day, from: r.from, org: lead.org || "", campaign: r.campaign || "", category, next_step: String(out.next_step || "").slice(0, 120) });
    }
    write(draftsRel, JSON.stringify(drafts, null, 1));
    write(`tracker/replies/${day}.md`, md.join(""));
    saveCsv("tracker/replies-log.csv", logCsv);
  }
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  log(total ? Object.entries(counts).map(([k, n]) => `${n} ${k}`).join(", ") : "No replies.");
  if (!named.length && !counts.opt_out) return "";
  const parts = ["interested", "question", "not_now", "wrong_person"].filter((k) => counts[k]).map((k) => `${counts[k]} ${k.replace("_", " ")}`);
  if (counts.opt_out) parts.push(`${counts.opt_out} opted out (blocked)`);
  return `${parts.join(", ")}${named.length ? ` (${[...new Set(named)].slice(0, 3).join(", ")})` : ""}. Drafts are in Jarvis > Marketing.`;
}

// --- Leads --------------------------------------------------------------------------------------------------------
function openWeeks(current) {
  const weeks = new Set();
  for (const f of fs.readdirSync(path.join(DIR, "prospects"))) {
    const m = f.match(/^week(\d+)-leads\.csv$/);
    if (m && csvOf("prospects/" + f).rows.some((r) => !r.uploaded && !/^(yes|y|x|1)$/i.test(String(r.approved).trim()))) weeks.add("W" + m[1]);
    const w = f.match(/^week(\d+)-(education|agencies-startups)\.csv$/);
    if (w && "W" + w[1] === current) weeks.add(current);
  }
  return [...weeks].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
}

async function fillLead(r) {
  const asks = String(r.missing).split("; ").filter((m) => FILLABLE.has(m));
  if (!asks.length) return 0;
  const out = await ai(
    "You complete one row of a cold-email lead list for QA-lab URL Review (website QA: accessibility, SEO, AI search visibility, security, performance). Fill only the fields asked. When you are not sure, return an empty string: an empty field goes to Carlos, a wrong one goes to a prospect. "
    + "top_finding: translate top_finding_en into the row's language as a short noun phrase that fits \"Lo primero que yo revisaría es {{top_finding}}\" (or the pt, fr or en equivalent). It must keep the problem itself, not only its topic; plain words, no jargon, keep numbers. "
    + "Examples (es): \"HSTS is not sent\" -> \"que el sitio no obliga a usar HTTPS (falta HSTS)\"; \"the start page tells search engines not to index it\" -> \"que la página de inicio pide a los buscadores no indexarla\"; "
    + "\"1 AI answer or search crawler is blocked\" -> \"el bloqueo a un rastreador de buscadores o de IA\"; \"elements must meet minimum color contrast ratio thresholds\" -> \"el contraste de color de textos que no alcanza el mínimo\"; "
    + "\"other sites can frame the page\" -> \"que otros sitios pueden incrustar la página\"; \"2 form controls have no label\" -> \"los 2 campos de formulario sin etiqueta\". "
    + "peer_1, peer_2: for a startup or agency, one or two real, well-known competitors in the same country and niche, names only; for a university or TVET, keep the current peers unless a prospective student would not compare them with this one (different city, size, type or level), then give two well-known comparable ones. "
    + "title: Dr., Dra., Prof., Profa., Mr. or Ms. only when the name or role makes it certain. month: the first month of the next term in the row's country, in the row's language. one_line_from_lecture_kit: one sentence in the row's language on the 90-minute guest session (a QA lab, an SDLC studio, the URL Review case). course_or_programme: only a programme you know this person leads. "
    + 'Reply with JSON only, with exactly the asked keys: {"top_finding": "...", "peer_1": "...", ...}.',
    JSON.stringify({ asked: asks.map((a) => a.replace(" (translate)", "")).concat(/^(A|B|E)$/.test(r.sequence) && r.peer_1 ? ["peer_1", "peer_2"] : []),
      row: { org: r.org, host: r.host, country: COUNTRY[r.cc] || r.cc, language: r.language, sequence: r.sequence, first_name: r.first_name, last_name: r.last_name, top_finding_en: r.top_finding_en, peer_1: r.peer_1, peer_2: r.peer_2 } }),
    { max: 400 }
  );
  let filled = 0;
  for (const [k, v] of Object.entries(out || {})) {
    const value = String(v == null ? "" : v).trim();
    if (!value || !(k in r) || ["email", "org", "host", "approved", "uploaded", "missing", "campaign"].includes(k)) continue;
    if (k === "top_finding" && value.toLowerCase() === String(r.top_finding_en).toLowerCase()) continue;
    if (r[k] !== value) { r[k] = value.slice(0, 200); filled += 1; }
  }
  return filled;
}

async function leadsJob(log) {
  const current = WEEK || tool("week").trim();
  const weeks = openWeeks(current);
  if (!weeks.length) { log("No open weeks."); return ""; }
  const summary = [];
  for (const week of weeks) {
    if (!DRY) log(tool("leads", "--week", week).trim().split("\n").slice(0, 3).join("\n"));
    const rel = `prospects/week${week.slice(1)}-leads.csv`;
    const c = csvOf(rel);
    let filled = 0;
    for (const r of c.rows.filter((x) => !x.uploaded && x.missing)) {
      const before = { ...r };
      try { filled += await fillLead(r); } catch (error) { log(`${r.email}: ${error.message}`); }
      if (DRY) Object.keys(r).filter((k) => r[k] !== before[k]).forEach((k) => log(`  ${r.org} (${r.language}) ${k}: ${before[k]} -> ${r[k]}`));
    }
    saveCsv(rel, c);
    if (!DRY) tool("leads", "--week", week);
    const rows = csvOf(rel).rows;
    const open = rows.filter((r) => !r.uploaded);
    const complete = open.filter((r) => !r.missing).length;
    const reports = open.filter((r) => /report \(not published yet\)/.test(r.missing)).length;
    log(`${week}: ${filled} fields filled; ${complete} complete, ${open.length - complete} still missing something (${reports} waiting for Live Reports)`);
    summary.push(`${week} ${complete} complete, ${open.length - complete} waiting${reports ? ` (${reports} for Live Reports)` : ""}`);
  }
  return `Leads ready: ${summary.join("; ")}. Approve them in Jarvis > Marketing, then press Upload.`;
}

// --- Prospects ----------------------------------------------------------------------------------------------------
async function page(url) {
  try {
    const res = await fetch(url, { headers: { "user-agent": UA, accept: "text/html" }, redirect: "follow", signal: AbortSignal.timeout(8000) });
    if (!res.ok || !/html/.test(res.headers.get("content-type") || "")) return null;
    return { url: res.url, html: (await res.text()).slice(0, 600000) };
  } catch {
    return null;
  }
}

function emailsIn(html, host) {
  const text = html.replace(/&#64;|&#x40;|\s\[at\]\s|\(at\)/gi, "@").replace(/%40/g, "@");
  const site = bare(host);
  const found = new Set();
  for (const m of text.matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g)) {
    const email = m[0].toLowerCase().replace(/\.$/, "");
    const domain = email.split("@")[1];
    if (/\.(png|jpe?g|gif|webp|svg|css|js)$/.test(email) || SKIP_INBOX.test(email) || FREE_MAIL.test(email)) continue;
    if (!(domain === site || domain.endsWith("." + site) || site.endsWith("." + domain))) continue;
    found.add(email);
  }
  return [...found];
}

const visible = (html) => html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;|&amp;/g, " ").replace(/\s+/g, " ").trim();

async function siteFacts(host) {
  const home = await page("https://" + host + "/") || await page("https://www." + bare(host) + "/");
  if (!home) return null;
  const emails = new Map();
  emailsIn(home.html, host).forEach((e) => emails.set(e, home.url));
  const links = [...new Set([...home.html.matchAll(/href="([^"#]+)"/gi)].map((m) => { try { return new URL(m[1], home.url).href; } catch { return ""; } })
    .filter((u) => u && bare(new URL(u).host) === bare(new URL(home.url).host) && CONTACT_LINK.test(u)))].slice(0, 3);
  for (const u of links) {
    const p = await page(u);
    if (p) emailsIn(p.html, host).forEach((e) => { if (!emails.has(e)) emails.set(e, p.url); });
  }
  const title = (home.html.match(/<title[^>]*>([^<]*)/i) || [])[1] || "";
  const description = (home.html.match(/<meta[^>]+name="description"[^>]+content="([^"]*)/i) || [])[1] || "";
  return { url: home.url, title: title.trim(), description, text: visible(home.html).slice(0, 1500), emails: [...emails].map(([email, url]) => ({ email, url })) };
}

function usedHosts() {
  const used = new Set();
  for (const f of fs.readdirSync(path.join(DIR, "prospects")).filter((n) => /^(week\d+-.*|warm-education|do-not-contact)\.csv$/.test(n))) {
    for (const r of csvOf("prospects/" + f).rows) {
      if (r.host) used.add(bare(r.host));
      if (r.email) used.add(String(r.email).toLowerCase());
      if (r.email_or_domain) used.add(String(r.email_or_domain).toLowerCase());
      if (r.org) used.add("org:" + String(r.org).toLowerCase());
    }
  }
  return used;
}

function shuffled(rows, seed) {
  let s = seed;
  const rnd = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
  return rows.map((r) => [rnd(), r]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
}

async function ycStartups() {
  try {
    const res = await fetch("https://yc-oss.github.io/api/companies/all.json", { signal: AbortSignal.timeout(60000) });
    const all = await res.json();
    const byName = Object.fromEntries(Object.entries(COUNTRY).map(([cc, name]) => [name.toLowerCase(), cc]));
    return all.filter((c) => c.status === "Active" && c.website).map((c) => {
      const loc = String(c.all_locations || "").toLowerCase();
      const cc = Object.keys(byName).find((n) => loc.includes(n));
      return cc && { segment: "startup", org: c.name, host: bare(c.website), cc: byName[cc], language: LANG[byName[cc]] || "es", source: "yc-oss" };
    }).filter(Boolean);
  } catch {
    return [];
  }
}

async function candidates(segment, used) {
  let rows = [];
  if (segment === "university") {
    rows = csvOf("prospects/universities-seed.csv").rows.filter((r) => r.segment === "university").map((r) => ({ ...r, cc: String(r.cc).toLowerCase() }));
  } else {
    rows = csvOf(`prospects/seeds/${segment}.csv`).rows.map((r) => ({ ...r, segment, cc: String(r.cc).toLowerCase() }));
    if (segment === "startup") rows = rows.concat(await ycStartups());
  }
  return rows.filter((r) => r.host && COUNTRY[r.cc] && !used.has(bare(r.host)) && !used.has("org:" + String(r.org).toLowerCase()));
}

// The address the model picks from the site's own list, as a prospect row; null when none fits.
async function judge(segment, cc, r, facts, used, log) {
  let out;
  try {
    out = await ai(
          `You pick the best published address for a first cold email about website quality (accessibility, SEO, visibility in AI search, security, performance) to a ${segment} in ${COUNTRY[cc]}. `
          + "University: the web, marketing, communications or accessibility team, or a dean or head of computing; TVET or bootcamp: the director or admissions; agency: the founder, the director or the general inbox; startup: a founder, hello@ or the general inbox. "
          + "Use only an address from the list. Set fits to false when the site is not really this kind of organisation in this country, or is closed, "
          + "and for a university when the list only has admissions, postgraduate, branch-campus, rector's office or citizen-service inboxes. "
          + "trigger: a recent fact from the page that makes the email timely (new site, accessibility statement, funding, new programme, hiring QA), under 15 words, or empty. "
          + 'Reply with JSON only: {"fits": true, "email": "...", "contact_name": "", "contact_title": "", "language": "es|pt|en|fr|it", "dean": false, "trigger": ""}. dean is true when the address belongs to a dean or head of computing.',
          JSON.stringify({ org: r.org, host: r.host, title: facts.title, description: facts.description, text: facts.text, emails: facts.emails.slice(0, 12) }),
      { max: 300 }
    );
  } catch (error) {
    log(`${r.host}: ${error.message}`);
    return null;
  }
  const hit = facts.emails.find((e) => e.email === String(out.email || "").toLowerCase());
  if (!out.fits || !hit || used.has(hit.email)) return null;
  used.add(hit.email);
  const seq = { university: out.dean ? "E" : "A", tvet: "B", agency: "C", startup: "D" }[segment];
  return {
    segment, org: r.org, host: bare(facts.url) || r.host, cc, country: COUNTRY[cc],
    language: ["es", "pt", "en", "fr", "it"].includes(out.language) ? out.language : (LANG[cc] || "es"),
    contact_name: String(out.contact_name || "").slice(0, 80), contact_title: String(out.contact_title || "").slice(0, 120),
    email: hit.email, linkedin_url: "", source: hit.url, sequence: seq, sender: seq === "D" ? "brand" : "carlos",
    trigger: String(out.trigger || "").slice(0, 160), status: "new"
  };
}

// One prospect per slot's country: sites are fetched five at a time, at most MAX_CHECKS per segment.
const MAX_CHECKS = 80;
async function pick(segment, pool, slots, used, log) {
  const picked = [];
  let checked = 0;
  for (const cc of slots) {
    const queue = pool.filter((x) => x.cc === cc && !used.has(bare(x.host)));
    let row = null;
    while (!row && queue.length && checked < MAX_CHECKS) {
      const batch = queue.splice(0, 5);
      batch.forEach((r) => used.add(bare(r.host)));
      checked += batch.length;
      const facts = await Promise.all(batch.map((r) => siteFacts(r.host)));
      for (let i = 0; i < batch.length && !row; i += 1) {
        if (facts[i] && facts[i].emails.length) row = await judge(segment, cc, batch[i], facts[i], used, log);
      }
    }
    if (!row) continue;
    picked.push(row);
    if (DRY) log(`  ${segment} ${cc} ${row.org} <${row.email}> ${row.sequence}${row.contact_name ? " " + row.contact_name : ""}${row.trigger ? " | " + row.trigger : ""}`);
  }
  log(`${segment}: ${picked.length} of ${slots.length} (${checked} sites checked, ${pool.length} candidates)`);
  return picked;
}

async function seasonal(week, countries, log) {
  const book = read("collateral/emails-seasonal.md", "# Seasonal first emails\n");
  const plan = await ai(
    "You read a seasonal outreach calendar and list the dates that fall in the next 21 days for the given countries and have no variant yet (a variant is a heading in the existing list). "
    + 'Reply with JSON only: {"items": [{"hook": "short name", "countries": "Colombia, Mexico", "dates": "11-27 Nov", "languages": ["es"]}]}, at most 3 items, or {"items": []}.',
    JSON.stringify({ today: utcDay(), countries, calendar: read("05-seasonal-calendar.md").slice(0, 12000), existing: book.split("\n").filter((l) => l.startsWith("## ")) }),
    { max: 500 }
  );
  const items = Array.isArray(plan.items) ? plan.items.slice(0, 3) : [];
  if (DRY) log("seasonal plan: " + JSON.stringify(plan).slice(0, 600));
  if (!items.length) return [];
  const sample = read("collateral/emails.md").slice(0, 3000);
  let text = book.replace(/\s*$/, "\n");
  for (const it of items) {
    const body = await ai(
      "You write the first email of a seasonal variant of QA-lab URL Review's cold sequences: plain text, the same voice, length and {{placeholders}} as the sample, one version per language asked, each under a '### <language>' line with a 'Subject:' line first. No markdown beyond that.",
      JSON.stringify({ hook: it.hook, countries: it.countries, dates: it.dates, languages: it.languages, sample }), { json: false, max: 1500 }
    );
    text += `\n## ${it.hook} (${it.countries}, ${it.dates}) - DRAFT, needs Carlos\n\n${body.trim()}\n`;
  }
  write("collateral/emails-seasonal.md", text);
  log(`seasonal drafts: ${items.map((i) => i.hook).join(", ")}`);
  return items.map((i) => i.hook);
}

async function prospects(log) {
  const week = WEEK || tool("week").trim();
  const n = week.slice(1);
  const site = path.join(__dirname, "..");
  const done = fs.existsSync(path.join(DIR, "prospects", `week${n}-education.csv`));
  let picked = [];
  if (done) {
    log(`${week}: prospects already exist; only seasonal drafts.`);
  } else {
    const used = usedHosts();
    const slots = [...SLOTS, ROTATE[Number(n) % ROTATE.length]];
    for (const segment of ["university", "tvet", "agency", "startup"]) {
      const pool = shuffled(await candidates(segment, used), Number(n) * 7919);
      picked = picked.concat(await pick(segment, pool, slots, used, log));
    }
    const edu = picked.filter((r) => r.segment === "university" || r.segment === "tvet");
    const biz = picked.filter((r) => r.segment === "agency" || r.segment === "startup");
    write(`prospects/week${n}-education.csv`, toCsv(PROSPECT_HEADER, edu, "\n"));
    write(`prospects/week${n}-agencies-startups.csv`, toCsv(PROSPECT_HEADER, biz, "\n"));
    write(`prospects/week${n}-emails-found.csv`, toCsv(["host", "org", "contact_name", "email", "kind", "source_url", "notes"],
      picked.map((r) => ({ host: r.host, org: r.org, contact_name: r.contact_name, email: r.email, kind: r.contact_name ? "personal" : "generic", source_url: r.source, notes: "found by the Friday Action " + utcDay() })), "\n"));
    const sweepRel = `prospects/week${n}-sweep.csv`;
    write(sweepRel, toCsv(["host", "cc", "segment"], picked.map((r) => ({ host: r.host, cc: r.cc, segment: r.segment })), "\n"));
    if (!DRY && picked.length) {
      log(execFileSync("node", [path.join(site, "scripts", "sweep-outreach.js"), "add", path.join(DIR, sweepRel)], { encoding: "utf8" }).trim());
      log(tool("campaigns", "--week", week).trim());
    }
  }
  const recent = new Set();
  for (let w = Math.max(1, Number(n) - 3); w <= Number(n); w += 1) {
    for (const f of [`week${w}-education.csv`, `week${w}-agencies-startups.csv`]) csvOf("prospects/" + f).rows.forEach((r) => r.country && recent.add(r.country));
  }
  const drafts = await seasonal(week, [...recent], log).catch((error) => { log("seasonal: " + error.message); return []; });
  const short = done ? "" : ["university", "tvet", "agency", "startup"].filter((s) => picked.filter((r) => r.segment === s).length < PER_SEGMENT);
  const line = done ? `${week}: prospects were already there` : `${week}: ${picked.length} prospects queued for the weekend sweep and the week's draft campaigns`;
  const status = read("04-sending-setup.md");
  if (status) write("04-sending-setup.md", status.replace(/^(## Status[^\n]*\n)/m, `$1- ${utcDay()} Friday Action: ${line}${drafts.length ? `; seasonal drafts: ${drafts.join(", ")}` : ""}.\n`));
  return `${line}${short.length ? `; short on ${short.join(", ")} (add rows to prospects/seeds/)` : ""}${drafts.length ? `; ${drafts.length} seasonal drafts to review (${drafts.join(", ")})` : ""}.`;
}

// --- Main ---------------------------------------------------------------------------------------------------------
async function main(argv) {
  const arg = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : ""; };
  const mode = argv[0];
  DIR = path.resolve(arg("--dir") || process.cwd());
  DRY = argv.includes("--dry");
  SINCE = /^\d{4}-\d{2}-\d{2}$/.test(arg("--since")) ? arg("--since") : "";
  WEEK = /^W\d{1,2}$/.test(arg("--week")) ? arg("--week") : "";
  if (!fs.existsSync(path.join(DIR, "tools", "instantly_campaigns.py"))) throw new Error("Usage: node scripts/outreach-weekly.js <prospects|leads|replies|holidays|sync> --dir <outreach folder> [--dry]");
  if (mode === "holidays") return console.log(tool("holidays", ...(DRY ? ["--dry"] : [])).trim());
  if (mode === "sync") {
    return execFileSync("node", [path.join(__dirname, "jarvis-marketing-sync.js"), "--dir", DIR, "--state", path.join(DIR, "tracker"), ...(DRY ? ["--dry"] : [])], { stdio: "inherit" });
  }
  if (!JOBS.includes(mode)) throw new Error("Unknown mode " + mode + ".");
  const lines = [`${new Date().toISOString()} ${mode} (GitHub Action)`];
  const log = (s) => { if (!s) return; lines.push(...String(s).split("\n")); console.log(s); };
  let notify = "";
  let failed = false;
  try {
    notify = await { prospects, leads: leadsJob, replies }[mode](log);
  } catch (error) {
    failed = true;
    log("error: " + String(error.message || error).split("\n")[0]);
    log("exit 1");
    notify = `The ${mode} run failed: ${String(error.message || error).split("\n")[0]}`.slice(0, 200);
  }
  if (notify) log("NOTIFY: " + notify);
  write(`tracker/logs/last-${mode}.txt`, lines.join("\n") + "\n");
  if (notify) await push(failed ? "Outreach " + mode + " failed" : "Outreach " + mode, notify).catch((error) => console.error("push failed:", error.message));
  if (failed) process.exitCode = 1;
}

if (require.main === module) main(process.argv.slice(2)).catch((error) => { console.error(error.message); process.exit(1); });

module.exports = { emailsIn, openWeeks, bare };
