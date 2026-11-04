/* Jarvis day rollups (#2085): the rows Jarvis counts, one document per closed UTC day.

   A range used to read every raw row of the range and the one before it, and the app rebuilds its snapshot every
   30 minutes, so Firestore ran at 8 to 14 times the free 50,000 reads a day. Now each closed day lives in
   jarvis_days/<YYYY-MM-DD>_<keep> with only the fields Jarvis reads, and a range reads one document per day plus
   the raw rows of the day still open. <keep> is the source's retention in days; the document expires with it.

   events    site_events               opens     url_review_opens (no ip or user agent)
   reviews   url_reviews (summary)     alerts    url_review_alerts
   notices   url_review_owner_notices  rivals    url_review_rivals
   captures  url_review_captures       failures  url_review_failures (kept 90 days) */

const HOUR = 3600000;
const DAY = 24 * HOUR;
const VERSION = 1;
// A day closes an hour after midnight UTC, so rows written late for it still land before it is stored.
const CLOSE_MS = HOUR;
// A stored day whose rows may still change (settle) is read again after 6 hours, or a quarter of its age if longer.
const REFRESH_MS = 6 * HOUR;
const MEMO_MS = 2 * 60 * 1000;
const MAX_BYTES = 900000;
const COLLECTION = "jarvis_days";

// A whole review document holds the report (hundreds of KB); a week of them overran the function's 512 MB (#1579).
const REVIEW_FIELDS = ["createdAt", "paid", "test", "priceUsd", "status", "score", "requestedUrl", "url", "frameworks", "query", "referrerHost"];

const KINDS = {
  events: { name: "site_events", field: "createdAt", keep: 365 },
  opens: { name: "url_review_opens", field: "createdAt", keep: 365, fields: ["createdAt", "city", "country", "region", "lang", "languages", "page", "query", "referrerHost", "screen", "timezone", "title", "urls"] },
  // A refund lands on the review days or weeks later, so refunded reviews are read live over the stored ones.
  reviews: { name: "url_reviews", field: "createdAt", iso: true, keep: 365, settle: 2 * DAY, live: ["refunded", "==", true], fields: REVIEW_FIELDS.concat(["sweep.outreach", "sweep.sector", "sweep.host", "refundedUsd", "refunded", "email", "reportId"]) },
  alerts: { name: "url_review_alerts", field: "at", iso: true, keep: 365, fields: ["at", "kind", "title", "url", "priceUsd"] },
  // A notice waits days for its send (status, lastError) and can be unlisted any time after.
  notices: { name: "url_review_owner_notices", field: "createdAt", iso: true, keep: 365, settle: 30 * DAY, fields: ["createdAt", "status", "unlistedAt", "lastError"] },
  rivals: { name: "url_review_rivals", field: "createdAt", iso: true, keep: 365, fields: ["createdAt"] },
  captures: { name: "url_review_captures", field: "at", iso: true, keep: 365, fields: ["at", "kind"] },
  failures: { name: "url_review_failures", field: "at", iso: true, keep: 90, fields: ["at", "host", "cause", "kind", "error.message"] }
};

const memo = new Map();

function toMs(value) {
  if (!value) return NaN;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.toDate === "function") return value.toDate().getTime();
  if (value instanceof Date) return value.getTime();
  if (typeof value.seconds === "number") return value.seconds * 1000;
  if (typeof value._seconds === "number") return value._seconds * 1000;
  return Date.parse(value);
}

const dayStart = (ms) => ms - (((ms % DAY) + DAY) % DAY);
const dayKey = (ms) => new Date(ms).toISOString().slice(0, 10);
const bound = (kind, ms) => (KINDS[kind].iso ? new Date(ms).toISOString() : new Date(ms));

async function raw(db, kind, from, to) {
  const k = KINDS[kind];
  let q = db.collection(k.name).where(k.field, ">=", bound(kind, from));
  if (to !== undefined) q = q.where(k.field, "<", bound(kind, to));
  if (k.fields) q = q.select(...k.fields);
  const snap = await q.limit(20000).get();
  return snap.docs.map((doc) => Object.assign({ id: doc.id }, doc.data()));
}

// The open day's rows, shared for a moment by the calls of one refresh (the app asks for its range and for 1 day).
async function openRows(db, kind, from) {
  const key = kind + "|" + from;
  const hit = memo.get(key);
  if (hit && hit.db === db && Date.now() - hit.at < MEMO_MS) return hit.rows;
  const rows = await raw(db, kind, from);
  memo.set(key, { db, at: Date.now(), rows });
  return rows;
}

// The first day each source holds a row, so a long range does not read a document for every empty day before it.
async function floors(db, kinds) {
  const ref = db.collection(COLLECTION).doc("meta");
  const snap = await ref.get().catch(() => null);
  const saved = Object.assign({}, snap && snap.exists ? (snap.data() || {}).floor : {});
  const missing = kinds.filter((kind) => !saved[kind]);
  if (!missing.length) return saved;
  let found = false;
  await Promise.all(missing.map(async (kind) => {
    const k = KINDS[kind];
    const first = await db.collection(k.name).orderBy(k.field).select(k.field).limit(1).get();
    const at = first.docs.length ? toMs(first.docs[0].data()[k.field]) : NaN;
    if (Number.isFinite(at)) { saved[kind] = dayKey(at); found = true; }
  }));
  if (found) await ref.set({ floor: saved }, { merge: true }).catch(() => null);
  return saved;
}

