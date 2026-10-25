/**
 * What the account page hands back or removes for the signed-in address
 * (Ley 1581 de 2012, arts. 8 and 14-15; GDPR arts. 15, 17 and 20).
 * Works on the same store as url-review-auth.js: get, where, replace, remove.
 */
const reviewAuth = require("./url-review-auth");

const LIMIT = 500;

// Collections whose rows carry the address in an `email` field, under the name each takes in the export.
const BY_EMAIL = [
  ["reviews", "url_reviews"],
  ["comparisons", "url_review_comparisons"],
  ["notes", "url_review_notes"],
  ["alerts", "url_review_alerts"],
  ["failures", "url_review_failures"],
  ["reruns", "url_review_reruns"],
  ["coupons", "url_review_coupons"],
  ["stopLinks", "url_review_stop_links"],
  ["signIns", "url_review_sign_ins"],
  ["sessions", "url_review_sessions"],
  ["ownerProofs", "url_review_owner_proofs"]
];

// Their ids are a hash of a live secret or the secret itself.
const SECRET_IDS = new Set(["url_review_sessions", "url_review_sign_ins", "url_review_stop_links"]);
const SECRET_FIELDS = ["deviceHash", "codeHash", "tokenHash"];

// Colombian tax support (Ley 962 de 2005, art. 46) keeps a payment for five years; the report itself goes.
const PAYMENT_STATUSES = new Set(["paid-report", "paid-addon", "run-credit", "run-credit-used", "monthly-pass", "checkout-open"]);
const PAYMENT_FIELDS = ["email", "status", "paid", "test", "provider", "method", "sessionId", "reference", "externalId", "purpose", "reportId",
  "billing", "plan", "paidUntil", "priceUsd", "listUsd", "percent", "coupon", "amount", "currency", "createdAt", "expireAt"];

function isPayment(row) {
  return !!row && (row.paid === true || PAYMENT_STATUSES.has(row.status));
}

// A stop on follow-up notes outlives the account, or the notes would start again.
function keeps(col, row) {
  if (col === "url_review_notes") return !!row && row.status === "follow-stop";
  if (col === "url_reviews") return isPayment(row) && !!row.accountDeletedAt;
  return false;
}

function paymentOnly(row, at) {
  return PAYMENT_FIELDS.reduce((kept, key) => (row[key] === undefined ? kept : Object.assign(kept, { [key]: row[key] })), { accountDeletedAt: at });
}

function plain(value) {
  if (value == null || typeof value !== "object") return value;
  if (typeof value.toDate === "function") return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(plain);
  return Object.keys(value).reduce((out, key) => Object.assign(out, { [key]: plain(value[key]) }), {});
}

function shown(col, row) {
  const out = plain(row);
  SECRET_FIELDS.forEach((key) => { delete out[key]; });
  if (SECRET_IDS.has(col)) delete out.id;
  return out;
}

function cleanEmail(email) {
  return String(email || "").trim().toLowerCase();
}

async function runIdsOf(store, email) {
  const rows = await store.where("url_reviews", "email", email, LIMIT);
  return rows.map((row) => row.id);
}

// Captures and stops hang off a run id, not an address.
async function byRun(store, runIds) {
  const captures = [];
  const stops = [];
  for (const id of runIds) {
    captures.push(...await store.where("url_review_captures", "reportId", id, LIMIT));
    const stop = await store.get("url_review_stops", id);
    if (stop) stops.push(Object.assign({ id }, stop));
  }
  return { captures, stops };
}

async function exportAccount(store, email, now) {
  const key = cleanEmail(email);
  const out = { exportedAt: new Date(now || Date.now()).toISOString(), email: key };
  const account = await store.get("url_review_accounts", key);
  out.account = account ? shown("url_review_accounts", account) : null;
  const freeRuns = await store.get("url_review_free_runs", key);
  out.freeAccount = freeRuns ? shown("url_review_free_runs", freeRuns) : null;
  for (const [name, col] of BY_EMAIL) {
    out[name] = (await store.where(col, "email", key, LIMIT)).map((row) => shown(col, row));
  }
  const linked = await byRun(store, out.reviews.map((row) => row.id));
  out.captures = linked.captures.map((row) => shown("url_review_captures", row));
  out.stops = linked.stops.map((row) => shown("url_review_stops", row));
  return out;
}

