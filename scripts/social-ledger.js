#!/usr/bin/env node
/* What Buffer and the Facebook Page took for each post, so the Social hub pane in admin.html shows confirmations
   instead of calendar slots. scripts/buffer-queue.js writes assets/social/buffer.json, scripts/facebook-queue.js
   writes assets/social/facebook.json, and the workflows that run them commit both (scripts/commit-social-ledgers.sh).

   { version: 1,
     posts: { "<batch>/<slug>": [{ channel: "linkedin", profile: "linkedin (QA-lab)", id: "<Buffer post or Graph post id>",
       at: "<due time, or sent time once sent>", result: "queued" | "sent" | "failed", error, url, checked: "<ISO>" }] } }

   One entry per calendar channel and profile. Every later run looks up the queued entries whose time has passed
   and moves them to sent or failed.

     node scripts/social-ledger.js --merge <from.json> <into.json>   adds the entries of <from> to <into>, newer wins */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const BUFFER = "assets/social/buffer.json";
const FACEBOOK = "assets/social/facebook.json";
const FINAL = new Set(["sent", "failed"]);
const FIELDS = ["channel", "profile", "id", "at", "result", "error", "url", "checked"];

function empty() {
  return { version: 1, posts: {} };
}

function read(file) {
  let text;
  try {
    text = fs.readFileSync(path.resolve(ROOT, file), "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return empty();
    throw error;
  }
  const json = JSON.parse(text);
  return json && json.posts && typeof json.posts === "object" ? json : empty();
}

function write(file, ledger) {
  const posts = {};
  Object.keys(ledger.posts).sort().forEach((id) => {
    posts[id] = ledger.posts[id].slice().sort((a, b) => (a.channel + "|" + a.profile).localeCompare(b.channel + "|" + b.profile));
  });
  fs.writeFileSync(path.resolve(ROOT, file), JSON.stringify({ version: 1, posts }, null, 1) + "\n");
}

// A sent or failed result outlives a later "queued" for the same post id: a stale run must not undo a lookup.
function newer(a, b) {
  if (a.id && a.id === b.id && FINAL.has(a.result) !== FINAL.has(b.result)) return FINAL.has(a.result) ? a : b;
  return (b.checked || "") >= (a.checked || "") ? b : a;
}

function record(ledger, post, entry) {
  const clean = Object.fromEntries(FIELDS.filter((field) => entry[field] !== "" && entry[field] != null).map((field) => [field, entry[field]]));
  const list = ledger.posts[post] || (ledger.posts[post] = []);
  const i = list.findIndex((other) => other.channel === clean.channel && other.profile === clean.profile);
  if (i < 0) list.push(clean);
  else list[i] = newer(list[i], clean);
  return ledger;
}

function merge(into, from) {
  Object.entries(from.posts || {}).forEach(([post, list]) => list.forEach((entry) => record(into, post, entry)));
  return into;
}

function find(ledger, post, channel, profile) {
  return (ledger.posts[post] || []).find((entry) => entry.channel === channel && entry.profile === profile) || null;
}

function due(ledger, now) {
  const out = [];
  Object.entries(ledger.posts).forEach(([post, list]) => list.forEach((entry) => {
    if (entry.result === "queued" && entry.id && Date.parse(entry.at) <= now) out.push({ post, entry });
  }));
  return out;
}

// lookup(entry) resolves to { result, at, url, error } once the network has decided, or null while it is still queued.
async function upgrade(ledger, now, lookup) {
  const counts = { sent: 0, failed: 0, queued: 0 };
  for (const { post, entry } of due(ledger, now)) {
    const update = await lookup(entry);
    if (!update || !FINAL.has(update.result)) { counts.queued += 1; continue; }
    const known = Object.fromEntries(Object.entries(update).filter(([, value]) => value));
    record(ledger, post, Object.assign({}, entry, known, { checked: new Date(now).toISOString() }));
    counts[update.result] += 1;
  }
  return counts;
}

// A post from Buffer's post query, or null when Buffer no longer has it. Other statuses are still on their way.
function fromBuffer(post) {
  if (!post) return { result: "failed", error: "No longer in Buffer" };
  if (post.status === "sent") return { result: "sent", at: post.sentAt, url: post.externalLink };
  if (post.status === "error") return { result: "failed", error: (post.error && post.error.message) || "Buffer could not publish it" };
  return null;
}

// A Page post read with is_published,permalink_url, or null when the Page no longer has it.
function fromGraph(node) {
  if (!node) return { result: "failed", error: "No longer on the Page" };
  return node.is_published ? { result: "sent", url: node.permalink_url } : null;
}

if (require.main === module) {
  const [flag, from, into] = process.argv.slice(2);
  if (flag !== "--merge" || !from || !into) {
    console.error("usage: node scripts/social-ledger.js --merge <from.json> <into.json>");
    process.exit(2);
  }
  write(into, merge(read(into), read(from)));
}

module.exports = { BUFFER, FACEBOOK, empty, read, write, record, merge, find, due, upgrade, fromBuffer, fromGraph };
