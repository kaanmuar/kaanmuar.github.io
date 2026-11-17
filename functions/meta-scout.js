"use strict";
/*
 * Meta engagement scout (#3613): one umbrella run for the scheduled engagementScout job. It runs the cloud scout
 * (jarvis-engagement.scout), folds in Mac / Reddit / owner-tags / student state, writes engagement_meta_runs/<iso>,
 * and returns the envelope Jarvis shows.
 */
const J = require("./jarvis-engagement");
const Act = require("./engagement-act");
const OwnerTags = require("./owner-tags");
const Communities = require("./student-communities");
const E = require("./engagement");
const Sources = require("./engagement-sources");

const MAC_STALE = 2 * 3600000;
const REDDIT_STALE = 3 * 3600000;
const BROWSER = Object.keys(E.NETWORKS).filter((k) => E.NETWORKS[k].browser);

const chip = (ok, label) => ({ ok: !!ok, label: String(label || "").slice(0, 240) });

/** Pass chips for cloud, Mac, Reddit sync, owner tags and student outreach. */
async function passStatus(deps, run) {
  const { db, now, env } = deps;
  const creds = await Act.readCreds(db).catch(() => ({}));
  const fullEnv = J.withAccounts(env || {}, creds);
  const [macSnap, redditSnap, ownerTags, communities] = await Promise.all([
    db.collection("engagement_private").doc("mac").get(),
    db.collection("engagement_private").doc("reddit").get(),
    OwnerTags.status(db, now).catch(() => null),
    Communities.summary(db).catch(() => null)
  ]);
  const macDoc = macSnap.exists ? macSnap.data() : null;
  const reddit = redditSnap.exists ? redditSnap.data() : null;

  const readTotal = Object.values((run && run.read) || {}).reduce((a, b) => a + b, 0);
  const errs = Object.keys((run && run.errors) || {});
  const skipped = Sources.readable(fullEnv).filter((r) => !r.ok && r.network !== "bluesky");
  const cloud = chip(readTotal > 0, [readTotal + " posts read", run && run.fresh ? run.fresh + " new" : "", run && run.drafted ? run.drafted + " drafted" : "", errs.length ? "failed: " + errs.join(", ") : "", skipped.length ? "needs keys: " + skipped.map((s) => s.network).join(", ") : ""].filter(Boolean).join("; ") || "no posts");

  const macAge = macDoc && macDoc.at ? now - Date.parse(macDoc.at) : Infinity;
  const macRead = macDoc && macDoc.read ? Object.values(macDoc.read).reduce((a, b) => a + b, 0) : 0;
  const signed = BROWSER.filter((k) => macDoc && (macDoc.signedIn || {})[k]).length;
  const mac = chip(macDoc && macAge < MAC_STALE, macDoc ? (macAge < MAC_STALE
    ? signed + "/" + BROWSER.length + " signed in; " + macRead + " read last heartbeat" + (macDoc.fresh ? "; " + macDoc.fresh + " new" : "") + (macDoc.drafted ? "; " + macDoc.drafted + " drafted" : "")
    : "last heard " + Math.round(macAge / 60000) + " minutes ago") : "Mac agent not paired (#1991)");

  const redditAge = reddit && reddit.at ? now - Date.parse(reddit.at) : Infinity;
  const redditChip = chip(reddit && redditAge < REDDIT_STALE && !reddit.error, reddit
    ? (reddit.error ? reddit.error : Math.round(redditAge / 60000) + "m ago; " + (reddit.read || 0) + " own-post comments read")
    : reddit ? "stale (" + Math.round(redditAge / 3600000) + "h)" : "never synced");

  const otLast = ownerTags && ownerTags.last;
  const waiting = ownerTags ? (ownerTags.accounts.suggested || 0) + (ownerTags.waiting || []).length : 0;
  const ownerTagsChip = chip(!!otLast, otLast
    ? [ownerTags.note || "ran", waiting ? waiting + " waiting approval" : ""].filter(Boolean).join("; ")
    : "no owner-tags run yet");

  const stud = (macDoc && macDoc.students) || {};
  const studentsChip = chip((stud.drafted || 0) + (stud.invited || 0) + (stud.communities || 0) > 0 || (communities && communities.total > 0),
    [stud.communities ? stud.communities + " communities found" : "", stud.drafted ? stud.drafted + " student drafts" : "", stud.invited ? stud.invited + " invited" : "",
      communities && communities.total ? communities.total + " communities tracked" : ""].filter(Boolean).join("; ") || "idle");

  return { cloud, mac, reddit: redditChip, ownerTags: ownerTagsChip, students: studentsChip };
}

function envelopeNeeds(passes, run, existing) {
  const needs = Array.isArray(existing) ? existing.slice() : [];
  if (run && run.paused) needs.push("Engagement is paused.");
  if (run && run.aiError) needs.push("Gemini: " + run.aiError);
  if (!passes.mac.ok) needs.push("Mac agent: " + passes.mac.label);
  if (!passes.reddit.ok) needs.push("Reddit sync: " + passes.reddit.label);
  return [...new Set(needs)].slice(0, 12);
}

/** One meta-scout run: cloud scout plus status envelope. */
async function run(deps) {
  const started = Date.now();
  const at = new Date(deps.now).toISOString();
  const scoutRun = await J.scout(deps);
  const passes = await passStatus(deps, scoutRun);
  const needs = envelopeNeeds(passes, scoutRun, []);
  const conf = await J.readSettings(deps.db);
  const pack = E.Regions.packForRun(deps.now, conf);
  const topics = E.Regions.discoveryForRun(deps.now, null, conf);
  const fs = (scoutRun && scoutRun.fieldSweep) || {};
  const envelope = {
    at, ms: Date.now() - started, needs, passes, run: scoutRun,
    discovery: {
      budget: E.DISCOVERY_BUDGET,
      pack: pack.primary,
      packName: (pack.pack && pack.pack.name) || pack.primary,
      rotate: pack.rotate,
      slot: pack.slot,
      setting: conf.discoveryPack,
      topics: topics.length,
      langs: [...new Set(topics.map((t) => t.lang))].slice(0, 12)
    },
    fieldSweep: { count: fs.count || 0, tender: fs.tender || 0, at: fs.at || "" }
  };
  await deps.db.collection("engagement_meta_runs").doc(at).set(envelope);
  return envelope;
}

module.exports = { run, passStatus, envelopeNeeds, MAC_STALE, REDDIT_STALE };