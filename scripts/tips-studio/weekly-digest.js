/* This week in web quality: every Friday, five picks from the field sweep (assets/social/proposals.json), each
   summed up in our own words and credited to its author and source, as one news post in lane 3 (#1112).
   Each edition is scripts/tips-studio/weekly-digest/<friday>.json; its batch is digest-<friday>, and edition N
   speaks turn N of the six-language rotation.

     node scripts/tips-studio/weekly-digest.js --draft [--date 2026-11-06]
       writes the next Friday's edition from the sweep's picks of the week before, marked draft
     node scripts/tips-studio/build.js --source weekly-digest [--batch digest-2026-10-30]
       renders the newest edition (or the named one); a draft edition stops the build

   A draft holds the sweep's own titles and summaries. Before rendering, open every link and read it, then write
   title, short (the spoken list), and summary in our words, saying only what the article says, and delete
   "draft". Prefer primary, reputable sources (W3C, WAI, web.dev, Chrome, WebAIM, Deque, Playwright releases). */

const fs = require("fs");
const path = require("path");
const { tagLine } = require("../social-tags");
const { xPost } = require("./tips");
const cal = require("../social-calendar");
const ledger = require("../social-ledger");

const ROOT = path.resolve(__dirname, "../..");
const SITE = "https://carlosandmunoz.com";
const GUIDE = SITE + "/qa-review-social.html";
const DIR = path.join(__dirname, "weekly-digest");
const KIND = "news";
const SLUG = "01-this-week";
const CATS = { Field: { label: "Field sweep", color: "#e2c48a" } };
const WINDOWS = Object.fromEntries(cal.NETWORKS.map((network) => [network, cal.WINDOWS[network]]));
const CLASH = 10;

const UI = {
  en: { tryThis: "Five picks", guided: "Social hub", never: "Our words, their sources", end: "This week in web quality.", endNote: "All five, with their sources, on our social hub." },
  es: { tryThis: "Cinco destacados", guided: "Hub social", never: "Nuestras palabras, sus fuentes", end: "Esta semana en calidad web.", endNote: "Los cinco, con sus fuentes, en nuestro hub social." },
  pt: { tryThis: "Cinco destaques", guided: "Hub social", never: "Nossas palavras, as fontes originais", end: "Esta semana em qualidade web.", endNote: "Os cinco, com as fontes, no nosso hub social." },
  de: { tryThis: "Fünf Empfehlungen", guided: "Social Hub", never: "Unsere Worte, ihre Quellen", end: "Diese Woche in Sachen Web-Qualität.", endNote: "Alle fünf mit Quellen in unserem Social Hub." },
  fr: { tryThis: "Cinq choix", guided: "Hub social", never: "Nos mots, leurs sources", end: "Cette semaine en qualité web.", endNote: "Les cinq, avec leurs sources, sur notre hub social." },
  it: { tryThis: "Cinque scelte", guided: "Hub social", never: "Parole nostre, fonti loro", end: "Questa settimana nella qualità web.", endNote: "Tutte e cinque, con le fonti, sul nostro hub social." }
};

