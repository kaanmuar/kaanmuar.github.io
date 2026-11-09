/* Jarvis actions (#1337): the safe actions Jarvis runs on its own every hour (inside jarvisWatch), within daily caps,
   and the log of every action, automatic or clicked, in jarvis_actions.

   rerun-held      send held re-runs to their askers; on its own only clean ones (a complete report with a score and an
                   asker's address), after the countdown; the rest wait for a click
   resend-notices  re-send owner notices whose last send failed: Monday-Saturday 08:00-19:00 Bogotá (Ley 2300 de 2023),
                   under NOTICE_TRIES, inside the day's owner-notice budget and only while OWNER_NOTICES_LIVE=1, click or
                   not; on its own after the countdown
   publish-hub     run refreshSocialHubStats when the hub stats are stale
   run-job         clicked only: run a scheduled job again

   #1977, each at most once per failure:
   rerun-job       a scheduled job whose last run failed (ops_runs ok=false) is started again once per failed run
   rerun-ci        a failed GitHub Actions run on main or a Jarvis branch (JARVIS_BRANCH: jarvis/..., and #1978's
                   pagespeed/safe-<day> and pagespeed/ai-<day>) gets its failed jobs re-run once (attempt 1 only);
                   a failed PR run on one is closed and reopened instead, once per main commit, since a re-run tests
                   the old merge (#2245). A push or manual run on main that main has since moved past starts again on
                   main's newest commit instead (#2409). Other chats' branches and PRs are left alone.
   refresh-stale   a scheduled job overdue by its gap is started once a day
   rerun-reviews   rerunReviewFailures starts when a FIXES row is newer than its last run
   pause-outreach  an active mailbox is paused while its domain's DNS fails, its warm-up is off or its score is under
                   the warm-up threshold; after RESUME_PASSES healthy hourly checks resume-outreach goes on the countdown,
                   which trouble coming back cancels
   retry-social    failed social posts are posted again after the countdown

   #2338, from the addresses source (jarvis-addresses.js), each at most once per occurrence of a problem:
   enable-warmup   an Instantly mailbox with warm-up off gets it turned on, before the pause loop, so it is healed
                   rather than paused
   restore-alias   a missing required ImprovMX alias (canary, postmaster, abuse) is added back
                   what Jarvis cannot fix (a mailbox to reconnect, DNS, a blocked Microsoft 365 user, a failed fix) is
                   pushed once per occurrence; jarvis_watch/addresses keeps which, so a problem that clears and comes
                   back pushes again
   merge-pr        an open PR labelled jarvis-merge, green and mergeable, squash-merged after the countdown
   launch-campaign #2475: an Instantly campaign still a draft with leads, steps, a mailbox and a start date at most
                   LAUNCH_DAYS away (jarvis-marketing.js launchReady) is activated after the countdown, one countdown per
                   campaign and start date, so one Carlos cancels stays a draft
   index-submit    logged by the Monday jarvisIndexPush job (#2480): the sitemap pages missing from Brave's index sent to
                   IndexNow and Brave's Submit URL form (jarvis-index.js)
   #2660, owner tags (owner-tags.js):
   owner-tags-approve-verified  suggested accounts whose handle resolves, or that share an approved owner's handle on
                   another network, are approved, within the cap; the rest wait for Carlos
   owner-tags-block  the author of a comment under our owner-tags comment that asks us to stop ("stop tagging", "no me
                   etiqueten", "spam") is blocked and its queued tags dismissed, once per account
   ai-ask, ai-fix  open alerts no rule handles go to Gemini once per alert set and day, AI_CALLS a day; it may only pick
                   from AI_CATALOG, and a pick runs alone at confidence >= settings.confidence (the risky ones after the
                   countdown); the rest become proposals
   #2526, from the github-work source (core.githubTargets, the same lists the briefing reads; jarvis-github-fix.js does them):
   gh-board-sync      a board item in the wrong column moves to the one it should be in, once per item and column
   gh-orphan-ticket   a PR that names no ticket gets one filed (kind:request, in Dev) and named on the PR, once per PR
   gh-update-pr       PRs behind main that are green and idle for a day get main merged in, after the countdown
   gh-revert          main went red after its HEAD commit: a revert PR, after the countdown
   gh-delete-branch   merged branches without a live worktree are deleted, after the countdown
   gh-remove-worktree a merged, clean worktree no chat holds is queued for the Mac uploader, after the countdown
   gh-merge-pr, gh-close-issue  on a click or a Gemini pick only; PRs labelled jarvis-merge merge through merge-pr
   gh-agent           a Cursor cloud agent; never on its own, every launch is Carlos's click
   gh-quarantine, gh-security-ticket  file a Backlog bug for a flaky workflow or a security alert, on a click only (#2808)
   gh-dismiss-alert, gh-dismiss-low  dismiss security alerts; only on Carlos's click, never a Gemini pick (GH_CLICK_ONLY)
   Jobs and workflows that mail third parties, post in public or deploy (RISKY_JOBS, RISKY_CI) run on their own only
   after the countdown (jarvis-countdown.js), which Carlos can cancel or run at once. Pages on main's newest commit
   runs at once: it publishes only what is merged already.

   jarvis_settings/main.actions = { auto, caps: { action: per day }, confidence, countdownHours }. A click is not capped
   by Jarvis's own caps; a countdown counts against its cap from the moment it is queued. */

const crypto = require("crypto");
const core = require("./jarvis-core");
const addresses = require("./jarvis-addresses");
const jarvisLog = require("./jarvis-log");

const SAFE = core.SAFE_ACTIONS;
const CAPS = { "rerun-held": 10, "resend-notices": 10, "publish-hub": 2, "rerun-job": 3, "rerun-ci": 5, "refresh-stale": 6, "rerun-reviews": 2, "ai-fix": 5, "retry-social": 3, "resume-outreach": 1, "merge-pr": 3, "enable-warmup": 2, "restore-alias": 2, "launch-campaign": 10,
  "gh-board-sync": 10, "gh-orphan-ticket": 5, "gh-update-pr": 5, "gh-merge-pr": 3, "gh-revert": 1, "gh-delete-branch": 2, "gh-close-issue": 5, "gh-remove-worktree": 5,
  "owner-tags-approve-verified": 20, "owner-tags-block": 10 };
