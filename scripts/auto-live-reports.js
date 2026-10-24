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
// Sites the country sweep reviewed (functions/url-review-sweep.js) all get a card, but only this
// many become social posts per batch, so requested reviews keep the feed and Buffer stays under its cap.
const SWEEP_POSTS_PER_BATCH = 2;
// Rival-sweep comparisons (functions/url-review-rivals.js): a site and its natural competitors in one
// post. Each competitor's own review gets a card but no post of its own.
const COMPARE_POSTS_PER_BATCH = 2;

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
  "pf-field": ["real-user speed", "Start with the largest image on the first screen: size it, compress it, and preload it.", ["WebPerformance", "CoreWebVitals", "LCP"]],
  "sec-safebrowsing": ["a Safe Browsing listing", "Watch the Security issues report in Search Console, clean the cause the day it appears, then request a review.", ["WebSecurity", "SafeBrowsing", "Malware"]],
  "sec-domain-expiry": ["domain renewal", "Turn on automatic renewal for every domain you own, and keep the card on file valid.", ["WebSecurity", "Domains", "DNS"]],
  "sec-domain-lock": ["the domain transfer lock", "Turn on the registrar's transfer lock, and two-factor sign-in for the registrar account.", ["WebSecurity", "Domains", "DNS"]],
  "sec-mta-sts": ["MTA-STS", "Publish an MTA-STS policy in testing mode, read the TLS-RPT reports, then switch it to enforce.", ["EmailSecurity", "MTASTS", "DNS"]],
  "sec-tlsrpt": ["TLS-RPT", "Publish a TLS-RPT record, so you hear when other servers cannot deliver your mail over TLS.", ["EmailSecurity", "TLSRPT", "DNS"]],
  "sec-libraries": ["outdated libraries", "Check front-end library versions against a known-flaw list on every release, and upgrade the ones that are flagged.", ["WebSecurity", "Dependencies", "JavaScript"]],
  "an-privacy": ["the privacy notice", "Link a privacy notice from the footer of every page: who controls the data, what is collected, why, and the visitor's rights.", ["Privacy", "GDPR", "WebDev"]],
  "an-imprint": ["the Impressum", "Link an Impressum from every page: who runs the site, a postal address, an email, and the register numbers.", ["Impressum", "Legal", "WebDev"]],
  "a11y-statement": ["the accessibility statement", "Publish an accessibility statement with known gaps and a contact for access problems, and link it from every page.", ["Accessibility", "EAA", "A11y"]],
  "an-chat-consent": ["chat before consent", "Load the chat widget after consent, or on the first click of a plain chat button.", ["Privacy", "Cookies", "Chatbots"]],
  "an-chat-reject": ["chat after Reject", "Put the chat widget in a consent category, and block it when that category is refused.", ["Privacy", "Cookies", "Chatbots"]],
  "an-chat-privacy": ["the chat's privacy link", "Link the privacy notice from the chat's welcome screen, before anyone types personal data.", ["Privacy", "Chatbots", "GDPR"]],
  "pf-chat": ["chat weight", "Load the chat widget on the first click of a plain button, so it costs nothing until someone needs help.", ["WebPerformance", "Chatbots", "PageWeight"]],
  "a11y-chat-cover": ["the chat button", "Keep the chat launcher clear of the cookie banner and call-to-action buttons on a phone.", ["Accessibility", "MobileUX", "Chatbots"]],
  "a11y-chat-name": ["the chat button's name", "Give the chat launcher an accessible name such as \"Open chat\".", ["Accessibility", "A11y", "Chatbots"]],
  "a11y-chat-focus": ["chat focus", "Move keyboard focus into the chat when it opens, and back to the launcher when it closes.", ["Accessibility", "Keyboard", "Chatbots"]],
  "a11y-chat-trap": ["a keyboard trap", "Let Escape close the chat and return focus to the launcher.", ["Accessibility", "Keyboard", "Chatbots"]],
  "a11y-reflow": ["the phone layout", "Let wide elements shrink to the screen, and give tables their own scroll box.", ["Accessibility", "MobileUX", "ResponsiveDesign"]],
  "a11y-targets": ["tap targets", "Make every link and button at least 24 by 24 px, with space between them.", ["Accessibility", "MobileUX", "A11y"]],
  "ax-color-contrast": ["text contrast", "Keep body text at a 4.5:1 contrast ratio or more against its background.", ["Accessibility", "Contrast", "A11y"]],
  "ax-link-name": ["link names", "Give every link text that says where it goes. An icon alone needs an aria-label.", ["Accessibility", "A11y", "WebDev"]],
  "ax-button-name": ["button names", "Give every button text or an aria-label, so a screen reader can announce it.", ["Accessibility", "A11y", "WebDev"]],
  "ax-image-alt": ["alt text", "Describe what each image shows in its alt attribute, and use alt=\"\" on purely decorative ones.", ["Accessibility", "A11y", "WebDev"]],
  "ax-label": ["form labels", "Give every input a visible label tied to it with for and id.", ["Accessibility", "Forms", "A11y"]],
  "ax-aria-required-parent": ["ARIA roles", "Use native HTML elements first. When you use ARIA roles, nest them the way the role requires.", ["Accessibility", "ARIA", "A11y"]],
  "ax-aria-required-children": ["ARIA roles", "Use native HTML elements first. When you use ARIA roles, nest them the way the role requires.", ["Accessibility", "ARIA", "A11y"]],
  "ax-aria-hidden-focus": ["hidden focus", "Never leave a focusable element inside aria-hidden content.", ["Accessibility", "Keyboard", "ARIA"]],
  "ax-list": ["list markup", "Keep only li elements directly inside ul and ol.", ["Accessibility", "A11y", "HTML"]],
  "ax-listitem": ["list markup", "Put each li inside a ul or ol.", ["Accessibility", "A11y", "HTML"]],
  "ax-heading-order": ["headings", "Nest headings in order, one level at a time, under one h1.", ["Accessibility", "Headings", "A11y"]],
  "ax-region": ["landmarks", "Put all visible content inside landmarks: header, nav, main, and footer.", ["Accessibility", "Landmarks", "A11y"]],
  "ax-target-size": ["tap targets", "Make every link and button at least 24 by 24 px, with space between them.", ["Accessibility", "MobileUX", "A11y"]]
};
const AREA_GAPS = { SEO: "search", GEO: "AI search", Analytics: "measurement", Security: "security", Accessibility: "accessibility", Performance: "speed" };
const AREA_ACTIONS = {
  SEO: "Fix the first search item in the report, then run the review again.",
  GEO: "Make the key pages readable without JavaScript, and let the answer engines you want in through robots.txt.",
  Analytics: "Load every tag after the visitor's choice, and check it again after each release.",
  Security: "Fix the first security item in the report, then run the review again.",
  Accessibility: "Run an automated accessibility check on every release, then test the main paths with a keyboard and a screen reader.",
  Performance: "Measure the start page on a phone after every release, and fix the largest cost first."
};
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
    action: lesson ? lesson[1] : (gap.fix && gap.fix.length <= 160 && !/https?:\/\//.test(gap.fix) ? sentence(gap.fix) : AREA_ACTIONS[gap.area]) || "Fix the first item in the report, then run the review again.",
    tags: lesson ? lesson[2] : (AREA_TAGS[gap.area] || []).concat(["QA", "WebDev"]).slice(0, 3)
  };
}

