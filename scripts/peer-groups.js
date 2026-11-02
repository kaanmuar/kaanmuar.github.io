#!/usr/bin/env node
/* Peer-group outreach (#2363): 2 to 6 natural competitors in one sector and place, one comparison report each.
     node scripts/peer-groups.js build --dir <outreach folder> [--groups 50] [--dry]
     node scripts/peer-groups.js send  --dir <outreach folder> [--dry]
     node scripts/peer-groups.js status --dir <outreach folder>
   build  walks scripts/peer-sectors.json: ~230 sectors, each at the scopes where it competes (city, region, country,
          continent, global, or cross: the country's leaders next to the world's). For each unused sector, scope and
          place it asks Workers AI for the official sites of up to ten competitors and the country each one is from, opens each site, keeps the real ones with an address they publish, and queues every
          kept host for the nightly sweep (scripts/sweep-outreach.js). Rows go to prospects/peer-groups.csv.
   send   for every group whose hosts the sweep has reviewed (all of them, or at least PEERS_MIN after WAIT_DAYS),
          saves url_review_peer_groups/<id> with one token per host, writes each peer's own comparison link, rank and
          score on its rows, and uploads the rows with an address to the Instantly peer campaigns, which it starts
          (tools/peer_campaigns.py in the outreach folder; sequence H in collateral/emails-peers.md).
   Only hosts, sectors and places go to Firestore; names and addresses stay in the private outreach folder. */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFileSync } = require("child_process");
const { parseCsv, toCsv } = require("./jarvis-marketing-sync");
const { siteFacts, ai, bare } = require("./outreach-weekly");
const { db } = require("./sweep-outreach");

const PEERS_MIN = 2;
const PEERS_MAX = 6;
const WAIT_DAYS = 4;
const PARALLEL = 4;
const FILE = "prospects/peer-groups.csv";
const HEADER = ["group", "sector", "scope", "place", "phrase", "cc", "language", "host", "org", "email", "contact_name", "source_url", "queued", "review_id", "peer_doc", "rank", "peer_count", "score", "sector_label", "group_phrase", "comparison_url", "status", "uploaded"];
// The sending domain's Worker (qalabreview/src/routes.js) forwards /<lang>/peers/<id>/<token> to the comparison.
const SHORT = "https://qalabreview.com";

const TAXONOMY = require("./peer-sectors.json");
const SECTORS = TAXONOMY.sectors.map((sector) => Object.assign({}, sector, { scopes: TAXONOMY.presets[sector.preset] || [sector.preset] }));
const LANG_OF = Object.assign(Object.fromEntries(["co", "mx", "pe", "cl", "ar", "ec", "uy", "py", "bo", "cr", "pa", "do", "gt", "es", "ve", "hn", "sv", "ni", "cu", "pr"].map((cc) => [cc, "es"])),
  { br: "pt", pt: "pt", ao: "pt", mz: "pt", fr: "fr", be: "fr", ma: "fr", sn: "fr", ci: "fr", tn: "fr", dz: "fr", it: "it", de: "de", at: "de", ch: "de" });
const PLACES = {
  city: TAXONOMY.places.city.map(([cc, city, country]) => ({ cc, name: city + ", " + country, id: cc + "-" + city })),
  region: TAXONOMY.places.region.map(([cc, region, country]) => ({ cc, name: region + ", " + country, id: cc + "-" + region })),
  country: TAXONOMY.places.country.map(([cc, country]) => ({ cc, name: country, id: cc })),
  continent: TAXONOMY.places.continent.map((name) => ({ cc: "", name, id: name })),
  global: [{ cc: "", name: "the world", id: "world" }]
};
PLACES.cross = PLACES.country;
const langOf = (cc) => LANG_OF[cc] || "en";

// The English phrase a group is named by; emails and the page get it translated (labels()).
function phraseOf(sector, scope, place) {
  if (scope === "global") return sector.en + " worldwide";
  if (scope === "continent") return sector.en + " across " + place.name;
  if (scope === "cross") return sector.en + " in " + place.name + " and worldwide";
  return sector.en + " in " + place.name;
}

let DIR = "";
let DRY = false;
const read = (rel) => { try { return fs.readFileSync(path.join(DIR, rel), "utf8"); } catch { return ""; } };
const sheet = () => { const c = parseCsv(read(FILE)); if (!c.header.length) c.header = HEADER; return c; };
const save = (c) => { if (!DRY) fs.writeFileSync(path.join(DIR, FILE), toCsv(c.header, c.rows, c.eol)); };
const groupsOf = (rows) => rows.reduce((m, r) => m.set(r.group, (m.get(r.group) || []).concat(r)), new Map());
const sectorOf = (key) => SECTORS.find((x) => x.key === key);

