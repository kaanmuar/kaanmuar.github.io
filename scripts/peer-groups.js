#!/usr/bin/env node
/* Peer-group outreach (#2363): 2 to 6 natural competitors in one sector and place, one comparison report each.
     node scripts/peer-groups.js build --dir <outreach folder> [--groups 50] [--dry]
     node scripts/peer-groups.js send  --dir <outreach folder> [--dry]
     node scripts/peer-groups.js status --dir <outreach folder>
   build  picks sector and place pairs not used yet (SECTORS x PLACES), asks Workers AI for the official sites of up to
          six competitors there, opens each site, keeps the real ones with an address they publish, and queues every
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
const FILE = "prospects/peer-groups.csv";
const HEADER = ["group", "sector", "place", "cc", "language", "host", "org", "email", "contact_name", "source_url", "queued", "review_id", "peer_doc", "rank", "peer_count", "score", "sector_label", "comparison_url", "status", "uploaded"];
// The sending domain's Worker (qalabreview/src/routes.js) forwards /<lang>/peers/<id>/<token> to the comparison.
const SHORT = "https://qalabreview.com";

// scope "country": too few of them in one city, so the group is national.
const SECTORS = [
  { key: "university", scope: "city", en: "universities", es: "universidades", pt: "universidades", fr: "universités", it: "università", de: "Hochschulen" },
  { key: "hotel", scope: "city", en: "hotels", es: "hoteles", pt: "hotéis", fr: "hôtels", it: "hotel", de: "Hotels" },
  { key: "online-store", scope: "country", en: "online stores", es: "tiendas online", pt: "lojas online", fr: "boutiques en ligne", it: "negozi online", de: "Onlineshops" },
  { key: "supermarket", scope: "country", en: "supermarket chains", es: "cadenas de supermercados", pt: "redes de supermercados", fr: "chaînes de supermarchés", it: "catene di supermercati", de: "Supermarktketten" },
  { key: "car-dealer", scope: "city", en: "car dealerships", es: "concesionarios de autos", pt: "concessionárias de carros", fr: "concessionnaires automobiles", it: "concessionari auto", de: "Autohäuser" },
  { key: "motorcycle-dealer", scope: "city", en: "motorcycle dealerships", es: "concesionarios de motos", pt: "concessionárias de motos", fr: "concessionnaires moto", it: "concessionari moto", de: "Motorradhändler" },
  { key: "yacht-broker", scope: "country", en: "yacht and boat dealers", es: "vendedores de yates y barcos", pt: "vendedores de iates e barcos", fr: "vendeurs de yachts et bateaux", it: "venditori di yacht e barche", de: "Yacht- und Boothändler" },
  { key: "aircraft-dealer", scope: "country", en: "aircraft sellers", es: "vendedores de aeronaves", pt: "vendedores de aeronaves", fr: "vendeurs d'avions", it: "venditori di aerei", de: "Flugzeughändler" },
  { key: "bicycle-shop", scope: "city", en: "bicycle shops", es: "tiendas de bicicletas", pt: "lojas de bicicletas", fr: "magasins de vélos", it: "negozi di biciclette", de: "Fahrradläden" },
  { key: "truck-dealer", scope: "country", en: "truck dealers", es: "concesionarios de camiones", pt: "concessionárias de caminhões", fr: "concessionnaires de camions", it: "concessionari di camion", de: "Lkw-Händler" },
  { key: "pet-store", scope: "city", en: "pet stores", es: "tiendas de mascotas", pt: "pet shops", fr: "animaleries", it: "negozi di animali", de: "Zoohandlungen" },
  { key: "hospital", scope: "city", en: "hospitals", es: "hospitales", pt: "hospitais", fr: "hôpitaux", it: "ospedali", de: "Krankenhäuser" },
  { key: "clinic", scope: "city", en: "private clinics", es: "clínicas privadas", pt: "clínicas privadas", fr: "cliniques privées", it: "cliniche private", de: "Privatkliniken" },
  { key: "dental-clinic", scope: "city", en: "dental clinics", es: "clínicas dentales", pt: "clínicas dentárias", fr: "cabinets dentaires", it: "studi dentistici", de: "Zahnkliniken" },
  { key: "real-estate", scope: "city", en: "real estate agencies", es: "inmobiliarias", pt: "imobiliárias", fr: "agences immobilières", it: "agenzie immobiliari", de: "Immobilienmakler" },
  { key: "private-school", scope: "city", en: "private schools", es: "colegios privados", pt: "escolas particulares", fr: "écoles privées", it: "scuole private", de: "Privatschulen" }
];
const PLACES = [
  ["co", "Bogotá", "Colombia", "es"], ["co", "Medellín", "Colombia", "es"], ["mx", "Ciudad de México", "México", "es"], ["mx", "Monterrey", "México", "es"],
  ["pe", "Lima", "Perú", "es"], ["cl", "Santiago", "Chile", "es"], ["ar", "Buenos Aires", "Argentina", "es"], ["ec", "Quito", "Ecuador", "es"],
  ["es", "Madrid", "España", "es"], ["es", "Barcelona", "España", "es"], ["br", "São Paulo", "Brasil", "pt"], ["br", "Rio de Janeiro", "Brasil", "pt"],
  ["pt", "Lisboa", "Portugal", "pt"], ["pt", "Porto", "Portugal", "pt"], ["us", "Miami", "United States", "en"], ["us", "Austin", "United States", "en"],
  ["us", "Chicago", "United States", "en"], ["ca", "Toronto", "Canada", "en"], ["gb", "London", "United Kingdom", "en"], ["gb", "Manchester", "United Kingdom", "en"],
  ["ie", "Dublin", "Ireland", "en"], ["au", "Sydney", "Australia", "en"], ["au", "Melbourne", "Australia", "en"], ["nz", "Auckland", "New Zealand", "en"],
  ["za", "Cape Town", "South Africa", "en"], ["in", "Bengaluru", "India", "en"], ["sg", "Singapore", "Singapore", "en"], ["ae", "Dubai", "United Arab Emirates", "en"],
  ["ph", "Manila", "Philippines", "en"], ["ng", "Lagos", "Nigeria", "en"], ["ke", "Nairobi", "Kenya", "en"], ["fr", "Paris", "France", "fr"],
  ["fr", "Lyon", "France", "fr"], ["be", "Bruxelles", "Belgique", "fr"], ["ca", "Montréal", "Canada", "fr"], ["ma", "Casablanca", "Maroc", "fr"],
  ["it", "Milano", "Italia", "it"], ["it", "Roma", "Italia", "it"], ["de", "Berlin", "Deutschland", "de"], ["de", "München", "Deutschland", "de"],
  ["at", "Wien", "Österreich", "de"], ["ch", "Zürich", "Schweiz", "de"]
].map(([cc, city, country, language]) => ({ cc, city, country, language }));

let DIR = "";
let DRY = false;
const read = (rel) => { try { return fs.readFileSync(path.join(DIR, rel), "utf8"); } catch { return ""; } };
const sheet = () => { const c = parseCsv(read(FILE)); if (!c.header.length) c.header = HEADER; return c; };
const save = (c) => { if (!DRY) fs.writeFileSync(path.join(DIR, FILE), toCsv(c.header, c.rows, c.eol)); };
const groupsOf = (rows) => rows.reduce((m, r) => m.set(r.group, (m.get(r.group) || []).concat(r)), new Map());
const labelOf = (key, lang) => { const s = SECTORS.find((x) => x.key === key); return (s && (s[lang] || s.en)) || key; };
const placeOf = (sector, p) => (sector.scope === "country" ? p.country : p.city + ", " + p.country);
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

// Sector and place pairs in a fixed walk, so each run takes the next ones no group has used.
function pairs(taken) {
  const out = [];
  const all = SECTORS.length * PLACES.length;
  const lap = all / gcd(SECTORS.length, PLACES.length);
  for (let i = 0; i < all; i += 1) {
    const sector = SECTORS[i % SECTORS.length];
    const place = PLACES[(i * 5 + Math.floor(i / lap)) % PLACES.length];
    const key = sector.key + "|" + (sector.scope === "country" ? place.cc : place.cc + "-" + place.city);
    if (!taken.has(key)) { taken.add(key); out.push({ sector, place, key }); }
  }
  return out;
}

async function groupFor(sector, place, skip, log) {
  const where = placeOf(sector, place);
  const named = await ai("You list real organisations and their official website domains. Answer only with JSON.",
    `List up to 8 well-known ${sector.en} in ${where} that compete with each other, each with the domain of its own official website (not a directory, marketplace, social network or booking platform). JSON: {"sites":[{"org":"...","host":"example.com"}]}`, { max: 700 });
  const hosts = [...new Set((named.sites || []).map((s) => bare(String(s.host || "").toLowerCase())).filter((h) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(h) && !skip.has(h)))].slice(0, 8);
  const facts = [];
  for (const host of hosts) {
    const f = await siteFacts(host);
    if (f) facts.push(Object.assign(f, { host: bare(new URL(f.url).host) }));
  }
  if (facts.length < PEERS_MIN + 1) return log(`  ${sector.key} ${where}: ${facts.length} sites opened of ${hosts.length} named, skipped`), [];
  const judged = await ai("You check websites for a B2B email about website quality. Answer only with JSON.",
    `Each site below was named as one of the ${sector.en} in ${where}. Keep only the official site of an organisation that is one of the ${sector.en} in ${where} (drop directories, marketplaces, news, government and duplicates of one brand). For each kept site pick the best published address for a first email about the website (marketing, communications, web, or a general contact; never privacy, jobs or support), or "" if none fits.\n` +
    facts.map((f) => JSON.stringify({ host: f.host, title: f.title, description: f.description.slice(0, 200), emails: f.emails.map((e) => e.email).slice(0, 12) })).join("\n") +
    `\nJSON: {"sites":[{"host":"...","org":"short brand name","email":"","contact_name":""}]}`, { max: 900 });
  const byHost = new Map(facts.map((f) => [f.host, f]));
  const kept = [];
  for (const s of judged.sites || []) {
    const f = byHost.get(bare(String(s.host || "").toLowerCase()));
    if (!f || kept.some((k) => k.host === f.host)) continue;
    const email = String(s.email || "").toLowerCase();
    const found = f.emails.find((e) => e.email === email);
    kept.push({ host: f.host, org: String(s.org || f.title).slice(0, 60), email: found && !skip.has(email) ? email : "", contact_name: String(s.contact_name || "").slice(0, 60), source_url: found ? found.url : "" });
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
  const skip = used();
  const fresh = [];
  let made = 0;
  for (const { sector, place, key } of pairs(taken)) {
    if (made >= want) break;
    let group = [];
    try {
      group = await groupFor(sector, place, skip, log);
    } catch (error) {
      if (error.fatal) throw error;
      log(`  ${key}: ${String(error.message || error).split("\n")[0]}`);
    }
    if (!group.length) continue;
    made += 1;
    const id = key + ":" + crypto.randomBytes(3).toString("hex");
    for (const g of group) {
      skip.add(g.host);
      if (g.email) skip.add(g.email);
      fresh.push(Object.assign({ group: id, sector: sector.key, place: placeOf(sector, place), cc: place.cc, language: place.language, queued: day(), status: "queued" }, g));
    }
  }
  c.rows = c.rows.concat(fresh.map((r) => Object.fromEntries(c.header.map((k) => [k, r[k] || ""]))));
  save(c);
  if (fresh.length && !DRY) {
    const queue = path.join(DIR, "prospects", "peer-sweep.csv");
    fs.writeFileSync(queue, toCsv(["host", "cc", "sector"], fresh.map((r) => ({ host: r.host, cc: r.cc, sector: r.sector }))));
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
    const doc = { sector: labelOf(done[0].sector, done[0].language), place: done[0].place, cc: done[0].cc, lang: done[0].language,
      hosts: done.map((r) => r.host), ids: done.map((r) => r.review_id), tokens, createdAt: new Date().toISOString() };
    const ref = { id: crypto.randomBytes(10).toString("hex") };
    if (!DRY) await store.collection("url_review_peer_groups").doc(ref.id).set(doc);
    const ranked = done.slice().sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0));
    for (const r of done) {
      Object.assign(r, { peer_doc: ref.id, rank: String(ranked.indexOf(r) + 1), peer_count: String(done.length), status: "ready", sector_label: labelOf(r.sector, r.language),
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

module.exports = { SECTORS, PLACES, pairs, placeOf };
