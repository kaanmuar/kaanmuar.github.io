/* Weekly sweep round-up (#2159): the past week's nightly sweep sites (assets/live-reports/*.json, series "auto") as one
   neutral post: how many sites, in how many countries, and the issues that came up most often. It names no site, owner
   or handle (no roasts, #2073). The draft waits as a proposal in assets/social/sweep-roundups.json, which Jarvis and the
   admin Social hub list next to the field-sweep proposals; approved, it posts like any hub item.

     node scripts/sweep-roundup.js [--date 2026-11-09] [--dry]
       --date  the run day (default today, UTC); the week is the 7 days before it
       --dry   print the caption and write nothing

   A card keeps only its top 6 findings, so a share reads "among the top issues on N% of sites", never "N% fail". */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.resolve(__dirname, "..");
const SITE = "https://carlosandmunoz.com";
const CARDS = path.join(ROOT, "assets/live-reports");
const BOOK = "assets/social/sweep-roundups.json";
const IMAGES = "assets/social/sweep-roundup";
const MIN_SITES = 30;
const TOP = 3;
const KEEP = 6;
// #2171: posts link to the sample report (its top case is a ranked P1 failure since #2114); false links the plain review page.
const SAMPLE_READY = true;

const LABELS = {
  "a11y-labels.title": "Form fields without a label",
  "ax-title.color-contrast": "Text with too little color contrast",
  "sec-hsts.title": "No HSTS header",
  "ax-title.link-name": "Links with no readable name",
  "an-firing.before.title": "Tracking that starts before the visitor chooses",
  "ax-title.target-size": "Touch targets smaller than 24 px",
  "ax-title.button-name": "Buttons with no readable name",
  "sec-http.title": "Plain http that does not redirect to https",
  "a11y-zoom.title": "Pages that block zooming",
  "ax-title.label-content-name-mismatch": "Visible text missing from the accessible name",
  "an-reject.title": "Tracking that continues after Reject"
};

