"use strict";
/*
 * Jarvis in the browser (#1671): standard Web Push to the admin page's service worker (jarvis-sw.js).
 * The VAPID keys and the button-signing key are made on first use and kept in jarvis_private/webpush,
 * which only the Admin SDK can read. A browser's buttons carry a signature per ref and act, because a
 * service worker holds no sign-in; notify-act accepts that signature in place of the owner's token.
 */
const crypto = require("crypto");

const SIGN_DAYS = 7;
const MAX_ACTIONS = 2;
const DEAD = new Set([404, 410]);
const URGENCY = { alerts: "high", money: "high", inbox: "high", codes: "high" };
// A sign-in code is dead within minutes, so a browser that was offline longer never shows it.
const TTL_S = { codes: 15 * 60 };
const SUBJECT = "mailto:qa@carlosandmunoz.com";

const keyRef = (db) => db.collection("jarvis_private").doc("webpush");

async function keys(db, webpush) {
  const ref = keyRef(db);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists && snap.data().publicKey) return snap.data();
    const made = webpush.generateVAPIDKeys();
    const row = { publicKey: made.publicKey, privateKey: made.privateKey, signKey: crypto.randomBytes(32).toString("hex"), createdAt: new Date().toISOString() };
    tx.set(ref, row);
    return row;
  });
}

function sign(signKey, ref, act, exp) {
  return crypto.createHmac("sha256", String(signKey)).update(ref + "\n" + act + "\n" + exp).digest("base64url");
}

/** True when sig was made by sign() for this ref and act and has not expired. */
function verify(signKey, { ref, act, exp, sig }, now) {
  const e = Number(exp);
  if (!signKey || !sig || !Number.isFinite(e) || e < now) return false;
  const want = Buffer.from(sign(signKey, String(ref || ""), String(act || ""), e));
  const got = Buffer.from(String(sig));
  return want.length === got.length && crypto.timingSafeEqual(want, got);
}

/** What the service worker gets: the push, with at most two buttons, each signed unless it needs typing. */
function payload(msg, signKey, now) {
  const exp = now + SIGN_DAYS * 86400000;
  const actions = (msg.ref ? (msg.actions || []) : []).slice(0, MAX_ACTIONS).map((a) => (a.input
    ? { act: a.act, label: a.label, input: a.input }
    : { act: a.act, label: a.label, exp, sig: sign(signKey, msg.ref, a.act, exp) }));
  return JSON.stringify({
    kind: msg.kind, title: msg.title, body: msg.body, lines: msg.lines || [], tab: msg.tab || "overview",
    tag: msg.tag || msg.kind, url: msg.url || "", ref: msg.ref || "", quiet: !!msg.quiet, actions
  });
}

/** Sends msg to each browser subscription and deletes the ones the push service says are gone. */
async function sendWeb(webpush, db, devices, msg, now) {
  if (!devices.length) return { sent: 0, failed: 0, removed: 0 };
  const k = await keys(db, webpush);
  const body = payload(msg, k.signKey, now);
  const options = { vapidDetails: { subject: SUBJECT, publicKey: k.publicKey, privateKey: k.privateKey }, TTL: TTL_S[msg.kind] || 12 * 3600, urgency: msg.quiet ? "low" : URGENCY[msg.kind] || "normal" };
  let sent = 0, failed = 0, removed = 0;
  await Promise.all(devices.map(async (d) => {
    try {
      await webpush.sendNotification(d.subscription, body, options);
      sent += 1;
    } catch (error) {
      failed += 1;
      if (DEAD.has(error && error.statusCode)) {
        removed += 1;
        await db.collection("jarvis_devices").doc(d.id).delete().catch(() => null);
      }
    }
  }));
  return { sent, failed, removed };
}

/** A browser's PushSubscription as the page sends it, or null. */
function cleanSubscription(sub) {
  const s = sub || {};
  const endpoint = String(s.endpoint || "");
  const p256dh = String((s.keys && s.keys.p256dh) || "");
  const auth = String((s.keys && s.keys.auth) || "");
  if (!/^https:\/\/[^\s]{10,1000}$/.test(endpoint) || !p256dh || !auth || p256dh.length > 200 || auth.length > 100) return null;
  return { endpoint, keys: { p256dh, auth } };
}

module.exports = { SIGN_DAYS, MAX_ACTIONS, keys, sign, verify, payload, sendWeb, cleanSubscription };
