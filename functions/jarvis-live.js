"use strict";
/* Jarvis 2.0 live pushes (#2509, contract on #2507): when a snapshot section's version moves, every phone and every
   open admin page gets one small data message (no notification) naming the sections that moved and the versions of
   all of them, and fetches only what it lacks.

   Change is found where the one-day snapshot is loaded anyway, so it costs no rebuild of its own: the snapshot op for
   1 day (the app reads it on every refresh), the writes that drop a build section (they load it once after), and the
   hourly jarvisWatch. The versions are the one-day snapshot's; a client on another range takes the message as "these
   sections changed" and fetches them for its range.

   The last pushed versions live in jarvis_cache/pushed-<days>, written only when a push goes out. Each instance also
   remembers them, so a check whose versions and build times it already pushed reads nothing. The first change goes
   out at once; one within GAP_MS of the last push waits out the gap and goes with whatever else moved, so a burst
   sends one message. mail and devices are read live on every fetch and are never pushed (sign-in codes have their
   own push). processes (#2548) goes at high priority; the rest at normal, to spare the battery. */

const sections = require("./jarvis-sections");
const webPush = require("./jarvis-webpush");
const push = require("./jarvis-push");

const KIND = "sections";
const DAYS = 1;
const SKIP = new Set(["mail", "devices"]);
const NAMES = sections.NAMES.filter((name) => !SKIP.has(name));
const URGENT = new Set(["processes"]);
const GAP_MS = 3000;
const PHONE_TTL_MS = 3600 * 1000;
// A browser that has been away longer has missed nothing it will not fetch on its own when it opens.
const WEB_TTL_S = 120;
// Browsers get the push only while the admin page is open: a push that shows nothing counts against a browser's
// silent-push allowance, and Safari drops a subscription that keeps getting them.
const WEB_LIVE_MS = 10 * 60 * 1000;
const COLLAPSE = "jarvis-sections";
const DEVICES_MS = 60 * 1000;

const stateRef = (db, days) => db.collection("jarvis_cache").doc("pushed-" + days);
const iso = (ms) => new Date(ms).toISOString();

let memo = {};
let devicesKept = null;

function forget() {
  memo = {};
  devicesKept = null;
}

// The pushed sections of a versions map, as { name: { v, at } }.
function pick(versions) {
  const out = {};
  NAMES.forEach((name) => {
    const row = versions && versions[name];
    if (row && row.v) out[name] = { v: String(row.v), at: String(row.at || "") };
  });
  return out;
}

// The sections whose version moved since `pushed`; one built before the pushed version is older news and stays out.
function moved(pushed, now) {
  return Object.keys(now).filter((name) => {
    const was = (pushed || {})[name];
    if (!was || !was.v) return true;
    if (was.v === now[name].v) return false;
    return !(Date.parse(now[name].at) < Date.parse(was.at));
  });
}

// True when this instance already pushed exactly these versions, built at the same times.
function known(kept, now) {
  return Object.keys(now).every((name) => kept && kept[name] && kept[name].v === now[name].v && kept[name].at === now[name].at);
}

/** The data message: string values only (FCM data), well under FCM's 4 KB. */
function message(days, pushed, names, now) {
  const versions = {};
  Object.keys(pushed).filter((name) => NAMES.includes(name)).sort().forEach((name) => { versions[name] = pushed[name].v; });
  return { kind: KIND, days: String(days), sections: names.slice().sort().join(","), versions: JSON.stringify(versions), at: iso(now) };
}

const urgent = (names) => names.some((name) => URGENT.has(name));

// One transaction on the pushed doc: the sections to push now, or how long to wait out the gap.
function claim(db, days, now, at) {
  const ref = stateRef(db, days);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const state = (snap && snap.exists ? snap.data() : null) || {};
    const pushed = state.versions || {};
    const names = moved(pushed, now);
    if (!names.length) return { names, pushed };
    const wait = Date.parse(state.sentAt) + GAP_MS - at;
    if (wait > 0) return { names: [], wait, pushed };
    const next = Object.assign({}, pushed);
    names.forEach((name) => { next[name] = now[name]; });
    tx.set(ref, { versions: next, sentAt: iso(at), sections: names });
    return { names, pushed: next };
  });
}

async function devices(deps, at) {
  if (devicesKept && at - devicesKept.at < DEVICES_MS) return devicesKept.rows;
  const rows = await push.list(deps.db);
  devicesKept = { at, rows };
  return rows;
}

// Sends the message to every phone and to every browser with Jarvis open; drops the devices their service says are gone.
async function send(deps, data, high, at) {
  const rows = await devices(deps, at);
  const tokens = rows.filter((d) => d.token).map((d) => d.token);
  const live = rows.filter((d) => d.subscription && Date.parse(d.liveAt) > at - WEB_LIVE_MS);
  const out = { phones: 0, web: 0, failed: 0, removed: 0 };
  if (tokens.length) {
    const res = await deps.messaging.sendEachForMulticast({ tokens, data, android: { priority: high ? "high" : "normal", ttl: PHONE_TTL_MS, collapseKey: COLLAPSE } });
    const dead = [];
    res.responses.forEach((r, i) => { if (!r.success && r.error && push.DEAD.has(r.error.code)) dead.push(tokens[i]); });
    await Promise.all(dead.map((t) => deps.db.collection("jarvis_devices").doc(push.idOf(t)).delete().catch(() => null)));
    if (dead.length) devicesKept = null;
    Object.assign(out, { phones: res.successCount, failed: res.failureCount, removed: dead.length });
  }
  if (live.length) {
    const web = await webPush.deliver(deps.webpush, deps.db, live, JSON.stringify(data), { TTL: WEB_TTL_S, urgency: high ? "normal" : "low", topic: COLLAPSE })
      .catch((error) => ({ sent: 0, failed: live.length, removed: 0, error: String(error.message || error).slice(0, 200) }));
    out.web = web.sent;
    out.failed += web.failed;
    out.removed += web.removed;
  }
  return out;
}

/**
 * Pushes the sections whose version moved since the last push. deps: { db, messaging, webpush, now(), sleep(ms) }.
 * versions is the snapshot op's `versions` for `days` (any subset of the sections).
 */
async function check(deps, days, versions) {
  const now = pick(versions);
  if (!Object.keys(now).length || known(memo[days], now)) return { pushed: false, reason: "unchanged" };
  let got = await claim(deps.db, days, now, deps.now());
  for (let tries = 0; got.wait && tries < 3; tries += 1) {
    await deps.sleep(got.wait);
    got = await claim(deps.db, days, now, deps.now());
  }
  memo[days] = got.pushed;
  if (got.wait) return { pushed: false, reason: "busy" };
  if (!got.names.length) return { pushed: false, reason: "unchanged" };
  const at = deps.now();
  const out = await send(deps, message(days, got.pushed, got.names, at), urgent(got.names), at);
  return Object.assign({ pushed: true, sections: got.names }, out);
}

/** The admin page sends its push endpoint with each snapshot read while it is open; only those browsers get pushes. */
async function markLive(db, endpoint, now) {
  const e = String(endpoint || "");
  if (!/^https:\/\/\S{10,1000}$/.test(e)) return false;
  await db.collection("jarvis_devices").doc(push.idOf(e)).update({ liveAt: iso(now) });
  return true;
}

module.exports = { KIND, DAYS, NAMES, URGENT, GAP_MS, WEB_LIVE_MS, PHONE_TTL_MS, WEB_TTL_S, COLLAPSE, pick, moved, known, message, urgent, check, markLive, forget };
