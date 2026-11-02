/* Jarvis actions (#1337): the safe actions Jarvis runs on its own every hour (inside jarvisWatch), within daily caps,
   and the log of every action, automatic or clicked, in jarvis_actions.

   rerun-held      send held re-runs to their askers; on its own only clean ones (a complete report with a score and an
                   asker's address), the rest wait for a click
   resend-notices  re-send owner notices whose last send failed: Monday-Saturday 08:00-19:00 Bogotá (Ley 2300 de 2023),
                   under NOTICE_TRIES, inside the day's owner-notice budget and only while OWNER_NOTICES_LIVE=1, click or not
   publish-hub     run refreshSocialHubStats when the hub stats are stale
   run-job         clicked only: run a scheduled job again

   #1977, each at most once per failure:
   rerun-job       a scheduled job whose last run failed (ops_runs ok=false) is started again once per failed run
   rerun-ci        a failed GitHub Actions run on main or a Jarvis branch gets its failed jobs re-run once (attempt 1 only)
   refresh-stale   a scheduled job overdue by its gap is started once a day
   rerun-reviews   rerunReviewFailures starts when a FIXES row is newer than its last run
   pause-outreach  an active mailbox is paused while its domain's DNS fails, its warm-up is off or its score is under
                   the warm-up threshold; after RESUME_PASSES healthy hourly checks resume-outreach waits for a click
   retry-social    failed social posts wait for a click (public posts go on the countdown in #1977's second PR)
   ai-ask, ai-fix  open alerts no rule handles go to Gemini once per alert set and day, AI_CALLS a day; it may only pick
                   from AI_CATALOG, and a pick runs alone at confidence >= settings.confidence; the rest become proposals

   jarvis_settings/main.actions = { auto, caps: { action: per day }, confidence }. A click is not capped by Jarvis's own caps. */

const crypto = require("crypto");
const core = require("./jarvis-core");

const SAFE = core.SAFE_ACTIONS;
const CAPS = { "rerun-held": 10, "resend-notices": 10, "publish-hub": 2, "rerun-job": 3, "rerun-ci": 5, "refresh-stale": 6, "rerun-reviews": 2, "ai-fix": 5 };
const LABELS = {
  "rerun-held": "Send held re-runs", "resend-notices": "Re-send failed owner notices", "publish-hub": "Publish the Social hub", "run-job": "Run a job again", "rerun-ci": "Re-run failed CI jobs",
  "rating-decide": "Decide ratings", "brief-mark": "Snooze or dismiss a briefing line", "rerun-job": "Re-run a failed job", "refresh-stale": "Refresh stale data", "rerun-reviews": "Re-run reviews after a fix",
  "pause-outreach": "Pause an outreach mailbox", "resume-outreach": "Resume outreach mailboxes", "retry-social": "Retry failed social posts", "ai-ask": "Ask the AI what to fix", "ai-fix": "Run a fix the AI picked",
  "pagespeed-merge": "Merge PageSpeed fixes", "pagespeed-close": "Close PageSpeed fixes", "pagespeed-run": "Start the PageSpeed run"
};
const NOTICE_TRIES = 3;
const NOTICE_HOURS = { from: 8, to: 19 };
const CONFIDENCE = 0.8;
const AI_CALLS = 24;
const RESUME_PASSES = 2;
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
  const c = Number(s.confidence);
  return { auto: typeof s.auto === "boolean" ? s.auto : true, caps, confidence: Number.isFinite(c) && s.confidence !== "" && s.confidence !== null ? Math.max(0.5, Math.min(1, Math.round(c * 100) / 100)) : CONFIDENCE };
}

