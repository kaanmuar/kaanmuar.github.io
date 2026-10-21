#!/usr/bin/env node
/* Daily: every publishable user review becomes a Live Report and a social post.

     PUBLISH_KEY=... node scripts/auto-live-reports.js            # since the last run
     node scripts/auto-live-reports.js --from saved.json          # a saved /publishable answer
     node scripts/auto-live-reports.js --since 2026-10-20T00:00:00Z

   Reads GET reviewUrl/publishable (functions/url-review-publish.js does the filtering and strips
   every requester detail), adds or replaces one card per host in assets/live-reports/, drops hosts
   that asked to be unlisted, and writes previews/auto-live-reports/batch.json for the tips studio
   (scripts/tips-studio/runs-auto.js). Hosts with a hand-checked card keep it. A host gets one
   social post per POST_EVERY_DAYS; its card still refreshes. Copy is a template: the engine's own
   finding titles plus a general lesson that holds for any site. State (since, posted hosts, recent
   lessons) lives in scripts/auto-live-reports.state.json and is committed by the workflow. */

const fs = require("fs");
const path = require("path");
const live = require("./build-live-reports");

const ROOT = path.resolve(__dirname, "..");
const STATE = path.join(__dirname, "auto-live-reports.state.json");
const BATCH_DIR = path.join(ROOT, "previews/auto-live-reports");
const ENDPOINT = process.env.PUBLISH_URL || "https://us-central1-carlosm-interactive-cv.cloudfunctions.net/reviewUrl/publishable";
const POST_EVERY_DAYS = 30;

