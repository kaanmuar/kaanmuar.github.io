#!/usr/bin/env node
/* Renders the LinkedIn Premium kit for the QA-lab URL Review company page:
   cover slideshow, proof cards from the Live Reports, a carousel PDF, the page copy, and the month plan.
     node scripts/linkedin-studio/build.js [--batch premium-2026-10] [--start 2026-10-21] [--renews 2026-11-19] */

const fs = require("fs");
const path = require("path");
require("../playwright-sandbox");
const { chromium } = require("playwright");
const sharp = require("sharp");

const ROOT = path.resolve(__dirname, "../..");
const SITE = "https://carlosandmunoz.com";
const REPORTS = path.join(ROOT, "assets/live-reports");

function args() {
  const out = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i].replace(/^--/, "");
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) out[key] = true;
    else { out[key] = next; i += 1; }
  }
  return out;
}

const opts = args();
const BATCH = opts.batch || "premium-2026-10";
const OUT = path.join(ROOT, "media/linkedin", BATCH);
const START = opts.start || "2026-10-20";
const RENEWS = opts.renews || "2026-11-19";

const SECTOR_LABELS = { opensource: "Open source", highered: "Higher education", devdocs: "Developer docs", fintech: "Fintech", humanitarian: "Humanitarian", international: "International" };
const EXPORTS = ["Jira", "TestRail", "Xray", "Zephyr", "Azure DevOps", "Mantis", "Excel", "PDF", "JSON"];

function link(medium, campaign) {
  return SITE + "/qa-review.html?utm_source=linkedin&utm_medium=" + medium + "&utm_campaign=" + campaign;
}

function readReports() {
  return fs.readdirSync(REPORTS)
    .filter((f) => f.endsWith(".json") && f !== "index.json")
    .map((f) => JSON.parse(fs.readFileSync(path.join(REPORTS, f), "utf8")));
}

function totals(reports) {
  return {
    reports: reports.length,
    pages: reports.reduce((sum, r) => sum + (Number(r.pages) || 0), 0),
    countries: new Set(reports.map((r) => r.country)).size,
    sectors: new Set(reports.map((r) => r.sector)).size,
    exports: EXPORTS
  };
}

function sectorLabel(sector) {
  return SECTOR_LABELS[sector] || sector.charAt(0).toUpperCase() + sector.slice(1);
}

function proofPicks(reports, count) {
  const seen = new Set();
  return reports
    .filter((r) => r.rank && r.rank.overall && Array.isArray(r.fix) && r.fix.length && Array.isArray(r.works) && r.works.length)
    .sort((a, b) => a.rank.overall.rank - b.rank.overall.rank)
    .filter((r) => !seen.has(r.sector) && seen.add(r.sector))
    .slice(0, count)
    .map((r) => ({
      id: r.id, name: r.name, host: r.host, flag: r.flag, read: r.read, pages: r.pages,
      overall: r.overall, grade: r.grade, rank: r.rank.overall.rank, of: r.rank.overall.of,
      sector: r.sector, sectorLabel: sectorLabel(r.sector),
      fix: r.fix[0].title, works: r.works[0].title,
      areas: Object.entries((r.score && r.score.areas) || {}).map(([name, a]) => [name === "GEO" ? "AI search" : name, a.score])
    }));
}

