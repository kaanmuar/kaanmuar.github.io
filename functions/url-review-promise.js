// The promise to an asker whose review failed for a reason on our side (#3079): the report by email once a re-run
// finishes, or an apology once the re-run window closes, with a code off their next review either way.
const reviewFailures = require("./url-review-failures");
const core = require("./url-review-core");

// Off the asker's next review, in percent. discountFor caps any code at 50 and keeps the price above half the list.
const APOLOGY_PERCENT = 20;
// A finished re-run of a promised failure goes to the asker on its own; false holds it on the desk like any other re-run.
const PROMISE_AUTO_SEND = true;
// With no finished report this long after the failure, the asker gets the apology and keeps the code.
const PROMISE_DEADLINE_H = 48;
// Hours after the failure when a promised review runs again; the rescue job ticks every 15 minutes, so each slot can run up to a tick late.
const PROMISE_TRIES_AT_H = [0.5, 4, 12, 24, 40];
// Re-runs one rescue tick starts, each up to 4 minutes, inside the job's 9-minute timeout.
const RESCUES_PER_TICK = 2;
const COUPON_DAYS = 90;
const DAY_MS = 86400000;
const HOUR_MS = 3600000;
const PREFIX = "SORRY-";
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
// open: waiting on a re-run; held: a re-run waits on the desk; delivered: the report went out;
// apologized: the window closed without a report; own-run: the asker reviewed the site again themselves.
const STATES = ["open", "held", "delivered", "apologized", "own-run"];

const clip = (value, max) => String(value == null ? "" : value).trim().slice(0, max);
const lower = (value) => clip(value, 160).toLowerCase();

// Site-side causes keep their own message, as the asker or the site fixes those; a comparison keeps its own flow.
function promised(record) {
  const row = record || {};
  const cause = row.cause && row.cause.id;
  if (row.kind !== "failed" || row.source === "sweep" || !row.email || !cause) return false;
  if ((row.intake || {}).reasonCode === "compare") return false;
  return !reviewFailures.siteSide(row, cause);
}

function couponCode(randomInt) {
  return PREFIX + Array.from({ length: 8 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
}

function apologyCoupon(record, now) {
  const at = Number(now) || Date.now();
  const row = record || {};
  return {
    percent: APOLOGY_PERCENT,
    purposes: ["new-run", "report"],
    reportId: "",
    email: lower(row.email),
    maxUses: 1,
    uses: 0,
    source: "inconclusive",
    runId: clip(row.runId, 40),
    url: clip(row.url, 300),
    validUntil: new Date(at + COUPON_DAYS * DAY_MS).toISOString(),
    createdAt: new Date(at).toISOString(),
    expireAt: new Date(at + core.RETAIN_MS)
  };
}

const sameSite = (a, b) => lower(a).replace(/\/+$/, "") === lower(b).replace(/\/+$/, "");

// One code per failed review: a retry of the same address while its promise is still open keeps the first code.
// `rows` are the asker's failures with a promise.
function openPromiseFor(rows, url) {
  const row = (Array.isArray(rows) ? rows : [])
    .filter((item) => item && item.promise && item.promise.state === "open" && item.promise.coupon && sameSite(item.url, url))
    .sort((a, b) => String(b.at).localeCompare(String(a.at)))[0];
  return row ? row.promise : null;
}

// `coupon` is the url_review_coupons row with its `code`.
function promiseOf(record, coupon, now) {
  const row = record || {};
  const code = coupon || {};
  return {
    state: "open",
    at: new Date(Number(now) || Date.now()).toISOString(),
    email: clip(row.email, 160),
    name: clip(row.name, 120),
    lang: clip((row.intake || {}).lang, 2).toLowerCase() || "en",
    coupon: clip(code.code, 24),
    percent: Number(code.percent) || APOLOGY_PERCENT,
    validUntil: clip(code.validUntil, 40)
  };
}

// The stream's last line. An open promise turns the failure into the inconclusive splash; anything else keeps its message.
function errorLine(message, promise) {
  const error = message || "The review failed.";
  if (!promise) return { type: "error", error };
  return { type: "error", error, code: "inconclusive", email: promise.email, coupon: promise.coupon, percent: promise.percent };
}

// The open promise behind a re-run group, and the failures that carry it. `rows` are the failures the plan was built from.
function groupPromise(group, rows) {
  const ids = new Set((group && group.failureIds) || []);
  const kept = (Array.isArray(rows) ? rows : []).filter((row) => row && ids.has(row.id) && row.promise && row.promise.state === "open")
    .sort((a, b) => String(b.at).localeCompare(String(a.at)));
  if (!kept.length) return null;
  return Object.assign({}, kept[0].promise, { ids: kept.map((row) => row.id), failedAt: String(kept[kept.length - 1].at || "") });
}

// Open promises by code, oldest failure first: a retry of the same address shares its first failure's code and deadline.
function openByCode(rows) {
  const byCode = new Map();
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const promise = row && row.promise;
    if (!row.id || !promise || promise.state !== "open" || !promise.email) return;
    const key = promise.coupon || row.id;
    byCode.set(key, (byCode.get(key) || []).concat(row));
  });
  return Array.from(byCode.values()).map((group) => group.sort((a, b) => String(a.at).localeCompare(String(b.at))));
}