// Top finding key: [the gap, in a few words; a lesson that is true for any site; hashtags].
const LESSONS = {
  "sec-hsts": ["HSTS", "Send Strict-Transport-Security with a max-age of at least a year, so browsers never try plain http again.", ["WebSecurity", "HSTS", "HTTPS"]],
  "sec-http": ["the https redirect", "Redirect every http request to https with one permanent 301, then add HSTS.", ["WebSecurity", "HTTPS", "Redirects"]],
  "sec-frame": ["framing", "Send frame-ancestors 'self' in the CSP, or X-Frame-Options: SAMEORIGIN, so other sites cannot frame your pages.", ["WebSecurity", "Clickjacking", "HTTPHeaders"]],
  "sec-csp": ["the CSP", "Tighten the content security policy one directive at a time, starting from default-src 'self'.", ["WebSecurity", "CSP", "HTTPHeaders"]],
  "sec-cookies": ["cookie flags", "Set Secure, HttpOnly, and SameSite on every cookie that scripts do not need to read.", ["WebSecurity", "Cookies", "HTTPHeaders"]],
  "sec-tls": ["TLS", "Renew the TLS certificate automatically, and alert well before it expires.", ["WebSecurity", "TLS", "HTTPS"]],
  "sec-permissions": ["Permissions-Policy", "Send a Permissions-Policy header that turns off camera, microphone, and geolocation where pages do not use them.", ["WebSecurity", "PermissionsPolicy", "HTTPHeaders"]],
  "sec-referrer": ["Referrer-Policy", "Send Referrer-Policy: strict-origin-when-cross-origin, so full addresses do not leak to other sites.", ["WebSecurity", "HTTPHeaders", "Privacy"]],
  "sec-headers-uneven": ["uneven headers", "Set security headers at the edge, once, so every page and path sends the same ones.", ["WebSecurity", "HTTPHeaders", "Headers"]],
  "a11y-labels": ["form labels", "Give every input a visible label tied to it with for and id. Screen readers announce it, and the tap target grows.", ["Accessibility", "Forms", "A11y"]],
  "a11y-alt": ["alt text", "Describe what each image shows in its alt attribute, and use alt=\"\" on purely decorative ones.", ["Accessibility", "A11y", "WebDev"]],
  "a11y-zoom": ["pinch-zoom", "Remove maximum-scale and user-scalable=no from the viewport tag. People need to zoom.", ["Accessibility", "Zoom", "MobileUX"]],
  "a11y-lang": ["the page language", "Set lang on the html element, so screen readers pronounce the page in the right language.", ["Accessibility", "Lang", "A11y"]],
  "a11y-frames": ["frame titles", "Give every iframe a title that says what it holds.", ["Accessibility", "A11y", "WebDev"]],
  "a11y-main": ["landmarks", "Wrap each page's main content in one main element, so screen-reader users can jump straight to it.", ["Accessibility", "Landmarks", "A11y"]],
  "a11y-h1": ["headings", "Give each page exactly one h1 that names it, then nest the rest in order.", ["Accessibility", "Headings", "SEO"]],
  "seo-broken-links": ["broken links", "Check your own links after each release, and fix or redirect every one that answers 404.", ["SEO", "BrokenLinks", "QA"]],
  "seo-sitemap-offhost": ["the sitemap host", "Serve sitemap.xml from the same host as the pages it lists, and name it in robots.txt.", ["SEO", "Sitemap", "RobotsTxt"]],
  "seo-sitemap": ["the sitemap", "Publish a sitemap.xml of the pages you want found, and name it in robots.txt with one Sitemap: line.", ["SEO", "Sitemap", "RobotsTxt"]],
  "seo-title-missing": ["page titles", "Give every page a unique title of about 60 characters: the page first, the site second.", ["SEO", "Titles", "SERP"]],
  "seo-description-missing": ["meta descriptions", "Write a description of about 150 characters for each key page, so you choose the snippet, not the crawler.", ["SEO", "MetaDescription", "SERP"]],
  "seo-canonical-away": ["canonicals", "Point each page's canonical at itself, unless it really is a copy of another page.", ["SEO", "Canonical", "WebDev"]],
  "seo-canonical-missing": ["canonicals", "Add a self-referencing canonical link to every page you want indexed.", ["SEO", "Canonical", "WebDev"]],
  "seo-noindex": ["noindex", "Review every noindex on purpose, and remove it from pages you want found.", ["SEO", "SERP", "WebDev"]],
  "seo-viewport": ["the viewport", "Add a width=device-width, initial-scale=1 viewport to every page, so phones do not shrink it.", ["MobileUX", "SEO", "WebDev"]],
  "seo-schema-props": ["schema fields", "Fill the required properties of each JSON-LD type, then test it in the Rich Results Test.", ["StructuredData", "SEO", "GEO"]],
  "seo-schema-parse": ["JSON-LD", "Validate each JSON-LD block after every release. One stray comma hides all of it.", ["StructuredData", "SEO", "GEO"]],
  "seo-hreflang": ["hreflang", "Make every language version list all the others, itself included, with matching hreflang links.", ["SEO", "Hreflang", "i18n"]],
  "geo-crawlers": ["AI crawler access", "Decide per bot in robots.txt: allow the answer engines you want to be cited by, and block only training crawlers.", ["GEO", "AISearch", "RobotsTxt"]],
  "geo-crawlers-partial": ["AI crawler access", "Decide per bot in robots.txt: allow the answer engines you want to be cited by, and block only training crawlers.", ["GEO", "AISearch", "RobotsTxt"]],
  "geo-entity": ["who runs the site", "Add one Organization block with name, url, logo, and sameAs links. AI answers use it to name you.", ["GEO", "StructuredData", "AISearch"]],
  "geo-llms": ["llms.txt", "Publish a short /llms.txt that points AI assistants at your key pages.", ["GEO", "AISearch", "WebDev"]],
  "an-duplicate": ["duplicate tags", "Load each measurement tag once, from one place, so every visit counts once.", ["Analytics", "GA4", "Measurement"]],
  "an-consent": ["consent", "Load tracking only after a consent choice, or use Consent Mode v2 so tags wait for it.", ["Analytics", "Privacy", "GA4"]],
  "an-utm": ["campaign tags", "Keep the query string on every redirect, so campaign tags reach the landing page.", ["Analytics", "Measurement", "Redirects"]],
  "an-gaps": ["measurement gaps", "Put the same measurement tag on every page, so no part of the site goes uncounted.", ["Analytics", "Measurement", "GA4"]],
  "pf-cls": ["layout shift", "Give images, ads, and embeds a width and height, so the page does not jump while it loads.", ["WebPerformance", "CoreWebVitals", "CLS"]],
  "pf-blocking": ["blocking scripts", "Add defer to every script the first paint does not need.", ["WebPerformance", "PageWeight", "LCP"]],
  "pf-field": ["real-user speed", "Start with the largest image on the first screen: size it, compress it, and preload it.", ["WebPerformance", "CoreWebVitals", "LCP"]]
};
const AREA_GAPS = { SEO: "search", GEO: "AI search", Analytics: "measurement", Security: "security headers", Accessibility: "accessibility", Performance: "speed" };
const AREA_TAGS = { SEO: ["SEO"], GEO: ["GEO", "AISearch"], Analytics: ["Analytics"], Security: ["WebSecurity"], Accessibility: ["Accessibility"], Performance: ["WebPerformance"] };
const CC = { uk: "GB" };
const SECOND_LEVEL = /^(gov|gob|com|edu|org|net|mil|ac|co)$/;

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