// Translations of sector labels and group phrases, written once by Workers AI and kept in the outreach folder.
const LABELS = "prospects/peer-labels.json";
async function labels(texts, lang) {
  if (lang === "en") return Object.fromEntries(texts.map((t) => [t, t]));
  let cache = {};
  try { cache = JSON.parse(read(LABELS) || "{}"); } catch { cache = {}; }
  const missing = [...new Set(texts.filter((t) => !cache[lang + "|" + t]))];
  if (missing.length) {
    const out = await ai("You translate short business phrases for a B2B email. Answer only with JSON.",
      `Translate each English phrase to the language with code "${lang}", keeping proper names of places as they are written locally and using the natural plural. JSON: {"items":[{"en":"...","text":"..."}]}\n` + missing.map((t) => JSON.stringify(t)).join("\n"), { max: 1200 });
    for (const item of out.items || []) if (item && missing.includes(item.en) && item.text) cache[lang + "|" + item.en] = String(item.text).slice(0, 160);
    if (!DRY) fs.writeFileSync(path.join(DIR, LABELS), JSON.stringify(cache, null, 1) + "\n");
  }
  return Object.fromEntries(texts.map((t) => [t, cache[lang + "|" + t] || t]));
}

async function labelOf(key, lang) {
  const sector = sectorOf(key);
  if (!sector) return key;
  if (lang === "en" || sector[lang]) return sector[lang] || sector.en;
  return (await labels([sector.en], lang))[sector.en];
}
const day = () => new Date().toISOString().slice(0, 10);

// Hosts and addresses outreach already holds, so a peer group never writes twice to one inbox.
function used() {
  const out = new Set();
  for (const f of fs.readdirSync(path.join(DIR, "prospects")).filter((n) => n.endsWith(".csv"))) {
    for (const r of parseCsv(read("prospects/" + f)).rows) {
      for (const v of [r.host, r.email, r.email_or_domain]) if (v) out.add(bare(String(v).toLowerCase()));
    }
  }
  return out;
}

const gcd = (a, b) => (b ? gcd(b, a % b) : a);

// Sector, scope and place triples in a fixed walk: every sector before any repeats, its scopes in turn, and places
// stepped so neighbouring sectors land in different parts of the world.
function pairs(taken) {
  const out = [];
  const rounds = Math.max(...Object.values(PLACES).map((list) => list.length)) * 6;
  for (let i = 0; i < SECTORS.length * rounds; i += 1) {
    const sector = SECTORS[i % SECTORS.length];
    const lap = Math.floor(i / SECTORS.length);
    const scope = sector.scopes[(lap + (i % SECTORS.length)) % sector.scopes.length];
    const list = PLACES[scope];
    const place = list[(i * 7 + lap) % list.length];
    const key = sector.key + "|" + scope + "|" + place.id;
    if (!taken.has(key)) { taken.add(key); out.push({ sector, scope, place, key }); }
  }
  return out;
}

