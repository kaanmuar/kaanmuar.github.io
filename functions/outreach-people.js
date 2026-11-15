"use strict";
/*
 * The outreach ledger (#3136): one row per person the social, student and company routines reach, in outreach_people.
 *
 *   outreach_people/<idFor(network, handle)>  { kind, network, handle, name, lang, domain, email, links {},
 *     threads [{ url, lastAt, ourLast, theirLast }], stage, offers [{ code, kind, at, url }], dms [{ at, network, text, card }],
 *     notes, nextAt, history [{ at, stage, by, note }], uses (a live's claims), createdAt, updatedAt }
 *
 * A stage only moves forward along STAGES. "declined" and "blocked" apply from any stage ("declined" not after "paid"),
 * and nothing moves a blocked or declined person on, except declined to blocked.
 */
const STAGES = ["found", "engaged", "replied", "nice", "offered", "claimed", "trial_ended", "discount_sent", "paid", "declined", "blocked"];
// A "live" row is one live show (live:<session>), not a person: its code is shared on stream, uses counts its claims.
const KINDS = ["social", "student", "company", "live"];
const COLLECTION = "outreach_people";
const STOPPED = ["declined", "blocked"];
const CAPS = { threads: 50, offers: 50, dms: 100, history: 200 };

const clip = (v, n) => String(v == null ? "" : v).trim().slice(0, n);
const iso = (ms) => new Date(ms).toISOString();
const bareDomain = (v) => clip(v, 200).toLowerCase().replace(/^https?:\/\//, "").replace(/[/?#].*$/, "").replace(/^www\./, "");

/** The ledger id: "<network>:<handle>", lowercased without the @; companies "web:<domain>". */
function idFor(network, handle) {
  const net = clip(network, 30).toLowerCase();
  const who = net === "web" ? bareDomain(handle) : clip(handle, 120).toLowerCase().replace(/^@+/, "");
  return net && who ? (net + ":" + who).replace(/\//g, "_") : "";
}

/** Whether a person at stage `from` may move to `to`. */
function canMove(from, to) {
  if (!STAGES.includes(to) || from === to) return false;
  if (!from) return true;
  if (from === "blocked") return false;
  if (from === "declined") return to === "blocked";
  if (to === "blocked") return true;
  if (to === "declined") return from !== "paid";
  return STAGES.indexOf(to) > STAGES.indexOf(from);
}

const byKey = (list, key, item) => {
  const at = item[key] ? list.findIndex((x) => x && x[key] === item[key]) : -1;
  if (at === -1) return list.concat([item]);
  const out = list.slice();
  out[at] = Object.assign({}, out[at], item);
  return out;
};

// Only the fields a thread update carries, so a reply's theirLast keeps our ourLast.
function cleanThread(t) {
  if (!t || !/^https?:\/\//.test(String(t.url || ""))) return null;
  const out = { url: clip(t.url, 500) };
  [["lastAt", 30], ["ourLast", 500], ["theirLast", 500]].forEach(([k, n]) => { if (clip(t[k], n)) out[k] = clip(t[k], n); });
  return out;
}
function cleanOffer(o, at) {
  return o && clip(o.code, 24) ? { code: clip(o.code, 24).toUpperCase(), kind: clip(o.kind, 20), at: clip(o.at, 30) || at, url: clip(o.url, 500) } : null;
}
function cleanDm(d, at) {
  return d && clip(d.text, 2000) ? { at: clip(d.at, 30) || at, network: clip(d.network, 30), text: clip(d.text, 2000), card: clip(d.card, 500) } : null;
}
const list = (v) => (Array.isArray(v) ? v : v ? [v] : []);

/**
 * The person after a patch: plain fields set when given, links merged, threads and offers added or updated (by url
 * and code), dms added, and the stage moved when canMove allows it, with a history row. `prev` is the stored row or null.
 */
function merged(prev, id, patch, now) {
  const p = patch || {};
  const at = iso(now);
  const base = prev || { kind: "", network: id.split(":")[0], handle: id.split(":").slice(1).join(":"), name: "", lang: "", domain: "", email: "", links: {},
    threads: [], stage: "", offers: [], dms: [], notes: "", nextAt: "", history: [], createdAt: at };
  const doc = Object.assign({}, base, { links: Object.assign({}, base.links), threads: list(base.threads), offers: list(base.offers), dms: list(base.dms), history: list(base.history) });
  if (KINDS.includes(p.kind)) doc.kind = p.kind;
  ["network", "handle", "name", "notes"].forEach((k) => { if (p[k] != null && clip(p[k], 2000)) doc[k] = clip(p[k], k === "notes" ? 2000 : 200); });
  if (p.lang && /^[a-z]{2}$/.test(String(p.lang).slice(0, 2).toLowerCase())) doc.lang = String(p.lang).slice(0, 2).toLowerCase();
  if (p.domain) doc.domain = bareDomain(p.domain);
  if (p.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(p.email).trim())) doc.email = clip(p.email, 200).toLowerCase();
  // Claims land out of order, so a live's uses only grow.
  if (p.uses != null && Number.isFinite(Number(p.uses))) doc.uses = Math.max(Number(base.uses) || 0, Math.floor(Number(p.uses)));
  if (p.nextAt !== undefined) doc.nextAt = p.nextAt ? iso(Date.parse(p.nextAt) || now) : "";
  if (p.links && typeof p.links === "object") Object.entries(p.links).forEach(([k, v]) => { if (/^https?:\/\//.test(String(v || ""))) doc.links[clip(k, 30)] = clip(v, 500); });
  list(p.threads).map(cleanThread).filter(Boolean).forEach((t) => { doc.threads = byKey(doc.threads, "url", t); });
  list(p.offers).map((o) => cleanOffer(o, at)).filter(Boolean).forEach((o) => { doc.offers = byKey(doc.offers, "code", o); });
  doc.dms = doc.dms.concat(list(p.dms).map((d) => cleanDm(d, at)).filter(Boolean));
  const from = doc.stage;
  const to = p.stage || (prev ? "" : "found");
  const moved = canMove(from, to);
  if (moved) {
    doc.stage = to;
    doc.history = doc.history.concat([{ at, stage: to, by: clip(p.by, 60), note: clip(p.note, 300) }]);
  } else if (p.note) doc.history = doc.history.concat([{ at, stage: from, by: clip(p.by, 60), note: clip(p.note, 300) }]);
  Object.keys(CAPS).forEach((k) => { doc[k] = doc[k].slice(-CAPS[k]); });
  doc.updatedAt = at;
  return { doc, moved, held: !!to && !moved && to !== from };
}

/** Merges patch into the person `id` (made when new) in one transaction: { id, ...doc, moved, held }. */
async function touch(db, id, patch, now) {
  const key = clip(id, 200);
  if (!/^[a-z0-9_-]+:.+/.test(key)) throw Object.assign(new Error("That is not a ledger id (network:handle or web:domain)."), { status: 400 });
  const at = now == null ? Date.now() : Number(now);
  const ref = db.collection(COLLECTION).doc(key);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const out = merged(snap.exists ? snap.data() : null, key, patch, at);
    tx.set(ref, out.doc);
    return Object.assign({ id: key }, out.doc, { moved: out.moved, held: out.held });
  });
}

/** One person, or null. */
async function get(db, id) {
  const snap = await db.collection(COLLECTION).doc(clip(id, 200)).get();
  return snap.exists ? Object.assign({ id: clip(id, 200) }, snap.data()) : null;
}

/**
 * People whose nextAt has come by `before` (now by default), soonest first. kind and stage narrow it; without a stage,
 * declined and blocked people are left out. Equality filters only, so no composite index is needed.
 */
async function listDue(db, opts) {
  const o = opts || {};
  const before = o.before ? Date.parse(o.before) || Date.now() : Date.now();
  const limit = Math.max(1, Math.min(500, Number(o.limit) || 50));
  let q = db.collection(COLLECTION);
  if (KINDS.includes(o.kind)) q = q.where("kind", "==", o.kind);
  if (STAGES.includes(o.stage)) q = q.where("stage", "==", o.stage);
  const snap = await q.limit(1000).get();
  return snap.docs.map((d) => Object.assign({ id: d.id }, d.data()))
    .filter((p) => p.nextAt && Date.parse(p.nextAt) <= before && (o.stage || !STOPPED.includes(p.stage)))
    .sort((a, b) => String(a.nextAt).localeCompare(String(b.nextAt))).slice(0, limit);
}

/** Every person, optionally of one kind or stage, newest change first: the tracking view. */
async function listAll(db, opts) {
  const o = opts || {};
  let q = db.collection(COLLECTION);
  if (KINDS.includes(o.kind)) q = q.where("kind", "==", o.kind);
  if (STAGES.includes(o.stage)) q = q.where("stage", "==", o.stage);
  const snap = await q.limit(Math.max(1, Math.min(5000, Number(o.limit) || 2000))).get();
  return snap.docs.map((d) => Object.assign({ id: d.id }, d.data())).sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
}

/** How many people stand at each stage, by kind: { total, stages: { stage: n }, kinds: { kind: { stage: n } } }. */
function counts(people) {
  const out = { total: 0, stages: {}, kinds: {}, lives: { count: 0, uses: 0 } };
  (people || []).forEach((p) => {
    const stage = p.stage || "found";
    const kind = p.kind || "unknown";
    if (kind === "live") { out.lives.count += 1; out.lives.uses += Number(p.uses) || 0; }
    out.total += 1;
    out.stages[stage] = (out.stages[stage] || 0) + 1;
    out.kinds[kind] = out.kinds[kind] || {};
    out.kinds[kind][stage] = (out.kinds[kind][stage] || 0) + 1;
  });
  return out;
}

const CSV_FIELDS = ["id", "kind", "stage", "network", "handle", "name", "lang", "domain", "email", "offers", "lastOffer", "dms", "uses", "lastThread", "nextAt", "updatedAt", "createdAt", "notes"];

/** The ledger as CSV, one row per person. */
function toCsv(people) {
  const cell = (v) => { const s = String(v == null ? "" : v); return /[",\n]/.test(s) ? "\"" + s.replace(/"/g, "\"\"") + "\"" : s; };
  const rows = (people || []).map((p) => {
    const offers = list(p.offers);
    const threads = list(p.threads);
    const last = offers[offers.length - 1] || {};
    return Object.assign({}, p, {
      offers: offers.map((o) => o.code).join(" "), lastOffer: last.at || "", dms: list(p.dms).length, lastThread: (threads[threads.length - 1] || {}).url || ""
    });
  });
  return [CSV_FIELDS.join(",")].concat(rows.map((r) => CSV_FIELDS.map((f) => cell(r[f])).join(","))).join("\n") + "\n";
}

module.exports = { COLLECTION, STAGES, KINDS, idFor, canMove, merged, touch, get, listDue, listAll, counts, toCsv };
