#!/usr/bin/env node
/* What Buffer, the Facebook Page, Bluesky, Mastodon, dev.to and Telegram took for each post, so the Social hub pane in
   admin.html shows confirmations instead of calendar slots. scripts/buffer-queue.js writes assets/social/buffer.json,
   scripts/facebook-queue.js writes assets/social/facebook.json, scripts/open-social-queue.js writes
   assets/social/open-social.json, scripts/devto-queue.js writes assets/social/devto.json, scripts/telegram-live.js
   writes assets/social/telegram.json (one channel post per Live Reports batch, under live/<date>), and the workflows
   that run them commit them (scripts/commit-social-ledgers.sh). Reddit's app posts on its own and logs each post;
   scripts/reddit-ledger.js reads those logs into assets/social/reddit.json, one entry per batch post under live/<date>,
   with the subreddit's members (#2571).

   { version: 1,
     posts: { "<batch>/<slug>": [{ channel: "linkedin", profile: "linkedin (QA-lab)", id: "<Buffer post or Graph post id>",
       at: "<due time, or sent time once sent>", result: "queued" | "sent" | "failed" | "moved", error, url, checked: "<ISO>",
       slot: "<the calendar time a queued post waits to be moved to (social-calendar.js --sync)>",
       hash: "<a short hash of the text Telegram has, so telegram-live.js scrub edits only changed posts>" }] },
     retry: { "<batch>": { since: "<ISO>", error } },
     members: { chat: "r/QALabLiveReports", members, at: "<ISO>", history: [{ date: "YYYY-MM-DD", members }] },
     numbers: { "<post id>": { likes, comments, at: "<ISO>" } } }
   members is only in a channel's own ledger (reddit.json): the count now and one point per UTC day. numbers is each
   post's latest score and comments as the Reddit app logged them (#2602), read by scripts/social-metrics.js.

   One entry per calendar channel and profile. Every later run looks up the queued entries whose time has passed
   and moves them to sent or failed. retry lists the batches a spent Buffer limit stopped (#1188); the nightly
   buffer-batch.yml run queues them again, and a run that queues a whole batch takes it off.

     node scripts/social-ledger.js --merge <from.json> <into.json>   adds the entries of <from> to <into>, newer wins */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const BUFFER = "assets/social/buffer.json";
const FACEBOOK = "assets/social/facebook.json";
const OPEN_SOCIAL = "assets/social/open-social.json";
const DEVTO = "assets/social/devto.json";
// moved: taken off this profile and queued on the other face's (scripts/face-route.js, #2310).
const FINAL = new Set(["sent", "failed", "moved"]);
const FIELDS = ["channel", "profile", "id", "at", "result", "error", "url", "checked", "slot", "hash"];

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
  const out = { version: 1, posts };
  const retry = Object.keys(ledger.retry || {}).sort();
  if (retry.length) out.retry = Object.fromEntries(retry.map((batch) => [batch, ledger.retry[batch]]));
  if (ledger.members) out.members = ledger.members;
  const numbered = Object.keys(ledger.numbers || {}).sort();
  if (numbered.length) out.numbers = Object.fromEntries(numbered.map((id) => [id, ledger.numbers[id]]));
  fs.writeFileSync(path.resolve(ROOT, file), JSON.stringify(out, null, 1) + "\n");
}

function markRetry(ledger, batch, error, now) {
  ledger.retry = Object.assign({}, ledger.retry, { [batch]: { since: (ledger.retry && ledger.retry[batch] && ledger.retry[batch].since) || now, error } });
  return ledger;
}

function clearRetry(ledger, batch) {
  if (ledger.retry) delete ledger.retry[batch];
  return ledger;
}

function retries(ledger) {
  return Object.keys(ledger.retry || {}).sort();
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
  if (i < 0) {
    list.push(clean);
    return ledger;
  }
  const old = list[i];
  list[i] = newer(old, clean);
  // A seed or check that re-reads a queued post knows nothing of the slot it waits for.
  if (old.slot && !list[i].slot && list[i].result === "queued" && list[i].id === old.id && Date.parse(list[i].at) !== Date.parse(old.slot)) list[i] = Object.assign({}, list[i], { slot: old.slot });
  return ledger;
}

const HISTORY_DAYS = 400;

// One point per UTC day, the later reading of a day wins; the count is the newest reading's.
function count(ledger, chat, members, at) {
  const n = Math.round(Number(members));
  if (members == null || !Number.isFinite(n) || n < 0 || !Number.isFinite(Date.parse(at || ""))) return ledger;
  const old = ledger.members || {};
  const date = new Date(at).toISOString().slice(0, 10);
  const kept = (Array.isArray(old.history) ? old.history : []).filter((p) => p && p.date !== date);
  const day = (old.history || []).find((p) => p && p.date === date);
  const point = day && (day.at || "") > at ? day : { date, members: n, at };
  const history = kept.concat(point).sort((a, b) => a.date.localeCompare(b.date)).slice(-HISTORY_DAYS);
  const newest = !old.at || at >= old.at;
  ledger.members = { chat: (newest && chat) || old.chat || chat || "", members: newest ? n : old.members, at: newest ? at : old.at, history };
  return ledger;
}

// A post's numbers as of at; an older reading never replaces a newer one.
function numbers(ledger, id, values, at) {
  if (!id || !Number.isFinite(Date.parse(at || ""))) return ledger;
  const old = (ledger.numbers || {})[id];
  if (old && (old.at || "") > at) return ledger;
  const n = (v) => Math.max(0, Math.round(Number(v) || 0));
  ledger.numbers = Object.assign({}, ledger.numbers, { [id]: { likes: n(values.likes), comments: n(values.comments), at } });
  return ledger;
}

// A batch one side took off retry comes back if the other still lists it; re-queueing it again only skips posts.
function merge(into, from) {
  Object.entries(from.posts || {}).forEach(([post, list]) => list.forEach((entry) => record(into, post, entry)));
  if (from.retry) into.retry = Object.assign({}, into.retry, from.retry);
  if (from.members) {
    (from.members.history || []).forEach((p) => count(into, from.members.chat, p.members, p.at || p.date + "T00:00:00.000Z"));
    count(into, from.members.chat, from.members.members, from.members.at);
  }
  Object.entries(from.numbers || {}).forEach(([id, v]) => numbers(into, id, v, v.at));
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

module.exports = { BUFFER, FACEBOOK, OPEN_SOCIAL, DEVTO, empty, read, write, record, count, numbers, merge, find, due, upgrade, fromBuffer, fromGraph, markRetry, clearRetry, retries };
