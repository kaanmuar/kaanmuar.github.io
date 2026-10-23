/* Country sweep: reviews the most visited sites of every country, a few a night, with no person.

   Seeds: scripts/build-sweep-seeds.js turns the monthly CrUX top lists (github.com/zakird/crux-top-lists)
   into assets/sweep/index.json and assets/sweep/<cc>.json on the site. Each tick of sweepReviews
   (functions/index.js) takes the next country of the lap, the next host of that country, and runs the
   same review a person would, without the web search (Brave and Tavily credits stay for people). The
   review goes public through Live Reports like any other, and its owner notice is queued.

   State lives in Firestore url_review_sweep/state: { lap, pos, cursor: { cc: n }, days: { date: {done, failed} }, last }. */

const PER_DAY = 24;
const REVISIT_DAYS = 182;
const KEEP_DAYS = 14;
const PER_COUNTRY = 150;
const GLOBAL_RANK = 5000;

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
// Returns up to `limit` hosts, one per registrable domain: its www or bare host when the list has one,
// else the bare domain, since app., login. and campus. hosts sit behind a sign-in.
function seedHosts(rows, globalDomains, registrable, limit, cc) {
  const own = CC_TLD[cc] || cc;
  const byDomain = new Map();
  for (const [origin] of rows) {
    const host = hostOf(origin);
    if (!host || /^\d+(\.\d+){3}$/.test(host) || RESERVED.test(host) || BLOCKED.test(host)) continue;
    const domain = registrable(host);
    const tld = domain.split(".").pop();
    if (!domain || globalDomains.has(domain) || !(tld === own || GENERIC_TLDS.includes(tld))) continue;
    const plain = host === domain || host === "www." + domain;
    const seen = byDomain.get(domain);
    if (!seen) {
      if (byDomain.size >= (limit || PER_COUNTRY)) break;
      byDomain.set(domain, { host: plain ? host : domain, plain });
    } else if (plain && !seen.plain) {
      Object.assign(seen, { host, plain });
    }
  }
  return [...byDomain.values()].map((seed) => seed.host);
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

function doneOn(state, day) {
  const today = ((state || {}).days || {})[day] || {};
  return (today.done || 0) + (today.failed || 0);
}

function tally(state, day, outcome, last) {
  const days = Object.assign({}, (state || {}).days);
  const today = Object.assign({ done: 0, failed: 0, skipped: 0 }, days[day]);
  today[outcome] = (today[outcome] || 0) + 1;
  days[day] = today;
  Object.keys(days).sort().slice(0, -KEEP_DAYS).forEach((old) => delete days[old]);
  return Object.assign({}, state, { days, last });
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

module.exports = { PER_DAY, REVISIT_DAYS, PER_COUNTRY, GLOBAL_RANK, TIER1, langOf, seedHosts, lapOrder, nextSlot, doneOn, tally, totals };