// Open promises past PROMISE_DEADLINE_H, one apology per code.
function apologiesDue(rows, now) {
  const at = Number(now) || Date.now();
  return openByCode(rows).filter((group) => Date.parse(group[0].at) <= at - PROMISE_DEADLINE_H * HOUR_MS).map((group) => {
    const last = group[group.length - 1];
    return Object.assign({}, last.promise, { url: last.url || "", host: last.host || "", ids: group.map((row) => row.id), failedAt: String(group[0].at || ""), hours: PROMISE_DEADLINE_H });
  });
}

// Promised reviews whose next PROMISE_TRIES_AT_H slot has come, as re-run groups (rerunPlan's shape), nearest deadline first.
function rescuesDue(rows, now, limit) {
  const at = Number(now) || Date.now();
  const due = [];
  openByCode(rows).forEach((group) => {
    const first = group[0];
    const last = group[group.length - 1];
    const age = at - Date.parse(first.at);
    const tries = Math.max(...group.map((row) => Number(row.promise.tries) || 0));
    if (!(age >= 0) || age >= PROMISE_DEADLINE_H * HOUR_MS || tries >= PROMISE_TRIES_AT_H.length || age < PROMISE_TRIES_AT_H[tries] * HOUR_MS) return;
    const options = last.options || {};
    due.push({
      key: String(last.url || "").toLowerCase() + "|" + String(last.email || "").toLowerCase(),
      url: last.url,
      host: last.host || "",
      name: last.name || "",
      email: last.email || "",
      at: last.at,
      failureIds: group.map((row) => row.id),
      trigger: { id: "promise", ref: "#3079", label: "Promised re-run " + (tries + 1) + " of " + PROMISE_TRIES_AT_H.length + ", " + Math.round(age / HOUR_MS) + " h after the failure, before the " + PROMISE_DEADLINE_H + " h deadline" },
      options: Object.assign({}, options, { frameworks: (options.frameworks || []).length ? options.frameworks : reviewFailures.RERUN_FRAMEWORKS }),
      intake: last.intake || {},
      tries: tries + 1,
      promise: Object.assign({}, last.promise, { ids: group.map((row) => row.id), failedAt: String(first.at || "") })
    });
  });
  return due.sort((a, b) => String(a.promise.failedAt).localeCompare(String(b.promise.failedAt))).slice(0, Number(limit) || RESCUES_PER_TICK);
}

// The fields a promise's failures take once it is settled, for a Firestore update with dotted paths.
function settled(state, extra) {
  return Object.assign({ "promise.state": state, "promise.closedAt": new Date().toISOString() }, extra || {});
}

// A line the desk shows on a promised failure or re-run.
function deskLabel(promise) {
  if (!promise || !promise.state) return "";
  const what = { open: "promised: report by email", held: "promised: waiting on your send", delivered: "promise kept: report sent", apologized: "promise closed: apology sent", "own-run": "promise settled: the asker ran it again" };
  return (what[promise.state] || "promised") + (promise.coupon ? " · " + promise.coupon + " " + (promise.percent || APOLOGY_PERCENT) + "%" : "");
}

module.exports = {
  APOLOGY_PERCENT, PROMISE_AUTO_SEND, PROMISE_DEADLINE_H, PROMISE_TRIES_AT_H, RESCUES_PER_TICK, COUPON_DAYS, PREFIX, STATES,
  promised, couponCode, apologyCoupon, openPromiseFor, promiseOf, errorLine, groupPromise, apologiesDue, rescuesDue, settled, deskLabel
};
