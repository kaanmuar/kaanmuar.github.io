/* Natural competitors: the 2-3 sites a site competes with, found on the open web, not typed by anyone.

   findRivals asks web search who competes with a host ("<host> competitors", then "sites like <host>"),
   counts the domains the results name in their titles and snippets and the ones they are hosted on,
   leaves out the directories and platforms that list everyone (Similarweb, G2, Wikipedia, social
   networks), and keeps the ones Tranco ranks, closest in size to the site first.

   The rival sweep (rivalSweep in functions/index.js) runs this on country-sweep sites, reviews each
   competitor passively, and stores the comparison in url_review_rivals/<baseId>, which /publishable
   hands to Live Reports and the social posts. A report's "Natural competitors" dropdown
   (js/qa-review.js) lists them and compares the ones with a public review: in full once the report
   is paid, as names under the frost before.

   Sweep state lives in Firestore url_review_sweep/rivals:
   { job: { baseId, host, cc, list: [{ host, rank, done, outcome }] } | null, tried: [ids], days: { date: { done, few, failed } }, last }. */

const compare = require("./url-review-compare");
const publish = require("./url-review-publish");
const sweep = require("./url-review-sweep");

const PICK = 3;
const MIN = 2;
const RANK_CHECKS = 6;
// When both sites are ranked, a rival within this factor of the site's rank, either way, comes first.
const SIZE_GAP = 50;
// An unranked domain still counts when this many results name it.
const UNRANKED_SCORE = 4;
// A competitor has to be named in a title or snippet at least once; a result merely hosted there is not enough.
const NAMED_SCORE = 2;
// Besides the country sweep's blocklist: app-piracy and download sites a post must not send people to.
const SHADY = /apk|crack|warez|keygen|nulled|serial|downloader|y2mate|savefrom|mp3juice|1337x|piratebay|yts\b/i;
const REVISIT_DAYS = 182;
const TRIED_KEEP = 300;
const KEEP_DAYS = 14;
const AREAS = ["SEO", "GEO", "Analytics", "Security", "Accessibility", "Performance"];

// Directories, review sites, search engines, social networks and hosts that name every site.
const NOISE = [
  "similarweb.com", "semrush.com", "ahrefs.com", "spyfu.com", "moz.com", "hypestat.com", "siteprice.org", "websiteoutlook.com",
  "rankingdb.com", "builtwith.com", "wappalyzer.com", "brandfetch.com", "g2.com", "capterra.com", "getapp.com", "softwareadvice.com",
  "trustradius.com", "alternativeto.net", "saashub.com", "sitelike.org", "siteslike.com", "similarsites.com", "sitesimilar.net",
  "topsitessimilar.com", "owler.com", "crunchbase.com", "zoominfo.com", "cbinsights.com", "comparably.com", "craft.co", "growjo.com",
  "rocketreach.co", "dnb.com", "pitchbook.com", "tracxn.com", "statista.com", "wikipedia.org", "wikimedia.org", "wikidata.org",
  "reddit.com", "quora.com", "medium.com", "substack.com", "youtube.com", "youtu.be", "facebook.com", "instagram.com", "linkedin.com",
  "twitter.com", "x.com", "tiktok.com", "pinterest.com", "threads.net", "trustpilot.com", "glassdoor.com", "indeed.com", "yelp.com",
  "tripadvisor.com", "google.com", "bing.com", "yahoo.com", "duckduckgo.com", "forbes.com", "investopedia.com", "techcrunch.com",
  "github.com", "w3.org", "schema.org", "cloudflare.com", "amazonaws.com", "gstatic.com", "googleapis.com", "bit.ly", "t.co",
  "wordpress.com", "blogspot.com", "wix.com", "apps.apple.com", "play.google.com",
  "corporationwiki.com", "opencorporates.com", "bizapedia.com", "kompass.com", "emis.com", "dnb.com", "bloomberg.com", "reuters.com",
  "yahoo.com.mx", "yahoo.co.jp", "msn.com", "aol.com", "yandex.ru", "baidu.com", "naver.com", "britannica.com", "cylex.com",
  "paginasamarillas.com", "yellowpages.com", "infobel.com", "empresite.com", "einforma.com", "datanyze.com", "6sense.com", "apollo.io",
  "leadiq.com", "signalhire.com", "contactout.com", "lusha.com", "wikiwand.com", "fandom.com", "scribd.com", "slideshare.net", "issuu.com"
];
const GENERIC = ["com", "net", "org", "io", "co", "ai", "app", "dev", "shop", "store", "online", "site", "info", "biz", "tv", "news",
  "blog", "tech", "cloud", "digital", "media", "travel", "bank", "edu", "gov"];
