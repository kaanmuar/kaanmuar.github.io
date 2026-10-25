/* Country sweep: reviews the most visited sites of every country, up to 96 a night, with no person.

   Seeds: scripts/build-sweep-seeds.js turns the monthly CrUX top lists (github.com/zakird/crux-top-lists)
   into assets/sweep/index.json and assets/sweep/<cc>.json on the site. Each tick of sweepReviews
   (functions/index.js) takes, up to PER_TICK times, the next country of the lap, the next host of that country, and runs the
   same review a person would, without the web search (Brave and Tavily credits stay for people). The
   review goes public through Live Reports like any other, and its owner notice is queued.

   State lives in Firestore url_review_sweep/state: { lap, pos, cursor: { cc: n }, days: { date: {done, failed, skipped, failures} }, last }.
   A failed review is also saved to url_review_failures (source "sweep"), so the daily diagnosis and re-runs pick it up. */

const { suffixRegistrable } = require("./url-review-suffix");

const PER_DAY = 96;
// A tick (every 15 minutes, 24 a night) reviews up to PER_TICK sites one after another, and starts the next
// only while a review stopped at REVIEW_MS still ends by TICK_MS, before the next tick and the TICK_SECONDS timeout.
const PER_TICK = 4;
const REVIEW_MS = 240000;
const TICK_MS = 840000;
const TICK_SECONDS = 900;
const REVISIT_DAYS = 182;
const KEEP_DAYS = 14;
const FAILS_KEPT = 30;
const PER_COUNTRY = 150;
const GLOBAL_RANK = 5000;
// Outreach prospects (Firestore url_review_sweep/outreach, filled by scripts/sweep-outreach.js) go before the
// country lap, at most this many a night, so the lap still gets the rest of the cap.
const OUTREACH_PER_DAY = 48;

// Markets of the six site languages come round twice per lap.
const TIER1 = [
  "es", "mx", "co", "ar", "cl", "pe", "ec", "ve", "uy", "py", "bo", "cr", "pa", "do", "gt", "hn", "sv", "ni", "pr",
  "br", "pt", "de", "at", "ch", "fr", "be", "it", "us", "gb", "ie", "ca", "au"
];
const LANG = {
  es: ["es", "mx", "co", "ar", "cl", "pe", "ec", "ve", "uy", "py", "bo", "cr", "pa", "do", "gt", "hn", "sv", "ni", "pr", "cu", "gq"],
  pt: ["br", "pt", "ao", "mz", "cv", "gw", "st", "tl"],
  de: ["de", "at", "ch", "li", "lu"],
  fr: ["fr", "be", "mc", "sn", "ci", "cm", "ml", "bf", "ne", "tg", "bj", "ga", "cg", "cd", "mg", "ht", "re", "gp", "mq", "nc", "pf"],
  it: ["it", "sm", "va"]
};

const BLOCKED = /porn|xxx|xvideo|xnxx|hentai|onlyfans|escort|casino|poker|gambl|torrent|chaturbate|stripchat|camsoda|camgirl|cuevana|pelis|manga|anime|lotter|loteri|bingo|jackpot|bovada|apuesta|xbet|betway|sportybet|bet9ja|betking|intim|flirt|dating|rusdate|swinger|erotic|adult|(^|[.-])(sex|bet|bets|nude|slots?|chance)/i;
const RESERVED = /(^|\.)(localhost|local|test|invalid|example|internal|onion)$/i;
// Besides the country's own ending, the generic ones a national business or institution uses.
const GENERIC_TLDS = ["com", "org", "net", "edu", "gov", "mil", "int", "io", "app", "dev", "ai"];
const CC_TLD = { gb: "uk" };

function langOf(cc) {
  const code = String(cc || "").toLowerCase();
  return Object.keys(LANG).find((lang) => LANG[lang].includes(code)) || "en";
}

function hostOf(origin) {
  try {
    const url = new URL(origin);
    return url.protocol === "https:" && !url.port ? url.hostname.toLowerCase() : "";
  } catch (error) {
    return "";
  }
}

// rows: [[origin, rank]] in rank order; globalDomains: registrable domains in the global top list.
// Returns up to `limit` hosts that `resolves(host)` accepts, one per registrable domain: its www or bare
// host when the list has one, else the bare domain, since app., login. and campus. hosts sit behind a
// sign-in, else the domain's most visited host when the bare domain does not resolve.
async function seedHosts(rows, globalDomains, registrable, limit, cc, resolves) {
  const own = CC_TLD[cc] || cc;
  const max = limit || PER_COUNTRY;
  const byDomain = new Map();
  for (const [origin] of rows) {
    const host = hostOf(origin);
    if (!host || /^\d+(\.\d+){3}$/.test(host) || RESERVED.test(host) || BLOCKED.test(host)) continue;
    const domain = registrable(host);
    const tld = domain.split(".").pop();
    if (!domain || globalDomains.has(domain) || !(tld === own || GENERIC_TLDS.includes(tld))) continue;
    const plain = host === domain || host === "www." + domain;
    const seen = byDomain.get(domain);
    if (!seen) byDomain.set(domain, { hosts: plain ? [host] : [domain, host], plain });
    else if (plain && !seen.plain) Object.assign(seen, { hosts: [host], plain });
  }
  const seeds = [...byDomain.values()];
  const out = [];
  for (let at = 0; at < seeds.length && out.length < max;) {
    const batch = seeds.slice(at, at + max - out.length);
    at += batch.length;
    const picked = await Promise.all(batch.map(async (seed) => {
      for (const host of seed.hosts) if (!resolves || await resolves(host)) return host;
      return "";
    }));
    out.push(...picked.filter(Boolean));
  }
  return out;
}