// The leader overall, and for each area which site leads it.
function versusCopy(sites) {
  const names = sites.map((site) => site.host);
  const order = sites.slice().sort((a, b) => b.overall - a.overall);
  const lead = order[0];
  const base = sites[0];
  const leads = live.AREAS.map((area) => {
    const best = sites.filter((site) => typeof site.areas[area] === "number").sort((a, b) => b.areas[area] - a.areas[area])[0];
    return best ? [area, best.host] : null;
  }).filter(Boolean);
  const byHost = new Map();
  leads.forEach(([area, host]) => byHost.set(host, (byHost.get(host) || []).concat(area)));
  const parts = [...byHost].map(([host, areas]) => host + " leads in " + (areas.length === live.AREAS.length ? "all six areas" : areas.join(", ")));
  const vs = names.join(" vs ");
  return {
    title: [vs.length <= 30 ? vs + "." : names.length + " natural competitors.", "*" + (order.length > 1 && lead.overall === order[1].overall ? "A tie at the top: " + lead.overall + "." : lead.host + " leads: " + lead.overall + ".") + "*"],
    body: (parts.length ? parts.join("; ") + "." : "") + (byHost.has(base.host) ? "" : " " + base.host + " leads in none of the six areas."),
    action: "Benchmark against the sites your visitors compare you with, not against a perfect score: the gap that costs you is the one a competitor has already closed.",
    tags: ["SEO", "WebPerf", "QA"]
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
  let sweepPosts = 0;
  for (const { report, source } of payload.reports || []) {
    const host = bare(report.host);
    if (curated.has(host) || gone(host)) continue;
    const swept = source === "sweep" || source === "rivals";
    const scope = swept ? "National" : "Requested";
    const copy = copyFor(report, state.recent || []);
    const country = countryOf(host);
    const run = { id: "u-" + host.replace(/[^a-z0-9]+/g, "-").slice(0, 60), data: report, scope,
      title: copy.title, body: copy.body, action: copy.action, tags: copy.tags, meta: [host, "", "", "", country] };
    let built;
    try { built = live.build(run, "auto"); } catch (error) { console.warn("skip", host, "-", error.message); continue; }
    const at = items.findIndex((x) => x.card.id === run.id);
    if (at >= 0) items.splice(at, 1, built); else items.push(built);
    added += 1;
    const last = (state.posted || {})[host];
    if (last && (Date.parse(today) - Date.parse(last)) / 864e5 < POST_EVERY_DAYS) continue;
    if (source === "rivals") continue;
    if (swept && sweepPosts >= SWEEP_POSTS_PER_BATCH) continue;
    if (swept) sweepPosts += 1;
    const score = report.insights.score;
    batch.push({ id: run.id, host, title: copy.title, body: copy.body, action: copy.action, tags: copy.tags, scope,
      fetchedAt: report.fetchedAt, pages: report.limits.pagesRead, overall: score.overall,
      areas: Object.fromEntries(live.AREAS.map((a) => [a, score.areas[a].score])) });
    state.posted = Object.assign(state.posted || {}, { [host]: today });
    if (copy.key) state.recent = [copy.key].concat(state.recent || []).slice(0, 5);
  }

  let comparePosts = 0;
  for (const cmp of payload.comparisons || []) {
    if (comparePosts >= COMPARE_POSTS_PER_BATCH) break;
    const host = bare(cmp.host);
    const key = "vs:" + host;
    const id = "u-" + host.replace(/[^a-z0-9]+/g, "-").slice(0, 60);
    const sites = [cmp].concat(cmp.rivals || []).filter((site) => !gone(site.host));
    if (gone(host) || sites.length < 2 || !items.some((x) => x.card.id === id)) continue;
    const last = (state.posted || {})[key];
    if (last && (Date.parse(today) - Date.parse(last)) / 864e5 < POST_EVERY_DAYS) continue;
    const copy = versusCopy(sites.map((site) => Object.assign({}, site, { host: bare(site.host) })));
    batch.push({ id: "vs-" + id.slice(2), live: id, host, kind: "rivals", scope: "Versus", title: copy.title, body: copy.body, action: copy.action, tags: copy.tags,
      fetchedAt: cmp.createdAt, pages: 0, overall: cmp.overall, areas: cmp.areas,
      sites: sites.map((site) => ({ host: bare(site.host), overall: site.overall, areas: site.areas })) });
    state.posted = Object.assign(state.posted || {}, { [key]: today });
    comparePosts += 1;
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
