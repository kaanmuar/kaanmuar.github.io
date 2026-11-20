"use strict";

/* Multi-page checks (#3830) on the pages a review already opened, ported in plain code from the algorithms of
   davo20019/seo-analysis (MIT): internal PageRank over the links between those pages (link-graph.ts) and MinHash
   near-duplicate clustering of their text (content-dedup.ts). No page is requested for this; the links and the text
   fingerprint come from the HTML the review fetched. */

const { say, some } = require("./url-review-findings-en");

const PERMUTATIONS = 64;
const SHINGLE_WORDS = 5;
const MIN_WORDS = 60;
const MAX_WORDS = 5000;
const DUPLICATE_AT = 0.85;
const MIN_PAGES = 5;

// Fixed odd multipliers and offsets so a fingerprint made now compares with one made later.
const SEEDS = (() => {
  let state = 0x9e3779b9;
  const next = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state;
  };
  return Array.from({ length: PERMUTATIONS }, () => [(next() | 1) >>> 0, next()]);
})();

function hashWord(text) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

// A signature as a 512-character hex string, or "" when the page has too little text to compare.
function minhash(text) {
  const words = (String(text || "").toLowerCase().match(/[\p{L}\p{N}]+/gu) || []).slice(0, MAX_WORDS);
  if (words.length < MIN_WORDS) return "";
  const mins = new Array(PERMUTATIONS).fill(0xffffffff);
  for (let i = 0; i + SHINGLE_WORDS <= words.length; i++) {
    const base = hashWord(words.slice(i, i + SHINGLE_WORDS).join(" "));
    for (let k = 0; k < PERMUTATIONS; k++) {
      const value = (Math.imul(base, SEEDS[k][0]) + SEEDS[k][1]) >>> 0;
      if (value < mins[k]) mins[k] = value;
    }
  }
  return mins.map((value) => value.toString(16).padStart(8, "0")).join("");
}

function similarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let same = 0;
  for (let k = 0; k < PERMUTATIONS; k++) if (a.slice(k * 8, k * 8 + 8) === b.slice(k * 8, k * 8 + 8)) same++;
  return same / PERMUTATIONS;
}

// Groups of two or more row paths whose text is at least DUPLICATE_AT alike, joined through pairs that pass.
function duplicateGroups(rows, threshold) {
  const limit = threshold || DUPLICATE_AT;
  const list = rows.filter((row) => row.sig);
  const parent = list.map((row, index) => index);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      if (similarity(list[i].sig, list[j].sig) >= limit) parent[find(j)] = find(i);
    }
  }
  const groups = new Map();
  list.forEach((row, index) => {
    const root = find(index);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(row.path);
  });
  return [...groups.values()].filter((group) => group.length > 1);
}

// PageRank (damping 0.85) over the rows' links to each other. Ranks add up to 1; a page with no links out shares its rank with all.
function pageRank(rows, options) {
  const damping = (options && options.damping) || 0.85;
  const rounds = (options && options.rounds) || 30;
  const n = rows.length;
  if (!n) return [];
  const index = new Map(rows.map((row, i) => [row.key, i]));
  const out = rows.map((row, i) => [...new Set((row.links || []).map((key) => index.get(key)).filter((target) => target != null && target !== i))]);
  let rank = new Array(n).fill(1 / n);
  for (let round = 0; round < rounds; round++) {
    const next = new Array(n).fill((1 - damping) / n);
    let loose = 0;
    for (let i = 0; i < n; i++) {
      if (!out[i].length) loose += rank[i];
      else out[i].forEach((target) => { next[target] += (damping * rank[i]) / out[i].length; });
    }
    for (let i = 0; i < n; i++) next[i] += (damping * loose) / n;
    rank = next;
  }
  return rows.map((row, i) => ({ path: row.path, rank: rank[i], inbound: out.reduce((sum, targets) => sum + (targets.indexOf(i) !== -1 ? 1 : 0), 0) }));
}

function analyze(rows) {
  const list = rows || [];
  const ranked = pageRank(list);
  const top = ranked.slice().sort((a, b) => b.rank - a.rank || a.path.localeCompare(b.path)).slice(0, 3).map((row) => row.path);
  const weak = ranked.slice(1).filter((row) => row.inbound <= 1).map((row) => row.path);
  return { pages: list.length, top, weak, groups: duplicateGroups(list), compared: list.filter((row) => row.sig).length };
}

function findings(rows, add) {
  if (!rows || rows.length < MIN_PAGES) return null;
  const report = analyze(rows);
  const weakShare = report.weak.length / Math.max(1, rows.length - 1);
  if (report.weak.length >= 3 && weakShare >= 0.4) {
    add("SEO", "risk", "low", "seo-page-rank", say("seo-page-rank.title", { n: report.weak.length }),
      say("seo-page-rank.evidence", { list: some(report.weak, 4), top: { items: report.top, join: "and" }, n: report.pages }),
      say("seo-page-rank.fix"), { pages: report.weak, effort: "hours" });
  } else {
    add("SEO", "pass", "info", "seo-page-rank", say("seo-page-rank.pass.title"),
      say("seo-page-rank.pass.evidence", { n: report.pages, top: { items: report.top, join: "and" } }), "", { effort: "hours" });
  }
  if (report.compared >= MIN_PAGES) {
    if (report.groups.length) {
      add("SEO", "risk", "low", "seo-near-duplicates", say("seo-near-duplicates.title", { n: report.groups.length }),
        say("seo-near-duplicates.evidence", { list: some(report.groups.map((group) => group.slice(0, 3).join(" ≈ ")), 3), pct: Math.round(DUPLICATE_AT * 100) }),
        say("seo-near-duplicates.fix"), { pages: [].concat(...report.groups), effort: "hours" });
    } else {
      add("SEO", "pass", "info", "seo-near-duplicates", say("seo-near-duplicates.pass.title"), say("seo-near-duplicates.pass.evidence", { n: report.compared }), "", { effort: "hours" });
    }
  }
  return report;
}

module.exports = { minhash, similarity, duplicateGroups, pageRank, analyze, findings, DUPLICATE_AT };
