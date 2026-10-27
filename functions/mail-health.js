"use strict";
/* Mail health for Jarvis (#1900, part of #1897): what ImprovMX did with the mail sent to carlosandmunoz.com, read
   from its logs API, and the daily canary that mails canary@ through SendGrid and waits for it to come back
   through the mailInbound webhook.

   ImprovMX logs one entry per forward destination, so a mail to qa@ is two entries (Gmail and the webhook). A
   mail counts as forwarded when one of its entries was delivered, bounced when one ended in a bounce, and
   refused when ImprovMX turned it away. Refusals to addresses that are not aliases are expected (there is no
   catch-all) and are only counted. A webhook destination carries the key in its URL, so it shows as "webhook". */

const API = "https://api.improvmx.com/v4/";
const DOMAIN = "carlosandmunoz.com";
const CANARY = "canary";
const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;
const RETENTION_DAYS = 180;
const PAGE = 200;
const MAX_PAGES = 5;
const CANARY_WAIT_MS = 30 * MINUTE;
const CANARY_STALE_MS = 26 * 60 * MINUTE;
const CANARY_HISTORY = 14;
const BOUNCES = ["soft-bounce", "hard-bounce", "bounced"];
const TOKEN = /\bMail round trip ([a-f0-9]{12})\b/;

const clip = (value, max) => {
  const s = String(value || "").replace(/\s+/g, " ").trim();
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
};
const lower = (v) => String(v || "").toLowerCase();

/** The forward an entry went to, with webhook URLs (and their key) reduced to "webhook". */
function destination(forward) {
  const email = lower(forward && forward.email);
  if (!email) return "";
  return /^https?:/.test(email) ? "webhook" : email;
}

/** delivered, bounced, refused or queued, from the entry's events. */
function outcome(log) {
  const statuses = ((log && log.events) || []).map((e) => lower(e.status));
  if (statuses.includes("refused")) return "refused";
  const last = statuses[statuses.length - 1] || "";
  if (BOUNCES.includes(last)) return "bounced";
  return last === "delivered" ? "delivered" : "queued";
}

function lastEvent(log) {
  const events = (log && log.events) || [];
  return events[events.length - 1] || {};
}

/** Per-alias counts and the problems (bounces and refusals to real aliases) from the mx log entries. */
function tally(logs, aliases) {
  const real = new Set((aliases || []).map(lower));
  const mails = new Map();
  (logs || []).forEach((log) => {
    const to = lower(log && log.recipient && log.recipient.email);
    const [local, domain] = to.split("@");
    const key = log.message_id || log.id;
    const mail = mails.get(key) || { key, id: log.id, at: log.created_at, alias: domain === DOMAIN ? local : "", from: lower(log.sender && log.sender.email).split("@").pop(), entries: [] };
    if (String(log.created_at || "") > String(mail.at || "")) mail.at = log.created_at;
    mail.entries.push({ outcome: outcome(log), to: destination(log.forward), event: lastEvent(log) });
    mails.set(key, mail);
  });
  const rows = {};
  const totals = { mails: 0, forwarded: 0, bounced: 0, refused: 0, unknown: 0, queued: 0 };
  const problems = [];
  mails.forEach((mail) => {
    const outcomes = mail.entries.map((e) => e.outcome);
    const state = outcomes.includes("refused") ? "refused" : outcomes.includes("bounced") ? "bounced" : outcomes.includes("delivered") ? "forwarded" : "queued";
    totals.mails += 1;
    if (!real.has(mail.alias)) {
      if (state === "refused") totals.unknown += 1;
      else totals[state] += 1;
      return;
    }
    totals[state] += 1;
    const row = rows[mail.alias] || (rows[mail.alias] = { alias: mail.alias, mails: 0, forwarded: 0, bounced: 0, refused: 0, queued: 0, last: "" });
    row.mails += 1;
    row[state] += 1;
    if (String(mail.at || "") > row.last) row.last = mail.at;
    if (state === "refused" || state === "bounced") {
      const bad = mail.entries.filter((e) => e.outcome === state);
      problems.push({
        id: String(mail.id || "").slice(0, 80), at: mail.at, alias: mail.alias, outcome: state, from: mail.from,
        to: [...new Set(bad.map((e) => e.to).filter(Boolean))], code: Number(bad[0].event.code) || null, reason: clip(bad[0].event.message, 160)
      });
    }
  });
  problems.sort((a, b) => String(b.at).localeCompare(String(a.at)));
  const list = Object.values(rows).sort((a, b) => b.mails - a.mails || a.alias.localeCompare(b.alias));
  return { totals, aliases: list, problems: problems.slice(0, 20) };
}