async function groupFor(sector, scope, place, skip, log) {
  const where = phraseOf(sector, scope, place);
  const ask = scope === "cross"
    ? `List 5 leading ${sector.en} in ${place.name} and 5 leading ${sector.en} worldwide`
    : `List up to 10 well-known ${where} that compete with each other`;
  const named = await ai("You list real organisations and their official website domains. Answer only with JSON.",
    `${ask}, each with the domain of its own official website (not a directory, marketplace, social network, booking platform or government body) and the two-letter ISO code of the country it is based in. Prefer independent organisations over brands of one group. JSON: {"sites":[{"org":"...","host":"example.com","cc":"us"}]}`, { max: 900 });
  const ccOf = new Map((named.sites || []).map((s) => [bare(String(s.host || "").toLowerCase()), String(s.cc || "").toLowerCase()]));
  const hosts = [...new Set((named.sites || []).map((s) => bare(String(s.host || "").toLowerCase())).filter((h) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(h) && !skip.has(h)))].slice(0, 10);
  const facts = (await Promise.all(hosts.map((host) => siteFacts(host).catch(() => null))))
    .filter(Boolean).map((f) => Object.assign(f, { host: bare(new URL(f.url).host) }));
  if (facts.length < PEERS_MIN + 1) return log(`  ${sector.key} ${where}: ${facts.length} sites opened of ${hosts.length} named, skipped`), [];
  const judged = await ai("You check websites for a B2B email about website quality. Answer only with JSON.",
    `Each site below was named as one of the ${where}. Keep only the official site of an organisation that is one of the ${where} (drop directories, marketplaces, news, government bodies and sister brands of one group). For each kept site pick the best published address for a first email about the website (marketing, communications, web, or a general contact; never privacy, jobs or support), or "" if none fits.\n` +
    facts.map((f) => JSON.stringify({ host: f.host, title: f.title, description: f.description.slice(0, 200), emails: f.emails.map((e) => e.email).slice(0, 12) })).join("\n") +
    `\nJSON: {"sites":[{"host":"...","org":"short brand name","email":"","contact_name":""}]}`, { max: 900 });
  const byHost = new Map(facts.map((f) => [f.host, f]));
  const kept = [];
  for (const s of judged.sites || []) {
    const f = byHost.get(bare(String(s.host || "").toLowerCase()));
    if (!f || kept.some((k) => k.host === f.host)) continue;
    const email = String(s.email || "").toLowerCase();
    const found = f.emails.find((e) => e.email === email);
    const cc = place.cc || (/^[a-z]{2}$/.test(ccOf.get(f.host) || "") ? ccOf.get(f.host) : (f.host.match(/\.([a-z]{2})$/) || [])[1] || "us");
    kept.push({ host: f.host, cc, language: langOf(cc), org: String(s.org || f.title).slice(0, 60), email: found && !skip.has(email) ? email : "", contact_name: String(s.contact_name || "").slice(0, 60), source_url: found ? found.url : "" });
  }
  const group = kept.slice(0, PEERS_MAX);
  if (group.length < PEERS_MIN + 1 || group.filter((k) => k.email).length < PEERS_MIN) {
    log(`  ${sector.key} ${where}: ${group.length} kept, ${group.filter((k) => k.email).length} with an address, skipped`);
    return [];
  }
  log(`  ${sector.key} ${where}: ${group.map((k) => k.host + (k.email ? "*" : "")).join(", ")}`);
  return group;
}

async function build(want, log) {
  const c = sheet();
  const taken = new Set(c.rows.map((r) => r.group.split(":")[0]));
  for (const h of HEADER) if (!c.header.includes(h)) c.header.push(h);
  const skip = used();
  const fresh = [];
  let made = 0;
  const todo = pairs(taken);
  // A few pairs at a time: most of the wait is sites that are slow to answer.
  const worker = async () => {
    while (made < want && todo.length) {
      const { sector, scope, place, key } = todo.shift();
      let group = [];
      try {
        group = await groupFor(sector, scope, place, skip, log);
      } catch (error) {
        if (error.fatal) throw error;
        log(`  ${key}: ${String(error.message || error).split("\n")[0]}`);
      }
      group = group.filter((g) => !skip.has(g.host));
      if (group.length < PEERS_MIN + 1 || made >= want) continue;
      made += 1;
      const id = key + ":" + crypto.randomBytes(3).toString("hex");
      for (const g of group) {
        skip.add(g.host);
        if (g.email) skip.add(g.email);
        fresh.push(Object.assign({ group: id, sector: sector.key, scope, place: place.name, phrase: phraseOf(sector, scope, place), queued: day(), status: "queued" }, g));
      }
    }
  };
  await Promise.all(Array.from({ length: PARALLEL }, worker));
  c.rows = c.rows.concat(fresh.map((r) => Object.fromEntries(c.header.map((k) => [k, r[k] || ""]))));
  save(c);
  const waiting = c.rows.filter((r) => r.status === "queued");
  if (waiting.length && !DRY) {
    const queue = path.join(DIR, "prospects", "peer-sweep.csv");
    fs.writeFileSync(queue, toCsv(["host", "cc", "sector"], waiting.map((r) => ({ host: r.host, cc: r.cc, sector: r.sector }))));
    log(execFileSync("node", [path.join(__dirname, "sweep-outreach.js"), "add", queue], { encoding: "utf8" }).trim());
  }
  return `${made} peer groups built (${fresh.length} sites, ${fresh.filter((r) => r.email).length} with an address), queued for the sweep`;
}

// The newest finished sweep review of a host.
async function reviewOf(store, host) {
  const rows = [];
  for (const h of [host, "www." + host]) {
    const snap = await store.collection("url_reviews").where("sweep.host", "==", h).limit(10).get();
    snap.forEach((doc) => { const d = doc.data(); if (d.report && d.report.insights) rows.push({ id: doc.id, at: String(d.createdAt || d.report.fetchedAt || ""), score: ((d.report.insights.score || {}).overall) }); });
  }
  return rows.sort((a, b) => b.at.localeCompare(a.at))[0] || null;
}

