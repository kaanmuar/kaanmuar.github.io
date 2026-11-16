"use strict";
/* Our own mail that ImprovMX refused because SendGrid sent it from a blocklisted shared IP (#2020).

   SendGrid sends from a rotating pool of shared IPs and answers 202 before the receiving server decides, and
   ImprovMX (the MX for carlosandmunoz.com) refuses mail from an IP on SpamCop. So a mail to our own domain is kept
   in mail_outbox for a day under SendGrid's message id. The hourly watch asks Email Activity which of them were not
   delivered, and sends each one refused for a blocklist once more: the new send leaves from another IP. */

const DOMAIN = "carlosandmunoz.com";
const OUTBOX = "mail_outbox";
const API = "https://api.sendgrid.com/v3/messages";
const KEEP_MS = 24 * 60 * 60 * 1000;
const MAX_TRIES = 2;
const BLOCKLIST = /spamcop|spamhaus|barracuda|black ?list(?:ed)?|block ?list(?:ed)?|\bRBL\b|\bDNSBL\b/i;

const clean = (error) => String((error && error.message) || error || "failed").slice(0, 160);

function toOwnDomain(to) {
  return [].concat(to || []).some((t) => String((t && t.email) || t || "").toLowerCase().endsWith("@" + DOMAIN));
}

/** The list a refusal names ("SpamCop"), or "" when it is not a blocklist refusal. */
function blocklistOf(reason) {
  const text = String(reason || "");
  if (!BLOCKLIST.test(text)) return "";
  const named = /spamcop/i.test(text) ? "SpamCop" : /spamhaus/i.test(text) ? "Spamhaus" : /barracuda/i.test(text) ? "Barracuda" : "";
  return named || "a blocklist";
}

/** Sends through SendGrid; a mail to our own domain is kept so retry() can send it again. */
async function send(sgMail, db, msg, now, tries) {
  const [res] = await sgMail.send(msg);
  const id = res && res.headers && (res.headers["x-message-id"] || res.headers["X-Message-Id"]);
  if (db && id && toOwnDomain(msg.to)) {
    await db.collection(OUTBOX).doc(String(id)).set({ msg: JSON.parse(JSON.stringify(msg)), sentAt: new Date(now || Date.now()).toISOString(), tries: tries || 1 })
      .catch((error) => console.error("mail_outbox was not written:", clean(error)));
  }
  return res;
}

/** What to do with a kept mail, given its Email Activity row and the refusal reason. */
function decide(kept, row, reason, now) {
  const age = now - Date.parse(kept.sentAt || 0);
  if (row && row.status === "delivered") return "drop";
  if (row && row.status === "not_delivered") {
    const list = blocklistOf(reason);
    return list && (kept.tries || 1) < MAX_TRIES ? "resend" : "drop";
  }
  return age > KEEP_MS ? "drop" : "wait";
}

async function activity(ctx, path, query) {
  const url = API + path + (query ? "?" + new URLSearchParams(query) : "");
  const res = await ctx.fetch(url, { headers: { Authorization: "Bearer " + ctx.key }, signal: AbortSignal.timeout(15000) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error("SendGrid Email Activity " + res.status + ": " + String((data.errors && data.errors[0] && data.errors[0].message) || "").slice(0, 120));
  return data;
}

/**
 * ctx: { db, sgMail, fetch, key, now }. Returns a note for the watch: what was resent, from which listed IP.
 * SendGrid's x-message-id is the start of Email Activity's msg_id.
 */
async function retry(ctx) {
  if (!ctx.key || !ctx.sgMail) return "mail retry: SendGrid is not configured";
  const now = ctx.now || Date.now();
  const snap = await ctx.db.collection(OUTBOX).get();
  if (snap.empty) return "no own-domain mail kept";
  const since = new Date(now - KEEP_MS - 60 * 60 * 1000).toISOString().replace(/\.\d+Z$/, "Z");
  const { messages = [] } = await activity(ctx, "", {
    limit: "100",
    query: `to_email LIKE "%@${DOMAIN}" AND last_event_time > TIMESTAMP "${since}"`
  });
  const resent = [];
  for (const doc of snap.docs) {
    const kept = doc.data();
    const row = messages.find((m) => String(m.msg_id || "").startsWith(doc.id));
    let reason = "";
    let ip = "";
    if (row && row.status === "not_delivered") {
      const detail = await activity(ctx, "/" + encodeURIComponent(row.msg_id)).catch(() => ({}));
      const refusal = (detail.events || []).filter((e) => /bounce|block|deferred/i.test(e.event_name || "")).pop() || {};
      reason = refusal.reason || "";
      ip = detail.outbound_ip || "";
    }
    const action = decide(kept, row, reason, now);
    if (action === "wait") continue;
    if (action === "resend") {
      try {
        await send(ctx.sgMail, ctx.db, kept.msg, now, (kept.tries || 1) + 1);
        resent.push(`${[].concat(kept.msg.to)[0]} (${blocklistOf(reason)}${ip ? " " + ip : ""})`);
      } catch (error) {
        console.error("The refused mail was not resent:", clean(error));
        continue;
      }
    }
    await doc.ref.delete();
  }
  return resent.length ? "resent " + resent.length + " refused for a blocklist: " + resent.join(", ") : "nothing refused";
}

module.exports = { DOMAIN, OUTBOX, toOwnDomain, blocklistOf, decide, send, retry };
