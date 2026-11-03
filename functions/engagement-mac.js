"use strict";
/*
 * The Mac's browser agent (#1991): X, LinkedIn, Facebook, Instagram, Threads and TikTok have no API we can search
 * and answer through, so scripts/engagement-browser/agent.js drives a real Chrome on the Mac, signed in once in its
 * own profile, every 30 minutes. It talks to the jarvis function with these ops, signed with the token it paired:
 *
 *   engagement-mac-ingest  { posts, errors, signedIn, accounts, agent }  posts it read; scored, read by Gemini and
 *                                                                        planned like the scout's own
 *   engagement-mac-queue   { networks }                                  planned likes, reposts, follows and approved
 *                                                                        replies for the networks signed in
 *   engagement-mac-result  { key, action, ok, url, error, retry }         what came of one task
 *
 *   engagement_private/mac  { tokenHash, pairedAt, at, read, errors, signedIn, accounts, agent, blocked }
 *
 * `agent.js pair` writes tokenHash with the Mac's gcloud sign-in, so no secret is deployed. A queued task is leased
 * for LEASE so a second run never doubles it; one the Mac cannot carry out in ACT_WINDOW turns missed, and in a dry
 * run (settings.live off) planned likes, reposts and follows turn dry as they are queued. Replies Carlos approved go
 * out either way.
 */
const crypto = require("crypto");
const E = require("./engagement");
const J = require("./jarvis-engagement");
const Act = require("./engagement-act");

const BROWSER = Object.keys(E.NETWORKS).filter((k) => E.NETWORKS[k].browser);
const CARRIED = ["like", "repost", "follow"];
const LEASE = 20 * 60 * 1000;
const PER_NETWORK = 6;
const MAX_POSTS = 300;

const clip = (v, n) => String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, n);
const num = (v) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : 0);
const macRef = (db) => db.collection("engagement_private").doc("mac");
const hash = (token) => crypto.createHash("sha256").update(String(token)).digest("hex");

class MacError extends Error {
  constructor(message, status) { super(message); this.status = status || 400; }
}

/** The token the Mac sends, against the hash agent.js pair stored. */
async function verify(db, token) {
  const t = String(token || "");
  if (t.length < 32) throw new MacError("Pair the Mac first: node scripts/engagement-browser/agent.js pair", 401);
  const snap = await macRef(db).get();
  const want = snap.exists ? String(snap.data().tokenHash || "") : "";
  const got = hash(t);
  if (!want || want.length !== got.length || !crypto.timingSafeEqual(Buffer.from(want), Buffer.from(got))) throw new MacError("This Mac is not paired, or was paired again elsewhere.", 403);
}

