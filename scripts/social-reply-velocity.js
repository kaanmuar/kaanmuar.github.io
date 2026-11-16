#!/usr/bin/env node
/* Reply velocity on our own posts (#3559): comments vs hours since first send.
   Reads social ledgers (sent `at`) + assets/social/metrics.json comments.
   node scripts/social-reply-velocity.js [--hours 24] [--json] [--limit 20] */

"use strict";

const fs = require("fs");
const path = require("path");
const ledger = require("./social-ledger");

const ROOT = path.resolve(__dirname, "..");
const METRICS = path.join(ROOT, "assets/social/metrics.json");
const BOOKS = [ledger.BUFFER, ledger.FACEBOOK, ledger.OPEN_SOCIAL].map((f) => path.join(ROOT, f));

function argValue(name) {
  const at = process.argv.indexOf("--" + name);
  return at > -1 && process.argv[at + 1] && !process.argv[at + 1].startsWith("--") ? process.argv[at + 1] : null;
}

function firstSentAt(entries) {
  const times = (entries || []).filter((e) => e && e.result === "sent" && e.at).map((e) => Date.parse(e.at)).filter(Number.isFinite);
  return times.length ? Math.min(...times) : 0;
}

function commentsOf(metricsPost) {
  let n = 0;
  Object.values(metricsPost || {}).forEach((row) => { n += Number(row && row.comments) || 0; });
  return n;
}

function score(comments, hours) {
  const h = Math.max(0.25, hours);
  return Math.round((comments / Math.pow(h, 0.8)) * 100) / 100;
}

function loadBooks() {
  return BOOKS.map((file) => {
    try { return ledger.read(path.relative(ROOT, file)); } catch (error) { return ledger.empty(); }
  });
}

/** Posts with comment velocity in the first `withinHours` after send. */
function velocity(opts) {
  const o = opts || {};
  const within = Number(o.hours) > 0 ? Number(o.hours) : 24;
  const now = o.now != null ? Number(o.now) : Date.now();
  const metrics = o.metrics || (fs.existsSync(METRICS) ? JSON.parse(fs.readFileSync(METRICS, "utf8")) : { posts: {} });
  const books = o.books || loadBooks();
  const byKey = {};
  books.forEach((book) => {
    Object.keys(book.posts || {}).forEach((key) => {
      const at = firstSentAt(book.posts[key]);
      if (!at) return;
      if (!byKey[key] || at < byKey[key]) byKey[key] = at;
    });
  });
  const rows = Object.keys(byKey).map((key) => {
    const sentAt = byKey[key];
    const hours = (now - sentAt) / 3600000;
    const comments = commentsOf((metrics.posts || {})[key]);
    return {
      key,
      sentAt: new Date(sentAt).toISOString(),
      hours: Math.round(hours * 10) / 10,
      comments,
      velocity: score(comments, Math.min(hours, within)),
      early: hours <= within && comments > 0
    };
  }).filter((row) => row.hours >= 0);
  rows.sort((a, b) => b.velocity - a.velocity || b.comments - a.comments);
  const limit = Number(o.limit) > 0 ? Number(o.limit) : 20;
  return {
    at: new Date(now).toISOString(),
    withinHours: within,
    posts: rows.slice(0, limit),
    hot: rows.filter((r) => r.early).slice(0, limit)
  };
}

if (require.main === module) {
  const out = velocity({ hours: argValue("hours"), limit: argValue("limit") });
  if (process.argv.includes("--json")) console.log(JSON.stringify(out, null, 2));
  else {
    console.log("Reply velocity (first " + out.withinHours + "h), top " + out.posts.length + ":");
    out.posts.slice(0, 15).forEach((p) => {
      console.log("  " + p.velocity.toFixed(2) + "  c=" + p.comments + "  h=" + p.hours + "  " + p.key + (p.early ? "  ← hot" : ""));
    });
    if (!out.hot.length) console.log("(none with comments inside the window yet)");
  }
}

module.exports = { velocity, score, commentsOf, firstSentAt };