// Two-letter endings that are mostly file names in snippets (app.js, README.md).
const FILE_ENDINGS = ["js", "ts", "md", "py", "rs", "sh", "cs", "rb", "db"];
// The ending stays lowercase so "competitors.It" at a sentence break is not read as a domain.
const DOMAIN = /(?:^|[^\w.@-])((?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+([a-z]{2,12}))(?![\w-])/g;

function bare(host) {
  return String(host || "").trim().toLowerCase().replace(/\.$/, "").replace(/^www\./, "");
}

function endingOk(ending) {
  return GENERIC.includes(ending) || (ending.length === 2 && !FILE_ENDINGS.includes(ending));
}

function noisy(domain) {
  return NOISE.some((item) => domain === item || domain.endsWith("." + item)) || /^yahoo\.|similar|sites?like|alternative|competitor|toplist|rankings?\b/.test(domain);
}

// Sites no post or report should send people to.
function shady(host) {
  return sweep.BLOCKED.test(bare(host)) || SHADY.test(bare(host));
}

// The name before the public suffix, so amazon.com and amazon.co.uk are one brand.
function brandOf(domain, registrable) {
  return String(registrable(domain) || "").split(".")[0];
}

// grupobancolombia.com is bancolombia.com's own group, not a competitor.
function sameBrand(brand, ownBrand) {
  if (brand === ownBrand) return true;
  return Math.min(brand.length, ownBrand.length) >= 4 && (brand.includes(ownBrand) || ownBrand.includes(brand));
}

function domainsIn(text) {
  const out = [];
  const raw = String(text || "");
  DOMAIN.lastIndex = 0;
  let match;
  while ((match = DOMAIN.exec(raw))) {
    if (endingOk(match[2])) out.push(match[1].toLowerCase());
  }
  return out;
}

function queriesFor(host) {
  const site = bare(host);
  return [site + " competitors", "sites like " + site];
}

// Each result names a domain once: 2 when its title or snippet names it, 1 when it is hosted there.
function tallyResults(results, ownHost, tally, registrable) {
  const own = registrable(bare(ownHost));
  const ownBrand = brandOf(own, registrable);
  (Array.isArray(results) ? results : []).forEach((row, order) => {
    const seen = new Map();
    let hostedOn = "";
    try { hostedOn = new URL(row.url).hostname; } catch (error) { hostedOn = ""; }
    domainsIn([row.title, row.description].join(" ")).forEach((domain) => seen.set(registrable(domain), 2));
    const hosted = registrable(bare(hostedOn));
    if (hosted && !seen.has(hosted)) seen.set(hosted, 1);
    seen.forEach((weight, domain) => {
      if (!domain || domain === own || noisy(domain) || shady(domain) || sameBrand(brandOf(domain, registrable), ownBrand)) return;
      const prev = tally.get(domain) || { host: domain, score: 0, first: tally.size * 100 + order };
      prev.score += weight;
      tally.set(domain, prev);
    });
  });
  return tally;
}

// One domain per brand, best named first.
function ranked(tally, registrable) {
  const brands = new Set();
  return [...tally.values()]
    .sort((a, b) => b.score - a.score || a.first - b.first)
    .filter((row) => {
      const brand = brandOf(row.host, registrable);
      if (brands.has(brand)) return false;
      brands.add(brand);
      return true;
    });
}

function rankOf(value) {
  return value && typeof value.rank === "number" ? value.rank : null;
}

function rankRecord(value) {
  if (!value || !value.read) return null;
  return { domain: value.domain, read: true, rank: value.rank == null ? null : value.rank, change: value.change == null ? null : value.change, ranks: (value.ranks || []).slice(-30) };
}

// Ranked domains first, the ones close in size to the site before the rest; unranked ones only when
// several results name them and there are not enough ranked ones.
function pickRivals(candidates, ranks, ownRank) {
  const own = rankOf(ownRank);
  const rows = candidates.map((row, index) => Object.assign({}, row, { rank: rankRecord(ranks[index]) }));
  const near = (row) => own == null || rankOf(row.rank) == null ? false : Math.max(own / row.rank.rank, row.rank.rank / own) <= SIZE_GAP;
  const withRank = rows.filter((row) => rankOf(row.rank) != null && row.score >= NAMED_SCORE);
  const ordered = withRank.filter(near).concat(withRank.filter((row) => !near(row)));
  const extra = rows.filter((row) => rankOf(row.rank) == null && row.score >= UNRANKED_SCORE);
  return ordered.concat(extra).slice(0, PICK).map((row) => ({ host: row.host, rank: row.rank, score: row.score }));
}

/* deps: { search(query) -> [{ title, url, description }], ranker(domains) -> [trancoRank], registrable(host) }.
   Answers { ownRank, list: [{ host, rank, score }], queries }. */
async function findRivals(host, deps) {
  const registrable = deps.registrable;
  const own = registrable(bare(host));
  if (shady(own)) return { ownRank: null, list: [], queries: 0 };
  const tally = new Map();
  let queries = 0;
  for (const query of queriesFor(own)) {
    queries += 1;
    tallyResults(await deps.search(query), own, tally, registrable);
    if (ranked(tally, registrable).filter((row) => row.score >= 2).length >= PICK + 2) break;
  }
  const candidates = ranked(tally, registrable).slice(0, RANK_CHECKS);
  if (!candidates.length) return { ownRank: null, list: [], queries };
  const ranks = await deps.ranker([own].concat(candidates.map((row) => row.host)));
  return { ownRank: rankRecord(ranks[0]), list: pickRivals(candidates, ranks.slice(1), ranks[0]), queries };
}

function within(createdAt, now, days) {
  const at = Date.parse(createdAt || "");
  return !isNaN(at) && (now || Date.now()) - at <= days * 864e5;
}

// The newest review of a host that could go public (functions/url-review-publish.js) and is recent enough.
function latestPublic(records, unlisted, now) {
  return (Array.isArray(records) ? records : [])
    .filter((record) => record && record.report && !publish.heldReason(record, unlisted || []) && within(record.createdAt, now, REVISIT_DAYS))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0] || null;
}

