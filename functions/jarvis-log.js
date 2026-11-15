"use strict";
/* Jarvis > Console (#2810): one line for each thing that happens in the back, in jarvis_log for 7 days.

   jarvis_log/<auto id> = { at (when it happened), addedAt (when it was written; the log op's cursor, since the pollers
   write GitHub and Cloud Logging lines up to minutes late), source, level, text (300 chars), ref?, url?, expireAt }.
   A Firestore TTL policy on expireAt (collection group jarvis_log) deletes old lines; prune() is the fallback.

   log() and logMany() never throw: a line that cannot be written is dropped, so logging never breaks the work it
   describes. db may be null in the helper modules; index.js gives the default with use(getFirestore), and without
   one (the unit tests) nothing is written. The pollers for what happens outside the functions are in
   jarvis-log-poll.js. */
const core = require("./jarvis-core");

const COLLECTION = "jarvis_log";
const SOURCES = core.LOG_SOURCES;
const LEVELS = core.LOG_LEVELS;
const KEEP_MS = 7 * 24 * 3600000;
const TEXT = 300;
const LIMIT = 300;
const BATCH = 400;

let fallback = null;

function use(getDb) { fallback = typeof getDb === "function" ? getDb : null; }

function store(db) {
  try { return db || (fallback && fallback()) || null; } catch (error) { return null; }
}

const dateOf = (v) => { const d = v && typeof v.toDate === "function" ? v.toDate() : v ? new Date(v) : null; return d && Number.isFinite(d.getTime()) ? d : null; };

/* -> the row to write, or null when it has no text. e.at may be the event's own time (a run, a log entry). */
function row(e, now) {
  const x = e || {};
  const text = String(x.text || "").replace(/\s+/g, " ").trim().slice(0, TEXT);
  if (!text) return null;
  const added = new Date(now);
  const at = dateOf(x.at) || added;
  const out = { at, addedAt: added, source: SOURCES.includes(x.source) ? x.source : "jarvis", level: LEVELS.includes(x.level) ? x.level : "info", text, expireAt: new Date(at.getTime() + KEEP_MS) };
  if (x.ref) out.ref = String(x.ref).slice(0, 120);
  if (/^https:\/\//.test(String(x.url || ""))) out.url = String(x.url).slice(0, 500);
  return out;
}

async function log(db, entry) {
  const s = store(db);
  const r = s && row(entry, Date.now());
  if (!r) return null;
  try {
    await s.collection(COLLECTION).add(r);
    return r;
  } catch (error) {
    console.error("jarvis_log write failed:", error && error.message);
    return null;
  }
}

async function logMany(db, entries) {
  const s = store(db);
  const now = Date.now();
  const rows = s ? (entries || []).map((e) => row(e, now)).filter(Boolean) : [];
  if (!rows.length) return 0;
  let written = 0;
  try {
    for (let i = 0; i < rows.length; i += BATCH) {
      const part = rows.slice(i, i + BATCH);
      if (typeof s.batch === "function") {
        const b = s.batch();
        part.forEach((r) => b.set(s.collection(COLLECTION).doc(), r));
        await b.commit();
      } else {
        for (const r of part) await s.collection(COLLECTION).add(r);
      }
      written += part.length;
    }
  } catch (error) {
    console.error("jarvis_log batch failed:", error && error.message);
  }
  return written;
}

// A stored row as the clients get it: ISO times, no expireAt.
function shape(id, d) {
  const at = dateOf(d.at);
  const added = dateOf(d.addedAt) || at;
  const out = { id, at: at ? at.toISOString() : "", addedAt: added ? added.toISOString() : "", source: d.source, level: d.level, text: d.text };
  if (d.ref) out.ref = d.ref;
  if (d.url) out.url = d.url;
  return out;
}

/* The log op: { since?, sources?, level?, q?, limit<=300 } -> { entries (newest first), cursor }. since is the last
   answer's cursor; a line written in that same millisecond comes again, and the clients drop it by id. Filters read
   up to four times the limit, so a narrow filter still fills the page. */
async function read(db, opts) {
  const o = opts || {};
  const limit = Math.max(1, Math.min(LIMIT, Math.round(Number(o.limit) || 200)));
  const filtered = !!(o.q || (o.level && o.level !== "debug") || (Array.isArray(o.sources) ? o.sources.length : o.sources));
  const since = Date.parse(o.since || "");
  let q = db.collection(COLLECTION);
  if (Number.isFinite(since)) q = q.where("addedAt", ">=", new Date(since));
  const snap = await q.orderBy("addedAt", "desc").limit(filtered ? limit * 4 : limit).get();
  const rows = snap.docs.map((d) => shape(d.id, d.data()));
  const entries = core.logFilter(rows, o).sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
  return { entries, cursor: rows.length ? rows[0].addedAt : String(o.since || ""), sources: SOURCES, levels: LEVELS };
}

// The TTL policy's fallback: deletes up to 400 lines past the 7 days per call.
async function prune(db, now) {
  const snap = await db.collection(COLLECTION).where("at", "<", new Date(now - KEEP_MS)).limit(BATCH).get();
  if (!snap.docs.length) return 0;
  if (typeof db.batch === "function") {
    const b = db.batch();
    snap.docs.forEach((d) => b.delete(d.ref));
    await b.commit();
  } else await Promise.all(snap.docs.map((d) => d.ref.delete()));
  return snap.docs.length;
}

const levelOfStatus = (status) => (status === "failed" ? "error" : status === "skipped" ? "warn" : "info");

module.exports = { COLLECTION, SOURCES, LEVELS, KEEP_MS, TEXT, LIMIT, use, row, log, logMany, shape, read, prune, levelOfStatus };