async function dropByEmail(store, col, email, at, counts) {
  for (;;) {
    const rows = await store.where(col, "email", email, LIMIT);
    const gone = rows.filter((row) => !keeps(col, row));
    for (const row of gone) {
      const paidElsewhere = col === "url_reviews" && isPayment(row) && !PAYMENT_STATUSES.has(row.status)
        && !!await store.get(col, "paid-report-" + row.id);
      if (col === "url_reviews" && isPayment(row) && !paidElsewhere) {
        await store.replace(col, row.id, paymentOnly(row, at));
        counts.paymentsKept = (counts.paymentsKept || 0) + 1;
      } else {
        await store.remove(col, row.id);
        counts[col] = (counts[col] || 0) + 1;
      }
    }
    if (!gone.length || rows.length < LIMIT) return;
  }
}

// The account doc goes last: its onDelete trigger drops the Firebase Auth user too,
// and authApi does it here as well, so the answer says whether it is gone.
async function deleteAccount(store, email, opts) {
  const key = cleanEmail(email);
  const options = opts || {};
  const at = new Date(options.now || Date.now()).toISOString();
  const counts = {};
  if (!key) return counts;
  const linked = await byRun(store, await runIdsOf(store, key));
  for (const row of linked.captures) await store.remove("url_review_captures", row.id);
  for (const row of linked.stops) await store.remove("url_review_stops", row.id);
  if (linked.captures.length) counts.url_review_captures = linked.captures.length;
  if (linked.stops.length) counts.url_review_stops = linked.stops.length;
  for (const [, col] of BY_EMAIL) await dropByEmail(store, col, key, at, counts);
  if (await store.get("url_review_free_runs", key)) {
    await store.remove("url_review_free_runs", key);
    counts.url_review_free_runs = 1;
  }
  if (await store.get("url_review_accounts", key)) {
    await store.remove("url_review_accounts", key);
    counts.url_review_accounts = 1;
  }
  if (options.authApi) counts.authUsers = await reviewAuth.dropAuthUsers(options.authApi, key);
  return counts;
}

const RUN_ID = /^[A-Za-z0-9_-]{1,64}$/;

// Only the address's own runs go; a payment row is never picked, and a paid run keeps its payment the same way deleteAccount does.
async function deleteRuns(store, email, ids, opts) {
  const key = cleanEmail(email);
  const at = new Date((opts && opts.now) || Date.now()).toISOString();
  const counts = { deleted: 0, paymentsKept: 0, skipped: 0 };
  if (!key) return counts;
  for (const id of new Set((ids || []).map(String))) {
    const row = RUN_ID.test(id) && id.indexOf("paid-report-") !== 0 ? await store.get("url_reviews", id) : null;
    if (!row || cleanEmail(row.email) !== key || !row.report || PAYMENT_STATUSES.has(row.status)) {
      counts.skipped += 1;
      continue;
    }
    const linked = await byRun(store, [id]);
    for (const capture of linked.captures) await store.remove("url_review_captures", capture.id);
    for (const stop of linked.stops) await store.remove("url_review_stops", stop.id);
    if (isPayment(row) && !await store.get("url_reviews", "paid-report-" + id)) {
      await store.replace("url_reviews", id, paymentOnly(row, at));
      counts.paymentsKept += 1;
    } else {
      await store.remove("url_reviews", id);
    }
    counts.deleted += 1;
  }
  return counts;
}

module.exports = { exportAccount, deleteAccount, deleteRuns, isPayment, keeps, paymentOnly };