const LABELS = {
  "rerun-held": "Send held re-runs", "resend-notices": "Re-send failed owner notices", "publish-hub": "Publish the Social hub", "run-job": "Run a job again", "rerun-ci": "Re-run failed CI jobs",
  "rating-decide": "Decide ratings", "brief-mark": "Snooze or dismiss a briefing line", "rerun-job": "Re-run a failed job", "refresh-stale": "Refresh stale data", "rerun-reviews": "Re-run reviews after a fix",
  "pause-outreach": "Pause an outreach mailbox", "resume-outreach": "Resume outreach mailboxes", "retry-social": "Retry failed social posts", "ai-ask": "Ask the AI what to fix", "ai-fix": "Run a fix the AI picked",
  "merge-pr": "Merge a green PR", "index-submit": "Send missing pages to search engines", "enable-warmup": "Turn mailbox warm-up back on", "restore-alias": "Restore a missing alias", "launch-campaign": "Launch a draft campaign",
  "pagespeed-merge": "Merge PageSpeed fixes", "pagespeed-close": "Close PageSpeed fixes", "pagespeed-run": "Start the PageSpeed run",
  "gh-board-sync": "Sync the board", "gh-orphan-ticket": "File a ticket for the PR", "gh-update-pr": "Update the PR with main", "gh-merge-pr": "Merge the green PR",
  "gh-revert": "Open a revert PR", "gh-delete-branch": "Delete merged branches", "gh-close-issue": "Close the issue", "gh-remove-worktree": "Remove the merged worktree",
  "gh-agent": "Launch a Cursor fix agent", "gh-diagnose": "Diagnose a failed run",
  "gh-quarantine": "File a flaky-workflow ticket", "gh-security-ticket": "File a ticket for a security alert", "gh-dismiss-alert": "Dismiss a security alert", "gh-dismiss-low": "Dismiss the low security alerts",
  "owner-tags-approve-verified": "Approve verified owner-tag accounts", "owner-tags-block": "Block an account that asked us to stop tagging"
};
const GH_ACTIONS = ["gh-board-sync", "gh-orphan-ticket", "gh-update-pr", "gh-merge-pr", "gh-revert", "gh-delete-branch", "gh-close-issue", "gh-remove-worktree", "gh-agent",
  "gh-quarantine", "gh-security-ticket", "gh-dismiss-alert", "gh-dismiss-low"];
const GH_RISKY = ["gh-update-pr", "gh-merge-pr", "gh-revert", "gh-delete-branch", "gh-close-issue", "gh-remove-worktree"];
// Never run by Jarvis itself or a Gemini pick, whatever the catalog says: only Carlos's click.
const GH_CLICK_ONLY = ["gh-agent", "gh-dismiss-alert", "gh-dismiss-low"];
// A Gemini pick's GitHub action: the catalog().github list its argument must be in, and the argument's name.
const GH_PICKS = { "gh-board-sync": ["drift", "number"], "gh-orphan-ticket": ["orphans", "pr"], "gh-update-pr": ["behind", "pr"], "gh-merge-pr": ["green", "pr"],
  "gh-revert": ["mainBroken", "sha"], "gh-delete-branch": ["merged", "branch"], "gh-remove-worktree": ["worktrees", "path"] };
const NOTICE_TRIES = 3;
const NOTICE_HOURS = { from: 8, to: 19 };
const CONFIDENCE = 0.8;
const COUNTDOWN_HOURS = 2;
const AI_CALLS = 24;
const RESUME_PASSES = 2;
const RISKY_JOBS = ["sendOwnerNotices", "sendReviewNotes", "dispatchFacebookQueue", "ensureLiveReportsBatch", "jarvisWatch", "ownerTags"];
const RISKY_CI = /live reports|buffer batch|facebook|bluesky|mastodon|social inbox|^pages$|jarvis android/i;
const PAGES_CI = /^pages$/i;
const JARVIS_BRANCH = /^(jarvis|pagespeed)\//;
const AI_CATALOG = {
  "run-job": "start a scheduled job again; args { \"job\": one of jobs }",
  "rerun-ci": "re-run the failed jobs of a GitHub Actions workflow; args { \"workflow\": one of workflows }",
  "publish-hub": "refresh the Social hub stats; args {}",
  "gh-board-sync": "move a drifted board item to the column it should be in; args { \"number\": one of github.drift }",
  "gh-orphan-ticket": "file a ticket for a PR that names none and link it on the PR; args { \"pr\": one of github.orphans }",
  "gh-update-pr": "merge main into a PR branch that is behind; args { \"pr\": one of github.behind }",
  "gh-merge-pr": "squash-merge a green, mergeable PR; args { \"pr\": one of github.green }",
  "gh-revert": "open a revert PR for the main commit that turned CI red; args { \"sha\": one of github.mainBroken }",
  "gh-delete-branch": "delete a merged branch; args { \"branch\": one of github.merged }",
  "gh-remove-worktree": "remove a merged local worktree through the Mac uploader; args { \"path\": one of github.worktrees }",
  "owner-tags-approve-verified": "approve suggested owner-tag accounts whose handle resolves or matches an owner's handle on another network; args {}"
};
const DAY = 24 * 60 * 60 * 1000;

const text = (value, max) => String(value === null || value === undefined ? "" : value).replace(/\s+/g, " ").trim().slice(0, max);

function cleanSettings(saved) {
  const s = saved || {};
  const caps = {};
  Object.keys(CAPS).forEach((key) => {
    const n = Number(s.caps && s.caps[key]);
    caps[key] = Number.isFinite(n) && s.caps[key] !== "" && s.caps[key] !== null ? Math.max(0, Math.min(100, Math.round(n))) : CAPS[key];
  });
  const set = (v) => v !== "" && v !== null && v !== undefined && Number.isFinite(Number(v));
  return {
    auto: typeof s.auto === "boolean" ? s.auto : true, caps,
    confidence: set(s.confidence) ? Math.max(0.5, Math.min(1, Math.round(Number(s.confidence) * 100) / 100)) : CONFIDENCE,
    countdownHours: set(s.countdownHours) ? Math.max(0.25, Math.min(24, Math.round(Number(s.countdownHours) * 4) / 4)) : COUNTDOWN_HOURS
  };
}