const addDays = (day, n) => { const d = new Date(day + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const shortDate = (day) => new Date(day + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const pct = (n, of) => Math.round((100 * n) / of);

function argValue(name) {
  const at = process.argv.indexOf("--" + name);
  return at > -1 && process.argv[at + 1] && !process.argv[at + 1].startsWith("--") ? process.argv[at + 1] : null;
}

function readCards(dir) {
  return fs.readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => {
    try { return JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")); } catch (error) { return null; }
  }).filter(Boolean);
}

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/** The week before `day`: sweep sites, countries, median score and the labelled issues found on the most sites. */
function roundup(cards, day) {
  const from = addDays(day, -7);
  const to = addDays(day, -1);
  const week = cards.filter((c) => c && c.series === "auto" && c.read >= from && c.read <= to);
  const counts = {};
  week.forEach((card) => {
    const ids = new Set((card.fix || []).filter((f) => f && f.verdict === "fail").map((f) => f.msg && f.msg.title && f.msg.title.id));
    ids.forEach((id) => { if (LABELS[id]) counts[id] = (counts[id] || 0) + 1; });
  });
  const issues = Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, TOP)
    .map(([id, n]) => ({ id, label: LABELS[id], sites: n, share: pct(n, week.length) }));
  return {
    day, from, to,
    sites: week.length,
    countries: new Set(week.map((c) => c.country).filter(Boolean)).size,
    median: median(week.map((c) => Number(c.overall))),
    issues,
    hosts: week.map((c) => c.host).filter(Boolean),
    names: week.map((c) => c.name).filter(Boolean)
  };
}

function link(day) {
  const url = new URL(SITE + "/qa-review.html");
  if (SAMPLE_READY) url.searchParams.set("sample", "1");
  url.searchParams.set("week", day);
  return url.toString();
}

function caption(r) {
  const lines = [
    "Our nightly sweep reviewed " + r.sites + " public websites in " + r.countries + " countries last week (" + shortDate(r.from) + " to " + shortDate(r.to) + ").",
    "",
    "What came up most often among each site's top issues:",
    ...r.issues.map((i) => "• " + i.label + ": " + i.share + "% of sites"),
    "",
    "Most of these are small fixes. " + (SAMPLE_READY ? "See one full case and its fix in our sample report:" : "Check your own site with URL Review:"),
    link(r.day),
    "",
    "Ran a review already? Your report reopens free for 7 days."
  ];
  return lines.join("\n");
}

/** Throws when a host from the week, or a site name of 6+ characters as a whole word, would appear in the post. */
function assertNeutral(text, r) {
  const lower = text.toLowerCase();
  const own = new URL(SITE).hostname;
  const word = (n) => new RegExp("(^|[^\\p{L}\\p{N}])" + n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "($|[^\\p{L}\\p{N}])", "u");
  const host = (r.hosts || []).map((h) => String(h).toLowerCase().replace(/^www\./, "")).find((h) => h && h !== own && lower.includes(h));
  const name = (r.names || []).map((n) => String(n).toLowerCase().trim()).find((n) => n.length >= 6 && word(n).test(lower));
  const hit = host || name;
  if (hit) throw new Error("The round-up names a swept site (" + hit + "); posts from the sweep stay neutral.");
  return text;
}

function proposal(r) {
  const title = "Nightly sweep: " + r.sites + " sites in " + r.countries + " countries, " + shortDate(r.from) + " to " + shortDate(r.to);
  const summary = assertNeutral(caption(r), r);
  assertNeutral(title, r);
  return {
    id: crypto.createHash("sha1").update("sweep-roundup:" + r.day).digest("hex").slice(0, 12),
    title, url: link(r.day), source: "URL Review nightly sweep", own: true,
    date: r.day, topic: "Field sweep", lang: "en", summary,
    why: "Weekly round-up of the nightly sweep. No site is named.",
    image: IMAGES + "/" + r.day + ".jpg", score: 100
  };
}

function cardHtml(r) {
  const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" })[ch]);
  const rows = r.issues.map((i) => `<li><b>${i.share}%</b><span>${esc(i.label)}</span></li>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    * { box-sizing: border-box; margin: 0; }
    body { width: 1080px; height: 1350px; background: #10161d; color: #e8eef2; font-family: "Inter", "Helvetica Neue", Arial, sans-serif; }
    #c { width: 1080px; height: 1350px; padding: 96px 88px; display: flex; flex-direction: column; background: radial-gradient(circle at 85% 8%, rgba(77,179,187,.22), transparent 42%), #10161d; }
    .eyebrow { color: #4db3bb; font-size: 30px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
    h1 { margin-top: 36px; font-size: 92px; line-height: 1.02; font-weight: 800; letter-spacing: -.02em; }
    .when { margin-top: 22px; color: #9aa5b1; font-size: 34px; }
    h2 { margin-top: 84px; font-size: 34px; color: #9aa5b1; font-weight: 600; }
    ul { list-style: none; padding: 0; margin-top: 26px; display: grid; gap: 22px; }
    li { display: flex; align-items: center; gap: 30px; padding: 26px 30px; border: 1px solid #2a3440; border-left: 8px solid #4db3bb; border-radius: 18px; background: #161d26; }
    li b { min-width: 150px; font-size: 64px; font-weight: 800; color: #4db3bb; }
    li span { font-size: 38px; line-height: 1.2; }
    .foot { margin-top: auto; display: flex; justify-content: space-between; align-items: flex-end; color: #9aa5b1; font-size: 26px; line-height: 1.4; }
    .foot strong { color: #e8eef2; font-size: 32px; }
  </style></head><body><div id="c">
    <p class="eyebrow">URL Review · Nightly sweep</p>
    <h1>${r.sites} websites,<br>${r.countries} countries</h1>
    <p class="when">${esc(shortDate(r.from))} to ${esc(shortDate(r.to))}${r.median != null ? " · median score " + r.median + "/100" : ""}</p>
    <h2>Most common among each site's top issues</h2>
    <ul>${rows}</ul>
    <div class="foot"><p>Share of sites where it was among<br>the top issues. No site is named.</p><strong>carlosandmunoz.com</strong></div>
  </div></body></html>`;
}

async function renderCard(r, file) {
  const { chromium } = require("playwright");
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1080, height: 1350 } });
    await page.setContent(cardHtml(r), { waitUntil: "load" });
    fs.mkdirSync(path.dirname(file), { recursive: true });
    await page.locator("#c").screenshot({ path: file, type: "jpeg", quality: 90 });
  } finally {
    await browser.close();
  }
}

function nextBook(book, entry, built) {
  const kept = ((book && book.proposals) || []).filter((p) => p && p.id !== entry.id);
  return { version: 1, built, proposals: [entry].concat(kept).sort((a, b) => b.date.localeCompare(a.date)).slice(0, KEEP) };
}

function output(key, value) {
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, key + "=" + value + "\n");
}

async function main() {
  const day = argValue("date") || new Date().toISOString().slice(0, 10);
  const r = roundup(readCards(CARDS), day);
  if (r.sites < MIN_SITES || r.issues.length < TOP) {
    console.log("Only " + r.sites + " sweep sites from " + r.from + " to " + r.to + "; no round-up this week.");
    output("written", "0");
    return;
  }
  const entry = proposal(r);
  console.log(entry.title + "\n\n" + entry.summary);
  if (process.argv.includes("--dry")) return;
  await renderCard(r, path.join(ROOT, entry.image));
  const file = path.join(ROOT, BOOK);
  const book = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : null;
  fs.writeFileSync(file, JSON.stringify(nextBook(book, entry, new Date().toISOString()), null, 1) + "\n");
  console.log("wrote", BOOK, "and", entry.image);
  output("written", "1");
  output("day", day);
}

if (require.main === module) main().catch((error) => { console.error(error.message); process.exit(1); });

module.exports = { LABELS, MIN_SITES, roundup, caption, assertNeutral, proposal, nextBook, cardHtml, link };
