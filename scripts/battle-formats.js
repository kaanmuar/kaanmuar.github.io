/**
 * Extra competitor battle formats beyond channel-split (#3627 / #3497).
 *
 * Defaults (locked for this PR; Reels stay on #3498):
 * 1. vs-tool — LinkedIn / Instagram scorecard carousel (+ PDF via tips-studio).
 *    Default rival: Semrush · Ahrefs Site Audit (`seo` in js/qa-review-vs.js).
 * 2. us-vs-them — short X / Threads reply thread (hook + up to 4 beats).
 *    Default rival: same `seo` row; English steps feed Buffer X replies and Threads replies.
 *
 * Channel-split (LI/IG quiz+reveal vs X/TG/Threads two-day) stays in PR #3598 /
 * scripts/compare-channel-split.js — these formats do not touch that policy.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const DEFAULT_RIVAL = "seo";
const THREAD_BEATS = 4;
const VS_PAGE = "https://carlosandmunoz.com/qa-review-vs.html";

const FORMATS = Object.freeze({
  "vs-tool": {
    id: "vs-tool",
    label: "vs-tool scorecard carousel",
    networks: ["linkedin", "instagram"],
    defaultRival: DEFAULT_RIVAL,
    slides: 4
  },
  "us-vs-them": {
    id: "us-vs-them",
    label: "us-vs-them short thread",
    networks: ["x", "threads"],
    defaultRival: DEFAULT_RIVAL,
    maxBeats: THREAD_BEATS
  }
});

let cached = null;
function loadVs() {
  if (cached) return cached;
  const window = {};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../js/qa-review-vs.js"), "utf8"), {
    window,
    document: { getElementById: () => null },
    location: { search: "" },
    navigator: { language: "en" },
    localStorage: { getItem: () => null },
    URLSearchParams
  });
  cached = window.QAReviewVs;
  if (!cached) throw new Error("qa-review-vs.js did not export QAReviewVs");
  return cached;
}

function tool(id) {
  const vs = loadVs();
  const found = vs.TOOLS.find((row) => row.id === id);
  if (!found) throw new Error("unknown vs tool: " + id);
  return found;
}

function book(lang) {
  const vs = loadVs();
  return vs.COPY[lang] || vs.COPY.en;
}

function markWord(code) {
  return { y: "yes", p: "partly", n: "no" }[code] || code;
}

function coverage(rivalId = DEFAULT_RIVAL) {
  const vs = loadVs();
  const us = tool("us");
  const them = tool(rivalId);
  const rows = vs.ROWS.map((row, index) => ({
    id: row,
    label: book("en").rows[row],
    us: us.marks[index],
    them: them.marks[index]
  }));
  return {
    rivalId,
    usName: us.name,
    themName: them.name,
    themShort: book("en").short[rivalId] || them.name,
    checked: vs.CHECKED,
    rows,
    weOnly: rows.filter((r) => r.us !== "n" && r.them === "n"),
    theyOnly: rows.filter((r) => r.them !== "n" && r.us === "n"),
    both: rows.filter((r) => r.us !== "n" && r.them !== "n")
  };
}

/** Four feed slides for tips-studio carousel / LinkedIn PDF (#3627 vs-tool). */
function vsToolCarouselSlides(tip) {
  if (!tip || tip.battleFormat !== "vs-tool") return null;
  const rivalId = (tip.vsRival || DEFAULT_RIVAL);
  const cov = coverage(rivalId);
  const we = cov.weOnly.slice(0, 4).map((r) => r.label);
  const themKind = book("en").tools[rivalId].kind;
  return [
    Object.assign({}, tip, {
      counter: "1 / 4",
      title: ["URL Review vs", "*" + cov.themShort + ".*"],
      body: "Same public-site checks, read from each vendor's own pages (checked " + cov.checked + "). Not a SEO crawl shoot-out — a coverage scorecard.",
      visual: {
        type: "versus",
        left: { label: "URL Review", lines: ["Whole public site", "Fixes + re-check"], mark: "pass" },
        right: { label: cov.themShort, lines: themKind.split(", ").slice(0, 2), mark: "fail" }
      },
      actionLabel: "Compare"
    }),
    Object.assign({}, tip, {
      counter: "2 / 4",
      title: ["What we cover", "*that SEO audits skip.*"],
      body: (we.length ? we.join("; ") : "Threat lists, lookalikes, mail auth, and done-for-you fixes") + ".",
      visual: {
        type: "check",
        items: (we.length ? we : ["Phishing and malware lists", "Lookalike domains", "SPF, DKIM and DMARC", "Done-for-you fixes"])
          .slice(0, 4)
          .map((label) => [label, "URL Review", "pass"])
      },
      actionLabel: "Coverage"
    }),
    Object.assign({}, tip, {
      counter: "3 / 4",
      title: ["What they do", "*deeper than we do.*"],
      body: themKind + ". Their pages do not name threat lists, hacked-site signs or mail records — use them for SEO crawl depth, not as a full-site review.",
      visual: {
        type: "check",
        items: [
          ["140+ / 170+ SEO issues", cov.themShort, "pass"],
          ["Scheduled re-crawls", cov.themShort, "pass"],
          ["Threat / mail checks", "Not named", "risk"],
          ["Done-for-you fixes", "Not named", "risk"]
        ]
      },
      actionLabel: "Honest"
    }),
    Object.assign({}, tip, {
      counter: "4 / 4",
      title: ["Use both.", "*Crawl + review.*"],
      body: "Run an SEO audit for on-page depth, then a URL Review for threats, lookalikes, mail auth and fix packages. Full matrix: " + VS_PAGE.replace("https://carlosandmunoz.com/", ""),
      visual: {
        type: "stat",
        value: String(cov.weOnly.length),
        caption: "checks we offer that " + cov.themShort + " does not name"
      },
      action: "Open the live comparison table, then review your own site.",
      actionLabel: "CTA"
    })
  ];
}

