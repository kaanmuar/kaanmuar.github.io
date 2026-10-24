/**
 * How present a site is in its market, from public signals only: the Tranco rank of its domain over
 * the last 30 days, whether Chrome publishes real-user data for it, the pages found, its language
 * versions, the public write-ups that name it, its linked social profiles, and the age of its domain.
 * It is an estimate of reach, not a traffic figure.
 * Tranco (https://tranco-list.eu) is a research ranking of the top million domains that averages
 * several popularity lists over 30 days.
 */
const TRANCO_API = "https://tranco-list.eu/api/ranks/domain/";
// The API answers about one request per second from one address.
const TRANCO_GAP_MS = 1100;
const TRANCO_TIMEOUT_MS = 6000;
const CACHE_MS = 12 * 3600 * 1000;
const TRANCO_SIZE = 1000000;
const cache = new Map();

// Each signal turns into 0..1. A signal that could not be read drops out and the others share its weight.
const SIGNALS = [
  { key: "rank", label: "Tranco rank", weight: 40 },
  { key: "chrome", label: "Real-user Chrome data", weight: 15 },
  { key: "pages", label: "Pages found", weight: 15 },
  { key: "languages", label: "Language versions", weight: 10 },
  { key: "writeups", label: "Public write-ups", weight: 10 },
  { key: "social", label: "Social profiles linked", weight: 5 },
  { key: "age", label: "Domain age", weight: 5 }
];

const clamp = (value) => Math.max(0, Math.min(1, value));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function readRanks(data, domain) {
  const rows = (Array.isArray(data && data.ranks) ? data.ranks : [])
    .filter((row) => row && typeof row.rank === "number" && row.rank > 0 && /^\d{4}-\d{2}-\d{2}$/.test(String(row.date || "")))
    .map((row) => ({ date: row.date, rank: row.rank }))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-30);
  if (!rows.length) return { domain, read: true, rank: null, ranks: [], change: null };
  const last = rows[rows.length - 1].rank;
  return { domain, read: true, rank: last, ranks: rows, change: rows.length > 1 ? rows[0].rank - last : null };
}

async function trancoRank(domain, fetcher) {
  const key = String(domain || "").toLowerCase();
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(key)) return { domain: key, read: false };
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
  try {
    const res = await (fetcher || fetch)(TRANCO_API + encodeURIComponent(key), { signal: AbortSignal.timeout(TRANCO_TIMEOUT_MS) });
    if (!res.ok) return { domain: key, read: false };
    const value = readRanks(await res.json(), key);
    cache.set(key, { at: Date.now(), value });
    return value;
  } catch (error) {
    return { domain: key, read: false };
  }
}

// One after the other, a second apart, so the second domain is not refused.
async function trancoRanks(domains, fetcher, gap) {
  const out = [];
  for (let index = 0; index < domains.length; index++) {
    const cached = cache.get(String(domains[index] || "").toLowerCase());
    if (index && !(cached && Date.now() - cached.at < CACHE_MS)) await sleep(gap == null ? TRANCO_GAP_MS : gap);
    out.push(await trancoRank(domains[index], fetcher));
  }
  return out;
}

function years(registered, now) {
  const at = Date.parse(registered || "");
  return at && !isNaN(at) ? Math.max(0, ((now || Date.now()) - at) / (365.25 * 86400000)) : null;
}

// Rank 1 is 1, rank 1,000 is 0.5, the millionth is 0, and outside the list is 0.
function rankPart(rank) {
  if (!rank) return 0;
  return clamp(1 - Math.log10(rank) / Math.log10(TRANCO_SIZE));
}

function signalValues(report, rank, now) {
  const observed = (report && report.observed) || {};
  const signals = observed.signals || {};
  const limits = (report && report.limits) || {};
  const speed = report && report.pagespeed;
  const age = years(observed.registered, now);
  return {
    rank: rank && rank.read ? { value: rank.rank, part: rankPart(rank.rank) } : null,
    chrome: speed ? { value: !!speed.field, part: speed.field ? 1 : 0 } : null,
    pages: limits.pagesFound ? { value: limits.pagesFound, part: clamp(Math.log10(limits.pagesFound) / 4) } : null,
    languages: typeof signals.hreflang === "number" ? { value: signals.hreflang, part: clamp(Math.log2(1 + signals.hreflang) / 5) } : null,
    writeups: Array.isArray(report && report.mentions) ? { value: report.mentions.length, part: clamp(report.mentions.length / 4) } : null,
    social: Array.isArray(observed.socialLinks) ? { value: observed.socialLinks.length, part: clamp(observed.socialLinks.length / 5) } : null,
    age: age == null ? null : { value: Math.round(age * 10) / 10, part: clamp(age / 20) }
  };
}

function presence(report, rank, now) {
  const values = signalValues(report, rank, now);
  const read = SIGNALS.filter((signal) => values[signal.key]);
  const weight = read.reduce((sum, signal) => sum + signal.weight, 0);
  return {
    score: weight ? Math.round(read.reduce((sum, signal) => sum + signal.weight * values[signal.key].part, 0) / weight * 100) : null,
    rank: rank && rank.read ? rank.rank : null,
    ranks: rank && rank.read ? rank.ranks : [],
    change: rank && rank.read ? rank.change : null,
    signals: SIGNALS.map((signal) => ({
      key: signal.key,
      label: signal.label,
      weight: signal.weight,
      value: values[signal.key] ? values[signal.key].value : null,
      points: values[signal.key] ? Math.round(values[signal.key].part * 100) : null
    }))
  };
}

// The share each site holds of the two presence scores together.
function marketView(ownReport, rivalReport, ranks, now) {
  const own = presence(ownReport, ranks && ranks.own, now);
  const rival = presence(rivalReport, ranks && ranks.rival, now);
  const sum = (own.score || 0) + (rival.score || 0);
  return { own, rival, share: own.score == null || rival.score == null || !sum ? null : Math.round(own.score / sum * 100) };
}

module.exports = { SIGNALS, TRANCO_API, readRanks, trancoRank, trancoRanks, rankPart, presence, marketView };