function bare(host) { return String(host || "").toLowerCase().replace(/^www\./, ""); }

// A country only when the address says so: .de, .gov.co, .com.mx. A bare .co or .io says nothing.
function countryOf(host) {
  const labels = bare(host).split(".");
  const tld = labels[labels.length - 1];
  const code = CC[tld] || tld.toUpperCase();
  if (!live.REGIONS[code]) return "";
  if (tld === "co" && !(labels.length >= 3 && SECOND_LEVEL.test(labels[labels.length - 2]))) return "";
  return code;
}

function sentence(text) {
  const t = live.scrub(text, 160).replace(/[.…]+$/, "");
  return t ? t + "." : "";
}
function lower(text) { return /^[A-Z][a-z]/.test(text) ? text[0].toLowerCase() + text.slice(1) : text; }

function copyFor(report, recent) {
  const ins = report.insights;
  const gaps = ins.findings.filter((f) => f.verdict === "fail" || f.verdict === "risk").sort((a, b) => (a.rank || 999) - (b.rank || 999));
  const top = gaps.slice(0, 3);
  const gap = top.find((f) => LESSONS[f.key] && !recent.includes(f.key)) || top.find((f) => LESSONS[f.key]) || top[0];
  const passes = ins.findings.filter((f) => f.verdict === "pass");
  const good = [];
  for (const f of passes) { if (good.length < 2 && !good.some((g) => g.area === f.area)) good.push(f); }
  const name = bare(report.host);
  const head = name.length <= 22 ? name + ": {overall}." : "Scored {overall} of 100.";
  if (!gap) {
    return { key: "", title: [head, "*Nothing failed.*"], tags: ["QA", "WebDev", "SEO"],
      body: [sentence(good[0] && good[0].title), sentence(good[1] && good[1].title), "No check failed on the pages analyzed."].filter(Boolean).join(" "),
      action: "Keep the review in your release checklist, so the next change keeps it that way." };
  }
  const lesson = LESSONS[gap.key];
  const strengths = good.map((g) => live.scrub(g.title, 90).replace(/\.$/, ""));
  const lead = strengths.length === 2 ? strengths[0] + ", and " + lower(strengths[1]) + "." : strengths.length ? strengths[0] + "." : "";
  return {
    key: gap.key,
    title: [head, "*The gap: " + (lesson ? lesson[0] : AREA_GAPS[gap.area] || gap.area) + ".*"],
    body: (lead ? lead + " But " + lower(sentence(gap.title)) : sentence(gap.title)).trim(),
    action: lesson ? lesson[1] : sentence(gap.fix) || "Fix the first item in the report, then run the review again.",
    tags: lesson ? lesson[2] : (AREA_TAGS[gap.area] || []).concat(["QA", "WebDev"]).slice(0, 3)
  };
}

