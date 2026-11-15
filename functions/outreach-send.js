"use strict";
/*
 * When outreach goes out on its own (#3137, Carlos 2026-11-09): every DM, reply and offer the social, student and
 * company routines (#3137, #3138, #3139) draft waits for Carlos's approval for the first APPROVE_DAYS after launch,
 * then goes out on its own, within each network's daily cap. One place for the rule and the caps, so every routine
 * imports it.
 *
 *   jarvis_settings/outreach_send  { launchAt, alwaysApprove, approveDays, caps { network: n }, updatedAt, by }
 *     launchAt       set on the first read (the first run of any routine), or by Carlos in Jarvis
 *     alwaysApprove  true keeps every send waiting for Carlos, whatever the date
 *   outreach_send_daily/<YYYY-MM-DD>  { <network>: { <kind>: sent } }, per Bogotá day
 *
 * API:
 *   sendMode(dbOrSettings, { network, kind, now }) => "approve" | "auto"   kind: dm, reply, offer, email, ...
 *   capOf(settings, network) => the daily cap; capLeft(db, { network, kind, now, settings }) => what is left today
 *   useCap(db, { network, kind, now, settings, n }) => { ok, left, cap }  takes n (1) from today's cap in a
 *     transaction; ok false (nothing taken) when the cap is reached
 *   readSend(db, now) => the settings, launchAt written when missing; save(db, body, by, now) => Jarvis's change
 *   ops (the Mac's paired token): outreach-send-mode { network, kind } => { mode, left, cap },
 *     outreach-send-use { network, kind, n } => { ok, left, cap }
 */

const DAY = 24 * 3600000;
const APPROVE_DAYS = 7;
// The most a young account sends a day before a network reads it as spam; LinkedIn and Facebook flag soonest.
const CAPS = { x: 5, instagram: 5, linkedin: 3, facebook: 3, threads: 3, tiktok: 3, telegram: 3, reddit: 3, bluesky: 3, mastodon: 3, youtube: 3, email: 3 };
const DEFAULT_CAP = 3;
const MAX_CAP = 50;
const KIND = /^[a-z][a-z_-]{1,19}$/;
const NETWORK = /^[a-z][a-z0-9_-]{0,29}$/;

const ref = (db) => db.collection("jarvis_settings").doc("outreach_send");
const dayRef = (db, now) => db.collection("outreach_send_daily").doc(bogotaDay(now));
const bogotaDay = (ms) => new Date(ms - 5 * 3600000).toISOString().slice(0, 10);
const clip = (v, n) => String(v == null ? "" : v).trim().slice(0, n);
const isoOr = (v) => (Number.isFinite(Date.parse(v)) ? new Date(Date.parse(v)).toISOString() : "");

class SendError extends Error {
  constructor(message, status) { super(message); this.status = status || 400; }
}

/** The stored settings with every field present and in range. */
function settings(doc) {
  const d = doc || {};
  const caps = Object.assign({}, CAPS);
  Object.entries(d.caps || {}).forEach(([k, v]) => { if (NETWORK.test(k) && Number.isFinite(Number(v))) caps[k] = Math.max(0, Math.min(MAX_CAP, Math.round(Number(v)))); });
  return {
    launchAt: isoOr(d.launchAt), alwaysApprove: d.alwaysApprove === true,
    approveDays: Number.isFinite(Number(d.approveDays)) ? Math.max(0, Math.min(90, Math.round(Number(d.approveDays)))) : APPROVE_DAYS,
    caps, updatedAt: clip(d.updatedAt, 30), by: clip(d.by, 120)
  };
}

/** The settings, with launchAt set to now the first time any routine reads them. */
async function readSend(db, now) {
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref(db));
    const s = settings(snap.exists ? snap.data() : null);
    if (s.launchAt) return s;
    s.launchAt = new Date(now).toISOString();
    tx.set(ref(db), Object.assign({}, snap.exists ? snap.data() : {}, { launchAt: s.launchAt }));
    return s;
  });
}

/** "approve" while Carlos approves everything (alwaysApprove, or within approveDays of launchAt), else "auto". */
function modeOf(s, opts) {
  const o = opts || {};
  const conf = settings(s);
  if (conf.alwaysApprove || !conf.launchAt) return "approve";
  return Number(o.now) >= Date.parse(conf.launchAt) + conf.approveDays * DAY ? "auto" : "approve";
}

