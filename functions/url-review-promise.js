// The promise to an asker whose review failed for a reason on our side (#3079): the report by email once a re-run
// finishes, or an apology once the re-run window closes, with a code off their next review either way; a report that
// finishes after the apology still goes out, until PROMISE_GIVE_UP_DAYS, and then a last note (#3257).
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
// Past the deadline the rescue keeps trying, and a report that finishes is still sent, until this many days after the failure;
// then the asker gets a last note. Matches the rescue's RESCUE_DAYS.
const PROMISE_GIVE_UP_DAYS = 14;
// Re-runs one rescue tick starts, each up to 4 minutes, inside the job's 9-minute timeout.
const RESCUES_PER_TICK = 2;
const COUPON_DAYS = 90;
const DAY_MS = 86400000;
const HOUR_MS = 3600000;
const PREFIX = "SORRY-";
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
// open: waiting on a re-run; held: a re-run waits on the desk; delivered: the report went out;
// apologized: the window closed without a report, the rescue still tries; sent-late: the report went out after the apology;
// given-up: PROMISE_GIVE_UP_DAYS passed without a report, or the desk dropped the report before the apology; own-run: the asker reviewed the site again themselves.
const STATES = ["open", "held", "delivered", "apologized", "sent-late", "given-up", "own-run"];
// Still owed a report: a re-run that finishes goes to the asker.
const PENDING = ["open", "held", "apologized"];
const STATE_LABELS = {
  open: "open", held: "held on the desk", delivered: "report sent", apologized: "apology sent, still trying",
  "sent-late": "report sent late, after the apology", "given-up": "given up, last note sent", "own-run": "the asker ran it again"
};

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
  return { type: "error", error, code: "inconclusive", email: promise.email, coupon: promise.coupon, percent: promise.percent, hours: PROMISE_DEADLINE_H };
}

// The open promise behind a re-run group, and the failures that carry it. `rows` are the failures the plan was built from.
function groupPromise(group, rows) {
  const ids = new Set((group && group.failureIds) || []);
  return pendingPromise((Array.isArray(rows) ? rows : []).filter((row) => row && ids.has(row.id)));
}

const ageOf = (row, now) => (Number(now) || Date.now()) - Date.parse(row && row.at);
const withinGiveUp = (row, now) => ageOf(row, now) < PROMISE_GIVE_UP_DAYS * DAY_MS;

// The promise still owed on these failures (one code), with the ids that carry it, or null; with `now`, also null once
// PROMISE_GIVE_UP_DAYS passed. Its state is apologized once any of them got the apology, so the report mail says it is late.
function pendingPromise(rows, now) {
  const kept = (Array.isArray(rows) ? rows : []).filter((row) => row && row.id && row.promise && PENDING.includes(row.promise.state))
    .sort((a, b) => String(b.at).localeCompare(String(a.at)));
  if (!kept.length || (now && !withinGiveUp(kept[kept.length - 1], now))) return null;
  const state = kept.some((row) => row.promise.state === "apologized") ? "apologized" : kept[0].promise.state;
  return Object.assign({}, kept[0].promise, { state, url: kept[0].url || "", host: kept[0].host || "", ids: kept.map((row) => row.id), failedAt: String(kept[kept.length - 1].at || "") });
}

// What a promise becomes once its report went out.
const reportState = (promise) => (promise && promise.state === "apologized" ? "sent-late" : "delivered");

// Promises by code, oldest failure first: a retry of the same address shares its first failure's code and deadline.
function openByCode(rows, states) {
  const kept = states || ["open"];
  const byCode = new Map();
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const promise = row && row.promise;
    if (!row.id || !promise || !kept.includes(promise.state) || !promise.email) return;
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

// Owed reports a re-run has finished, by any path (a promised try, the daily re-run, the Mac, a re-run from the desk), at any
// time before PROMISE_GIVE_UP_DAYS: one held re-run per code, to send to the asker.
function finishedDue(rows, now) {
  return openByCode(rows, PENDING).filter((group) => withinGiveUp(group[0], now)).map((group) => {
    const done = group.slice().reverse().find((row) => row.rerun && row.rerun.status === "held" && row.rerun.id);
    return done ? { rerunId: String(done.rerun.id), code: group[0].promise.coupon || "", host: done.host || "", ids: group.map((row) => row.id) } : null;
  }).filter(Boolean);
}

// Promises still without a report PROMISE_GIVE_UP_DAYS after the failure: the asker gets a last note and keeps the code.
function giveUpsDue(rows, now) {
  return openByCode(rows, ["open", "apologized"]).filter((group) => !withinGiveUp(group[0], now)).map((group) => {
    const last = group[group.length - 1];
    return Object.assign({}, last.promise, {
      url: last.url || "", host: last.host || "", ids: group.map((row) => row.id), failedAt: String(group[0].at || ""), days: PROMISE_GIVE_UP_DAYS,
      key: String(last.url || "").toLowerCase() + "|" + String(last.email || "").toLowerCase()
    });
  });
}

// The fields a promise's failures take once it is settled, for a Firestore update with dotted paths.
function settled(state, extra) {
  return Object.assign({ "promise.state": state, "promise.closedAt": new Date().toISOString() }, extra || {});
}

// A line the desk shows on a promised failure or re-run.
function deskLabel(promise) {
  if (!promise || !promise.state) return "";
  const what = {
    open: "promised: report by email", held: "promised: waiting on your send", delivered: "promise kept: report sent", apologized: "promise late: apology sent, still trying",
    "sent-late": "promise kept late: report sent after the apology", "given-up": "promise given up: last note sent", "own-run": "promise settled: the asker ran it again"
  };
  return (what[promise.state] || "promised") + (promise.coupon ? " · " + promise.coupon + " " + (promise.percent || APOLOGY_PERCENT) + "%" : "");
}

module.exports = {
  APOLOGY_PERCENT, PROMISE_AUTO_SEND, PROMISE_DEADLINE_H, PROMISE_GIVE_UP_DAYS, PROMISE_TRIES_AT_H, RESCUES_PER_TICK, COUPON_DAYS, PREFIX, STATES, PENDING, STATE_LABELS,
  promised, couponCode, apologyCoupon, openPromiseFor, promiseOf, errorLine, groupPromise, pendingPromise, reportState, apologiesDue, rescuesDue, finishedDue, giveUpsDue,
  settled, deskLabel
};