/** What the canary doc says: ok, waiting, lost, stale (no run in over a day) or never. */
function canaryState(doc, now) {
  const d = doc || {};
  const history = (d.history || []).slice(-CANARY_HISTORY);
  if (!d.sentAt) return { state: "never", history };
  const sent = Date.parse(d.sentAt);
  const base = { sentAt: d.sentAt, receivedAt: d.receivedAt || null, seconds: d.seconds === undefined ? null : d.seconds, history };
  if (now - sent > CANARY_STALE_MS) return Object.assign({ state: "stale" }, base);
  if (d.receivedAt) return Object.assign({ state: "ok" }, base);
  return Object.assign({ state: now - sent < CANARY_WAIT_MS ? "waiting" : "lost" }, base);
}

/** The doc after a new canary goes out: the last run moves into the history. */
function canarySent(prev, token, now) {
  const p = prev || {};
  const history = (p.history || []).concat(p.sentAt ? [{ sentAt: p.sentAt, seconds: p.receivedAt ? p.seconds : null }] : []).slice(-CANARY_HISTORY);
  return { token, sentAt: new Date(now).toISOString(), receivedAt: null, seconds: null, history };
}

/** The doc once the canary with this token came back, or null when the token is not the one in flight. */
function canaryBack(doc, token, now) {
  const d = doc || {};
  if (!token || d.token !== token || d.receivedAt) return null;
  return { receivedAt: new Date(now).toISOString(), seconds: Math.max(0, Math.round((now - Date.parse(d.sentAt)) / 1000)) };
}

function canaryMail(token) {
  return {
    to: CANARY + "@" + DOMAIN,
    subject: "Mail round trip " + token,
    text: "Jarvis sends this once a day through SendGrid to see that mail to " + DOMAIN + " reaches ImprovMX and comes back through the webhook. Nothing to do."
  };
}

const tokenOf = (subject) => (TOKEN.exec(String(subject || "")) || [])[1] || "";

async function getJson(fetchImpl, key, path, label) {
  const res = await fetchImpl(API + path, { headers: { Authorization: "Basic " + Buffer.from("api:" + key).toString("base64") }, signal: AbortSignal.timeout(10000) });
  if (res.status === 401) throw new Error("ImprovMX refused the API key (IMPROVMX_API_KEY).");
  if (!res.ok) throw new Error(label + " answered " + res.status + ".");
  return res.json();
}

async function mxLogs(fetchImpl, key, since) {
  const logs = [];
  let cursor = "";
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const q = new URLSearchParams({ transport: "mx", after: since, limit: String(PAGE) });
    if (cursor) q.set("cursor", cursor);
    const out = await getJson(fetchImpl, key, "domains/" + DOMAIN + "/logs?" + q, "ImprovMX logs");
    logs.push(...(out.logs || []));
    cursor = out.next_cursor || "";
    if (!cursor) return { logs, partial: false };
  }
  return { logs, partial: true };
}

/** The Jarvis source: ctx = {fetch, env, db, now, days}. */
async function mailbox(ctx) {
  const key = (ctx.env || {}).IMPROVMX_API_KEY;
  if (!key) return { ok: false, error: "IMPROVMX_API_KEY is not mounted on this function.", needs: [] };
  const now = ctx.now;
  const days = Math.min(Number(ctx.days) || 1, RETENTION_DAYS);
  const since = new Date(now - days * DAY).toISOString().replace(/\.\d+Z$/, "Z");
  const d = new Date(now);
  const monthStart = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString().replace(/\.\d+Z$/, "Z");
  const dayStart = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString().replace(/\.\d+Z$/, "Z");
  const count = (after) => getJson(ctx.fetch, key, "domains/" + DOMAIN + "/logs/count?" + new URLSearchParams({ transport: "smtp", after }), "ImprovMX log count").then((r) => Number(r.total) || 0);
  const canaryDoc = ctx.db ? ctx.db.collection("jarvis_mail").doc(CANARY).get().then((s) => (s.exists ? s.data() : null)).catch(() => null) : Promise.resolve(null);
  const [account, aliasList, mx, month, today, canary] = await Promise.all([
    getJson(ctx.fetch, key, "account", "ImprovMX account"),
    getJson(ctx.fetch, key, "domains/" + DOMAIN + "/aliases?limit=100", "ImprovMX aliases"),
    mxLogs(ctx.fetch, key, since),
    count(monthStart),
    count(dayStart),
    canaryDoc
  ]);
  const plan = (account.account || {}).plan || {};
  const aliases = (aliasList.aliases || []).map((a) => lower(a.alias)).filter(Boolean);
  return Object.assign({
    ok: true,
    days,
    partial: mx.partial,
    plan: { name: plan.name || "", retentionDays: (account.account || {}).email_log_retention_days || null },
    smtp: { month, monthLimit: plan.monthly_send_limit || null, today, dayLimit: plan.daily_send_limit || null },
    aliasCount: aliases.length,
    canary: canaryState(canary, now),
    needs: []
  }, tally(mx.logs, aliases));
}

module.exports = { CANARY, CANARY_WAIT_MS, destination, outcome, tally, canaryState, canarySent, canaryBack, canaryMail, tokenOf, mailbox };
