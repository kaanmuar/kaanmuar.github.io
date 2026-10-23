#!/usr/bin/env node
/* Picks the day's trending tech hashtags for scripts/social-tags.js and writes scripts/trending-tags.json.
   Sources are free and need no key: the tags on dev.to's top articles of the day and on Lobsters' hottest
   stories, Hacker News' front page, Google's daily search trends in the six clip markets, and Mastodon's
   trending tags. Only VOCAB terms count, so a trend has to be about our field to reach a post; general
   trends (sports, celebrities) never match, and a headline with a SENSITIVE word is skipped, so no post
   rides on news about deaths, wars, elections or layoffs. A failing source is skipped; when all fail the
   last file stays, and social-tags.js stops using it once it is 3 days old.
   node scripts/trending-tags.js [--if-stale] [--dry-run] */

const fs = require("fs");
const path = require("path");
const { TRENDING_FILE } = require("./social-tags");

const GEOS = ["US", "ES", "BR", "DE", "FR", "IT"];
const KEEP = 25;

// [pattern, tag, topic, techOnly]. techOnly terms are too ambiguous for general headlines and only
// count from dev.to, Lobsters and Hacker News.
const VOCAB = [
  [/\bchat ?gpt\b/i, "ChatGPT", "GEO"], [/\bopen ?ai\b/i, "OpenAI", "AI"], [/\bgemini\b/i, "Gemini", "AI", true],
  [/\bclaude\b/i, "Claude", "AI", true], [/\bperplexity\b/i, "Perplexity", "GEO", true], [/\bai overviews?\b/i, "AIOverviews", "GEO"],
  [/\bai mode\b/i, "AIMode", "GEO"], [/\bcopilot\b/i, "Copilot", "AI"], [/\bllms?\b/i, "LLM", "AI"], [/\bgen ?ai\b|\bgenerative ai\b/i, "GenAI", "AI"],
  [/\b(ai )?agents?\b|\bagentic\b/i, "AIAgents", "AI", true], [/^ai$|\bartificial intelligence\b/i, "AI", "AI"], [/\bmcp\b|model context protocol/i, "MCP", "AI", true],
  [/\bdeepseek\b/i, "DeepSeek", "AI"], [/\bgemma\b/i, "Gemma", "AI", true], [/\bhugging ?face\b/i, "HuggingFace", "AI"], [/\brag\b/i, "RAG", "AI", true],
  [/\bmachine ?learning\b|^ml$/i, "MachineLearning", "AI", true], [/\bvibe ?coding\b/i, "VibeCoding", "WebDev"],
  [/\bseo\b/i, "SEO", "SEO"], [/\bgoogle search\b|\bsearch console\b/i, "GoogleSearch", "SEO"], [/\bcore update\b/i, "GoogleCoreUpdate", "SEO"],
  [/\bcyber ?security\b|^security$|^infosec$/i, "CyberSecurity", "Security"], [/\bransomware\b/i, "Ransomware", "Security"],
  [/\bdata ?breach\b/i, "DataBreach", "Security"], [/\bphishing\b/i, "Phishing", "Security"], [/\bzero[- ]day\b/i, "ZeroDay", "Security"],
  [/\bcve-\d{4}-\d+\b|\bvulnerabilit(y|ies)\b/i, "Vulnerability", "Security", true], [/\bpasskeys?\b/i, "Passkeys", "Security"],
  [/\bowasp\b/i, "OWASP", "Security"], [/\bddos\b/i, "DDoS", "Security"], [/\bsupply[- ]chain\b/i, "SupplyChainSecurity", "Security", true],
  [/\boutage\b|\bis down\b/i, "Outage", "QA"], [/\bsre\b|\bobservability\b/i, "SRE", "QA", true],
  [/\btesting\b|\bqa\b/i, "SoftwareTesting", "QA", true], [/\bplaywright\b/i, "Playwright", "QA"], [/\bselenium\b/i, "Selenium", "QA", true],
  [/\bcypress\b/i, "Cypress", "QA", true], [/\bautomation\b/i, "Automation", "QA", true], [/\bdevops\b/i, "DevOps", "QA"],
  [/\baccessibility\b|\ba11y\b|\bwcag\b/i, "Accessibility", "A11y"], [/\beuropean accessibility act\b/i, "EAA", "A11y"],
  [/\bgdpr\b|\brgpd\b|\bdsgvo\b/i, "GDPR", "Privacy"], [/\bprivacy\b/i, "Privacy", "Privacy", true],
  [/\bcore web vitals\b/i, "CoreWebVitals", "Perf"], [/^performance$|\bweb ?perf\b/i, "WebPerformance", "Perf", true],
  [/\bga4\b|\bgoogle analytics\b/i, "GA4", "Analytics"],
  [/\bweb ?dev\b|\bweb development\b/i, "WebDev", "WebDev"], [/\bjavascript\b|^js$/i, "JavaScript", "WebDev"], [/\btypescript\b/i, "TypeScript", "WebDev"],
  [/\bReact(\.?js)?\b/, "React", "WebDev"], [/^react$/i, "React", "WebDev"], [/\bnext\.?js\b/i, "NextJS", "WebDev"], [/\bvue(\.?js)?\b/i, "VueJS", "WebDev", true],
  [/\bsvelte\b/i, "Svelte", "WebDev"], [/\bnode\.?js\b|^node$/i, "NodeJS", "WebDev"], [/\bCSS\b/, "CSS", "WebDev"], [/^css$/i, "CSS", "WebDev"],
  [/\bHTML\b/, "HTML", "WebDev"], [/^html$/i, "HTML", "WebDev"],
  [/\bwebassembly\b|\bwasm\b/i, "WebAssembly", "WebDev"], [/\bwordpress\b/i, "WordPress", "WebDev"], [/\bshopify\b/i, "Shopify", "WebDev"],
  [/\bchrome\b/i, "Chrome", "WebDev"], [/\bfirefox\b/i, "Firefox", "WebDev"], [/\bopen ?source\b/i, "OpenSource", "WebDev"],
  [/\bcloudflare\b/i, "Cloudflare", "Perf"], [/^programming$|\bcoding\b/i, "Programming", "WebDev", true]
];