const minutes = (t) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
const hhmm = (min) => String(Math.floor(min / 60)).padStart(2, "0") + ":" + String(min % 60).padStart(2, "0");
const addDays = (day, n) => { const d = new Date(day + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const longDate = (day) => new Date(day + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

function editions() {
  return fs.existsSync(DIR) ? fs.readdirSync(DIR).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().map((f) => f.slice(0, 10)) : [];
}

function argValue(name) {
  const at = process.argv.indexOf("--" + name);
  return at > -1 && process.argv[at + 1] && !process.argv[at + 1].startsWith("--") ? process.argv[at + 1] : null;
}

function credit(pick) { return pick.author ? "By " + pick.author + ", " + pick.source : "From " + pick.source; }
function plainTitle(tip) { return tip.title.join(" ").replace(/\*/g, "").replace(/\s+/g, " ").trim(); }
function listOf(words) { return words.length < 2 ? words.join("") : words.slice(0, -1).join(", ") + " and " + words[words.length - 1]; }
function tagged(url, platform, content) {
  return url + "?" + new URLSearchParams({ utm_source: platform, utm_medium: "social", utm_campaign: "weekly-digest", utm_content: content }).toString();
}

function load(date) {
  const all = editions();
  const day = date || all[all.length - 1];
  if (!day || !all.includes(day)) throw new Error("no weekly digest edition " + (day || "yet") + " in " + path.relative(ROOT, DIR));
  const edition = JSON.parse(fs.readFileSync(path.join(DIR, day + ".json"), "utf8"));
  return Object.assign(edition, { date: day, turn: all.indexOf(day), batch: "digest-" + day });
}

function postFor(edition) {
  if (edition.picks.length !== 5) throw new Error("edition " + edition.date + " has " + edition.picks.length + " picks, not 5");
  const action = listOf(edition.picks.map((p) => p.short)) + ". Sources on our social hub.";
  const titles = "This week in web quality card, " + longDate(edition.date) + ", five picks: " + edition.picks.map((p) => p.title).join("; ") + ".";
  return {
    id: "this-week", cat: "Field", kind: KIND, date: edition.date, pin: true,
    counter: longDate(edition.date),
    title: ["This week in", "*web quality.*"],
    body: "Five picks from our daily sweep of the field, each summed up in our own words and credited to its source.",
    visual: { type: "list", items: edition.picks.map((p) => ({ title: p.title, by: p.author ? p.source + " · " + p.author : p.source })) },
    action,
    alt: titles.length <= 300 ? titles : titles.slice(0, 299).replace(/\s+\S*$/, "") + "…",
    tags: ["WebDev", "Accessibility", "SEO"]
  };
}

const EDITION = editions().length ? load(argValue("batch") ? argValue("batch").replace(/^digest-/, "") : null) : null;
const TIPS = EDITION ? [postFor(EDITION)] : [];
const BATCH = EDITION && EDITION.batch;
const LANG_OFFSET = EDITION ? EDITION.turn : 0;
TIPS.forEach((tip) => { tip.times = Object.fromEntries(cal.NETWORKS.map((network) => [network, timeFor(tip, network)])); });

function hostFor() { return "carlosandmunoz.com/qa-review-social.html"; }
function postUrl(platform) { return tagged(SITE + "/social/" + BATCH + "/" + SLUG + ".html", platform, BATCH); }
function link(platform) { return tagged(GUIDE, platform, BATCH); }

function captions(tip) {
  const head = plainTitle(tip);
  const dated = "This week in web quality, " + longDate(EDITION.date);
  const picks = (withLink) => EDITION.picks.map((p, i) => [(i + 1) + ". " + p.title, p.summary, credit(p) + (withLink ? ": " + p.url : ".")].join("\n")).join("\n\n");
  const tags = (network) => tagLine(tip, network);
  return {
    linkedin: [dated, "", tip.body, "", picks(true), "", "Every digest, tip and site review on our social hub: " + link("linkedin"), "", tags("linkedin")].join("\n"),
    x: xPost("This week in web quality: " + listOf(EDITION.picks.map((p) => p.short)) + ".", postUrl("x"), tags("x")),
    instagram: [dated, "", tip.body, "", picks(false), "", "Every source is linked on our social hub. Link in bio.", "", tags("instagram")].join("\n"),
    facebook: [dated, "", tip.body, "", picks(true), "", "Every digest, tip and site review on our social hub: " + link("facebook"), "", tags("facebook")].join("\n"),
    tiktok: head + " " + tip.action + " " + tags("tiktok"),
    youtubeTitle: (head + " #Shorts").slice(0, 100),
    youtube: [tip.body, "", EDITION.picks.map((p, i) => (i + 1) + ". " + p.title + ": " + p.url).join("\n"), "", "Summaries and sources: " + postUrl("youtube"), "", dated + " · QA-lab URL Review", "", tags("youtube")].join("\n")
  };
}

// Times other posts hold on that day and network: their calendar rows and what Buffer or the Page has queued.
function busy(day, channel) {
  const out = [];
  const posts = path.join(ROOT, "media/social-posts");
  fs.readdirSync(posts).filter((batch) => batch !== BATCH && fs.existsSync(path.join(posts, batch, "calendar.csv"))).forEach((batch) => {
    fs.readFileSync(path.join(posts, batch, "calendar.csv"), "utf8").trim().split("\n").slice(1).forEach((line) => {
      const [date, time, ch] = line.split(",");
      if (date === day && ch === channel && /^\d\d:\d\d$/.test(time)) out.push(minutes(time));
    });
  });
  [ledger.BUFFER, ledger.FACEBOOK].forEach((file) => Object.entries(ledger.read(path.join(ROOT, file)).posts).forEach(([id, entries]) => entries.forEach((e) => {
    if (id.startsWith(BATCH + "/") || e.result !== "queued" || e.channel !== channel || !e.at) return;
    const local = new Date(Date.parse(e.at) - 5 * 3600e3).toISOString();
    if (local.slice(0, 10) === day) out.push(minutes(local.slice(11, 16)));
  })));
  return out.sort((a, b) => a - b);
}

// The lane 3 slot of the planner (scripts/social-calendar.js); when a queued post already sits within CLASH
// minutes of it, the middle of the widest free stretch of the network's window.
function timeFor(tip, channel) {
  const slot = cal.slotTime(tip.date, channel, cal.LANES[KIND]);
  const taken = busy(tip.date, channel);
  if (!taken.some((t) => Math.abs(t - minutes(slot)) < CLASH)) return slot;
  const [from, to] = WINDOWS[channel].map(minutes);
  const marks = [from].concat(taken.filter((t) => t > from && t < to), to);
  let best = [from, to];
  marks.slice(1).forEach((t, i) => { if (t - marks[i] > best[1] - best[0] || best[0] === from && best[1] === to) best = [marks[i], t]; });
  return hhmm(Math.round((best[0] + best[1]) / 2 / 5) * 5);
}

/* --draft: the five best picks the sweep found in the seven days up to the Friday, at most one per topic first and
   two per source, reputable hosts first, never a link an earlier edition already ran. */
const REPUTABLE = ["w3.org", "web.dev", "developer.chrome.com", "developers.google.com", "webaim.org", "deque.com", "playwright.dev",
  "github.com/microsoft/playwright", "developer.mozilla.org", "webkit.org", "hacks.mozilla.org", "cypress.io", "searchenginejournal.com"];

function draft() {
  const all = editions();
  const date = argValue("date") || addDays(all.length ? all[all.length - 1] : "2026-10-23", 7);
  if (new Date(date + "T12:00:00Z").getUTCDay() !== 5) throw new Error(date + " is not a Friday");
  const file = path.join(DIR, date + ".json");
  if (fs.existsSync(file)) throw new Error(path.relative(ROOT, file) + " already exists");
  const ran = new Set(all.flatMap((day) => JSON.parse(fs.readFileSync(path.join(DIR, day + ".json"), "utf8")).picks.map((p) => p.url)));
  const { proposals } = JSON.parse(fs.readFileSync(path.join(ROOT, "assets/social/proposals.json"), "utf8"));
  const trusted = (url) => REPUTABLE.some((host) => url.replace(/^https?:\/\/(www\.)?/, "").startsWith(host));
  const pool = proposals.filter((p) => p.date > addDays(date, -7) && p.date <= date && !ran.has(p.url))
    .map((p) => Object.assign({}, p, { rank: p.score * (trusted(p.url) ? 2 : 1) })).sort((a, b) => b.rank - a.rank);
  const picks = [];
  const count = (key, value) => picks.filter((p) => p[key] === value).length;
  pool.forEach((p) => { if (picks.length < 5 && !count("topic", p.topic) && count("source", p.source) < 2) picks.push(p); });
  pool.forEach((p) => { if (picks.length < 5 && !picks.includes(p) && count("source", p.source) < 2) picks.push(p); });
  if (picks.length < 5) throw new Error("only " + picks.length + " picks from the sweep between " + addDays(date, -6) + " and " + date);
  const edition = { date, draft: true, picks: picks.map((p) => Object.assign({ id: p.id, topic: p.topic, title: p.title, short: "", summary: p.summary, source: p.source },
    p.author ? { author: p.author } : {}, { published: p.date, url: p.url })) };
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(edition, null, 1) + "\n");
  console.log("drafted " + path.relative(ROOT, file) + ":\n" + picks.map((p, i) => "  " + (i + 1) + ". [" + p.topic + "] " + p.title + " (" + p.source + ")\n     " + p.url).join("\n"));
  console.log("Open each link, rewrite title, short and summary in our words, delete \"draft\", then:\n  node scripts/tips-studio/build.js --source weekly-digest");
}

if (require.main === module) {
  if (process.argv.includes("--draft")) {
    try { draft(); } catch (error) { console.error(error.message); process.exit(1); }
  } else console.log(EDITION ? "edition " + EDITION.date + " (" + BATCH + "), language turn " + LANG_OFFSET : "no edition yet");
} else if (EDITION && EDITION.draft && /build\.js$/.test(process.argv[1] || "")) {
  throw new Error("edition " + EDITION.date + " is a draft: check each pick against its article, rewrite it, and delete \"draft\" first");
}

module.exports = { SITE, GUIDE, CATS, KIND, TIPS, UI, WINDOWS, BATCH, LANG_OFFSET, captions, link, plainTitle, hostFor, timeFor, credit, postFor, load, editions };
