/* Jarvis countdown (#1977): the risky actions Jarvis starts by itself wait in jarvis_countdowns for
   actions.countdownHours (2 by default) before they run. Each one pushes "Doing X in 2 h" with Do it now and
   Cancel, then a push when it starts and one with the result; the web and the app list the pending ones.

   kinds      email     third-party email: held re-runs to their askers, owner notices, the jobs that mail people,
                        launching a draft outreach campaign
              post      public posts off schedule: retrying failed social posts, a failed posting job or workflow re-run
              code      code reaching production: merging a green PR (labelled jarvis-merge, or a safe PageSpeed PR),
                        the Pages and app workflows
              outreach  resuming the mailboxes Jarvis paused (jarvis_outreach_pauses)
              repo      GitHub housekeeping (#2526): updating PR branches, deleting merged branches, closing issues,
                        removing merged worktrees through the Mac uploader; merges and reverts count as code
              money     money other than refunds; Jarvis has no such action yet
   Refunds and deletes are never queued: they wait for a click.
   A countdown starts at any hour. One that ends at night holds email and posts until Bogotá 08:00-21:00, and owner
   notices until their Ley 2300 hours (Monday-Saturday 08:00-19:00); the rest runs right away. Do it now skips the
   daytime window but not the notice hours. Only what Jarvis starts goes through here: Carlos's own clicks run at once.

   jarvis_countdowns/<id> = { id, action, target, label, kind, key, count, payload, why, by, confidence, status
   (waiting, running, done, failed, cancelled), day, createdAt, dueAt, hold, startedAt, endedAt, result, decidedBy }.
   The same collection keeps the PageSpeed PR records (jarvis-pagespeed.js, pagespeed-<pr>, with state and no status),
   which the queries here never match. */

const crypto = require("crypto");
const core = require("./jarvis-core");
const jarvisLog = require("./jarvis-log");

const KINDS = { email: "third-party email", post: "public post", code: "code reaching production", outreach: "resuming outreach", repo: "GitHub housekeeping", money: "money" };
const DAYTIME = { from: 8, to: 21 };
const OPEN = ["waiting", "running"];
const MERGE_LABEL = "jarvis-merge";
const STUCK = 30 * 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;
const EXTRA_LABELS = { "merge-pr": "Merge a green PR", money: "Move money" };
const MAIL_JOBS = ["sendOwnerNotices", "sendReviewNotes", "jarvisWatch"];
const JOB_ACTIONS = ["run-job", "rerun-job", "refresh-stale"];

const text = (value, max) => String(value === null || value === undefined ? "" : value).replace(/\s+/g, " ").trim().slice(0, max);
const actions = () => require("./jarvis-actions");
const lower = (s) => s.charAt(0).toLowerCase() + s.slice(1);

// The action that runs: a Gemini pick carries its catalog action and target. Jobs and runs name theirs in the payload.
function inner(row) {
  const p = row.payload || {};
  if (row.action === "ai-fix" && p.action) return { action: p.action, target: p.target };
  if (JOB_ACTIONS.includes(row.action)) return { action: row.action, target: p.job || row.target };
  if (row.action === "rerun-ci") return { action: row.action, target: p.name || row.target };
  return { action: row.action, target: row.target };
}

function kindOf(action, target) {
  if (action === "rerun-held" || action === "resend-notices" || action === "launch-campaign") return "email";
  if (JOB_ACTIONS.includes(action)) return MAIL_JOBS.includes(target) ? "email" : "post";
  if (action === "rerun-ci") return /^pages$|jarvis android/i.test(String(target)) ? "code" : "post";
  if (action === "retry-social") return "post";
  if (action === "merge-pr" || action === "gh-merge-pr" || action === "gh-revert") return "code";
  if (/^gh-/.test(String(action))) return "repo";
  if (action === "resume-outreach") return "outreach";
  return "money";
}

function labelOf(row) {
  const a = inner(row).action;
  return actions().LABELS[a] || EXTRA_LABELS[a] || a;
}

const daytime = (t) => { const h = core.zoneParts(new Date(t)).hour; return h >= DAYTIME.from && h < DAYTIME.to; };

