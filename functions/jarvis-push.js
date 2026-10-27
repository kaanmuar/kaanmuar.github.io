"use strict";
/*
 * Jarvis push (#1416): the Android app registers its FCM token here, and the hourly watch and the
 * daily briefing push to every phone that keeps that kind on, alongside the owner email.
 * Data-only messages, so the app picks the channel and what a tap opens.
 * Browsers (#1671) register a Web Push subscription in the same collection and get every broadcast kind too.
 */
const crypto = require("crypto");
const webPush = require("./jarvis-webpush");

// Kinds that only make sense on the phone: app updates and reviews started from a shared link.
const PHONE_ONLY = new Set(["update", "review"]);

const KINDS = ["alerts", "briefing", "money", "reviews", "outreach", "inbox", "desk", "social"];
const DEAD = new Set(["messaging/registration-token-not-registered", "messaging/invalid-registration-token", "messaging/invalid-argument"]);
const TTL = { alerts: 6 * 3600 * 1000, briefing: 12 * 3600 * 1000, review: 24 * 3600 * 1000, money: 24 * 3600 * 1000, reviews: 24 * 3600 * 1000, outreach: 12 * 3600 * 1000, inbox: 24 * 3600 * 1000, desk: 12 * 3600 * 1000, social: 24 * 3600 * 1000, update: 24 * 3600 * 1000, test: 3600 * 1000 };

const devices = (db) => db.collection("jarvis_devices");
const idOf = (token) => crypto.createHash("sha256").update(String(token)).digest("hex").slice(0, 40);

function cleanKinds(kinds) {
  return KINDS.reduce((out, k) => { out[k] = !(kinds && kinds[k] === false); return out; }, {});
}

async function register(db, { token, name, kinds, subscription }, by, now) {
  if (subscription) {
    const sub = webPush.cleanSubscription(subscription);
    if (!sub) throw new Error("That is not a browser subscription.");
    const row = { type: "web", subscription: sub, name: String(name || "Browser").slice(0, 80), kinds: cleanKinds(kinds), by: String(by || ""), updatedAt: new Date(now).toISOString() };
    await devices(db).doc(idOf(sub.endpoint)).set(row);
    return { id: idOf(sub.endpoint), name: row.name, kinds: row.kinds };
  }
  const t = String(token || "").trim();
  if (t.length < 20 || t.length > 4096) throw new Error("That is not a device token.");
  const row = { token: t, name: String(name || "Android phone").slice(0, 80), kinds: cleanKinds(kinds), by: String(by || ""), updatedAt: new Date(now).toISOString() };
  await devices(db).doc(idOf(t)).set(row, { merge: true });
  return { id: idOf(t), name: row.name, kinds: row.kinds };
}

async function unregister(db, token) {
  await devices(db).doc(idOf(token)).delete();
  return { removed: true };
}

async function list(db) {
  const snap = await devices(db).get();
  return snap.docs.map((d) => Object.assign({ id: d.id }, d.data()));
}

const wants = (d, kind) => kind === "test" || !(d.kinds && d.kinds[kind] === false);

/** Phone tokens that keep this kind on. */
async function targets(db, kind) {
  return (await list(db)).filter((d) => d.token && wants(d, kind)).map((d) => d.token);
}

/** Browsers that keep this kind on. */
async function webTargets(db, kind) {
  if (PHONE_ONLY.has(kind)) return [];
  return (await list(db)).filter((d) => d.subscription && wants(d, kind));
}

/** True when a phone or a browser would get this kind. */
async function anyTargets(db, kind) {
  return (await list(db)).some((d) => (d.token || (d.subscription && !PHONE_ONLY.has(kind))) && wants(d, kind));
}

function alertMessage(fresh) {
  const more = fresh.length > 1 ? " (+" + (fresh.length - 1) + " more)" : "";
  return {
    kind: "alerts",
    title: "Jarvis alert" + (fresh.length > 1 ? "s: " + fresh.length : ""),
    body: fresh[0].text.slice(0, 180) + more,
    lines: fresh.slice(0, 6).map((row) => row.text.slice(0, 120)),
    tab: "systems",
    tag: "jarvis-alerts"
  };
}

/** top is the best-ranked proposal; Done and Dismiss on the push mark it (#1670). */
function briefingMessage({ items, aiText, dateLabel, top }) {
  const alerts = items.filter((r) => r.level === "alert").length;
  const warns = items.filter((r) => r.level === "warn").length;
  const plural = (n, w) => n + " " + w + (n === 1 ? "" : "s");
  const head = alerts + warns ? plural(alerts, "alert") + ", " + plural(warns, "warning") : "All clear";
  const first = String(aiText || "").split(/\n+/).map((s) => s.trim()).find(Boolean) || (items[0] && items[0].text) || "Nothing to flag.";
  const lines = items.filter((r) => r.level === "alert" || r.level === "warn").slice(0, 6).map((r) => r.text.slice(0, 120));
  const key = top && top.key ? String(top.key).slice(0, 140) : "";
  if (key) lines.unshift(("Do next: " + (top.title || key)).slice(0, 120));
  return {
    kind: "briefing",
    title: "Jarvis briefing, " + dateLabel + ": " + head,
    body: first.slice(0, 220),
    lines: lines.slice(0, 6),
    tab: "overview",
    tag: "jarvis-briefing",
    ref: key ? "proposal:" + key : "",
    actions: key ? [{ act: "done", label: "Done" }, { act: "dismissed", label: "Dismiss" }] : []
  };
}