// Jobs and workflows that mail third parties, post in public or deploy: on their own only after a countdown.
const risky = (action, target) => (["run-job", "rerun-job", "refresh-stale"].includes(action) && RISKY_JOBS.includes(target)) || (action === "rerun-ci" && RISKY_CI.test(target)) || GH_RISKY.includes(action);

// Why a mailbox should not send, or "" when it may: its domain's DNS, an error, warm-up off or a score under the threshold.
function mailboxProblem(m, o) {
  if (!m) return "not in Instantly";
  if ((o.failing || []).length && m.email.toLowerCase().endsWith("@" + String(o.domain || "").toLowerCase())) return "DNS on " + o.domain + " fails: " + o.failing.join(", ");
  if (m.status === "error") return "mailbox error" + (m.error ? ": " + text(m.error, 120) : "");
  if (m.warmup !== "on") return "warm-up " + m.warmup;
  if (m.score !== null && m.score !== undefined && m.score < o.warmupMin) return "warm-up score " + m.score + " under " + o.warmupMin;
  return "";
}

// Why Jarvis pauses a mailbox on its own, or keeps it paused. Pausing in Instantly stops warm-up too, so a low score alone would keep it paused for good.
const pauseProblem = (m, o) => mailboxProblem(m, Object.assign({}, o, { warmupMin: 0 }));

/* What a Pause outreach click pauses (#1977): the active mailboxes Jarvis has not paused that have a problem; when
   none has one (bounces), every active mailbox on the sending domain. [{ email, why }] */
function pauseTargets(o) {
  const paused = new Set(((o && o.pauses) || []).map((p) => p.email));
  const active = ((o && o.mailboxes) || []).filter((m) => m.status === "active" && !paused.has(m.email));
  const sick = active.map((m) => ({ email: m.email, why: mailboxProblem(m, o) })).filter((m) => m.why);
  if (sick.length) return sick;
  const domain = "@" + String((o && o.domain) || "").toLowerCase();
  return active.filter((m) => m.email.toLowerCase().endsWith(domain)).map((m) => ({ email: m.email, why: "paused from a proposal" }));
}

function aiPrompt(alerts, catalog) {
  return [
    "Open alerts no rule fixed. For each one you can fix with exactly one catalog action, pick it; skip the rest.",
    "Catalog (action: what it does): " + JSON.stringify(AI_CATALOG),
    "jobs: " + JSON.stringify(catalog.jobs || []) + "; workflows: " + JSON.stringify(catalog.workflows || []) + (catalog.github ? "; github: " + JSON.stringify(catalog.github) : ""),
    "Alerts: " + JSON.stringify(alerts.map((a) => ({ key: a.key, level: a.level, text: text(a.text, 240) }))),
    "Answer only a JSON array, at most 6 rows: [{\"key\": alert key, \"action\": catalog action or \"none\", \"args\": {}, \"confidence\": 0-1, \"title\": what Carlos should do if not this action (under 100 characters), \"why\": one sentence}]."
  ].join("\n");
}

function parsePicks(raw, alerts) {
  const keys = new Set(alerts.map((a) => a.key));
  let list;
  try { list = JSON.parse(String(raw || "").replace(/^```(?:json)?\s*|\s*```$/g, "").trim()); } catch (error) { throw new Error("The AI's answer was not JSON."); }
  return (Array.isArray(list) ? list : []).filter((p) => p && keys.has(p.key)).slice(0, 6).map((p) => ({
    key: text(p.key, 140), action: text(p.action, 40), args: p.args && typeof p.args === "object" ? p.args : {},
    confidence: Math.max(0, Math.min(1, Number(p.confidence) || 0)), title: text(p.title, 120), why: text(p.why, 240)
  }));
}

// A pick runs only when its action is in the catalog and its argument names something that exists now.
function pickOk(p, catalog) {
  if (!AI_CATALOG[p.action] || GH_CLICK_ONLY.includes(p.action)) return false;
  if (p.action === "run-job") return (catalog.jobs || []).includes(p.args.job);
  if (p.action === "rerun-ci") return (catalog.workflows || []).includes(p.args.workflow);
  if (GH_PICKS[p.action]) return ghArg(p) !== "" && (((catalog.github || {})[GH_PICKS[p.action][0]]) || []).map(String).includes(ghArg(p));
  return true;
}

const ghArg = (p) => (GH_PICKS[p.action] && p.args && p.args[GH_PICKS[p.action][1]] !== undefined ? String(p.args[GH_PICKS[p.action][1]]) : "");

// A held re-run Jarvis may send without Carlos: the report finished, it has a score, and there is someone to send it to.
function cleanRerun(doc) {
  const d = doc || {};
  const r = d.record || {};
  const score = ((r.report || {}).insights || {}).score;
  if (d.status !== "held" || !d.record) return { ok: false, reason: "not held" };
  if (r.status !== "complete") return { ok: false, reason: "the report " + (r.status || "has no status") };
  if (!score || typeof score.overall !== "number") return { ok: false, reason: "the report has no score" };
  if (!text(d.email || r.email, 200).includes("@")) return { ok: false, reason: "no asker address" };
  if (d.mailError) return { ok: false, reason: "the last mail failed" };
  return { ok: true, reason: "" };
}

function noticeHours(now) {
  const p = core.zoneParts(new Date(now));
  return p.weekday !== 6 && p.hour >= NOTICE_HOURS.from && p.hour < NOTICE_HOURS.to;
}

function usedToday(rows, action) {
  return (rows || []).filter((r) => r.action === action && r.mode === "auto" && r.status === "done").reduce((n, r) => n + (Number(r.count) || 1), 0);
}

async function todayRows(db, now) {
  const day = core.zoneParts(new Date(now)).day;
  const snap = await db.collection("jarvis_actions").where("day", "==", day).limit(500).get().catch(() => null);
  return snap ? snap.docs.map((doc) => doc.data()) : [];
}

