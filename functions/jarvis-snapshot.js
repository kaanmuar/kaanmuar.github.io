/* The Jarvis snapshot (#2099): everything the stats page computes, in one answer for the Android app and the web.

   The app refreshes its range and 1 day every 30 minutes, and the whole snapshot used to expire after 5, so each
   refresh rebuilt all of it. Now each section has one builder over its own reads and is kept in
   jarvis_cache/sections-<days> (sections-0 for those the same in every range) with its build time and a content
   version; a refresh rebuilds only the sections past their TTL or dropped by the write that changes them:

   settings    jarvis_settings/main                        30 min, dropped by settings-save
   products    day rollups, messages, ratings, hub stats    5 min (with the live feed and social heat map)
   external    the sources, each through its own cache      5 min, dropped by settings-save and a few actions
   goals       count aggregations per goal                  15 min, rebuilt with settings
   reports     the last 12 mailed review reports            6 h, dropped when a report is emailed
   proposals   saved proposals and Jarvis's AI ones         6 h, dropped by proposal-mark and new AI proposals
   marks       snoozed and dismissed briefing lines         6 h, dropped by brief-mark
   countdowns  the last 40 countdowns                       5 min, dropped by a countdown decision

   The briefing, open proposals, readiness, connections and wide view are derived from the sections on every read, so
   they never lag them. Jarvis 2.0 (#2508) serves the sections by version. */

const crypto = require("crypto");
const core = require("./jarvis-core");
const proposals = require("./jarvis-proposals");

const MINUTE = 60000;
const HOUR = 60 * MINUTE;
const RANGES = [1, 7, 30, 90, 365];
const MAX_BYTES = 900000;
const COLLECTION = "jarvis_cache";

// `needs`: rebuilt whenever a section it is built from is. `shared`: the same for every range, kept once in sections-0.
const SECTIONS = {
  settings: { ttl: 30 * MINUTE, shared: true, build: (src) => src.settings() },
  products: { ttl: 5 * MINUTE, build: (src) => src.products() },
  external: { ttl: 5 * MINUTE, build: (src) => src.external() },
  goals: { ttl: 15 * MINUTE, shared: true, needs: ["settings"], build: (src, got) => src.goals(got.settings) },
  reports: { ttl: 6 * HOUR, shared: true, build: (src) => src.reports() },
  proposals: { ttl: 6 * HOUR, shared: true, build: async (src) => ({ saved: await src.savedProposals(), ai: await src.aiProposals() }) },
  marks: { ttl: 6 * HOUR, shared: true, build: (src) => src.briefMarks() },
  countdowns: { ttl: 5 * MINUTE, shared: true, build: (src) => src.countdowns() }
};
const NAMES = Object.keys(SECTIONS);

const docId = (days) => "sections-" + days;
const version = (json) => crypto.createHash("sha1").update(json).digest("hex").slice(0, 12);
const keptIn = (snap) => (snap && snap.exists ? (snap.data() || {}).sections : null) || {};

// Writes the sections built now; the largest are left out (and built again next time) if the document would overflow.
async function store(ref, names, fresh, kept) {
  const out = {};
  names.forEach((name) => { if (fresh[name]) out[name] = fresh[name]; });
  if (!Object.keys(out).length) return;
  let size = names.reduce((total, name) => total + ((out[name] || kept[name] || {}).json || "").length, 0);
  Object.keys(out).sort((a, b) => out[b].json.length - out[a].json.length).forEach((name) => {
    if (size <= MAX_BYTES) return;
    size -= out[name].json.length;
    out[name] = { at: "", v: "", json: "" };
  });
  await ref.set({ sections: out }, { merge: true }).catch(() => null);
}