async function fetchPublishable(since) {
  if (!process.env.PUBLISH_KEY) throw new Error("PUBLISH_KEY is not set.");
  const res = await fetch(ENDPOINT + "?since=" + encodeURIComponent(since), { headers: { "x-publish-key": process.env.PUBLISH_KEY } });
  if (!res.ok) throw new Error("publishable answered " + res.status + ": " + (await res.text()).slice(0, 200));
  return res.json();
}

function output(values) {
  const lines = Object.entries(values).map(([k, v]) => k + "=" + v);
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, lines.join("\n") + "\n");
  console.log(lines.join(" "));
}

async function main() {
  const opts = args();
  const state = fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, "utf8")) : { since: new Date(Date.now() - 864e5).toISOString(), posted: {}, recent: [] };
  const payload = opts.from ? JSON.parse(fs.readFileSync(opts.from, "utf8")) : await fetchPublishable(opts.since || state.since);
  const unlisted = (payload.unlisted || []).map(bare);
  const gone = (host) => unlisted.some((u) => bare(host) === u || bare(host).endsWith("." + u));

  const items = live.existingItems((card) => !gone(card.host));
  const removed = live.existingItems().length - items.length;
  const curated = new Set(items.filter((x) => x.card.series !== "auto").map((x) => bare(x.card.host)));
  const today = new Date().toISOString().slice(0, 10);
  const batch = [];
  let added = 0;
  for (const { report } of payload.reports || []) {
    const host = bare(report.host);
    if (curated.has(host) || gone(host)) continue;
    const copy = copyFor(report, state.recent || []);
    const country = countryOf(host);
    const run = { id: "u-" + host.replace(/[^a-z0-9]+/g, "-").slice(0, 60), data: report, scope: "Requested",
      title: copy.title, body: copy.body, action: copy.action, tags: copy.tags, meta: [host, "", "", "", country] };
    let built;
    try { built = live.build(run, "auto"); } catch (error) { console.warn("skip", host, "-", error.message); continue; }
    const at = items.findIndex((x) => x.card.id === run.id);
    if (at >= 0) items.splice(at, 1, built); else items.push(built);
    added += 1;
    const last = (state.posted || {})[host];
    if (last && (Date.parse(today) - Date.parse(last)) / 864e5 < POST_EVERY_DAYS) continue;
    const score = report.insights.score;
    batch.push({ id: run.id, host, title: copy.title, body: copy.body, action: copy.action, tags: copy.tags, scope: "Requested",
      fetchedAt: report.fetchedAt, pages: report.limits.pagesRead, overall: score.overall,
      areas: Object.fromEntries(live.AREAS.map((a) => [a, score.areas[a].score])) });
    state.posted = Object.assign(state.posted || {}, { [host]: today });
    if (copy.key) state.recent = [copy.key].concat(state.recent || []).slice(0, 5);
  }

  if (added || removed) live.writeAll(items);
  fs.mkdirSync(BATCH_DIR, { recursive: true });
  fs.writeFileSync(path.join(BATCH_DIR, "batch.json"), JSON.stringify(batch, null, 1) + "\n");
  if (!opts.from) state.since = payload.until || state.since;
  fs.writeFileSync(STATE, JSON.stringify(state, null, 1) + "\n");
  console.log("read " + (payload.read || 0) + ", held " + JSON.stringify(payload.held || {}));
  output({ cards: added, removed, social: batch.length, batch: "auto-" + today, total: items.length });
}

main().catch((error) => { console.error(error); process.exit(1); });