async function log(db, entry, now) {
  const row = {
    action: text(entry.action, 40), mode: entry.mode === "auto" ? "auto" : "click", status: ["done", "failed", "skipped", "waiting"].includes(entry.status) ? entry.status : "done",
    count: Math.max(0, Math.round(Number(entry.count) || (entry.status === "done" ? 1 : 0))), target: text(entry.target, 200), detail: text(entry.detail, 400),
    by: text(entry.by, 120) || (entry.mode === "auto" ? "jarvis" : ""), proposal: text(entry.proposal, 140),
    at: new Date(now).toISOString(), day: core.zoneParts(new Date(now)).day, expireAt: new Date(now + 180 * DAY)
  };
  await db.collection("jarvis_actions").add(row);
  await jarvisLog.log(null, { source: entry.source === "countdown" ? "countdown" : "jarvis", level: jarvisLog.levelOfStatus(row.status), ref: row.proposal || entry.key || "",
    text: row.action + " " + row.status + (row.mode === "auto" ? " (auto)" : "") + (row.target ? ": " + row.target : "") + (row.detail ? " · " + row.detail : "") + (row.by && row.mode !== "auto" ? " · by " + row.by : "") });
  return row;
}

// Whether this action already ran or failed for this target (a failed run, a fix, a mailbox), on any day.
async function seen(db, action, target) {
  const snap = await db.collection("jarvis_actions").where("target", "==", text(target, 200)).limit(20).get().catch(() => null);
  return !!snap && snap.docs.some((doc) => { const d = doc.data(); return d.action === action && d.status !== "waiting"; });
}

async function recent(db, limit) {
  const snap = await db.collection("jarvis_actions").orderBy("at", "desc").limit(Math.min(Number(limit) || 50, 200)).get().catch(() => null);
  return snap ? snap.docs.map((doc) => { const d = doc.data(); delete d.expireAt; return d; }) : [];
}

/* One hourly pass. ops = {
     held()          -> [{ id, data }] held re-runs
     release(id, by) -> { status, reportId, mailed } (null when no longer held)
     failedNotices() -> [{ id, ref, data }] pending notices with lastError and a live card
     noticeBudget()  -> how many owner notices may still go out today
     resend(ref, by) -> { outcome, reason, email }
     hubStale()      -> boolean
     publishHub()    -> { ran }
     noticesLive     -> boolean (OWNER_NOTICES_LIVE=1)
   and, each optional (#1977):
     runJob(job)       -> start a scheduled job
     failedJobs()      -> [{ job, endedAt, error }] scheduled jobs whose last run failed in the last day
     overdueJobs()     -> [{ job, why }] scheduled jobs past their gap that did not fail
     failedCi()        -> [{ id, name, branch, attempt, url, sha, event, path, pr?, main? }] the newest run per workflow and branch, failed
     rerunRun(id)      -> re-run a run's failed jobs
     refreshPr(n)      -> { refreshed } or { skipped }: close and reopen a PR unless it conflicts with main
     mainSha()         -> main's newest commit;  dispatch(path) -> start a workflow on main
     rerunCi(workflow) -> re-run a workflow's newest failed run on main
     reviewFix()       -> { fixAt, ref, lastRun } the newest FIXES row and rerunReviewFailures' last start
     outreach()        -> { domain, failing: [check], warmupMin, mailboxes: [{ email, status, warmup, score, error }], pauses: [{ email, reason, passes }] }
     pauseMailbox(e)   -> pause a mailbox in Instantly;  setPause(email, row | null) -> save or clear Jarvis's pause
     addresses()       -> the addresses source;  addressState() / setAddressState(row) -> jarvis_watch/addresses
     enableWarmup(emails), restoreAlias(alias) -> the two fixes;  push(msg) -> a push to the alerts devices
     socialFailed()    -> failed social posts in range
     mergeCandidates() -> [{ number, sha, title, url }] open PRs labelled jarvis-merge, green and mergeable
     launchReady()     -> [{ id, name, start, leads }] draft campaigns ready to send
     alerts()          -> [{ key, level, text }] open briefing and watch lines;  catalog() -> { jobs, workflows }
     ask(prompt)       -> Gemini's text;  saveProposals([pick]) -> keep the picks Jarvis did not run as proposals
     githubWork()      -> the github-work source (#2526);  githubAct(action, args) -> { detail, count? }, throws when it did nothing
     ownerTagsApprovable() -> [{ id, handle, why }];  ownerTagsApprove(ids) -> { detail, count }   (#2660)
     ownerTagsStops()  -> [{ id, handle, text }] authors asking us to stop;  ownerTagsBlock(stop) -> { detail } }
   Returns { done: [rows], queued: [countdowns], waiting: [{ action, count, reason }] }; every action and every wait
   is logged. */
