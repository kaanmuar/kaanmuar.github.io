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
                   other chats' branches are left alone
   refresh-stale   a scheduled job overdue by its gap is started once a day
   rerun-reviews   rerunReviewFailures starts when a FIXES row is newer than its last run
   pause-outreach  an active mailbox is paused while its domain's DNS fails, its warm-up is off or its score is under
                   the warm-up threshold; after RESUME_PASSES healthy hourly checks resume-outreach goes on the countdown,
                   which trouble coming back cancels
   retry-social    failed social posts are posted again after the countdown
   merge-pr        an open PR labelled jarvis-merge, green and mergeable, squash-merged after the countdown
   ai-ask, ai-fix  open alerts no rule handles go to Gemini once per alert set and day, AI_CALLS a day; it may only pick
                   from AI_CATALOG, and a pick runs alone at confidence >= settings.confidence (the risky ones after the
                   countdown); the rest become proposals
   Jobs and workflows that mail third parties, post in public or deploy (RISKY_JOBS, RISKY_CI) run on their own only
   after the countdown (jarvis-countdown.js), which Carlos can cancel or run at once.

   jarvis_settings/main.actions = { auto, caps: { action: per day }, confidence, countdownHours }. A click is not capped
   by Jarvis's own caps; a countdown counts against its cap from the moment it is queued. */

const crypto = require("crypto");
const core = require("./jarvis-core");

