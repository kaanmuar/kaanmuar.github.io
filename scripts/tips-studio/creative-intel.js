#!/usr/bin/env node
/* Weekly creative-intel digest (#3558): which formats and topics won on our channels,
   plus held caption drafts from field trends. Human gate: editions keep draft:true until edited.

     node scripts/tips-studio/creative-intel.js --draft [--date 2026-11-21]
     node scripts/tips-studio/creative-intel.js --held   # write held tip stubs from trending tags + hooks

   Does not push to Buffer. Held stubs land in scripts/tips-studio/creative-intel/held-<date>.json
   for a later studio build once draft is cleared. */

"use strict";

const fs = require("fs");
const path = require("path");
const hooks = require("../social-hooks");

const ROOT = path.resolve(__dirname, "../..");
const DIR = path.join(__dirname, "creative-intel");
const METRICS = path.join(ROOT, "assets/social/metrics.json");
const FEED = path.join(ROOT, "assets/social/feed.json");
const TRENDING = path.join(ROOT, "scripts/trending-tags.json");

const addDays = (day, n) => { const d = new Date(day + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

function argValue(name) {
  const at = process.argv.indexOf("--" + name);
  return at > -1 && process.argv[at + 1] && !process.argv[at + 1].startsWith("--") ? process.argv[at + 1] : null;
}

function editions() {
  return fs.existsSync(DIR)
    ? fs.readdirSync(DIR).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().map((f) => f.slice(0, 10))
    : [];
}

function engagementOf(metricsPost) {
  let score = 0;
  Object.values(metricsPost || {}).forEach((row) => {
    score += (Number(row.likes) || 0) + 2 * (Number(row.comments) || 0) + (Number(row.views) || Number(row.impressions) || 0) / 100;
  });
  return Math.round(score * 10) / 10;
}

function kindOf(post) {
  const k = String((post && post.kind) || "").toLowerCase();
  if (/quiz|compare/.test(k)) return "quiz";
  if (/myth|never/.test(k)) return "myth";
  if (/list|digest|news/.test(k)) return "list";
  if (/audit|live|report/.test(k)) return "audit";
  if (/trend/.test(k)) return "trend";
  const visual = String((post && post.visual && post.visual.type) || "").toLowerCase();
  if (visual === "list") return "list";
  return "audit";
}

function rankWins(feed, metrics) {
  const posts = (feed && feed.posts) || [];
  const m = (metrics && metrics.posts) || {};
  return posts.map((p) => {
    const key = p.batch && p.slug ? p.batch + "/" + p.slug : (p.id || "");
    const alt = key || Object.keys(m).find((k) => k.endsWith("/" + (p.slug || p.id || ""))) || "";
    const score = engagementOf(m[key] || m[alt] || {});
    return {
      id: p.id || alt || key,
      key: key || alt,
      kind: kindOf(p),
      cat: p.cat || "",
      title: Array.isArray(p.title) ? p.title.join(" ") : String(p.title || p.text || "").slice(0, 120),
      score,
      date: p.date || ""
    };
  }).filter((row) => row.score > 0).sort((a, b) => b.score - a.score);
}

function formatBuckets(wins) {
  const counts = {};
  wins.slice(0, 40).forEach((w) => {
    const k = w.kind || "audit";
    if (!counts[k]) counts[k] = { kind: k, count: 0, score: 0, samples: [] };
    counts[k].count += 1;
    counts[k].score += w.score;
    if (counts[k].samples.length < 3) counts[k].samples.push({ id: w.id, title: w.title, score: w.score });
  });
  return Object.values(counts).sort((a, b) => b.score - a.score);
}

function draft() {
  const all = editions();
  const date = argValue("date") || addDays(all.length ? all[all.length - 1] : "2026-11-14", 7);
  if (new Date(date + "T12:00:00Z").getUTCDay() !== 5) throw new Error(date + " is not a Friday");
  const file = path.join(DIR, date + ".json");
  if (fs.existsSync(file)) throw new Error(path.relative(ROOT, file) + " already exists");
  const feed = JSON.parse(fs.readFileSync(FEED, "utf8"));
  const metrics = fs.existsSync(METRICS) ? JSON.parse(fs.readFileSync(METRICS, "utf8")) : { posts: {} };
  const wins = rankWins(feed, metrics).slice(0, 15);
  const formats = formatBuckets(wins);
  const edition = {
    date,
    draft: true,
    note: "Rewrite the takeaways in our words, then delete draft before any studio build.",
    formats,
    wins,
    hooks: formats.slice(0, 3).map((f, i) => ({ kind: f.kind, hook: hooks.pick(f.kind, date + i) }))
  };
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(edition, null, 2) + "\n");
  console.log("drafted " + path.relative(ROOT, file));
  console.log(formats.slice(0, 5).map((f) => "  " + f.kind + ": n=" + f.count + " score=" + Math.round(f.score)).join("\n"));
  console.log("Review, delete \"draft\", then use --held or a studio source when ready.");
}

function held() {
  const date = argValue("date") || new Date().toISOString().slice(0, 10);
  const file = path.join(DIR, "held-" + date + ".json");
  let tags = [];
  try { tags = (JSON.parse(fs.readFileSync(TRENDING, "utf8")).tags || []).slice(0, 8); } catch (error) { tags = []; }
  const stubs = (tags.length ? tags : [{ tag: "WebDev", topic: "WebDev" }, { tag: "Accessibility", topic: "A11y" }, { tag: "SEO", topic: "SEO" }])
    .slice(0, 5)
    .map((t, i) => {
      const kind = /a11y|access/i.test(t.topic || "") ? "myth" : /seo|geo|ai/i.test(t.topic || "") ? "trend" : "list";
      const hook = hooks.pick(kind, date + String(i) + (t.tag || ""));
      return {
        id: "held-" + date + "-" + (i + 1),
        hold: true,
        draft: true,
        kind,
        topic: t.topic || "WebDev",
        tag: t.tag || "",
        title: hooks.titleLines(kind, date + i),
        body: hook + " Tied to the field's #" + String(t.tag || "WebDev").replace(/^#/, "") + " conversation — keep it practical for URL Review.",
        action: "Open a URL review on your site.",
        tags: [t.tag, "QA"].filter(Boolean)
      };
    });
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ date, draft: true, hold: true, tips: stubs }, null, 2) + "\n");
  console.log("held drafts " + path.relative(ROOT, file) + " (" + stubs.length + " tips)");
  console.log("Human gate: edit copy, delete draft/hold flags when ready to schedule — never auto-Buffer.");
}

if (require.main === module) {
  try {
    if (process.argv.includes("--draft")) draft();
    else if (process.argv.includes("--held")) held();
    else console.log("editions: " + (editions().join(", ") || "(none)") + "\nUse --draft or --held");
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

module.exports = { editions, rankWins, formatBuckets, kindOf, engagementOf, draft, held };