// The window a row may run in: owner notices keep their legal hours, other email and posts wait for daytime.
function windowOf(row) {
  const a = inner(row).action;
  if (a === "resend-notices") return { open: (t) => actions().noticeHours(t), why: "Owner notices go out Monday to Saturday, 08:00-19:00 Bogotá." };
  if (row.kind === "email" || row.kind === "post") return { open: daytime, why: "Email and posts wait for 08:00-21:00 Bogotá." };
  return null;
}

// The first quarter hour at or after t inside the window.
function nextOpen(t, open) {
  if (open(t)) return t;
  const step = 15 * 60 * 1000;
  let at = Math.ceil(t / step) * step;
  for (let i = 0; i < 8 * 96 && !open(at); i += 1) at += step;
  return at;
}

// When a row runs: its due time, or the next open window after it.
function runsAt(row) {
  const due = Date.parse(row.dueAt);
  const w = windowOf(row);
  return w ? nextOpen(due, w.open) : due;
}

// Bogotá keeps UTC-5 all year.
const bogotaTime = (t) => new Date(t - 5 * 3600000).toISOString().slice(11, 16);
const hoursText = (h) => (h >= 1 ? (Number.isInteger(h) ? h : h.toFixed(1)) + " h" : Math.round(h * 60) + " min");

function idOf(action, target, part) {
  return crypto.createHash("sha1").update([action, target, part].join("|")).digest("hex").slice(0, 24);
}

const col = (db) => db.collection("jarvis_countdowns");
const cleanId = (id) => String(id || "").replace(/[^a-f0-9]/g, "").slice(0, 24) || "-";

async function get(db, id) {
  const snap = await col(db).doc(cleanId(id)).get();
  return snap.exists ? snap.data() : null;
}

async function open(db) {
  const snap = await col(db).where("status", "in", OPEN).limit(100).get().catch(() => null);
  return snap ? snap.docs.map((doc) => doc.data()) : [];
}

// Waiting and running countdowns count against the day's cap when queued; a cancelled one gives its slot back.
function queued(rows, action, day) {
  return (rows || []).filter((r) => r.action === action && r.day === day && OPEN.includes(r.status)).reduce((n, r) => n + (Number(r.count) || 1), 0);
}

/* Queues one countdown. entry = { action, target, key, count, payload, why, by, confidence, part, kind, label }; part makes the
   id (the day by default, so an action and target is queued once a day). Returns { row } when queued, or
   { existing } with the row already there. */
async function queue(db, entry, { now, hours }) {
  const day = core.zoneParts(new Date(now)).day;
  const id = idOf(entry.action, entry.target, entry.part || day);
  const kind = entry.kind || kindOf(inner(entry).action, inner(entry).target);
  const row = {
    id, action: text(entry.action, 40), target: text(entry.target, 200), kind, key: text(entry.key, 140), count: Math.max(1, Math.round(Number(entry.count) || 1)),
    payload: entry.payload || {}, why: text(entry.why, 300), by: entry.by === "gemini" ? "gemini" : "jarvis", confidence: typeof entry.confidence === "number" ? entry.confidence : null,
    status: "waiting", day, createdAt: new Date(now).toISOString(), dueAt: new Date(now + hours * 3600000).toISOString(), hold: "", startedAt: "", endedAt: "", result: "", decidedBy: "",
    expireAt: new Date(now + 60 * DAY)
  };
  row.label = text(entry.label, 80) || labelOf(row);
  const ref = col(db).doc(id);
  try {
    await ref.create(row);
    await jarvisLog.log(null, { source: "countdown", level: "info", ref: "countdown:" + id, text: "Queued " + lower(row.label) + ": " + row.target + ", runs at " + bogotaTime(runsAt(row)) + " Bogotá" + (row.why ? " · " + row.why : "") });
    return { row };
  } catch (error) {
    const snap = await ref.get().catch(() => null);
    if (snap && snap.exists) return { existing: snap.data() };
    throw error;
  }
}

/* Runs a row's action. ops as in jarvis-actions autoRun, plus retrySocial() -> { note },
   resumeMailboxes(emails) -> { resumed: [email], left: [email: why] }, launchCampaigns(ids) -> { launched: [name], left: [name: why] }, mergePr(number, sha) -> { merged, sha } and
   pagespeedMerge(number, sha) -> { message }. Returns { count, detail }; throws when it did nothing. */