// Why a mailbox should not send, or "" when it may: its domain's DNS, an error, warm-up off or a score under the threshold.
function mailboxProblem(m, o) {
  if (!m) return "not in Instantly";
  if ((o.failing || []).length && m.email.toLowerCase().endsWith("@" + String(o.domain || "").toLowerCase())) return "DNS on " + o.domain + " fails: " + o.failing.join(", ");
  if (m.status === "error") return "mailbox error" + (m.error ? ": " + text(m.error, 120) : "");
  if (m.warmup !== "on") return "warm-up " + m.warmup;
  if (m.score !== null && m.score !== undefined && m.score < o.warmupMin) return "warm-up score " + m.score + " under " + o.warmupMin;
  return "";
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
     alerts()          -> [{ key, level, text }] open briefing and watch lines;  catalog() -> { jobs, workflows }
     ask(prompt)       -> Gemini's text;  saveProposals([pick]) -> keep the picks Jarvis did not run as proposals }
   Returns { done: [rows], waiting: [{ action, count, reason }] }; every action and every wait is logged. */
async function autoRun({ db, now, settings, ops }) {
  const cfg = cleanSettings((settings || {}).actions);
  const out = { done: [], waiting: [] };
  if (!cfg.auto) return Object.assign(out, { off: true });
  const rows = await todayRows(db, now);
  const left = (action) => Math.max(0, cfg.caps[action] - usedToday(rows, action));
  const wait = async (action, count, reason) => {
    if (!count) return;
    out.waiting.push({ action, count, reason });
    if (!rows.some((r) => r.action === action && r.status === "waiting" && r.detail === reason)) {
      rows.push(await log(db, { action, mode: "auto", status: "waiting", count, detail: reason }, now));
    }
  };

  const held = await ops.held();
  const clean = held.filter((h) => cleanRerun(h.data).ok);
  const sendable = clean.slice(0, left("rerun-held"));
  for (const h of sendable) {
    try {
      const res = await ops.release(h.id, "jarvis");
      if (!res) continue;
      out.done.push(await log(db, { action: "rerun-held", mode: "auto", status: "done", target: h.data.host || h.id, detail: "Sent to the asker" + (res.mailed === false ? ", but the mail failed" : "") + (res.reportId ? " (report " + res.reportId + ")" : "") + "." }, now));
    } catch (error) {
      await log(db, { action: "rerun-held", mode: "auto", status: "failed", target: h.data.host || h.id, detail: error.message || String(error) }, now);
    }
  }
  await wait("rerun-held", clean.length - sendable.length, "Over today's cap of " + cfg.caps["rerun-held"] + ".");
  await wait("rerun-held", held.length - clean.length, "Not clean: " + Array.from(new Set(held.filter((h) => !cleanRerun(h.data).ok).map((h) => cleanRerun(h.data).reason))).join(", ") + ".");

  const notices = ops.noticesLive ? await ops.failedNotices() : [];
  if (notices.length) {
    if (!noticeHours(now)) await wait("resend-notices", notices.length, "Outside Monday-Saturday 08:00-19:00 Bogotá.");
    else {
      const room = Math.min(left("resend-notices"), Math.max(0, await ops.noticeBudget()));
      for (const n of notices.slice(0, room)) {
        const res = await ops.resend(n.ref, "jarvis");
        if (res.outcome === "skipped") continue;
        const row = await log(db, { action: "resend-notices", mode: "auto", status: res.outcome === "sent" ? "done" : "failed", target: n.data.domain || n.id, detail: res.outcome === "sent" ? "Sent to " + res.email + "." : res.reason }, now);
        if (row.status === "done") out.done.push(row);
      }
      await wait("resend-notices", notices.length - Math.min(room, notices.length), room < left("resend-notices") ? "Today's owner-notice budget is used." : "Over today's cap of " + cfg.caps["resend-notices"] + ".");
    }
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
  const day = core.zoneParts(new Date(now)).day;

  if (ops.failedJobs && ops.runJob) {
    for (const f of await ops.failedJobs()) {
      handled.add("job:" + f.job).add("scheduler:" + f.job);
      await once("rerun-job", f.job + " @ " + f.endedAt, "The run that ended " + f.endedAt + " failed: " + text(f.error, 200), () => ops.runJob(f.job));
    }
  }
  if (ops.overdueJobs && ops.runJob) {
    for (const o of await ops.overdueJobs()) {
      if (handled.has("job:" + o.job)) continue;
      handled.add("job:" + o.job).add("scheduler:" + o.job);
      await once("refresh-stale", o.job + " @ " + day, "Overdue: " + text(o.why, 200) + ".", () => ops.runJob(o.job));
    }
  }
  if (ops.failedCi && ops.rerunRun) {
    for (const run of await ops.failedCi()) {
      handled.add("ci:" + run.name);
      if (run.attempt > 1 || (run.branch !== "main" && !JARVIS_BRANCH.test(run.branch || ""))) continue;
      await once("rerun-ci", run.name + " #" + run.id, "Re-running the failed jobs on " + run.branch + ".", () => ops.rerunRun(run.id));
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
      let ready = 0;
      for (const p of pauses.values()) {
        const m = (o.mailboxes || []).find((x) => x.email === p.email);
        if (!m || m.status === "active") { await ops.setPause(p.email, null); continue; }
        const passes = mailboxProblem(m, o) ? 0 : (Number(p.passes) || 0) + 1;
        if (passes !== p.passes) await ops.setPause(p.email, Object.assign({}, p, { passes }));
        if (passes >= RESUME_PASSES) ready += 1;
      }
      await wait("resume-outreach", ready, "Healthy for " + RESUME_PASSES + " hourly checks; resuming waits for a click.");
    }
  }

  if (ops.socialFailed) {
    handled.add("social:failed");
    await wait("retry-social", await ops.socialFailed(), "A public post off schedule waits for a click.");
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
            const what = p.action + (p.args.job || p.args.workflow ? " " + (p.args.job || p.args.workflow) : "");
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
  return (parts.length ? parts.join(", ") : "no actions") + (waiting ? "; " + waiting + " waiting for a click" : "");
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

module.exports = { SAFE, CAPS, LABELS, NOTICE_TRIES, NOTICE_HOURS, CONFIDENCE, AI_CALLS, AI_CATALOG, RESUME_PASSES, JARVIS_BRANCH, cleanSettings, cleanRerun, noticeHours, mailboxProblem, aiPrompt, parsePicks, pickOk, usedToday, todayRows, log, seen, recent, autoRun, summary, pushMessage, briefLines };