async function autoRun({ db, now, settings, ops }) {
  const cfg = cleanSettings((settings || {}).actions);
  const out = { done: [], queued: [], waiting: [] };
  if (!cfg.auto) return Object.assign(out, { off: true });
  const countdown = require("./jarvis-countdown");
  const day = core.zoneParts(new Date(now)).day;
  const [rows, pending] = await Promise.all([todayRows(db, now), countdown.open(db)]);
  const left = (action) => Math.max(0, cfg.caps[action] - usedToday(rows, action) - countdown.queued(pending, action, day));
  const wait = async (action, count, reason) => {
    if (!count) return;
    out.waiting.push({ action, count, reason });
    if (!rows.some((r) => r.action === action && r.status === "waiting" && r.detail === reason)) {
      rows.push(await log(db, { action, mode: "auto", status: "waiting", count, detail: reason }, now));
    }
  };
  // A risky action goes on the countdown, inside its cap; one Carlos cancelled waits for him.
  const later = async (entry) => {
    const count = entry.count || 1;
    if (left(entry.action) < count) return wait(entry.action, count, "Over today's cap of " + cfg.caps[entry.action] + ".");
    const res = await countdown.queue(db, entry, { now, hours: cfg.countdownHours });
    if (res.row) { pending.push(res.row); out.queued.push(res.row); return res.row; }
    if (res.existing.status === "cancelled") return wait(entry.action, count, entry.target + ": you cancelled its countdown; " + (entry.onCancel || "it runs on a click") + ".");
    return null;
  };
  const isOpen = (r) => countdown.OPEN.includes(r.status);
  const busy = (action) => new Set(pending.filter((r) => r.action === action && isOpen(r)).flatMap((r) => ((r.payload || {}).items || []).map((i) => i.id)));
  const plural = (n, w) => n + " " + w + (n === 1 ? "" : "s");
  const names = (list) => list.slice(0, 4).join(", ") + (list.length > 4 ? " and " + (list.length - 4) + " more" : "");

  const held = await ops.held();
  const inHeld = busy("rerun-held");
  const cleanAll = held.filter((h) => cleanRerun(h.data).ok);
  const clean = cleanAll.filter((h) => !inHeld.has(h.id));
  const sendable = clean.slice(0, left("rerun-held"));
  if (sendable.length) {
    await later({ action: "rerun-held", target: plural(sendable.length, "held re-run"), count: sendable.length, part: sendable.map((h) => h.id).sort().join(","),
      payload: { items: sendable.map((h) => ({ id: h.id, host: h.data.host || h.id })) }, why: "Clean reports for " + names(sendable.map((h) => h.data.host || h.id)) + "." });
  }
  await wait("rerun-held", clean.length - sendable.length, "Over today's cap of " + cfg.caps["rerun-held"] + ".");
  await wait("rerun-held", held.length - cleanAll.length, "Not clean: " + Array.from(new Set(held.filter((h) => !cleanRerun(h.data).ok).map((h) => cleanRerun(h.data).reason))).join(", ") + ".");

  const inNotices = busy("resend-notices");
  const notices = (ops.noticesLive ? await ops.failedNotices() : []).filter((n) => !inNotices.has(n.id));
  if (notices.length) {
    const capLeft = left("resend-notices");
    const room = Math.min(capLeft, Math.max(0, await ops.noticeBudget()));
    const take = notices.slice(0, room);
    if (take.length) {
      await later({ action: "resend-notices", target: plural(take.length, "failed owner notice"), count: take.length, part: take.map((n) => n.id).sort().join(","),
        payload: { items: take.map((n) => ({ id: n.id, domain: n.data.domain || n.id })) }, why: "Their last send failed: " + names(take.map((n) => n.data.domain || n.id)) + "." });
    }
    await wait("resend-notices", notices.length - take.length, room < capLeft ? "Today's owner-notice budget is used." : "Over today's cap of " + cfg.caps["resend-notices"] + ".");
  }

  if (await ops.hubStale()) {
    if (left("publish-hub") > 0) {
      try {
        await ops.publishHub();
        out.done.push(await log(db, { action: "publish-hub", mode: "auto", status: "done", target: "refreshSocialHubStats", detail: "The hub stats were stale." }, now));
      } catch (error) {
        await log(db, { action: "publish-hub", mode: "auto", status: "failed", target: "refreshSocialHubStats", detail: error.message || String(error) }, now);
      }
    } else await wait("publish-hub", 1, "Over today's cap of " + cfg.caps["publish-hub"] + ".");
  }

  const handled = new Set(["hub:", "notices:"]);
  const attempt = async (action, target, detail, run) => {
    try {
      const res = await run();
      const row = await log(db, { action, mode: "auto", status: "done", target, detail: (res && res.detail) || detail }, now);
      rows.push(row);
      out.done.push(row);
      return row;
    } catch (error) {
      const row = await log(db, { action, mode: "auto", status: "failed", target, detail: error.message || String(error) }, now);
      rows.push(row);
      return row;
    }
  };
  const once = async (action, target, detail, run) => {
    if (await seen(db, action, target)) return null;
    if (left(action) <= 0) return wait(action, 1, "Over today's cap of " + cfg.caps[action] + ".");
    return attempt(action, target, detail, run);
  };
  // A job or run that mails third parties, posts or deploys goes on the countdown instead, once per target.
  const onceOrLater = async (action, target, detail, risk, payload, run) => {
    if (!risk) return once(action, target, detail, run);
    if (await seen(db, action, target)) return;
    await later({ action, target, part: target, payload, why: detail });
  };

  if (ops.failedJobs && ops.runJob) {
    for (const f of await ops.failedJobs()) {
      handled.add("job:" + f.job).add("scheduler:" + f.job);
      await onceOrLater("rerun-job", f.job + " @ " + f.endedAt, "The run that ended " + f.endedAt + " failed: " + text(f.error, 200), risky("rerun-job", f.job), { job: f.job }, () => ops.runJob(f.job));
    }
  }
  if (ops.overdueJobs && ops.runJob) {
    for (const o of await ops.overdueJobs()) {
      if (handled.has("job:" + o.job)) continue;
      handled.add("job:" + o.job).add("scheduler:" + o.job);
      await onceOrLater("refresh-stale", o.job + " @ " + day, "Overdue: " + text(o.why, 200) + ".", risky("refresh-stale", o.job), { job: o.job }, () => ops.runJob(o.job));
    }
  }
  if (ops.failedCi && ops.rerunRun) {
    const failed = await ops.failedCi();
    const head = failed.some((r) => r.branch === "main") && ops.mainSha && ops.dispatch ? await ops.mainSha().catch(() => "") : "";
    for (const run of failed) {
      handled.add("ci:" + run.name);
      if (run.attempt > 1 || (run.branch !== "main" && !JARVIS_BRANCH.test(run.branch || ""))) continue;
      if (run.pr) {
        if (!ops.refreshPr) continue;
        const refresh = async () => {
          const res = await ops.refreshPr(run.pr);
          if (!res.refreshed) throw new Error("#" + run.pr + " was not reopened: " + res.skipped + ".");
          return { detail: "Closed and reopened #" + run.pr + " for a fresh merge with main " + run.main + "." };
        };
        await onceOrLater("rerun-ci", "#" + run.pr + " " + run.name + " @ main " + run.main, "#" + run.pr + " failed " + run.name + "; closing and reopening it for a fresh merge with main " + run.main + ".", risky("rerun-ci", run.name), { pr: run.pr, name: run.name }, refresh);
        continue;
      }
      // Pages on main's newest commit publishes only what is merged already, so it skips the countdown (Carlos, #2893).
      const mainDeploy = Boolean(head) && run.branch === "main" && PAGES_CI.test(run.name);
      if (head && run.branch === "main" && run.sha && run.sha !== head && run.path && ["push", "workflow_dispatch"].includes(run.event)) {
        await onceOrLater("rerun-ci", run.name + " #" + run.id, "Main has moved past the commit that failed, so it starts again on main's newest commit.", risky("rerun-ci", run.name) && !mainDeploy, { run: run.id, name: run.name, workflow: run.path }, () => ops.dispatch(run.path));
        continue;
      }
      await onceOrLater("rerun-ci", run.name + " #" + run.id, "Re-running the failed jobs on " + run.branch + ".", risky("rerun-ci", run.name) && !(mainDeploy && run.sha === head),
        Object.assign({ run: run.id, name: run.name }, run.branch === "main" && run.sha && run.path && ["push", "workflow_dispatch"].includes(run.event) ? { sha: run.sha, path: run.path } : {}), () => ops.rerunRun(run.id));
    }
  }
  if (ops.reviewFix && ops.runJob) {
    const fx = await ops.reviewFix();
    if (fx && fx.fixAt && (!fx.lastRun || fx.fixAt > fx.lastRun)) {
      await once("rerun-reviews", "rerunReviewFailures @ " + fx.fixAt, "Fix " + fx.ref + " is newer than the last run" + (fx.lastRun ? " (" + fx.lastRun + ")" : "") + ".", () => ops.runJob("rerunReviewFailures"));
    }
  }

  const healed = new Set();
  if (ops.addresses && ops.addressState && ops.setAddressState) {
    const a = await ops.addresses();
    if (a && a.ok) {
      handled.add("addresses:");
      const issues = a.issues || [];
      const open = addresses.openProblems(issues, ((await ops.addressState()) || {}).open, now);
      const failed = [];
      for (const i of issues.filter((x) => x.by === "jarvis")) {
        const run = i.action === "enable-warmup" && ops.enableWarmup ? () => ops.enableWarmup([i.address])
          : i.action === "restore-alias" && ops.restoreAlias ? () => ops.restoreAlias(i.address.split("@")[0]) : null;
        if (!run) continue;
        const res = await once(i.action, i.address + " @ " + open[i.key].since, i.text, run);
        if (res && res.status === "done" && i.action === "enable-warmup") healed.add(i.address);
        if (res && res.status === "failed") failed.push(addresses.failedFix(i, res.detail));
      }
      const fresh = addresses.toPush(issues.concat(failed), open);
      if (fresh.length && ops.push) {
        let sent = true;
        for (const msg of addresses.pushMessages(fresh)) await ops.push(msg).catch(() => { sent = false; });
        if (sent) fresh.forEach((i) => { open[i.key].pushedAt = new Date(now).toISOString(); });
      }
      await ops.setAddressState({ open: addresses.openList(open), at: new Date(now).toISOString() });
    }
  }

  if (ops.outreach && ops.pauseMailbox && ops.setPause) {
    const o = await ops.outreach();
    if (o) {
      handled.add("outreach:mailbox:").add("outreach:warmup").add("outreach:dns:");
      // A mailbox whose warm-up Jarvis just turned on is not paused for it.
      o.mailboxes = (o.mailboxes || []).map((m) => (healed.has(String(m.email).toLowerCase()) ? Object.assign({}, m, { warmup: "on" }) : m));
      const pauses = new Map((o.pauses || []).map((p) => [p.email, p]));
      for (const m of o.mailboxes || []) {
        const why = pauseProblem(m, o);
        if (!why || m.status !== "active" || pauses.has(m.email)) continue;
        try {
          await ops.pauseMailbox(m.email);
          await ops.setPause(m.email, { email: m.email, domain: o.domain, reason: why, pausedAt: new Date(now).toISOString(), passes: 0 });
          const row = await log(db, { action: "pause-outreach", mode: "auto", status: "done", target: m.email, detail: "Paused: " + why + "." }, now);
          out.done.push(row);
        } catch (error) {
          await log(db, { action: "pause-outreach", mode: "auto", status: "failed", target: m.email, detail: error.message || String(error) }, now);
        }
      }
      const ready = [];
      const troubled = new Set();
      for (const p of pauses.values()) {
        const m = (o.mailboxes || []).find((x) => x.email === p.email);
        if (!m || m.status === "active") { await ops.setPause(p.email, null); continue; }
        const passes = pauseProblem(m, o) ? 0 : (Number(p.passes) || 0) + 1;
        // since: when the current healthy streak began, so a streak gets one countdown and a cancelled one stays cancelled.
        const row = Object.assign({}, p, { passes }, passes === 0 && p.passes ? { since: new Date(now).toISOString() } : {});
        if (passes !== p.passes) await ops.setPause(p.email, row);
        if (passes === 0) troubled.add(p.email);
        else if (passes >= RESUME_PASSES) ready.push(row);
      }
      const resumes = pending.filter((r) => r.action === "resume-outreach" && isOpen(r));
      for (const r of resumes.filter((x) => x.status === "waiting" && ((x.payload || {}).emails || []).some((e) => troubled.has(e)))) {
        await countdown.cancel(db, r.id, { now, by: "jarvis", why: "the mailbox trouble came back" }).then(() => { r.status = "cancelled"; }).catch(() => null);
      }
      const queuedEmails = new Set(resumes.filter(isOpen).flatMap((r) => (r.payload || {}).emails || []));
      const fresh = ready.filter((p) => !queuedEmails.has(p.email));
      if (fresh.length) {
        const emails = fresh.map((p) => p.email).sort();
        const streak = fresh.map((p) => p.since || p.pausedAt || "").sort().pop();
        await later({ action: "resume-outreach", target: names(emails), part: emails.join(",") + "@" + streak, payload: { emails },
          why: "Healthy for " + RESUME_PASSES + " hourly checks in a row (paused for " + names(Array.from(new Set(fresh.map((p) => p.reason)))) + ").", onCancel: "resume them from Proposals or Outreach" });
      }
    }
  }

  if (ops.socialFailed) {
    handled.add("social:failed");
    const failed = await ops.socialFailed();
    if (failed && !pending.some((r) => r.action === "retry-social" && isOpen(r))) {
      await later({ action: "retry-social", target: plural(failed, "failed social post"), part: day + "#" + failed, why: "Buffer re-queues the failed posts when the posting workflows run again." });
    }
  }

  if (ops.launchReady) {
    let drafts = [];
    try { drafts = await ops.launchReady(); } catch (error) {
      const detail = "Instantly: " + text(error.message || error, 200);
      if (!rows.some((r) => r.action === "launch-campaign" && r.status === "failed" && r.detail === detail)) rows.push(await log(db, { action: "launch-campaign", mode: "auto", status: "failed", target: "draft campaigns", detail }, now));
    }
    const inLaunch = busy("launch-campaign");
    for (const c of drafts.filter((d) => !inLaunch.has(d.id))) {
      await later({ action: "launch-campaign", target: c.name, part: c.id + "@" + c.start, payload: { items: [{ id: c.id, name: c.name }] },
        why: "A draft with " + plural(c.leads, "lead") + " that starts " + c.start + "; nothing sends until it is active.", onCancel: "activate it in Jarvis > Marketing" });
    }
  }

  if (ops.ownerTagsApprovable && ops.ownerTagsApprove) {
    const approvable = await ops.ownerTagsApprovable().catch(() => []);
    const take = approvable.slice(0, left("owner-tags-approve-verified"));
    if (take.length) {
      const target = names(take.map((a) => "@" + a.handle));
      try {
        const res = await ops.ownerTagsApprove(take.map((a) => a.id));
        if (res.count) {
          const row = await log(db, { action: "owner-tags-approve-verified", mode: "auto", status: "done", count: res.count, target, detail: take.map((a) => "@" + a.handle + ": " + a.why).join("; ") }, now);
          rows.push(row);
          out.done.push(row);
        }
      } catch (error) {
        rows.push(await log(db, { action: "owner-tags-approve-verified", mode: "auto", status: "failed", target, detail: error.message || String(error) }, now));
      }
    }
    await wait("owner-tags-approve-verified", approvable.length - take.length, "Over today's cap of " + cfg.caps["owner-tags-approve-verified"] + ".");
  }
  if (ops.ownerTagsStops && ops.ownerTagsBlock) {
    for (const s of await ops.ownerTagsStops().catch(() => [])) {
      await once("owner-tags-block", s.id, "@" + s.handle + " asked us to stop: \"" + text(s.text, 160) + "\"", () => ops.ownerTagsBlock(s));
    }
  }

  if (ops.mergeCandidates) {
    let prs = [];
    try { prs = await ops.mergeCandidates(); } catch (error) {
      const detail = "GitHub: " + text(error.message || error, 200);
      if (!rows.some((r) => r.action === "merge-pr" && r.status === "failed" && r.detail === detail)) rows.push(await log(db, { action: "merge-pr", mode: "auto", status: "failed", target: "jarvis-merge PRs", detail }, now));
    }
    for (const pr of prs) {
      await later({ action: "merge-pr", target: "#" + pr.number, part: pr.sha, payload: { number: pr.number, sha: pr.sha, url: pr.url }, why: text(pr.title, 200) + " (green, labelled jarvis-merge).",
        onCancel: "remove the label or merge it yourself" });
    }
  }

  if (ops.githubWork && ops.githubAct) {
    let g = null;
    try { g = await ops.githubWork(); } catch (error) { g = null; }
    if (g && g.ok !== false) {
      const t = core.githubTargets(g);
      ["gh:drift:", "gh:orphan-pr:", "gh:pr-behind:", "gh:pr-green:", "gh:main-broken:", "gh:branch-merged", "gh:worktree-merged:"].forEach((h) => handled.add(h));
      for (const d of t.drift) {
        await once("gh-board-sync", "#" + d.number + " to " + d.should, text(d.why, 200) || "In " + d.column + ", should be in " + d.should + ".",
          () => ops.githubAct("gh-board-sync", { number: d.number, should: d.should, item: d.item }));
      }
      for (const pr of t.orphans) {
        await once("gh-orphan-ticket", "PR #" + pr.number, "\"" + text(pr.title, 120) + "\" names no ticket.", () => ops.githubAct("gh-orphan-ticket", { pr: pr.number }));
      }
      // Only green PRs idle for a day: a chat still pushing to the branch would have its next push refused.
      const idle = t.behind.filter((pr) => pr.checks === "pass" && Number(pr.updatedH) >= 24).slice(0, left("gh-update-pr"));
      if (idle.length) {
        const numbers = idle.map((pr) => pr.number).sort((a, b) => a - b);
        await later({ action: "gh-update-pr", target: names(numbers.map((n) => "#" + n)), count: numbers.length, part: numbers.join(",") + "@" + day, payload: { numbers },
          why: plural(numbers.length, "green PR") + " behind main, idle for a day.", onCancel: "update them from Jarvis > GitHub" });
      }
      for (const m of t.mainBroken) {
        await later({ action: "gh-revert", target: String(m.sha).slice(0, 7), part: m.sha, payload: { sha: m.sha, why: m.why },
          why: "Main went red after " + String(m.sha).slice(0, 7) + (m.title ? " (" + text(m.title, 120) + ")" : "") + ": " + text(m.why, 160) + ".", onCancel: "fix it forward or revert it yourself" });
      }
      if (t.merged.length) {
        const branches = t.merged.map((b) => b.name).sort().slice(0, 30);
        await later({ action: "gh-delete-branch", target: branches.length + " merged branch" + (branches.length === 1 ? "" : "es"), part: crypto.createHash("sha1").update(branches.join(",")).digest("hex").slice(0, 12),
          payload: { branches }, why: "Merged and left behind: " + names(branches) + "." });
      }
      for (const w of t.worktrees) {
        await later({ action: "gh-remove-worktree", target: w.dir, part: w.path, payload: { path: w.path }, why: w.branch + " is merged, clean and no chat holds it." });
      }
    }
  }

  if (ops.alerts && ops.ask && ops.catalog) {
    const open = (await ops.alerts()).filter((a) => ["alert", "warn"].includes(a.level) && !Array.from(handled).some((h) => a.key === h || a.key.startsWith(h)));
    const target = "alerts " + crypto.createHash("sha1").update(open.map((a) => a.key).sort().join(",")).digest("hex").slice(0, 12);
    const asked = rows.filter((r) => r.action === "ai-ask" && r.status !== "waiting");
    if (open.length && !asked.some((r) => r.target === target)) {
      if (asked.length >= AI_CALLS) await wait("ai-ask", open.length, "Today's " + AI_CALLS + " AI calls are used.");
      else {
        const catalog = await ops.catalog();
        let picks = null;
        try {
          picks = parsePicks(await ops.ask(aiPrompt(open, catalog)), open);
          rows.push(await log(db, { action: "ai-ask", mode: "auto", status: "done", count: 1, target, detail: open.length + " open alerts, " + picks.filter((p) => p.action !== "none").length + " picks." }, now));
        } catch (error) {
          rows.push(await log(db, { action: "ai-ask", mode: "auto", status: "failed", target, detail: error.message || String(error) }, now));
        }
        const keep = [];
        const approveVerified = async () => {
          if (!ops.ownerTagsApprovable || !ops.ownerTagsApprove) throw new Error("Owner tags are not wired here.");
          return ops.ownerTagsApprove((await ops.ownerTagsApprovable()).slice(0, left("owner-tags-approve-verified")).map((a) => a.id));
        };
        for (const p of picks || []) {
          const runnable = pickOk(p, catalog);
          if (runnable && p.confidence >= cfg.confidence && left("ai-fix") > 0) {
            const arg = p.args.job || p.args.workflow || ghArg(p);
            const what = p.action + (arg ? " " + arg : "");
            if (risky(p.action, arg)) {
              await later({ action: "ai-fix", target: what, key: p.key, part: what, payload: { action: p.action, target: arg }, why: "For " + p.key + ": " + p.why, by: "gemini", confidence: p.confidence });
              continue;
            }
            await attempt("ai-fix", what, "For " + p.key + ": " + p.why + " (confidence " + p.confidence + ").", () =>
              p.action === "run-job" ? ops.runJob(p.args.job) : p.action === "rerun-ci" ? ops.rerunCi(p.args.workflow)
                : GH_PICKS[p.action] ? ops.githubAct(p.action, { target: arg })
                : p.action === "owner-tags-approve-verified" ? approveVerified() : ops.publishHub());
          } else if (p.title || runnable) {
            keep.push(Object.assign({}, p, { runnable, reason: !runnable ? "not in the catalog" : p.confidence < cfg.confidence ? "confidence " + p.confidence + " under " + cfg.confidence : "over today's cap" }));
          }
        }
        if (keep.length && ops.saveProposals) await ops.saveProposals(keep);
      }
    }
  }
  return out;
}

