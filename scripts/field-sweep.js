#!/usr/bin/env node
/* Daily: standout items from our field (QA and testing, SEO, GEO, accessibility, web performance, analytics,
   standards) proposed for the social hub. The owner approves or dismisses them in admin.html's Social hub pane.

     node scripts/field-sweep.js             # ask every source in scripts/field-sweep/sources.js, write assets/social/proposals.json
     node scripts/field-sweep.js --dry-run   # print the ranking, write nothing

   Nothing here posts anywhere. An approved proposal becomes an item added by hand (js/social-hub-admin.js), and
   the next hub build publishes it. Proposals already approved, dismissed or on the hub stay out; the owner's
   decisions come from Firestore socialHub/live, or assets/social/edits.json when Firestore does not answer.
   Proposals still waiting carry over to the next run until they age out.

   score = weight x (1 + relevance + 2 x trend) x freshness
     relevance  topic keyword hits (title 2, summary 1), at most 6
     trend      log2(1 + signal / scale) from Hacker News points, DEV reactions or GitHub stars,
                plus 1 for each other source with the same address or title
     freshness  halves every 7 days; nothing older than 21 days is proposed */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const admin = require("../js/social-hub-admin");
const { SITE } = require("../js/social-hub-card");
const { SOURCES, TOPICS, BLOCK } = require("./field-sweep/sources");

const ROOT = path.resolve(__dirname, "..");
const OUT = "assets/social/proposals.json";
const EDITS = "assets/social/edits.json";
const DAY = 86400000;
const MAX_AGE = 21;
const HALF_LIFE = 7;
const KEEP = 40;
const PER_SOURCE = 4;
const PER_FEED = 30;
const SUMMARY_MAX = 400;
const AGENT = "qa-lab-field-sweep (+" + SITE + "qa-review-social.html)";
const SCALE = { hn: 100, devto: 30, github: 150 };
const SIGNAL = { hn: "points on Hacker News", devto: "reactions on DEV", github: "stars on GitHub" };

const MATCHERS = Object.entries(TOPICS).map(([topic, words]) => [topic, words.map((word) => new RegExp("(^|[^a-z0-9])" + word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "s?($|[^a-z0-9])", "i"))]);

function entities(value) {
  return String(value || "")
    .replace(/&#x([0-9a-f]+);/gi, (entity, hex) => {
      const code = parseInt(hex, 16);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : entity;
    })
    .replace(/&#(\d+);/g, (entity, dec) => {
      const code = Number(dec);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : entity;
    })
    .replace(/&nbsp;/gi, " ")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&");
}