const SAFE = core.SAFE_ACTIONS;
const CAPS = { "rerun-held": 10, "resend-notices": 10, "publish-hub": 2, "rerun-job": 3, "rerun-ci": 5, "refresh-stale": 6, "rerun-reviews": 2, "ai-fix": 5, "retry-social": 3, "resume-outreach": 1, "merge-pr": 3 };
const LABELS = {
  "rerun-held": "Send held re-runs", "resend-notices": "Re-send failed owner notices", "publish-hub": "Publish the Social hub", "run-job": "Run a job again", "rerun-ci": "Re-run failed CI jobs",
  "rating-decide": "Decide ratings", "brief-mark": "Snooze or dismiss a briefing line", "rerun-job": "Re-run a failed job", "refresh-stale": "Refresh stale data", "rerun-reviews": "Re-run reviews after a fix",
  "pause-outreach": "Pause an outreach mailbox", "resume-outreach": "Resume outreach mailboxes", "retry-social": "Retry failed social posts", "ai-ask": "Ask the AI what to fix", "ai-fix": "Run a fix the AI picked",
  "merge-pr": "Merge a green PR",
  "pagespeed-merge": "Merge PageSpeed fixes", "pagespeed-close": "Close PageSpeed fixes", "pagespeed-run": "Start the PageSpeed run"
};
const NOTICE_TRIES = 3;
const NOTICE_HOURS = { from: 8, to: 19 };
const CONFIDENCE = 0.8;
const COUNTDOWN_HOURS = 2;
const AI_CALLS = 24;
const RESUME_PASSES = 2;
const RISKY_JOBS = ["sendOwnerNotices", "sendReviewNotes", "dispatchFacebookQueue", "ensureLiveReportsBatch", "jarvisWatch"];
const RISKY_CI = /live reports|buffer batch|facebook|bluesky|mastodon|social inbox|^pages$|jarvis android/i;
const JARVIS_BRANCH = /^(jarvis|pagespeed)\//;
const AI_CATALOG = {
  "run-job": "start a scheduled job again; args { \"job\": one of jobs }",
  "rerun-ci": "re-run the failed jobs of a GitHub Actions workflow; args { \"workflow\": one of workflows }",
  "publish-hub": "refresh the Social hub stats; args {}"
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
const risky = (action, target) => (["run-job", "rerun-job", "refresh-stale"].includes(action) && RISKY_JOBS.includes(target)) || (action === "rerun-ci" && RISKY_CI.test(target));

// Why a mailbox should not send, or "" when it may: its domain's DNS, an error, warm-up off or a score under the threshold.
function mailboxProblem(m, o) {
  if (!m) return "not in Instantly";
  if ((o.failing || []).length && m.email.toLowerCase().endsWith("@" + String(o.domain || "").toLowerCase())) return "DNS on " + o.domain + " fails: " + o.failing.join(", ");
  if (m.status === "error") return "mailbox error" + (m.error ? ": " + text(m.error, 120) : "");
  if (m.warmup !== "on") return "warm-up " + m.warmup;
  if (m.score !== null && m.score !== undefined && m.score < o.warmupMin) return "warm-up score " + m.score + " under " + o.warmupMin;
  return "";
}

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
    "jobs: " + JSON.stringify(catalog.jobs || []) + "; workflows: " + JSON.stringify(catalog.workflows || []),
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
  if (!AI_CATALOG[p.action]) return false;
  if (p.action === "run-job") return (catalog.jobs || []).includes(p.args.job);
  if (p.action === "rerun-ci") return (catalog.workflows || []).includes(p.args.workflow);
  return true;
}

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
     failedCi()        -> [{ id, name, branch, attempt, url }] the newest run per workflow and branch, failed
     rerunRun(id)      -> re-run a run's failed jobs
     rerunCi(workflow) -> re-run a workflow's newest failed run on main
     reviewFix()       -> { fixAt, ref, lastRun } the newest FIXES row and rerunReviewFailures' last start
     outreach()        -> { domain, failing: [check], warmupMin, mailboxes: [{ email, status, warmup, score, error }], pauses: [{ email, reason, passes }] }
     pauseMailbox(e)   -> pause a mailbox in Instantly;  setPause(email, row | null) -> save or clear Jarvis's pause
     socialFailed()    -> failed social posts in range
     mergeCandidates() -> [{ number, sha, title, url }] open PRs labelled jarvis-merge, green and mergeable
     alerts()          -> [{ key, level, text }] open briefing and watch lines;  catalog() -> { jobs, workflows }
     ask(prompt)       -> Gemini's text;  saveProposals([pick]) -> keep the picks Jarvis did not run as proposals }
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
    } catch (error) {
      rows.push(await log(db, { action, mode: "auto", status: "failed", target, detail: error.message || String(error) }, now));
    }
  };
  const once = async (action, target, detail, run) => {
    if (await seen(db, action, target)) return;
    if (left(action) <= 0) return wait(action, 1, "Over today's cap of " + cfg.caps[action] + ".");
    await attempt(action, target, detail, run);
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
    for (const run of await ops.failedCi()) {
      handled.add("ci:" + run.name);
      if (run.attempt > 1 || (run.branch !== "main" && !JARVIS_BRANCH.test(run.branch || ""))) continue;
      await onceOrLater("rerun-ci", run.name + " #" + run.id, "Re-running the failed jobs on " + run.branch + ".", risky("rerun-ci", run.name), { run: run.id, name: run.name }, () => ops.rerunRun(run.id));
    }
  }
  if (ops.reviewFix && ops.runJob) {
    const fx = await ops.reviewFix();
    if (fx && fx.fixAt && (!fx.lastRun || fx.fixAt > fx.lastRun)) {
      await once("rerun-reviews", "rerunReviewFailures @ " + fx.fixAt, "Fix " + fx.ref + " is newer than the last run" + (fx.lastRun ? " (" + fx.lastRun + ")" : "") + ".", () => ops.runJob("rerunReviewFailures"));
    }
  }

  if (ops.outreach && ops.pauseMailbox && ops.setPause) {
    const o = await ops.outreach();
    if (o) {
      handled.add("outreach:mailbox:").add("outreach:warmup").add("outreach:dns:");
      const pauses = new Map((o.pauses || []).map((p) => [p.email, p]));
      for (const m of o.mailboxes || []) {
        const why = mailboxProblem(m, o);
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
        const passes = mailboxProblem(m, o) ? 0 : (Number(p.passes) || 0) + 1;
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
        for (const p of picks || []) {
          const runnable = pickOk(p, catalog);
          if (runnable && p.confidence >= cfg.confidence && left("ai-fix") > 0) {
            const arg = p.args.job || p.args.workflow || "";
            const what = p.action + (arg ? " " + arg : "");
            if (risky(p.action, arg)) {
              await later({ action: "ai-fix", target: what, key: p.key, part: what, payload: { action: p.action, target: arg }, why: "For " + p.key + ": " + p.why, by: "gemini", confidence: p.confidence });
              continue;
            }
            await attempt("ai-fix", what, "For " + p.key + ": " + p.why + " (confidence " + p.confidence + ").", () =>
              p.action === "run-job" ? ops.runJob(p.args.job) : p.action === "rerun-ci" ? ops.rerunCi(p.args.workflow) : ops.publishHub());
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
  return {
    kind: "alerts", title: "Jarvis acted: " + done.length + " action" + (done.length === 1 ? "" : "s"), tab: "systems", tag: "jarvis-actions",
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

module.exports = { SAFE, CAPS, LABELS, NOTICE_TRIES, NOTICE_HOURS, CONFIDENCE, COUNTDOWN_HOURS, AI_CALLS, AI_CATALOG, RESUME_PASSES, JARVIS_BRANCH, RISKY_JOBS, RISKY_CI, risky, cleanSettings, cleanRerun, noticeHours, mailboxProblem, pauseTargets, aiPrompt, parsePicks, pickOk, usedToday, todayRows, log, seen, recent, autoRun, summary, pushMessage, briefLines };