function current(part, day, now) {
  if (!part || part.v !== VERSION || part.over) return false;
  return part.final === true || now - Date.parse(part.at) < Math.max(REFRESH_MS, (now - day - DAY) / 4);
}

const getAll = (db, refs) => (typeof db.getAll === "function" ? db.getAll(...refs) : Promise.all(refs.map((ref) => ref.get())));

// Stores the parts read again; a day too large for one document keeps its rows out and is read raw each time.
async function save(ref, day, keep, parts, fresh) {
  const out = {};
  Object.keys(fresh).forEach((kind) => { out[kind] = Object.assign({}, fresh[kind]); });
  const size = () => JSON.stringify(Object.assign({}, parts, out)).length;
  Object.keys(out).sort((a, b) => out[b].rows.length - out[a].rows.length).forEach((kind) => {
    if (size() > MAX_BYTES) out[kind] = Object.assign({}, out[kind], { rows: [], over: true });
  });
  await ref.set({ day: dayKey(day), expireAt: new Date(day + DAY + keep * DAY), parts: out }, { merge: true }).catch(() => null);
}

async function storedDays(db, kinds, days, floor, now, out) {
  const groups = {};
  kinds.forEach((kind) => { (groups[KINDS[kind].keep] = groups[KINDS[kind].keep] || []).push(kind); });
  await Promise.all(Object.keys(groups).map(async (keepKey) => {
    const keep = Number(keepKey);
    const list = groups[keepKey];
    const has = (kind, day) => !!floor[kind] && dayKey(day) >= floor[kind];
    const wanted = days.filter((day) => day + DAY > now - keep * DAY && list.some((kind) => has(kind, day)));
    if (!wanted.length) return;
    const refs = wanted.map((day) => db.collection(COLLECTION).doc(dayKey(day) + "_" + keep));
    const snaps = await getAll(db, refs);
    await Promise.all(snaps.map(async (snap, i) => {
      const day = wanted[i];
      const parts = (snap && snap.exists ? (snap.data() || {}).parts : null) || {};
      const fresh = {};
      await Promise.all(list.filter((kind) => has(kind, day)).map(async (kind) => {
        const part = parts[kind];
        if (current(part, day, now)) { out[kind].push(...(part.rows || [])); return; }
        const rows = await raw(db, kind, day, day + DAY);
        out[kind].push(...rows);
        const final = now >= day + DAY + (KINDS[kind].settle || CLOSE_MS);
        if (!(part && part.over && part.final)) fresh[kind] = { v: VERSION, at: new Date(now).toISOString(), final, over: false, rows };
      }));
      if (Object.keys(fresh).length) await save(refs[i], day, keep, parts, fresh);
    }));
  }));
}

// Rows of each kind whose time field falls in [from, now], newest first: stored days, then the open day raw.
async function rows(db, kinds, { from, now }) {
  const out = {};
  kinds.forEach((kind) => { if (!KINDS[kind]) throw new Error("No such day rows: " + kind); out[kind] = []; });
  const edge = dayStart(now - CLOSE_MS);
  const days = [];
  for (let day = dayStart(from); day < edge; day += DAY) days.push(day);
  if (days.length) await storedDays(db, kinds, days, await floors(db, kinds), now, out);
  const live = {};
  await Promise.all(kinds.map(async (kind) => {
    out[kind].push(...(await openRows(db, kind, edge)));
    live[kind] = days.length ? await liveRows(db, kind) : [];
  }));
  kinds.forEach((kind) => {
    const field = KINDS[kind].field;
    const patch = new Map(live[kind].map((row) => [row.id, row]));
    const seen = new Set();
    out[kind] = out[kind].filter((row) => toMs(row[field]) >= from && !seen.has(row.id) && seen.add(row.id))
      .map((row) => patch.get(row.id) || row)
      .sort((a, b) => toMs(b[field]) - toMs(a[field]));
  });
  return out;
}

async function liveRows(db, kind) {
  const k = KINDS[kind];
  if (!k.live) return [];
  let q = db.collection(k.name).where(...k.live);
  if (k.fields) q = q.select(...k.fields);
  const snap = await q.limit(500).get();
  return snap.docs.map((doc) => Object.assign({ id: doc.id }, doc.data()));
}

// Timestamps as ISO strings, for rows sent to the browser as JSON.
function plain(row) {
  const out = {};
  Object.keys(row).forEach((key) => {
    const v = row[key];
    out[key] = v && typeof v === "object" && !Array.isArray(v) && (typeof v.toDate === "function" || typeof v._seconds === "number") ? new Date(toMs(v)).toISOString() : v;
  });
  return out;
}

module.exports = { KINDS, REVIEW_FIELDS, VERSION, rows, plain, toMs, dayKey, _memo: memo };