async function send(log) {
  const c = sheet();
  for (const h of HEADER) if (!c.header.includes(h)) c.header.push(h);
  const store = db();
  let opened = 0;
  for (const [id, rows] of groupsOf(c.rows)) {
    if (rows.some((r) => r.peer_doc) || rows.some((r) => r.status === "dropped")) continue;
    for (const r of rows) {
      const found = r.review_id ? { id: r.review_id, score: Number(r.score) } : await reviewOf(store, r.host);
      if (found) Object.assign(r, { review_id: found.id, score: typeof found.score === "number" ? String(found.score) : "" });
    }
    const done = rows.filter((r) => r.review_id);
    const waited = (Date.now() - Date.parse(rows[0].queued)) / 86400000 >= WAIT_DAYS;
    if (done.length < rows.length && !waited) continue;
    if (done.length < PEERS_MIN || !done.some((r) => r.email)) {
      if (waited) rows.forEach((r) => { r.status = "dropped"; });
      continue;
    }
    const tokens = {};
    done.forEach((r) => { r.token = crypto.randomBytes(12).toString("hex"); tokens[r.token] = r.host; });
    const english = done[0].phrase || ((sectorOf(done[0].sector) || { en: done[0].sector }).en + " in " + done[0].place);
    const phrase = { en: english };
    for (const lang of [...new Set(done.map((r) => r.language))]) phrase[lang] = (await labels([english], lang))[english];
    const doc = { sector: (sectorOf(done[0].sector) || { en: done[0].sector }).en, place: done[0].place, scope: done[0].scope || "", phrase,
      hosts: done.map((r) => r.host), ids: done.map((r) => r.review_id), tokens, createdAt: new Date().toISOString() };
    const ref = { id: crypto.randomBytes(10).toString("hex") };
    if (!DRY) await store.collection("url_review_peer_groups").doc(ref.id).set(doc);
    const ranked = done.slice().sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0));
    for (const r of done) {
      Object.assign(r, { peer_doc: ref.id, rank: String(ranked.indexOf(r) + 1), peer_count: String(done.length), status: "ready",
        sector_label: await labelOf(r.sector, r.language), group_phrase: phrase[r.language] || english,
        comparison_url: SHORT + "/" + r.language + "/peers/" + ref.id + "/" + r.token });
      delete r.token;
    }
    rows.filter((r) => !r.review_id).forEach((r) => { r.status = "not reviewed"; });
    opened += 1;
    log(`  ${id}: ${done.length} of ${rows.length} reviewed, saved as ${ref.id}`);
  }
  save(c);
  const ready = c.rows.filter((r) => r.status === "ready" && r.email && !r.uploaded).length;
  if (ready) log(execFileSync("python3", [path.join(DIR, "tools", "peer_campaigns.py"), "upload", ...(DRY ? ["--dry"] : [])], { cwd: DIR, encoding: "utf8", timeout: 20 * 60000 }).trim());
  return `${opened} peer comparisons saved; ${ready} peers sent to the Instantly peer campaigns`;
}

function status() {
  const rows = sheet().rows;
  const groups = groupsOf(rows);
  const count = (s) => [...groups.values()].filter((g) => g[0].status === s || g.some((r) => r.status === s)).length;
  return `${groups.size} peer groups: ${count("queued")} waiting for the sweep, ${count("ready")} compared, ${count("dropped")} dropped; ${rows.filter((r) => r.uploaded).length} peers uploaded`;
}

async function main(argv) {
  const arg = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : ""; };
  DIR = path.resolve(arg("--dir") || process.cwd());
  DRY = argv.includes("--dry");
  if (!fs.existsSync(path.join(DIR, "prospects"))) throw new Error("Usage: node scripts/peer-groups.js <build|send|status> --dir <outreach folder> [--groups N] [--dry]");
  const log = (s) => s && console.log(s);
  const mode = argv[0];
  if (mode === "build") return log(await build(Math.max(1, Number(arg("--groups")) || 10), log));
  if (mode === "send") return log(await send(log));
  if (mode === "status") return log(status());
  throw new Error("Unknown mode " + mode + ".");
}

if (require.main === module) main(process.argv.slice(2)).catch((error) => { console.error(error.message || error); process.exit(1); });

module.exports = { SECTORS, PLACES, pairs, phraseOf, langOf };