function scoresOf(report) {
  const score = report.insights.score;
  return { overall: score.overall, areas: Object.fromEntries(AREAS.map((area) => [area, score.areas && score.areas[area] ? score.areas[area].score : null])) };
}

/* What the report's dropdown gets. paid: each competitor with a public review carries its full
   comparison. Unpaid: only the names and whether a comparison is ready; the page frosts the rest. */
function payload(base, rivals, records, paid) {
  const list = ((rivals && rivals.list) || []).map((row, index) => {
    const record = records[index];
    const out = { host: row.host, rank: rankOf(row.rank), ready: !!record };
    if (!paid || !record) return out;
    out.reviewedAt = record.report.fetchedAt || record.createdAt || "";
    out.compare = compare.compareSites(base, Object.assign({ id: record.id }, record.report), { ranks: { own: rivals.ownRank, rival: row.rank } });
    if (!out.compare) out.ready = false;
    return out;
  });
  return { at: (rivals && rivals.at) || "", paid: !!paid, list };
}

// Scores and who leads, for Live Reports and the social posts. Only public data: hosts and scores.
function socialSummary(base, records, rivals) {
  const own = Object.assign({ id: base.id }, base.report);
  const rows = ((rivals && rivals.list) || []).map((row, index) => {
    const record = records[index];
    if (!record) return null;
    const cmp = compare.compareSites(own, Object.assign({ id: record.id }, record.report), { ranks: { own: rivals.ownRank, rival: row.rank } });
    if (!cmp) return null;
    return Object.assign({ host: bare(record.report.host), id: record.report.id || record.id, rank: rankOf(row.rank), dominance: cmp.dominance }, scoresOf(record.report));
  }).filter(Boolean);
  return Object.assign({ baseId: base.id, host: bare(base.report.host), cc: (base.sweep && base.sweep.cc) || "", rank: rankOf(rivals && rivals.ownRank), rivals: rows }, scoresOf(base.report));
}

// The newest country-sweep review that could go public and has no competitors looked up yet.
function pickBase(records, state, unlisted) {
  const tried = new Set((state && state.tried) || []);
  return (Array.isArray(records) ? records : [])
    .filter((record) => record && record.id && record.source === "sweep" && !record.rivalsAt && !shady(record.report && record.report.host) && !tried.has(record.id) && !publish.heldReason(record, unlisted || []))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0] || null;
}

function doneOn(state, day) {
  const today = ((state || {}).days || {})[day] || {};
  return (today.done || 0) + (today.few || 0) + (today.failed || 0);
}

function tally(state, day, outcome, last) {
  const days = Object.assign({}, (state || {}).days);
  const today = Object.assign({ done: 0, few: 0, failed: 0 }, days[day]);
  today[outcome] = (today[outcome] || 0) + 1;
  days[day] = today;
  Object.keys(days).sort().slice(0, -KEEP_DAYS).forEach((old) => delete days[old]);
  return Object.assign({}, state, { days, last });
}

// A base with fewer than MIN competitors is counted and dropped; otherwise its competitors queue up.
function started(state, base, found, day) {
  const tried = [base.id].concat((state && state.tried) || []).slice(0, TRIED_KEEP);
  const next = Object.assign({}, state, { tried });
  if (found.list.length < MIN) return Object.assign(tally(next, day, "few", { host: base.report.host, at: new Date().toISOString(), outcome: "few", found: found.list.map((row) => row.host) }), { job: null });
  return Object.assign(next, { job: { baseId: base.id, host: bare(base.report.host), cc: (base.sweep && base.sweep.cc) || "", list: found.list.map((row) => ({ host: row.host, rank: row.rank, done: false })) } });
}

// The intake intakeRecord prices and stores for a competitor's passive review.
function intake(host, baseHost, lang) {
  return {
    url: "https://" + bare(host) + "/",
    name: "Natural competitors",
    email: "",
    reason: "Natural competitor of " + bare(baseHost) + ", found by the rival sweep",
    reasonCode: "rivals",
    frameworks: ["Playwright"],
    lang: lang || "en"
  };
}

module.exports = {
  PICK, MIN, RANK_CHECKS, SIZE_GAP, UNRANKED_SCORE, NAMED_SCORE, REVISIT_DAYS, NOISE, AREAS,
  bare, shady, domainsIn, queriesFor, tallyResults, ranked, pickRivals, findRivals, latestPublic,
  payload, socialSummary, pickBase, doneOn, tally, started, intake
};