/** Short reply beats for X (cap.steps) and Threads (#3627 us-vs-them). */
function usVsThemBeats(rivalId = DEFAULT_RIVAL, max = THREAD_BEATS) {
  const cov = coverage(rivalId);
  const we = cov.weOnly[0] ? cov.weOnly[0].label : "threat lists and mail auth";
  const beats = [
    cov.themShort + " crawls thousands of pages for SEO issues. That depth is real — keep using it.",
    "URL Review instead covers " + we.toLowerCase() + ", lookalikes, and done-for-you fix packages.",
    "Honest split: SEO crawler for on-page depth; URL Review for the rest of the public site.",
    "Matrix + sources (checked " + cov.checked + "): " + VS_PAGE
  ];
  return beats.slice(0, Math.max(1, Math.min(max, THREAD_BEATS)));
}

function isUsVsThem(cap) {
  return !!(cap && (cap.battleFormat === "us-vs-them" || (cap.kind === "compare" && Array.isArray(cap.steps) && cap.steps.length && /us-vs-them|vs-them/i.test(String(cap.title || cap.id || "")))));
}

/** Threads reply plans under the card (sibling replies; richest first). */
function threadsBattleReplies(cap) {
  if (!isUsVsThem(cap)) return null;
  const steps = Array.isArray(cap.steps) && cap.steps.length ? cap.steps : usVsThemBeats(cap.vsRival || DEFAULT_RIVAL);
  const replies = steps.slice(0, THREAD_BEATS).map((step, i) => ({
    uses: ["battle-beat"],
    params: { media_type: "TEXT", text: String(i + 1) + "/" + Math.min(steps.length, THREAD_BEATS) + " " + String(step).slice(0, 480) }
  }));
  return replies.length ? replies : null;
}

module.exports = {
  FORMATS,
  DEFAULT_RIVAL,
  THREAD_BEATS,
  VS_PAGE,
  loadVs,
  coverage,
  markWord,
  vsToolCarouselSlides,
  usVsThemBeats,
  isUsVsThem,
  threadsBattleReplies
};