/**
 * Sends one message to the phone tokens and to the browsers that keep its kind on (or to the browsers
 * given, for a test), and deletes the devices their push service says are gone.
 */
async function send(messaging, db, tokens, msg, browsers) {
  const phones = await sendPhones(messaging, db, tokens, msg);
  const web = browsers || (db && msg.kind !== "test" ? await webTargets(db, msg.kind) : []);
  if (!web.length) return logged(db, msg, phones);
  const out = await webPush.sendWeb(require("web-push"), db, web, msg, Date.now())
    .catch((error) => ({ sent: 0, failed: web.length, removed: 0, error: String(error.message || error).slice(0, 200) }));
  return logged(db, msg, { sent: phones.sent + out.sent, failed: phones.failed + out.failed, removed: phones.removed + out.removed, web: out.sent });
}

// Every push except tests lands in jarvis_pushes for the evening digest, delivered or not.
async function logged(db, msg, out) {
  if (!db || msg.kind === "test") return out;
  const now = Date.now();
  try {
    await db.collection("jarvis_pushes").add({
      kind: msg.kind, title: String(msg.title || "").slice(0, 200), body: String(msg.body || "").slice(0, 400), ref: String(msg.ref || ""),
      at: new Date(now).toISOString(), sent: out.sent, expireAt: new Date(now + 30 * 86400000)
    });
  } catch (error) {
    console.error("Jarvis push log failed:", error && error.message);
  }
  return out;
}

async function sendPhones(messaging, db, tokens, msg) {
  if (!tokens.length) return { sent: 0, failed: 0, removed: 0 };
  const data = { kind: msg.kind, title: msg.title, body: msg.body, lines: JSON.stringify(msg.lines || []), tab: msg.tab || "overview", tag: msg.tag || msg.kind };
  if (msg.url) data.url = msg.url;
  if (msg.ref) data.ref = msg.ref;
  if (msg.quiet) data.quiet = "1";
  if (msg.actions && msg.actions.length) data.actions = JSON.stringify(msg.actions.slice(0, 3));
  const res = await messaging.sendEachForMulticast({ tokens, data, android: { priority: msg.quiet ? "normal" : "high", ttl: TTL[msg.kind] || TTL.test } });
  const dead = [];
  res.responses.forEach((r, i) => { if (!r.success && r.error && DEAD.has(r.error.code)) dead.push(tokens[i]); });
  await Promise.all(dead.map((t) => devices(db).doc(idOf(t)).delete().catch(() => null)));
  return { sent: res.successCount, failed: res.failureCount, removed: dead.length };
}

/*
 * App release push (#1562): CI calls the jarvis function with op "app-release" after it publishes an APK.
 * The release is read from GitHub here rather than taken from the caller, so the op needs no secret,
 * and each version is pushed once. The app installs the update itself when the push arrives.
 */
const RELEASES = "https://api.github.com/repos/kaanmuar/kaanmuar.github.io/releases?per_page=30";
const TAG = "jarvis-android-v";

function newestRelease(list) {
  return (Array.isArray(list) ? list : [])
    .filter((r) => r && !r.draft && String(r.tag_name || "").startsWith(TAG))
    .map((r) => { const name = r.tag_name.slice(TAG.length); return { code: Number(name.split(".").pop()), name, url: r.html_url || "" }; })
    .filter((r) => Number.isInteger(r.code) && r.code > 0)
    .sort((a, b) => b.code - a.code)[0] || null;
}

async function releasePush(fetchFn, db, messaging, { token, now }) {
  const headers = { accept: "application/vnd.github+json", "user-agent": "jarvis-function" };
  if (token) headers.authorization = "Bearer " + token;
  const res = await fetchFn(RELEASES, { headers });
  if (!res.ok) throw new Error("GitHub releases answered " + res.status + ".");
  const rel = newestRelease(await res.json());
  if (!rel) return { pushed: false, reason: "No Jarvis release yet." };
  const ref = db.collection("jarvis_cache").doc("app-release");
  const fresh = await db.runTransaction(async (tx) => {
    const seen = (await tx.get(ref)).data() || {};
    if ((seen.code || 0) >= rel.code) return false;
    tx.set(ref, { code: rel.code, name: rel.name, at: new Date(now).toISOString() });
    return true;
  });
  if (!fresh) return { pushed: false, version: rel.name, reason: "Already pushed." };
  const out = await send(messaging, db, await targets(db, "update"), { kind: "update", title: "Jarvis " + rel.name, body: "Installing the new version.", tab: "overview", tag: "jarvis-update", url: rel.url });
  return Object.assign({ pushed: true, version: rel.name }, out);
}

module.exports = { KINDS, PHONE_ONLY, idOf, cleanKinds, register, unregister, list, targets, webTargets, anyTargets, alertMessage, briefingMessage, send, newestRelease, releasePush };