/** One post the Mac read, in the scout's shape, or null when it is not one of the Mac's networks or has no id. */
function cleanPost(p) {
  if (!p || !BROWSER.includes(p.network) || !clip(p.id, 300) || !/^https:\/\//.test(String(p.url || ""))) return null;
  const a = p.author || {};
  const m = p.metrics || {};
  const at = Date.parse(p.createdAt);
  return {
    network: p.network, id: clip(p.id, 300), url: clip(p.url, 500),
    author: { handle: clip(a.handle, 120).replace(/^@/, ""), name: clip(a.name, 120), id: clip(a.id, 200), followers: num(a.followers) },
    title: clip(p.title, 300), text: String(p.text || "").slice(0, 1200), lang: clip(p.lang, 8), createdAt: Number.isFinite(at) ? new Date(at).toISOString() : "",
    isReply: p.isReply === true, metrics: { likes: num(m.likes), replies: num(m.replies), reposts: num(m.reposts), views: num(m.views) },
    tags: (Array.isArray(p.tags) ? p.tags : []).map((t) => clip(t, 40)).filter(Boolean).slice(0, 10)
  };
}

const netMap = (obj, fn) => Object.fromEntries(BROWSER.filter((k) => obj && obj[k] !== undefined).map((k) => [k, fn(obj[k])]));

/** Posts the Mac read: the same scoring, Gemini read and plan as the scout's, and the agent's heartbeat. */
async function ingest(deps, body) {
  const { db, now } = deps;
  const b = body || {};
  const posts = (Array.isArray(b.posts) ? b.posts : []).slice(0, MAX_POSTS).map(cleanPost).filter(Boolean);
  const read = Object.fromEntries(BROWSER.map((k) => [k, 0]).filter(([k]) => (b.signedIn || {})[k]));
  posts.forEach((p) => { read[p.network] = (read[p.network] || 0) + 1; });
  const errors = netMap(b.errors, (v) => clip(v, 200));
  const conf = await J.readSettings(db);
  const r = await J.takeIn(deps, conf, posts, read, errors);
  await macRef(db).set({
    at: new Date(now).toISOString(), read, errors, signedIn: netMap(b.signedIn, (v) => v === true), accounts: netMap(b.accounts, (v) => clip(v, 120)),
    blocked: netMap(b.blocked, (v) => clip(v, 30)), agent: clip(b.agent, 40), fresh: r.fresh, engaged: r.engaged, drafted: r.drafted
  }, { merge: true });
  await J.clearCache(db);
  return { ok: true, read: posts.length, fresh: r.fresh, engaged: r.engaged, drafted: r.drafted, aiError: r.aiError };
}

const leased = (x, now) => x && x.leasedAt && Date.parse(x.leasedAt) > now - LEASE;

/** The Mac's work for this run: approved replies first, then planned likes, reposts and follows, best first. */
async function queue(deps, body) {
  const { db, now, inc } = deps;
  const conf = await J.readSettings(db);
  if (conf.paused) return { ok: true, paused: true, live: conf.live, tasks: [] };
  const want = (Array.isArray((body || {}).networks) ? body.networks : BROWSER).filter((k) => BROWSER.includes(k));
  const rows = (snap) => snap.docs.map((d) => ({ key: d.id, ref: d.ref, doc: d.data() })).filter((t) => BROWSER.includes(t.doc.network));
  const planned = (await Promise.all(CARRIED.map((a) => db.collection("engagement_posts").where("actions." + a + ".status", "==", "planned").limit(300).get()
    .then((s) => rows(s).map((t) => Object.assign(t, { action: a })))))).flat().sort((a, b) => (b.doc.score || 0) - (a.doc.score || 0));
  const replies = rows(await db.collection("engagement_posts").where("actions.reply.status", "==", "approved").limit(50).get()).map((t) => Object.assign(t, { action: "reply" }));
  const at = new Date(now).toISOString();
  const day = db.collection("engagement_daily").doc(E.bogotaDay(now));
  const tasks = [];
  const per = {};
  const take = async (t) => {
    if (!want.includes(t.doc.network) || leased(t.doc.actions[t.action], now) || (per[t.doc.network] || 0) >= PER_NETWORK) return;
    per[t.doc.network] = (per[t.doc.network] || 0) + 1;
    await t.ref.update({ ["actions." + t.action + ".leasedAt"]: at, updatedAt: at });
    const r = t.doc.actions.reply || {};
    tasks.push({
      key: t.key, network: t.doc.network, action: t.action, id: t.doc.id, url: t.doc.url, author: { handle: (t.doc.author || {}).handle || "", id: (t.doc.author || {}).id || "" },
      draft: t.action === "reply" ? r.draft || "" : "", lang: t.action === "reply" ? r.lang || t.doc.lang || "" : ""
    });
  };
  for (const t of replies) await take(t);
  let dry = 0;
  let missed = 0;
  for (const t of planned) {
    const k = "actions." + t.action + ".";
    if (Date.parse(t.doc.decidedAgainAt || t.doc.seenAt || 0) < now - Act.ACT_WINDOW) {
      await t.ref.update({ [k + "status"]: "missed", [k + "at"]: at, [k + "error"]: "The Mac's browser did not get to it within 6 hours.", updatedAt: at });
      missed += 1;
    } else if (!conf.live) {
      await t.ref.update({ [k + "status"]: "dry", [k + "at"]: at, updatedAt: at });
      await day.set({ n: { [t.doc.network]: { [t.action + "_dry"]: inc(1) } } }, { merge: true });
      dry += 1;
    } else await take(t);
  }
  if (dry || missed) await J.clearCache(db);
  return { ok: true, paused: false, live: conf.live, tasks, dry, missed };
}

/** What came of one task the Mac carried out. retry: the network refused for now (signed out, a check), so it stays queued. */
async function result(deps, body) {
  const { db, now, inc } = deps;
  const b = body || {};
  const key = String(b.key || "");
  const action = String(b.action || "");
  if (!/^[a-z]+_[a-f0-9]{20}$/.test(key) || !CARRIED.concat("reply").includes(action)) throw new MacError("That is not a task the Mac was given.");
  const ref = db.collection("engagement_posts").doc(key);
  const snap = await ref.get();
  const doc = snap.exists ? snap.data() : null;
  if (!doc || !BROWSER.includes(doc.network)) throw new MacError("That post is gone.", 404);
  const cur = (doc.actions || {})[action] || {};
  const k = "actions." + action + ".";
  const at = new Date(now).toISOString();
  const count = (c) => db.collection("engagement_daily").doc(E.bogotaDay(now)).set({ n: { [doc.network]: { [c]: inc(1) } } }, { merge: true });
  const error = clip(b.error, 200);
  let status;
  if (action === "reply") {
    if (cur.status !== "approved") return { ok: true, status: cur.status || "", note: "Already " + (cur.status || "gone") + "." };
    const tries = (cur.tries || 0) + (b.retry ? 0 : 1);
    if (b.ok) {
      status = "posted";
      await ref.update({ [k + "status"]: status, [k + "postedAt"]: at, [k + "url"]: clip(b.url, 500), [k + "tries"]: tries, [k + "error"]: "", [k + "leasedAt"]: "", [k + "by"]: "mac", updatedAt: at });
      await count("posted");
      if (doc.campaign === "report-reply") await db.collection("engagement_daily").doc(E.bogotaDay(now)).set({ report: { posted: inc(1) } }, { merge: true });
    } else {
      status = !b.retry && tries >= Act.MAX_TRIES ? "failed" : "approved";
      await ref.update(Object.assign({ [k + "error"]: error, [k + "tries"]: tries, [k + "leasedAt"]: "", updatedAt: at }, status === "failed" ? { [k + "status"]: status } : {}));
      if (status === "failed") await count("failed");
    }
  } else {
    if (cur.status !== "planned") return { ok: true, status: cur.status || "", note: "Already " + (cur.status || "gone") + "." };
    if (b.ok) {
      status = "done";
      await ref.update({ [k + "status"]: status, [k + "at"]: at, [k + "url"]: clip(b.url, 500), [k + "leasedAt"]: "", [k + "by"]: "mac", updatedAt: at });
      await count(action + "_done");
    } else if (b.retry) {
      status = "planned";
      await ref.update({ [k + "leasedAt"]: "", [k + "error"]: error, updatedAt: at });
    } else {
      status = "failed";
      await ref.update({ [k + "status"]: status, [k + "at"]: at, [k + "error"]: error, [k + "leasedAt"]: "", updatedAt: at });
      await count("act_failed");
    }
  }
  await J.clearCache(db);
  return { ok: true, key, action, status };
}

const OPS = { "engagement-mac-ingest": ingest, "engagement-mac-queue": queue, "engagement-mac-result": result };

/** The jarvis function's entry for the Mac: checks the token, then runs the op. */
async function handle(deps, body, token) {
  const op = OPS[String((body || {}).op || "")];
  if (!op) throw new MacError("Unknown Mac op.");
  await verify(deps.db, token);
  return op(deps, body);
}

module.exports = { BROWSER, LEASE, PER_NETWORK, MacError, hash, verify, cleanPost, ingest, queue, result, handle };
