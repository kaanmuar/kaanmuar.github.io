// Guards the CV contact and rating forms: a Cloudflare Turnstile token checked at Siteverify, and a per-visitor limit.
const crypto = require("crypto");

const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
// Production hostnames only: a token minted on localhost must not post to the live inbox.
const HOSTNAMES = new Set(["carlosandmunoz.com", "www.carlosandmunoz.com"]);
const ACTIONS = new Set(["message", "rating"]);
const LIMIT_WINDOW_MS = 10 * 60 * 1000;
const LIMIT_POSTS = 5;

// Siteverify answers in well under a second; ten seconds covers a slow region without holding the visitor long.
async function verifyTurnstile({ secret, token, ip, action, fetchImpl = fetch }) {
  if (!secret || !ACTIONS.has(action)) return { ok: false, reason: "config" };
  if (typeof token !== "string" || !token || token.length > 2048) return { ok: false, reason: "token" };
  let result;
  try {
    const body = new URLSearchParams({ secret, response: token });
    if (ip) body.set("remoteip", ip);
    const res = await fetchImpl(SITEVERIFY, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(10000)
    });
    if (!res.ok) throw new Error("siteverify " + res.status);
    result = await res.json();
  } catch (error) {
    return { ok: false, reason: "unreachable" };
  }
  if (!result || result.success !== true) return { ok: false, reason: "token", codes: (result && result["error-codes"]) || [] };
  if (result.action !== action) return { ok: false, reason: "action" };
  if (!HOSTNAMES.has(result.hostname)) return { ok: false, reason: "hostname" };
  return { ok: true };
}

function visitorKey(ip) {
  return crypto.createHash("sha256").update("cv-form:" + String(ip || "unknown")).digest("hex").slice(0, 40);
}

// One Firestore doc per hashed IP; the raw address is never stored.
async function takeFormSlot(db, ip, now = Date.now()) {
  const ref = db.collection("form_limits").doc(visitorKey(ip));
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const prev = snap.exists ? snap.data() || {} : {};
    const start = Number(prev.windowStart) || 0;
    const fresh = !start || now - start >= LIMIT_WINDOW_MS;
    const count = fresh ? 1 : (Number(prev.count) || 0) + 1;
    tx.set(ref, {
      windowStart: fresh ? now : start,
      count,
      expiresAt: new Date((fresh ? now : start) + LIMIT_WINDOW_MS)
    });
    return count <= LIMIT_POSTS;
  });
}

module.exports = { verifyTurnstile, takeFormSlot, visitorKey, HOSTNAMES, LIMIT_POSTS, LIMIT_WINDOW_MS };