const SENSITIVE = /\b(dies|died|dead|death|killed|kills?|murder|shooting|shot|war|terror\w*|bomb\w*|hostage|election\w*|vote|president|senat\w*|congress|gaza|israel|ukraine|russia|crash(es|ed)?|earthquake|hurricane|flood\w*|wildfire|funeral|suicide|abuse|arrest\w*|lawsuit|sued|layoffs?|fired|scandal)\b/i;

// [name, weight, techOnly source, fetch → list of strings]
const SOURCES = [
  ["devto", 3, true, async () => (await json("https://dev.to/api/articles?top=1&per_page=100")).flatMap((a) => a.tag_list || [])],
  ["lobsters", 2, true, async () => (await json("https://lobste.rs/hottest.json")).flatMap((s) => (s.tags || []).concat(s.title))],
  ["hackernews", 2, true, async () => (await json("https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=50")).hits.map((h) => h.title)],
  ["google-trends", 2, false, async () => (await Promise.all(GEOS.map((geo) => text("https://trends.google.com/trending/rss?geo=" + geo).catch(() => ""))))
    .flatMap((xml) => Array.from(xml.matchAll(/<item>[\s\S]*?<title>([^<]+)<\/title>/g), (m) => m[1]))],
  ["mastodon", 1, false, async () => (await json("https://mastodon.social/api/v1/trends/tags?limit=20")).map((t) => t.name)]
];

async function text(url) {
  const res = await fetch(url, { headers: { "user-agent": "QA-lab trending tags (+https://carlosandmunoz.com)" }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(url + " answered " + res.status);
  return res.text();
}
async function json(url) { return JSON.parse(await text(url)); }

function matches(items, techOnly) {
  const counts = {};
  for (const item of items) {
    if (!item || SENSITIVE.test(item)) continue;
    const hit = new Set();
    for (const [re, tag, topic, onlyTech] of VOCAB) {
      if (onlyTech && !techOnly) continue;
      if (re.test(item) && !hit.has(tag)) { hit.add(tag); counts[tag] = { topic, n: ((counts[tag] || {}).n || 0) + 1 }; }
    }
  }
  return counts;
}

async function main() {
  const flags = new Set(process.argv.slice(2));
  const today = new Date().toISOString().slice(0, 10);
  if (flags.has("--if-stale") && fs.existsSync(TRENDING_FILE)) {
    try { if (JSON.parse(fs.readFileSync(TRENDING_FILE, "utf8")).date === today) { console.log("trending tags already fetched today"); return; } } catch (e) { /* refetch */ }
  }
  const score = {};
  const read = {};
  await Promise.all(SOURCES.map(async ([name, weight, techOnly, get]) => {
    try {
      const items = await get();
      const counts = matches(items, techOnly);
      const top = Math.max(1, ...Object.values(counts).map((c) => c.n));
      read[name] = items.length;
      for (const [tag, c] of Object.entries(counts)) {
        const s = score[tag] || (score[tag] = { tag, topic: c.topic, score: 0, from: [] });
        s.score += weight * c.n / top;
        s.from.push(name);
      }
    } catch (e) {
      read[name] = 0;
      console.warn("trending tags: " + name + " skipped (" + e.message + ")");
    }
  }));
  if (!Object.values(read).some(Boolean)) { console.warn("trending tags: no source answered; kept the last file"); return; }
  const tags = Object.values(score)
    .map((s) => Object.assign(s, { score: Math.round(s.score * 100) / 100, from: s.from.sort() }))
    .sort((a, b) => b.score - a.score || a.tag.localeCompare(b.tag)).slice(0, KEEP);
  const out = { date: today, fetchedAt: new Date().toISOString(), sources: read, tags };
  if (flags.has("--dry-run")) { console.log(JSON.stringify(out, null, 1)); return; }
  fs.writeFileSync(TRENDING_FILE, JSON.stringify(out, null, 1) + "\n");
  console.log("trending tags:", tags.slice(0, 10).map((t) => "#" + t.tag).join(" "), "→", path.relative(process.cwd(), TRENDING_FILE));
}

if (require.main === module) main().catch((e) => { console.warn("trending tags failed: " + e.message); });

module.exports = { VOCAB, SENSITIVE, matches };
