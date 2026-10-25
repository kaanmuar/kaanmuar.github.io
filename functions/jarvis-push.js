"use strict";
/*
 * Jarvis push (#1416): the Android app registers its FCM token here, and the hourly watch and the
 * daily briefing push to every phone that keeps that kind on, alongside the owner email.
 * Data-only messages, so the app picks the channel and what a tap opens.
 */
const crypto = require("crypto");

const KINDS = ["alerts", "briefing"];
const DEAD = new Set(["messaging/registration-token-not-registered", "messaging/invalid-registration-token", "messaging/invalid-argument"]);
const TTL = { alerts: 6 * 3600 * 1000, briefing: 12 * 3600 * 1000, review: 24 * 3600 * 1000, test: 3600 * 1000 };

const devices = (db) => db.collection("jarvis_devices");
const idOf = (token) => crypto.createHash("sha256").update(String(token)).digest("hex").slice(0, 40);

function cleanKinds(kinds) {
  return KINDS.reduce((out, k) => { out[k] = !(kinds && kinds[k] === false); return out; }, {});
}

async function register(db, { token, name, kinds }, by, now) {
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

async function targets(db, kind) {
  return (await list(db)).filter((d) => kind === "test" || !(d.kinds && d.kinds[kind] === false)).map((d) => d.token);
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

function briefingMessage({ items, aiText, dateLabel }) {
  const alerts = items.filter((r) => r.level === "alert").length;
  const warns = items.filter((r) => r.level === "warn").length;
  const plural = (n, w) => n + " " + w + (n === 1 ? "" : "s");
  const head = alerts + warns ? plural(alerts, "alert") + ", " + plural(warns, "warning") : "All clear";
  const first = String(aiText || "").split(/\n+/).map((s) => s.trim()).find(Boolean) || (items[0] && items[0].text) || "Nothing to flag.";
  return {
    kind: "briefing",
    title: "Jarvis briefing, " + dateLabel + ": " + head,
    body: first.slice(0, 220),
    lines: items.filter((r) => r.level === "alert" || r.level === "warn").slice(0, 6).map((r) => r.text.slice(0, 120)),
    tab: "overview",
    tag: "jarvis-briefing"
  };
}

/** Sends one message to the tokens and deletes the ones FCM says are gone. */
async function send(messaging, db, tokens, msg) {
  if (!tokens.length) return { sent: 0, failed: 0, removed: 0 };
  const data = { kind: msg.kind, title: msg.title, body: msg.body, lines: JSON.stringify(msg.lines || []), tab: msg.tab || "overview", tag: msg.tag || msg.kind };
  if (msg.url) data.url = msg.url;
  const res = await messaging.sendEachForMulticast({ tokens, data, android: { priority: "high", ttl: TTL[msg.kind] || TTL.test } });
  const dead = [];
  res.responses.forEach((r, i) => { if (!r.success && r.error && DEAD.has(r.error.code)) dead.push(tokens[i]); });
  await Promise.all(dead.map((t) => devices(db).doc(idOf(t)).delete().catch(() => null)));
  return { sent: res.successCount, failed: res.failureCount, removed: dead.length };
}

module.exports = { KINDS, idOf, cleanKinds, register, unregister, list, targets, alertMessage, briefingMessage, send };