async function execute(row, ops, now) {
  const A = actions();
  const { action, target } = inner(row);
  const p = row.payload || {};
  if (JOB_ACTIONS.includes(action)) { await ops.runJob(target); return { count: 1, detail: "Started " + target + "." }; }
  if (action === "rerun-ci" && p.pr) {
    const res = await ops.refreshPr(p.pr);
    if (!res.refreshed) throw new Error("#" + p.pr + " was not reopened: " + res.skipped + ".");
    return { count: 1, detail: "Closed and reopened #" + p.pr + " for a fresh merge with main." };
  }
  if (action === "rerun-ci" && p.workflow) { await ops.dispatch(p.workflow); return { count: 1, detail: "Started " + (p.name || p.workflow) + " on main's newest commit." }; }
  if (action === "rerun-ci" && p.run) { await ops.rerunRun(p.run); return { count: 1, detail: "Re-running the failed jobs of run " + p.run + "." }; }
  if (action === "rerun-ci") {
    const res = await ops.rerunCi(target);
    if (res.already === "re-run once") throw new Error("Run " + res.run + " failed again after one re-run; it is yours now.");
    return { count: res.already ? 0 : 1, detail: res.already ? "Already " + res.already + "." : "Re-running run " + res.run + "." };
  }
  if (action === "publish-hub") { await ops.publishHub(); return { count: 1, detail: "Started refreshSocialHubStats." }; }
  if (action === "retry-social") { const res = await ops.retrySocial(); return { count: 1, detail: text(res.note, 300) || "Started the posting workflows." }; }
  if (action === "rerun-held") {
    const ids = new Set((p.items || []).map((i) => i.id));
    const held = (await ops.held()).filter((h) => ids.has(h.id));
    let sent = 0;
    const left = [];
    for (const h of held) {
      const ok = A.cleanRerun(h.data);
      if (!ok.ok) { left.push((h.data.host || h.id) + ": " + ok.reason); continue; }
      const res = await ops.release(h.id, "jarvis");
      if (res) sent += 1;
    }
    if (!sent && !held.length) throw new Error("None of them is held any more.");
    return { count: sent, detail: "Sent " + sent + " of " + ids.size + " to the askers" + (left.length ? "; left: " + left.join(", ") : "") + "." };
  }
  if (action === "resend-notices") {
    if (!ops.noticesLive) throw new Error("Owner notices are off (OWNER_NOTICES_LIVE is not 1).");
    if (!A.noticeHours(now)) throw new Error("Owner notices go out Monday to Saturday, 08:00-19:00 Bogotá.");
    const ids = new Set((p.items || []).map((i) => i.id));
    const [list, budget] = await Promise.all([ops.failedNotices(), ops.noticeBudget()]);
    const due = list.filter((n) => ids.has(n.id));
    let sent = 0, failed = 0;
    for (const n of due.slice(0, Math.max(0, budget))) {
      const res = await ops.resend(n.ref, "jarvis");
      if (res.outcome === "sent") sent += 1; else if (res.outcome !== "skipped") failed += 1;
    }
    if (!due.length) throw new Error("None of them is pending any more.");
    return { count: sent, detail: "Sent " + sent + " of " + due.length + (failed ? ", " + failed + " failed" : "") + (due.length > budget ? "; today's notice budget ran out" : "") + "." };
  }
  if (action === "resume-outreach") {
    const res = await ops.resumeMailboxes(p.emails || []);
    if (!res.resumed.length) throw new Error("Nothing resumed" + (res.left.length ? ": " + res.left.join("; ") : "") + ".");
    return { count: res.resumed.length, detail: "Resumed " + res.resumed.join(", ") + (res.left.length ? "; left: " + res.left.join("; ") : "") + "." };
  }
  if (action === "launch-campaign") {
    const res = await ops.launchCampaigns((p.items || []).map((i) => i.id));
    if (!res.launched.length) throw new Error("Nothing launched" + (res.left.length ? ": " + res.left.join("; ") : "") + ".");
    return { count: res.launched.length, detail: "Launched " + res.launched.join(", ") + (res.left.length ? "; left: " + res.left.join("; ") : "") + "." };
  }
  if (action === "merge-pr" && p.pagespeed) { const res = await ops.pagespeedMerge(p.number, p.sha); return { count: 1, detail: res.message }; }
  if (action === "merge-pr") { const res = await ops.mergePr(p.number, p.sha); return { count: 1, detail: "Merged #" + p.number + " at " + String(res.sha || p.sha || "").slice(0, 7) + "." }; }
  // #2526: the payload carries the numbers, branches, sha or path; gh-remove-worktree only queues it for the Mac.
  if (/^gh-/.test(action) && action !== "gh-agent" && ops.githubAct) {
    const res = await ops.githubAct(action, Object.assign({}, p, { target }));
    return { count: res.count || 1, detail: text(res.detail, 300) };
  }
  throw new Error("Jarvis has no action for this yet; do it by hand.");
}