function summary(result) {
  const r = result || {};
  if (r.off) return "actions off";
  const by = {};
  (r.done || []).forEach((row) => { by[row.action] = (by[row.action] || 0) + 1; });
  const parts = Object.keys(by).map((k) => LABELS[k].toLowerCase() + " " + by[k]);
  const waiting = (r.waiting || []).reduce((n, w) => n + w.count, 0);
  const queued = (r.queued || []).length;
  return (parts.length ? parts.join(", ") : "no actions") + (queued ? "; " + queued + " on the countdown" : "") + (waiting ? "; " + waiting + " waiting for a click" : "");
}

function pushMessage(result) {
  const done = (result && result.done) || [];
  if (!done.length) return null;
  const github = done.every((row) => /^gh-/.test(row.action));
  return {
    kind: "alerts", tab: github ? "github" : "systems", tag: "jarvis-actions",
    title: github ? "Jarvis fixed: " + (done.length === 1 ? LABELS[done[0].action].toLowerCase() : done.length + " GitHub issues") : "Jarvis acted: " + done.length + " action" + (done.length === 1 ? "" : "s"),
    body: (LABELS[done[0].action] + ": " + done[0].target + ". " + done[0].detail).slice(0, 180) + (done.length > 1 ? " (+" + (done.length - 1) + " more)" : ""),
    lines: done.slice(0, 6).map((row) => (LABELS[row.action] + ": " + row.target).slice(0, 120))
  };
}