const isDb = (x) => !!x && typeof x.collection === "function";

/** sendMode(db or settings, { network, kind, now }): what a routine does with a draft now. */
async function sendMode(dbOrSettings, opts) {
  const o = opts || {};
  const s = isDb(dbOrSettings) ? await readSend(dbOrSettings, Number(o.now)) : dbOrSettings;
  return modeOf(s, o);
}

const capOf = (s, network) => {
  const caps = settings(s).caps;
  return caps[network] === undefined ? DEFAULT_CAP : caps[network];
};

function check(opts) {
  const o = opts || {};
  if (!NETWORK.test(String(o.network || ""))) throw new SendError("Name the network.");
  if (!KIND.test(String(o.kind || ""))) throw new SendError("Name the kind of send (dm, reply, offer, email).");
  return o;
}

/** What is left of today's cap for this network and kind. */
async function capLeft(db, opts) {
  const o = check(opts);
  const s = o.settings || await readSend(db, Number(o.now));
  const used = ((((await dayRef(db, Number(o.now)).get()).data() || {})[o.network]) || {})[o.kind] || 0;
  return Math.max(0, capOf(s, o.network) - used);
}

/** Takes n (1) sends from today's cap in a transaction: { ok, left, cap }; ok false takes nothing. */
async function useCap(db, opts) {
  const o = check(opts);
  const n = Math.max(1, Math.round(Number(o.n) || 1));
  const s = o.settings || await readSend(db, Number(o.now));
  const cap = capOf(s, o.network);
  const r = dayRef(db, Number(o.now));
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(r);
    const doc = snap.exists ? snap.data() : {};
    const net = Object.assign({}, doc[o.network]);
    const used = net[o.kind] || 0;
    if (used + n > cap) return { ok: false, left: Math.max(0, cap - used), cap };
    net[o.kind] = used + n;
    tx.set(r, Object.assign({}, doc, { day: bogotaDay(Number(o.now)), [o.network]: net }));
    return { ok: true, left: cap - used - n, cap };
  });
}

/** Carlos's change from Jarvis: launchAt (a date, or "now"), alwaysApprove, approveDays, caps { network: n }. */
async function save(db, body, by, now) {
  const b = body || {};
  const snap = await ref(db).get();
  const cur = snap.exists ? snap.data() : {};
  const next = Object.assign({}, cur);
  let changed = false;
  if (b.launchAt !== undefined) {
    const at = b.launchAt === "now" ? new Date(now).toISOString() : isoOr(b.launchAt);
    if (!at) throw new SendError("launchAt is a date or \"now\".");
    next.launchAt = at;
    changed = true;
  }
  if (typeof b.alwaysApprove === "boolean") { next.alwaysApprove = b.alwaysApprove; changed = true; }
  if (b.approveDays !== undefined) { next.approveDays = b.approveDays; changed = true; }
  if (b.caps && typeof b.caps === "object") { next.caps = Object.assign({}, cur.caps, b.caps); changed = true; }
  if (!changed) throw new SendError("Nothing to change.");
  const s = settings(next);
  await ref(db).set(Object.assign({}, s, { updatedAt: new Date(now).toISOString(), by: clip(by, 120) }));
  return { settings: s, mode: modeOf(s, { now }) };
}

const OPS = {
  "outreach-send-mode": async (deps, b) => {
    const o = check(b);
    const s = await readSend(deps.db, deps.now);
    return { ok: true, mode: modeOf(s, { now: deps.now }), left: await capLeft(deps.db, Object.assign({}, o, { now: deps.now, settings: s })), cap: capOf(s, o.network) };
  },
  "outreach-send-use": async (deps, b) => Object.assign({}, await useCap(deps.db, Object.assign({}, check(b), { now: deps.now })))
};

/** The jarvis function's entry for these ops (after the Mac's token is checked). */
async function handle(deps, body) {
  const op = OPS[String((body || {}).op || "")];
  if (!op) throw new SendError("Unknown send op.");
  return op(deps, body || {});
}

module.exports = { APPROVE_DAYS, CAPS, DEFAULT_CAP, OPS, SendError, settings, readSend, modeOf, sendMode, capOf, capLeft, useCap, save, handle, bogotaDay };