const tabOf = (row) => (/^gh-/.test(inner(row).action) ? "github" : "systems");

function queuedMessage(row, hours) {
  const at = runsAt(row);
  const late = at > Date.parse(row.dueAt);
  return {
    kind: "alerts", tab: tabOf(row), tag: "jarvis-countdown-" + row.id, ref: "countdown:" + row.id,
    title: ("Doing " + lower(row.label) + (late ? " at " + bogotaTime(at) + " Bogotá" : " in " + hoursText(hours))).slice(0, 120),
    body: (row.target + ". " + (row.why || KINDS[row.kind] + ".")).slice(0, 220),
    lines: [KINDS[row.kind] ? "Kind: " + KINDS[row.kind] : "", row.confidence !== null ? "Gemini confidence " + row.confidence : ""].filter(Boolean),
    actions: [{ act: "now", label: "Do it now" }, { act: "cancel", label: "Cancel" }]
  };
}

function startMessage(row) {
  return { kind: "alerts", tab: tabOf(row), tag: "jarvis-countdown-" + row.id, title: ("Doing " + lower(row.label) + " now").slice(0, 120), body: row.target.slice(0, 220) };
}

function resultMessage(row) {
  const gh = tabOf(row) === "github";
  return { kind: "alerts", tab: tabOf(row), tag: "jarvis-countdown-" + row.id, title: ((row.status === "done" ? (gh ? "Jarvis fixed: " : "Done: ") : "Failed: ") + lower(row.label)).slice(0, 120), body: (row.target + ". " + row.result).slice(0, 220) };
}

// Moves a row from one status to the next inside a transaction; throws when it is no longer in `from`.
async function claim(db, id, from, patch) {
  const ref = col(db).doc(cleanId(id));
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error("That countdown is gone.");
    const row = snap.data();
    if (!from.includes(row.status)) throw new Error("That countdown is already " + row.status + ".");
    tx.update(ref, patch);
    return Object.assign({}, row, patch);
  });
}

/* Starts a waiting countdown: by is "jarvis" when it came due, or who pressed Do it now. ops.push(msg) sends a push. */
async function start(db, id, { ops, now, by }) {
  const A = actions();
  const forced = by !== "jarvis";
  if (forced) {
    const snap = await col(db).doc(cleanId(id)).get();
    const row = snap.exists ? snap.data() : null;
    if (row && row.status === "waiting" && inner(row).action === "resend-notices" && !A.noticeHours(now)) throw new Error("Owner notices go out Monday to Saturday, 08:00-19:00 Bogotá; it waits for them.");
  }
  let row = await claim(db, id, ["waiting"], { status: "running", startedAt: new Date(now).toISOString(), hold: "", decidedBy: forced ? text(by, 120) : "" });
  if (ops.push) await ops.push(startMessage(row)).catch(() => null);
  await jarvisLog.log(null, { source: "countdown", level: "info", ref: "countdown:" + row.id, text: "Started " + lower(row.label) + ": " + row.target + (forced ? " (Do it now by " + by + ")" : " (countdown ended)") });
  let out;
  try { out = Object.assign({ status: "done" }, await execute(row, ops, now)); } catch (error) { out = { status: "failed", count: 0, detail: text(error.message || error, 300) }; }
  const patch = { status: out.status, result: text(out.detail, 300), endedAt: new Date().toISOString() };
  await col(db).doc(row.id).update(patch);
  row = Object.assign(row, patch);
  await A.log(db, { action: row.action, mode: "auto", status: out.status, count: out.count, target: row.target, key: row.key, detail: (forced ? "Do it now: " : "After the countdown: ") + out.detail,
    by: forced ? "jarvis, Do it now by " + by : "jarvis (countdown)", source: "countdown" }, now);
  if (ops.push) await ops.push(resultMessage(row)).catch(() => null);
  return row;
}