function addDays(stamp, days) {
  const d = new Date(stamp + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function mondaysBetween(from, to) {
  const out = [];
  for (let d = from; d < to; d = addDays(d, 1)) if (new Date(d + "T12:00:00Z").getUTCDay() === 1) out.push(d);
  return out;
}

function pageCopy(t) {
  return {
    tagline: "One public URL in. A plain-language QA review out: SEO, AI search, analytics, security, accessibility, speed.",
    button: { label: "Visit website", url: link("company_page", "premium-cta") },
    highlights: [
      { text: nf(t.reports) + " public sites reviewed in Live Reports", detail: nf(t.pages) + " pages, " + t.countries + " countries", featured: true },
      { text: "Proposed test cases for 20 frameworks", detail: "Exports to Jira, TestRail, Xray, Zephyr" },
      { text: "Reports in six languages", detail: "English, Spanish, Portuguese, French, +2" },
      { text: "First review included", detail: "Up to 20 pages, 2 links deep" }
    ].map((h) => ({ ...h, url: link("company_page", "premium-highlight") })),
    competitors: ["Siteimprove", "Semrush", "Ahrefs", "Screaming Frog", "Sitebulb", "Lumar (formerly Deepcrawl)", "Silktide", "Deque Systems, Inc", "Testlio"],
    testimonial: "Leave off until a URL Review client gives a quote in their own words. Do not reuse CV testimonials here."
  };
}

function carouselPost(t, picks) {
  const read = new Date(picks[0].read + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  return [
    "What a URL Review finds on the best sites we read.",
    "We read " + nf(t.reports) + " public sites, " + nf(t.pages) + " pages across " + t.countries + " countries. The top site in each of " + (["three", "four", "five", "six", "seven"][picks.length - 3] || picks.length) + " sectors still had one thing to fix first:",
    picks.map((p) => "→ " + p.name + ", " + p.overall + ": " + p.fix).join("\n"),
    "Swipe for the six area scores and what each site already does well.",
    "One automated read of public pages on " + read + ". A starting point, not a verdict.\nYour first review is included, up to 20 pages: " + link("social", "premium-carousel"),
    "#QA #SEO #Accessibility #WebPerformance"
  ].join("\n\n");
}

// LinkedIn rejects document titles over 58 characters.
const CAROUSEL_TITLE = "QA-lab URL Review: what it finds on the best sites we read";
if (CAROUSEL_TITLE.length > 58) throw new Error("Carousel title is " + CAROUSEL_TITLE.length + " characters; LinkedIn allows 58");

function nf(n) {
  return Number(n).toLocaleString("en-US");
}

function plan(copy) {
  const rows = [];
  const add = (date, time, action, where, asset, url) => rows.push([date, time, action, where, asset || "", url || ""]);
  add(START, "", "Upload the three cover slides as the dynamic cover, in order: promise, proof, handoff", "Edit page > Banner", "cover-promise.png cover-proof.png cover-handoff.png");
  add(START, "", "Set the custom button to " + copy.button.label, "Edit page > Buttons", "", copy.button.url);
  add(START, "", "Replace the tagline and the four highlights with the copy in page.json", "Edit page > Page info", "page.json");
  add(START, "", "Add competitors for the insights tab", "Analytics > Competitors", "");
  add(START, "", "Post the carousel PDF with the title and text in page.json (carouselTitle, carouselPost), then pin it in Featured", "Page post", "carousel.pdf", link("social", "premium-carousel"));
  add(START, "", "Send follow invitations to connections who work in QA, web, or marketing; credits are few, so pick only clear fits", "Invite to follow", "");
  mondaysBetween(START, RENEWS).forEach((d) => add(d, "", "Review who visited the page, competitor insights, and LinkedIn opens in admin; pin last week's best runs post in Featured", "Analytics, Featured", ""));
  add(addDays(RENEWS, -3), "", "Decide whether to keep Premium; export page analytics either way", "Premium features > Manage subscription", "");
  add(addDays(RENEWS, -1), "", "Last day to cancel before Premium renews on " + RENEWS, "Premium features > Manage subscription", "");
  return rows.sort((a, b) => (a[0] + a[1]).localeCompare(b[0] + b[1]));
}

function csv(rows) {
  const cell = (v) => /[",\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v);
  return rows.map((r) => r.map(cell).join(",")).join("\n") + "\n";
}

function indexHtml(t, picks, copy, rows) {
  const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
  const img = (file, w) => '<a href="' + file + '"><img src="' + file + '" width="' + w + '" alt="' + esc(file) + '"></a>';
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex"><title>LinkedIn Premium kit · ' + esc(BATCH) + "</title>" +
    "<style>body{font:15px/1.5 Inter,system-ui,sans-serif;background:#050c0f;color:#eef6f7;margin:0 auto;max-width:1180px;padding:32px}a{color:#7ef6fb}img{display:block;max-width:100%;border-radius:10px;margin:8px 0}" +
    ".row{display:flex;gap:16px;flex-wrap:wrap}table{border-collapse:collapse;width:100%}td,th{border-top:1px solid #1d3439;padding:6px 8px;text-align:left;vertical-align:top}code{color:#e2c48a}</style></head><body>" +
    "<h1>LinkedIn Premium kit</h1><p>" + nf(t.reports) + " Live Reports · " + nf(t.pages) + " pages · " + t.countries + " countries · " + t.sectors + " sectors. Premium renews on " + esc(RENEWS) + ".</p>" +
    "<h2>Cover slideshow (1128×191, rendered at 2×)</h2>" + ["promise", "proof", "handoff"].map((v) => img("cover-" + v + ".png", 1128)).join("") +
    "<h2>Page copy</h2><p><b>Tagline:</b> " + esc(copy.tagline) + "</p><p><b>Button:</b> " + esc(copy.button.label) + " → <code>" + esc(copy.button.url) + "</code></p>" +
    "<p><b>Highlights:</b></p><ul>" + copy.highlights.map((h) => "<li>" + esc(h.text) + " · <i>" + esc(h.detail) + "</i>" + (h.featured ? " (featured)" : "") + "</li>").join("") + "</ul>" +
    "<p><b>Competitors:</b> " + esc(copy.competitors.join(", ")) + "</p><p><b>Testimonial:</b> " + esc(copy.testimonial) + "</p>" +
    '<h2>Carousel PDF</h2><p><a href="carousel.pdf">carousel.pdf</a> · ' + (picks.length + 2) + " pages</p>" +
    "<p><b>Document title:</b> " + esc(CAROUSEL_TITLE) + "</p>" +
    '<p><b>Post text:</b></p><pre style="white-space:pre-wrap">' + esc(carouselPost(t, picks)) + "</pre>" +
    '<h2>Proof cards</h2><div class="row">' + picks.map((p) => "<div>" + img("proof-" + p.id + ".jpg", 260) + esc(p.name) + "</div>").join("") + "</div>" +
    '<h2>Month plan</h2><p><a href="plan.csv">plan.csv</a></p><table><tr><th>Date</th><th>Time</th><th>Action</th><th>Where</th><th>Asset</th></tr>' +
    rows.map((r) => "<tr><td>" + esc(r[0]) + "</td><td>" + esc(r[1]) + "</td><td>" + esc(r[2]) + (r[5] ? '<br><code>' + esc(r[5]) + "</code>" : "") + "</td><td>" + esc(r[3]) + "</td><td>" + esc(r[4]) + "</td></tr>").join("") +
    "</table></body></html>\n";
}

async function shoot(page, spec, file, size, scale) {
  await page.setViewportSize({ width: size[0], height: size[1] });
  await page.evaluate((s) => window.render(s), spec);
  const png = await page.locator("#c").screenshot({ scale: scale > 1 ? "device" : "css" });
  if (file.endsWith(".jpg")) await sharp(png).jpeg({ quality: 90, mozjpeg: true }).toFile(file);
  else fs.writeFileSync(file, png);
  return png;
}

async function pdfFrom(browser, images, file) {
  const html = "<!doctype html><html><head><style>@page{size:1080px 1350px;margin:0}html,body{margin:0}img{display:block;width:1080px;height:1350px;page-break-after:always}</style></head><body>" +
    images.map((img) => '<img src="' + path.basename(img) + '">').join("") + "</body></html>";
  const tmp = path.join(path.dirname(file), ".pdf-" + path.basename(file, ".pdf") + ".html");
  fs.writeFileSync(tmp, html);
  const page = await browser.newPage();
  await page.goto("file://" + tmp);
  await page.waitForFunction(() => Array.from(document.images).every((i) => i.complete));
  await page.pdf({ path: file, width: "1080px", height: "1350px", printBackground: true });
  await page.close();
  fs.unlinkSync(tmp);
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const reports = readReports();
  const t = totals(reports);
  const picks = proofPicks(reports, 5);
  const copy = pageCopy(t);
  const rows = plan(copy);

  const browser = await chromium.launch({ channel: "chromium" });
  const cover = await browser.newPage({ deviceScaleFactor: 2 });
  await cover.goto("file://" + path.join(__dirname, "frame.html"));
  for (const variant of ["promise", "proof", "handoff"]) {
    await shoot(cover, { kind: "cover", variant, data: t }, path.join(OUT, "cover-" + variant + ".png"), [1128, 191], 2);
  }
  await cover.close();

  const page = await browser.newPage();
  await page.goto("file://" + path.join(__dirname, "frame.html"));
  const total = picks.length + 2;
  const slides = [];
  const slide = async (spec, name) => {
    const file = path.join(OUT, name);
    await shoot(page, spec, file, [1080, 1350], 1);
    slides.push(file);
  };
  await slide({ kind: "page", variant: "open", data: Object.assign({ total }, t) }, ".slide-open.jpg");
  for (const p of picks) {
    await shoot(page, { kind: "proof", data: { report: p } }, path.join(OUT, "proof-" + p.id + ".jpg"), [1080, 1350], 1);
    slides.push(path.join(OUT, "proof-" + p.id + ".jpg"));
  }
  await slide({ kind: "page", variant: "close", data: { total } }, ".slide-close.jpg");
  await pdfFrom(browser, slides, path.join(OUT, "carousel.pdf"));
  slides.filter((f) => path.basename(f).startsWith(".slide-")).forEach((f) => fs.unlinkSync(f));
  await browser.close();

  fs.writeFileSync(path.join(OUT, "page.json"), JSON.stringify(Object.assign({ batch: BATCH, renews: RENEWS, totals: t, carousel: picks.map((p) => p.id), carouselTitle: CAROUSEL_TITLE, carouselPost: carouselPost(t, picks) }, copy), null, 2) + "\n");
  fs.writeFileSync(path.join(OUT, "plan.csv"), csv([["Date", "Time", "Action", "Where", "Asset", "Link"]].concat(rows)));
  fs.writeFileSync(path.join(OUT, "index.html"), indexHtml(t, picks, copy, rows));
  console.log("LinkedIn kit:", path.relative(ROOT, OUT), "· carousel", picks.map((p) => p.id).join(", "));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