// Every section goes through JSON, built or kept, so the derived parts see the same values either way.
async function sections(db, days, src, now) {
  const own = db.collection(COLLECTION).doc(docId(days));
  const common = db.collection(COLLECTION).doc(docId(0));
  const [ownSnap, commonSnap] = await Promise.all([own.get().catch(() => null), common.get().catch(() => null)]);
  const [ownKept, commonKept] = [keptIn(ownSnap), keptIn(commonSnap)];
  const kept = NAMES.reduce((m, name) => { m[name] = (SECTIONS[name].shared ? commonKept : ownKept)[name]; return m; }, {});
  const got = {}, meta = {}, fresh = {};
  const wave = async (names) => Promise.all(names.map(async (name) => {
    const s = SECTIONS[name];
    const k = kept[name];
    const stale = !k || typeof k.json !== "string" || !k.json || !(now - Date.parse(k.at) < s.ttl) || Date.parse(k.at) <= Date.parse(k.dropped) || (s.needs || []).some((n) => fresh[n]);
    if (!stale) { got[name] = JSON.parse(k.json); meta[name] = { at: k.at, v: k.v }; return; }
    const json = JSON.stringify(await s.build(src, got));
    got[name] = JSON.parse(json);
    meta[name] = { at: new Date(now).toISOString(), v: version(json) };
    fresh[name] = Object.assign({ json }, meta[name]);
  }));
  await wave(NAMES.filter((name) => !SECTIONS[name].needs));
  await wave(NAMES.filter((name) => SECTIONS[name].needs));
  await Promise.all([
    store(own, NAMES.filter((name) => !SECTIONS[name].shared), fresh, kept),
    store(common, NAMES.filter((name) => SECTIONS[name].shared), fresh, kept)
  ]);
  return { got, meta };
}

// The snapshot as the app has always read it, from the sections.
function compose(got, src, now) {
  const settings = got.settings;
  const { window, products, outreachVisits, feed, socialHeat } = got.products;
  const external = got.external;
  const goalRows = got.goals;
  const state = { products, external, thresholds: settings.thresholds, goals: goalRows };
  const briefing = core.briefing(state).map((b) => Object.assign({ detail: core.briefDetail(b, state) }, b));
  const candidates = core.proposalRules(state, briefing).concat(src.aiCandidates(got.proposals.ai, now));
  const open = core.openProposals(candidates, got.proposals.saved, new Date(now)).slice(0, 5).map(proposals.withButtons);
  return {
    window, products, external, outreachVisits, feed, socialHeat, reports: got.reports, goals: goalRows, briefing, proposals: open, countdowns: got.countdowns,
    readiness: core.readiness(external), connections: core.connections(external), settings, thresholds: core.thresholds(settings.thresholds),
    wide: core.wide({ products, external, briefing, now: new Date(now) })
  };
}

// The snapshot, its briefing marks, and the build time of the counts it shows (cachedAt).
async function load(db, days, src, now) {
  const { got, meta } = await sections(db, days, src, now);
  return { snap: Object.assign(compose(got, src, now), { cachedAt: meta.products.at }), marks: got.marks, meta };
}

// Drops the named sections (all by default) in every range, so the next read builds them again. A section is stamped
// rather than cleared: a build that started before the write and saves after it is still stale.
function drop(db, names = NAMES, now = Date.now()) {
  const stamp = (list) => list.reduce((m, name) => { m[name] = { dropped: new Date(now).toISOString() }; return m; }, {});
  const shared = names.filter((name) => SECTIONS[name].shared);
  const ranged = names.filter((name) => !SECTIONS[name].shared);
  const writes = (shared.length ? [[0, stamp(shared)]] : []).concat(ranged.length ? RANGES.map((days) => [days, stamp(ranged)]) : []);
  return Promise.all(writes.map(async ([days, stale]) => {
    try { await db.collection(COLLECTION).doc(docId(days)).set({ sections: stale }, { merge: true }); } catch (error) { /* the TTL still ends it */ }
  }));
}

module.exports = { SECTIONS, RANGES, load, drop, compose, docId };
