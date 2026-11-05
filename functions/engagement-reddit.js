"use strict";
/*
 * Reddit under our own posts (#2614). Reddit lets nothing reach the Reddit app over the network, so the loop runs
 * through the app's log lines and its uploads, once an hour in .github/workflows/reddit-engagement.yml:
 *
 *   1. The app (reddit/live-reports) logs the comments left under its r/QALabLiveReports posts of the last week and
 *      the replies it posted, as qalab-ledger lines (kinds "comments", "replied" and "reply-failed").
 *   2. scripts/reddit-engagement.js reads them with `devvit logs` and sends them here (engagement-reddit-sync):
 *      comments go through the chain pass like every network's (Gemini reads them, an answer waits for Carlos), and
 *      each replied line marks its reply posted.
 *   3. The answer is the replies Carlos approved that the app has not posted yet. When one is new to the app, or
 *      REUPLOAD passed without the app confirming it, upload is true: the workflow ships them in the app's
 *      dist/engagement.json with a new version and then says so ({ uploaded: [keys] }).
 *
 *   engagement_private/reddit  { tokenHash, pairedAt, at, read, chained, queued, posted, error }
 *
 * The workflow signs with REDDIT_ENGAGEMENT_TOKEN, whose hash `node scripts/reddit-engagement.js pair` stores. The
 * app answers as its own account and cannot vote, so nothing is liked here.
 */
const crypto = require("crypto");
const E = require("./engagement");
const J = require("./jarvis-engagement");

const REUPLOAD = 3 * 3600000;
const MAX_COMMENTS = 200;
const MAX_QUEUE = 20;
const MAX_TRIES = 3;
const T1 = /^t1_[a-z0-9]{1,13}$/;
const THING = /^t[13]_[a-z0-9]{1,13}$/;
const KEY = /^reddit_[a-f0-9]{20}$/;

const clip = (v, n) => String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, n);
const num = (v) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : 0);
const stateRef = (db) => db.collection("engagement_private").doc("reddit");
const hash = (token) => crypto.createHash("sha256").update(String(token)).digest("hex");

class RedditError extends Error {
  constructor(message, status) { super(message); this.status = status || 400; }
}

async function verify(db, token) {
  const t = String(token || "");
  if (t.length < 32) throw new RedditError("Pair the Reddit sync first: node scripts/reddit-engagement.js pair", 401);
  const snap = await stateRef(db).get();
  const want = snap.exists ? String(snap.data().tokenHash || "") : "";
  const got = hash(t);
  if (!want || want.length !== got.length || !crypto.timingSafeEqual(Buffer.from(want), Buffer.from(got))) throw new RedditError("This token is not the paired Reddit sync token.", 403);
}