// The last 24 hours of automatic actions and waits, for the daily briefing.
function briefLines(rows, now) {
  const since = new Date(now - DAY).toISOString();
  const auto = (rows || []).filter((r) => r.mode === "auto" && r.at >= since);
  const done = auto.filter((r) => r.status === "done");
  const by = {};
  done.forEach((r) => { by[r.action] = (by[r.action] || 0) + (r.count || 1); });
  const lines = Object.keys(by).map((k) => "Jarvis did: " + LABELS[k].toLowerCase() + " x" + by[k] + ".");
  const failed = auto.filter((r) => r.status === "failed");
  if (failed.length) lines.push("Jarvis tried and failed " + failed.length + " time" + (failed.length === 1 ? "" : "s") + ": " + failed[0].detail);
  const waits = {};
  auto.filter((r) => r.status === "waiting").forEach((r) => { waits[r.action] = r; });
  Object.keys(waits).forEach((k) => lines.push("Waiting for your click: " + LABELS[k].toLowerCase() + " (" + waits[k].count + "). " + waits[k].detail));
  return lines;
}

module.exports = { SAFE, CAPS, LABELS, GH_ACTIONS, GH_RISKY, GH_PICKS, GH_CLICK_ONLY, NOTICE_TRIES, NOTICE_HOURS, CONFIDENCE, COUNTDOWN_HOURS, AI_CALLS, AI_CATALOG, RESUME_PASSES, JARVIS_BRANCH, RISKY_JOBS, RISKY_CI, risky, cleanSettings, cleanRerun, noticeHours, mailboxProblem, pauseProblem, pauseTargets, aiPrompt, parsePicks, pickOk, usedToday, todayRows, log, seen, recent, autoRun, summary, pushMessage, briefLines };
