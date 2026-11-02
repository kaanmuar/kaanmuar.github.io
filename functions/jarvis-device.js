"use strict";
/*
 * Which devices run Jarvis (#2068). The Android app and the admin page send the screen they run on with each call
 * (phone, foldable folded or open, tablet, desktop, and the fold's posture); the kinds live in jarvis-core.js.
 * One row per install or browser, in jarvis_seen; Settings on both lists the ones seen in the last 30 days.
 */
const crypto = require("crypto");
const core = require("./jarvis-core");

const KEEP_DAYS = 30;
const DAY = 24 * 3600 * 1000;
const seenCol = (db) => db.collection("jarvis_seen");
const idOf = (id) => crypto.createHash("sha256").update("seen:" + String(id)).digest("hex").slice(0, 40);
const validId = (id) => typeof id === "string" && id.trim().length >= 8 && id.trim().length <= 100;

/** Keeps this device's row; null when the call carried no device or no id. */
async function seen(db, raw, by, now) {
  const form = core.cleanDevice(raw);
  if (!form || !validId(raw.id)) return null;
  const row = Object.assign(form, { by: String(by || "").slice(0, 120), seenAt: new Date(now).toISOString() });
  await seenCol(db).doc(idOf(raw.id.trim())).set(row);
  return row;
}

async function forget(db, raw) {
  if (raw && validId(raw.id)) await seenCol(db).doc(idOf(raw.id.trim())).delete();
  return { removed: true };
}

/** Rows seen in the last 30 days, newest first, with their label; older rows are deleted. mine marks the caller's own. */
async function list(db, now, raw) {
  const mine = raw && validId(raw.id) ? idOf(raw.id.trim()) : null;
  const cut = now - KEEP_DAYS * DAY;
  const snap = await seenCol(db).get();
  const rows = [];
  for (const d of snap.docs) {
    const r = d.data() || {};
    if (!(Date.parse(r.seenAt) >= cut)) { await seenCol(db).doc(d.id).delete().catch(() => null); continue; }
    rows.push(Object.assign({ id: d.id }, r, { label: core.deviceLabel(r), mine: d.id === mine }));
  }
  return rows.sort((a, b) => String(b.seenAt).localeCompare(String(a.seenAt)));
}

module.exports = { seen, forget, list, idOf, KEEP_DAYS };