/** A comment the app logged, as a post in the scout's shape with liked, answered, on (what it answers) and ours (what that says), or null. */
function cleanComment(c) {
  if (!c || !T1.test(c.id) || !THING.test(c.post) || !THING.test(c.parent || "")) return null;
  const text = String(c.body || "").trim();
  if (!text || !/^\/r\/\w+\/comments\//.test(String(c.permalink || ""))) return null;
  const at = Date.parse(c.created);
  return {
    network: "reddit", id: c.id, thread: c.post, url: "https://www.reddit.com" + clip(c.permalink, 400),
    author: { handle: clip(c.author, 60), name: clip(c.author, 60), id: "", followers: 0 },
    text: text.slice(0, 1200), lang: "", createdAt: Number.isFinite(at) ? new Date(at).toISOString() : "", isReply: true,
    metrics: { likes: num(c.score), replies: 0, reposts: 0, views: 0 }, tags: [],
    liked: false, answered: c.answered === true, on: c.parent, ours: clip(c.ours, 500)
  };
}

/** What the app said of the replies it was given: posted (or found ours already there), or failed on one run. */
async function results(deps, lines) {
  const { db, now, inc } = deps;
  const at = new Date(now).toISOString();
  const day = db.collection("engagement_daily").doc(E.bogotaDay(now));
  const count = (c) => day.set({ n: { reddit: { [c]: inc(1) } } }, { merge: true });
  let posted = 0;
  for (const line of (Array.isArray(lines) ? lines : []).slice(0, 100)) {
    if (!line || !KEY.test(line.key || "")) continue;
    const ref = db.collection("engagement_posts").doc(line.key);
    const snap = await ref.get();
    const doc = snap.exists ? snap.data() : null;
    const r = ((doc || {}).actions || {}).reply || {};
    if (!doc || doc.network !== "reddit" || r.status !== "approved") continue;
    if (line.kind === "replied") {
      const fields = { "actions.reply.url": /^https:\/\/www\.reddit\.com\//.test(line.url || "") ? clip(line.url, 500) : "", "actions.reply.id": T1.test(line.id || "") ? line.id : "", "actions.reply.leasedAt": "", "actions.reply.by": "reddit-app", updatedAt: at };
      if (line.already) await ref.update(Object.assign(fields, { "actions.reply.status": "replied", "actions.reply.at": at, "actions.reply.error": "We had already replied there, so this one was not sent." }));
      else await ref.update(Object.assign(fields, { "actions.reply.status": "posted", "actions.reply.postedAt": at, "actions.reply.error": "" }));
      await count(line.already ? "already" : "posted");
      if (!line.already) posted += 1;
    } else if (line.kind === "reply-failed" && String(line.at || "") > String(r.failedAt || "")) {
      // The app tries each reply on every run and logs each failure, so one line per run counts.
      const tries = (r.tries || 0) + 1;
      await ref.update(Object.assign({ "actions.reply.error": clip(line.error, 200), "actions.reply.tries": tries, "actions.reply.failedAt": clip(line.at, 30), updatedAt: at }, tries >= MAX_TRIES ? { "actions.reply.status": "failed" } : {}));
      if (tries >= MAX_TRIES) await count("failed");
    }
  }
  return posted;
}

/** The approved replies the app has not posted: [{ key, id, text }], and whether they need a new upload. */
async function queue(deps, conf) {
  if (conf.paused) return { items: [], upload: false };
  const snap = await deps.db.collection("engagement_posts").where("actions.reply.status", "==", "approved").limit(60).get();
  const rows = snap.docs.map((d) => ({ key: d.id, doc: d.data() })).filter((t) => t.doc.network === "reddit" && T1.test(t.doc.id)).slice(0, MAX_QUEUE);
  return {
    items: rows.map((t) => ({ key: t.key, id: t.doc.id, text: t.doc.actions.reply.draft })),
    upload: rows.some((t) => !t.doc.actions.reply.uploadedAt || deps.now - Date.parse(t.doc.actions.reply.uploadedAt) > REUPLOAD)
  };
}

/** One sync from the workflow: comments in, results in, the replies to ship out. */
async function sync(deps, body) {
  const { db, now } = deps;
  const b = body || {};
  const at = new Date(now).toISOString();
  const conf = await J.readSettings(db);
  if (Array.isArray(b.uploaded)) {
    for (const key of b.uploaded.filter((k) => KEY.test(k)).slice(0, MAX_QUEUE)) {
      const ref = db.collection("engagement_posts").doc(key);
      const snap = await ref.get();
      if (snap.exists && snap.data().network === "reddit" && ((snap.data().actions || {}).reply || {}).status === "approved") await ref.update({ "actions.reply.uploadedAt": at, updatedAt: at });
    }
  }
  const comments = (Array.isArray(b.comments) ? b.comments : []).slice(0, MAX_COMMENTS).map(cleanComment).filter(Boolean);
  const found = comments.map((c) => ({ parent: { key: "", own: true, network: "reddit", id: c.on, thread: c.thread, text: "", score: 0, actions: { reply: { draft: c.ours } } }, comments: [c] }));
  const chains = found.length ? await J.takeChains(deps, conf, found).catch((error) => ({ chained: 0, drafted: 0, aiError: String(error.message || error).slice(0, 200) })) : { chained: 0, drafted: 0, aiError: "" };
  const posted = await results(deps, b.results);
  const q = await queue(deps, conf);
  const error = clip(b.error || chains.aiError, 200);
  await stateRef(db).set({ at, read: comments.length, chained: chains.chained || 0, queued: q.items.length, posted, error }, { merge: true });
  await J.clearCache(db);
  return { ok: true, read: comments.length, chained: chains.chained || 0, drafted: chains.drafted || 0, posted, aiError: chains.aiError || "", queue: q.items, upload: q.upload };
}

/** The jarvis function's entry for the workflow: checks the token, then syncs. */
async function handle(deps, body, token) {
  if (String((body || {}).op || "") !== "engagement-reddit-sync") throw new RedditError("Unknown Reddit op.");
  await verify(deps.db, token);
  return sync(deps, body);
}

module.exports = { REUPLOAD, MAX_TRIES, RedditError, hash, verify, cleanComment, results, queue, sync, handle };