// Feeds escape their HTML once or twice, so tags go after each pass.
function plain(value) {
  const once = entities(String(value || "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]+>/g, " "));
  return entities(once.replace(/<[^>]+>/g, " ")).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function tag(block, names) {
  for (const name of names) {
    const match = block.match(new RegExp("<" + name + "\\b[^>]*>([\\s\\S]*?)</" + name + ">", "i"));
    const value = match ? plain(match[1]) : "";
    if (value) return value;
  }
  return "";
}

function feedLink(block) {
  const href = block.match(/<link\b(?=[^>]*rel="alternate")[^>]*href="([^"]+)"/i) || block.match(/<link\b(?![^>]*rel="(?:self|replies|edit|enclosure)")[^>]*href="([^"]+)"/i);
  return href ? entities(href[1]).trim() : tag(block, ["link", "guid"]);
}

function feedImage(block) {
  const html = entities(block.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1"));
  const match = html.match(/<media:thumbnail\b[^>]*url="(https:\/\/[^"]+)"/i)
    || html.match(/<media:content\b(?=[^>]*(?:medium="image"|url="[^"]+\.(?:jpe?g|png|webp)(?:\?[^"]*)?"))[^>]*url="(https:\/\/[^"]+)"/i)
    || html.match(/<enclosure\b(?=[^>]*type="image\/)[^>]*url="(https:\/\/[^"]+)"/i)
    || html.match(/<img\b[^>]*src="(https:\/\/[^"]+)"/i);
  return match ? match[1] : "";
}

function short(value, max) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  return cut.slice(0, cut.lastIndexOf(" ") > max / 2 ? cut.lastIndexOf(" ") : cut.length).replace(/[\s,.;:]+$/, "") + "…";
}

// The hub speaks six Latin-script languages, so a title mostly in another script is not for it.
function latin(text) {
  const letters = text.match(/\p{L}/gu) || [];
  return letters.length > 0 && (text.match(/\p{Script=Latin}/gu) || []).length / letters.length >= 0.8;
}

// One shape for every source; null when the item lacks an https address, a title or a date.
function candidate(source, raw) {
  const url = String(raw.url || "").trim();
  const time = Date.parse(raw.date || "");
  let title = plain(raw.title);
  if (source.prefix && title && !title.toLowerCase().includes(source.prefix.toLowerCase())) title = source.prefix + " " + title;
  title = short(title, 200);
  if (!/^https:\/\//.test(url) || !admin.canonUrl(url) || title.length < 8 || !Number.isFinite(time)) return null;
  if (!latin(title) || BLOCK.test(title) || BLOCK.test(raw.summary || "")) return null;
  return {
    sourceId: source.id,
    source: source.name,
    url,
    title,
    author: short(plain(raw.author).replace(/^\S+@\S+\s*\((.+)\)$/, "$1"), 80),
    date: new Date(time).toISOString().slice(0, 10),
    time,
    summary: short(plain(raw.summary), SUMMARY_MAX),
    image: /^https:\/\/[^\s<>"'`]+$/.test(raw.image || "") ? raw.image : "",
    signal: Number(raw.signal) || 0
  };
}

function parseFeed(xml, source) {
  return String(xml || "").split(/<(?:item|entry)\b/i).slice(1, PER_FEED + 1).map((chunk) => {
    const block = chunk.split(/<\/(?:item|entry)>/i)[0];
    return candidate(source, {
      title: tag(block, ["title"]),
      url: feedLink(block),
      date: tag(block, ["pubDate", "published", "dc:date", "updated"]),
      author: tag(block, ["dc:creator", "name", "author"]),
      summary: tag(block, ["description", "summary", "content:encoded", "content"]),
      image: feedImage(block)
    });
  }).filter(Boolean);
}

function parseHn(json, source) {
  return ((json && json.hits) || []).map((hit) => candidate(source, {
    title: hit.title,
    url: hit.url || "https://news.ycombinator.com/item?id=" + hit.objectID,
    date: hit.created_at,
    author: hit.author,
    signal: hit.points
  })).filter(Boolean);
}

function parseDevto(json, source) {
  return (Array.isArray(json) ? json : []).map((post) => candidate(source, {
    title: post.title,
    url: post.canonical_url || post.url,
    date: post.published_timestamp || post.published_at,
    author: post.user && post.user.name,
    summary: post.description,
    image: post.cover_image || post.social_image,
    signal: post.positive_reactions_count
  })).filter(Boolean);
}

function parseGithub(json, source) {
  return ((json && json.items) || []).filter((repo) => !repo.fork && !repo.archived).map((repo) => candidate(source, {
    title: repo.full_name + (repo.description ? ": " + repo.description : ""),
    url: repo.html_url,
    date: repo.created_at,
    author: repo.owner && repo.owner.login,
    summary: repo.description,
    image: "https://opengraph.githubassets.com/1/" + repo.full_name,
    signal: repo.stargazers_count
  })).filter(Boolean);
}

const PARSE = { feed: parseFeed, hn: parseHn, devto: parseDevto, github: parseGithub };

function requests(source, now) {
  const since = now - MAX_AGE * DAY;
  if (source.type === "feed") return [source.url];
  if (source.type === "hn") return source.queries.map((query) => "https://hn.algolia.com/api/v1/search?tags=story&hitsPerPage=20&query=" + encodeURIComponent(query) + "&numericFilters=" + encodeURIComponent("created_at_i>" + Math.floor(since / 1000) + ",points>=30"));
  if (source.type === "devto") return source.tags.map((name) => "https://dev.to/api/articles?top=7&per_page=20&tag=" + encodeURIComponent(name));
  if (source.type === "github") {
    const day = new Date(since).toISOString().slice(0, 10);
    return source.topics.map((topic) => "https://api.github.com/search/repositories?sort=stars&order=desc&per_page=10&q=" + encodeURIComponent("topic:" + topic + " created:>=" + day + " stars:>=20"));
  }
  return [];
}

function relevance(title, summary) {
  let total = 0;
  let best = ["", 0];
  let inTitle = false;
  MATCHERS.forEach(([topic, patterns]) => {
    let hits = 0;
    patterns.forEach((pattern) => {
      if (pattern.test(title)) {
        hits += 2;
        inTitle = true;
      } else if (pattern.test(summary)) {
        hits += 1;
      }
    });
    total += hits;
    if (hits > best[1]) best = [topic, hits];
  });
  return { topic: best[0], score: Math.min(6, total), inTitle };
}

function titleKey(title) {
  return String(title || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().slice(0, 80);
}

function proposalId(url) {
  return crypto.createHash("sha1").update(admin.canonUrl(url)).digest("hex").slice(0, 12);
}

function freshness(date, now) {
  const age = Math.max(0, (now - Date.parse(date)) / DAY);
  return Math.pow(0.5, age / HALF_LIFE);
}

function score(proposal, now) {
  return Math.round(100 * proposal.weight * (1 + proposal.relevance + 2 * proposal.trend) * freshness(proposal.date, now)) / 100;
}

function why(group, best, topic) {
  const parts = [];
  if (best.signal && SCALE[best.type]) parts.push(best.signal + " " + SIGNAL[best.type]);
  if (group.length > 1) parts.push("also on " + group.slice(1).map((item) => item.source).join(", "));
  if (topic.score) parts.push(topic.topic + " keywords in the " + (topic.inTitle ? "title" : "summary"));
  return parts.join("; ");
}

/* candidates: from every source. state: the owner's hub edits (items and decisions). previous: the last
   proposals.json. Returns the proposals still worth showing, best first. */
function rank(candidates, options) {
  const { now, state, previous } = options;
  const byId = Object.fromEntries(SOURCES.map((source) => [source.id, source]));
  const sourceOf = (item) => byId[item.sourceId] || { weight: 1, type: "feed" };
  const fresh = candidates.filter((item) => item && now - item.time <= MAX_AGE * DAY && item.time - now <= DAY).map((item) => {
    const source = sourceOf(item);
    const topic = relevance(item.title, item.summary);
    return Object.assign({}, item, { type: source.type, weight: source.weight, topic, strict: !!source.strict, key: admin.canonUrl(item.url), tkey: titleKey(item.title) });
  }).filter((item) => !item.strict || item.topic.inTitle);
  fresh.sort((a, b) => b.weight - a.weight || b.signal - a.signal);

  const groups = [];
  fresh.forEach((item) => {
    const group = groups.find((members) => members.some((other) => other.key === item.key || (item.tkey.length >= 20 && other.tkey === item.tkey)));
    if (!group) groups.push([item]);
    else if (!group.some((other) => other.sourceId === item.sourceId)) group.push(item);
  });

  const decided = (state && state.decisions) || {};
  const shared = new Set(((state && state.items) || []).map((item) => admin.canonUrl(item.url)).filter(Boolean));
  const before = Object.fromEntries((((previous && previous.proposals) || [])).map((proposal) => [proposal.id, proposal]));
  const today = new Date(now).toISOString().slice(0, 10);
  const out = new Map();
  groups.forEach((group) => {
    const lead = group[0];
    const id = proposalId(lead.url);
    const trends = group.map((item) => (SCALE[item.type] ? Math.log2(1 + item.signal / SCALE[item.type]) : 0));
    const best = group[trends.indexOf(Math.max(...trends))];
    const topic = group.map((item) => item.topic).sort((a, b) => b.score - a.score)[0];
    const proposal = {
      id,
      title: lead.title,
      url: lead.url,
      source: lead.source,
      author: lead.author || (group.find((item) => item.author) || {}).author || "",
      date: lead.date,
      topic: topic.topic || sourceOf(lead).topic || "",
      lang: "en",
      summary: lead.summary || (group.find((item) => item.summary) || {}).summary || "",
      image: lead.image || (group.find((item) => item.image) || {}).image || (before[id] && before[id].image) || "",
      why: why(group, best, topic),
      weight: lead.weight,
      relevance: Math.max(topic.score, lead.strict ? 0 : 1),
      trend: Math.round(100 * (Math.max(...trends) + group.length - 1)) / 100,
      firstSeen: (before[id] && before[id].firstSeen) || today
    };
    out.set(id, proposal);
  });
  Object.values(before).forEach((proposal) => {
    if (!out.has(proposal.id) && now - Date.parse(proposal.date) <= MAX_AGE * DAY) out.set(proposal.id, proposal);
  });

  const perSource = {};
  return [...out.values()]
    .filter((proposal) => !decided[proposal.id] && !shared.has(admin.canonUrl(proposal.url)))
    .map((proposal) => Object.assign({}, proposal, { score: score(proposal, now) }))
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .filter((proposal) => (perSource[proposal.source] = (perSource[proposal.source] || 0) + 1) <= PER_SOURCE)
    .slice(0, KEEP);
}

async function fetchText(url) {
  const headers = { "user-agent": AGENT, accept: "application/rss+xml, application/atom+xml, application/json, text/xml, text/html;q=0.8, */*;q=0.5" };
  if (url.startsWith("https://api.github.com/") && process.env.GITHUB_TOKEN) headers.authorization = "Bearer " + process.env.GITHUB_TOKEN;
  const res = await fetch(url, { headers, redirect: "follow", signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(new URL(url).hostname + " answered " + res.status);
  return res.text();
}

// A source fails alone: its error goes in the report and the rest still count.
async function gather(sources, fetcher, now) {
  const report = {};
  const all = [];
  await Promise.all(sources.map(async (source) => {
    const urls = requests(source, now);
    const results = await Promise.allSettled(urls.map(async (url) => {
      const body = await fetcher(url);
      return PARSE[source.type](source.type === "feed" ? body : JSON.parse(body), source);
    }));
    const found = results.filter((result) => result.status === "fulfilled").flatMap((result) => result.value);
    const failed = results.filter((result) => result.status === "rejected");
    if (urls.length && failed.length === urls.length) {
      report[source.id] = "failed: " + String(failed[0].reason && failed[0].reason.message || failed[0].reason).slice(0, 120);
    } else {
      report[source.id] = found.length;
      all.push(...found);
    }
  }));
  return { candidates: all, report };
}

async function pageImage(url, fetcher) {
  try {
    const html = (await fetcher(url)).slice(0, 300000);
    const meta = html.match(/<meta\b(?=[^>]*(?:property|name)=["'](?:og:image|twitter:image)["'])[^>]*content=["'](https:\/\/[^"']+)["']/i);
    return meta ? entities(meta[1]) : "";
  } catch (error) {
    return "";
  }
}

async function sweep(options) {
  const { sources = SOURCES, fetcher = fetchText, now = Date.now(), state, previous } = options;
  const { candidates, report } = await gather(sources, fetcher, now);
  const proposals = rank(candidates, { now, state, previous });
  for (let i = 0; i < proposals.length; i += 8) {
    await Promise.all(proposals.slice(i, i + 8).filter((proposal) => !proposal.image).map(async (proposal) => {
      proposal.image = await pageImage(proposal.url, fetcher);
    }));
  }
  return { proposals, report };
}

async function ownerState() {
  try {
    const live = await require("./build-social-hub").liveEdits();
    if (live) return live;
  } catch (error) {
    console.warn("Firestore skipped: " + error.message);
  }
  const file = path.join(ROOT, EDITS);
  return admin.clean(fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : null);
}

async function main() {
  const dry = process.argv.includes("--dry-run");
  const file = path.join(ROOT, OUT);
  const previous = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : null;
  const { proposals, report } = await sweep({ state: await ownerState(), previous });
  Object.entries(report).forEach(([id, value]) => console.log(id.padEnd(24) + value));
  if (!Object.values(report).some((value) => typeof value === "number")) {
    console.error("Every source failed; proposals.json stays as it was.");
    process.exit(1);
  }
  const added = proposals.filter((proposal) => !(previous && previous.proposals || []).some((other) => other.id === proposal.id)).length;
  proposals.slice(0, dry ? KEEP : 10).forEach((proposal) => console.log(proposal.score.toFixed(2).padStart(6) + "  " + proposal.topic.padEnd(13) + proposal.title.slice(0, 90) + "  [" + proposal.source + "]"));
  console.log(proposals.length + " proposals, " + added + " new");
  if (dry) return;
  fs.writeFileSync(file, JSON.stringify({ version: 1, built: new Date().toISOString(), sources: report, proposals }, null, 1) + "\n");
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, "proposals=" + proposals.length + "\nadded=" + added + "\n");
}

if (require.main === module) main().catch((error) => { console.error(error); process.exit(1); });

module.exports = { plain, candidate, parseFeed, parseHn, parseDevto, parseGithub, requests, relevance, titleKey, proposalId, score, rank, gather, sweep };