// One lap: the tier-one countries, half the rest, the tier-one countries again, the other half.
function lapOrder(countries) {
  const all = [...new Set(countries.map((cc) => String(cc).toLowerCase()))].sort();
  const first = all.filter((cc) => TIER1.includes(cc));
  const rest = all.filter((cc) => !TIER1.includes(cc));
  const half = Math.ceil(rest.length / 2);
  return first.concat(rest.slice(0, half), first, rest.slice(half));
}

// The next country and its seed position; the returned state has both moved on.
function nextSlot(state, countries) {
  const prev = state || {};
  let lap = Array.isArray(prev.lap) && prev.lap.length ? prev.lap.filter((cc) => countries.includes(cc)) : [];
  let pos = Number(prev.pos) || 0;
  if (!lap.length || pos >= lap.length) {
    lap = lapOrder(countries);
    pos = 0;
  }
  const cc = lap[pos];
  const cursor = Object.assign({}, prev.cursor);
  const at = cursor[cc] || 0;
  cursor[cc] = at + 1;
  return { cc, at, state: Object.assign({}, prev, { lap, pos: pos + 1, cursor }) };
}

// The next outreach prospect and the moved-on state, or null once the list is done or tonight's share is used.
// The list only grows (the script appends), so a cursor is enough to never review a prospect twice.
function nextOutreach(state, list, day) {
  const prev = state || {};
  const rows = Array.isArray(list) ? list : [];
  const at = Number(prev.outreachAt) || 0;
  const today = (prev.days || {})[day] || {};
  if (at >= rows.length || (today.outreach || 0) >= OUTREACH_PER_DAY) return null;
  const row = rows[at] || {};
  const target = { host: String(row.host || ""), cc: String(row.cc || "").toLowerCase(), month: "", rank: 0, outreach: true, sector: String(row.sector || "") };
  return { target, state: Object.assign({}, prev, { outreachAt: at + 1 }) };
}

// The intake intakeRecord prices and stores; a run is priced per framework, so it names the default one.
function intake(target) {
  const where = String(target.cc || "").toUpperCase();
  return {
    url: "https://" + target.host + "/",
    name: target.outreach ? "Outreach sweep" : "Country sweep",
    email: "",
    reason: target.outreach
      ? "Outreach sweep: a " + (target.sector || "prospect") + " site in " + where
      : "Country sweep: one of the most visited sites in " + where + " (CrUX " + target.month + ")",
    reasonCode: "sweep",
    frameworks: ["Playwright"],
    lang: langOf(target.cc)
  };
}

function doneOn(state, day) {
  const today = ((state || {}).days || {})[day] || {};
  return (today.done || 0) + (today.failed || 0);
}

// A failed tick also lands in today's `failures` (host, country, reason), the newest FAILS_KEPT.
function tally(state, day, outcome, last) {
  const days = Object.assign({}, (state || {}).days);
  const today = Object.assign({ done: 0, failed: 0, skipped: 0 }, days[day]);
  today[outcome] = (today[outcome] || 0) + 1;
  if (last && last.outreach && outcome !== "skipped") today.outreach = (today.outreach || 0) + 1;
  if (outcome === "failed") {
    const row = last || {};
    today.failures = (today.failures || []).concat({ host: row.host || "", cc: row.cc || "", at: row.at || "", reason: String(row.reason || "").slice(0, 160) }).slice(-FAILS_KEPT);
  }
  days[day] = today;
  Object.keys(days).sort().slice(0, -KEEP_DAYS).forEach((old) => delete days[old]);
  return Object.assign({}, state, { days, last });
}

function roomForReview(elapsedMs) {
  return elapsedMs + REVIEW_MS <= TICK_MS;
}

// One night's tally against the cap, for the watchdog: a night that reviewed under half the cap is short.
function night(state, day, cap) {
  const row = ((state || {}).days || {})[day] || {};
  const out = { done: row.done || 0, failed: row.failed || 0, skipped: row.skipped || 0 };
  return Object.assign(out, { short: out.done + out.failed < cap / 2 });
}

// Totals over the days kept in state, for the ops digest.
function totals(state, sinceDay) {
  const out = { done: 0, failed: 0, skipped: 0 };
  Object.entries((state || {}).days || {}).forEach(([day, row]) => {
    if (day < sinceDay) return;
    Object.keys(out).forEach((key) => { out[key] += row[key] || 0; });
  });
  return out;
}

module.exports = { PER_DAY, PER_TICK, REVIEW_MS, TICK_MS, TICK_SECONDS, roomForReview, night, REVISIT_DAYS, PER_COUNTRY, GLOBAL_RANK, OUTREACH_PER_DAY, TIER1, BLOCKED, RESERVED, langOf, hostOf, suffixRegistrable, seedHosts, lapOrder, nextSlot, nextOutreach, intake, doneOn, tally, totals };