async function cancel(db, id, { now, by, why }) {
  const row = await claim(db, id, ["waiting"], { status: "cancelled", endedAt: new Date(now).toISOString(), decidedBy: text(by, 120), result: text(why, 300) || "Cancelled." });
  await actions().log(db, { action: row.action, mode: by === "jarvis" ? "auto" : "click", status: "skipped", target: row.target, key: row.key, detail: "Countdown cancelled" + (why ? ": " + why : "."), by, source: "countdown" }, now);
  return row;
}

// A notification button or a web/app button: "now" runs it, "cancel" drops it.
async function decide(db, { id, act }, { ops, now, by }) {
  if (act === "cancel") { const row = await cancel(db, id, { now, by }); return { message: "Cancelled: " + lower(row.label) + ".", countdown: row }; }
  if (act !== "now") throw new Error("Do it now or Cancel only.");
  const row = await start(db, id, { ops, now, by });
  return { message: (row.status === "done" ? "Done: " : "Failed: ") + row.result, countdown: row };
}

/* Every ten minutes: due rows start (email and posts at night wait for their window); a row stuck in running is
   marked failed. Returns { started, held, stuck }. */
async function runDue({ db, now, ops }) {
  const rows = await open(db);
  const out = { started: [], held: [], stuck: [] };
  for (const r of rows.filter((x) => x.status === "running" && now - Date.parse(x.startedAt) > STUCK)) {
    await col(db).doc(r.id).update({ status: "failed", result: "It stopped without an answer.", endedAt: new Date(now).toISOString() });
    out.stuck.push(r.id);
  }
  for (const r of rows.filter((x) => x.status === "waiting" && Date.parse(x.dueAt) <= now).sort((a, b) => a.dueAt.localeCompare(b.dueAt))) {
    const w = windowOf(r);
    if (w && !w.open(now)) {
      if (r.hold !== w.why) await col(db).doc(r.id).update({ hold: w.why });
      out.held.push(r.id);
      continue;
    }
    try { out.started.push(await start(db, r.id, { ops, now, by: "jarvis" })); } catch (error) { /* taken by a button meanwhile */ }
  }
  return out;
}

function summary(out) {
  const o = out || {};
  const done = (o.started || []).filter((r) => r.status === "done").length;
  return (o.started || []).length + " started (" + done + " done), " + (o.held || []).length + " waiting for daytime" + ((o.stuck || []).length ? ", " + o.stuck.length + " stuck" : "");
}

// For the actions op and the snapshot: what waits, newest first, and what ended in the last day.
async function view(db, now) {
  const snap = await col(db).orderBy("createdAt", "desc").limit(40).get().catch(() => null);
  const rows = snap ? snap.docs.map((doc) => { const d = doc.data(); delete d.expireAt; return d; }) : [];
  const since = new Date(now - DAY).toISOString();
  const shape = (r) => Object.assign(r, { runsAt: r.status === "waiting" ? new Date(runsAt(r)).toISOString() : "", kindLabel: KINDS[r.kind] || r.kind });
  return {
    pending: rows.filter((r) => OPEN.includes(r.status)).map(shape),
    recent: rows.filter((r) => !OPEN.includes(r.status) && (r.endedAt || r.createdAt) >= since).slice(0, 10).map(shape)
  };
}

module.exports = {
  KINDS, DAYTIME, OPEN, MERGE_LABEL, kindOf, labelOf, daytime, windowOf, nextOpen, runsAt, idOf, get, open, queued, queue, execute,
  queuedMessage, startMessage, resultMessage, start, cancel, decide, runDue, summary, view
};
