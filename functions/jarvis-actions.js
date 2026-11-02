/* Jarvis actions (#1337): the safe actions Jarvis runs on its own every hour (inside jarvisWatch), within daily caps,
   and the log of every action, automatic or clicked, in jarvis_actions.

   rerun-held      send held re-runs to their askers; on its own only clean ones (a complete report with a score and an
                   asker's address), the rest wait for a click
   resend-notices  re-send owner notices whose last send failed: Monday-Saturday 08:00-19:00 Bogotá (Ley 2300 de 2023),
                   under NOTICE_TRIES, inside the day's owner-notice budget and only while OWNER_NOTICES_LIVE=1, click or not
   publish-hub     run refreshSocialHubStats when the hub stats are stale
   run-job         a scheduled job whose last run failed runs again, once a day on its own (#1977); clicked, any job
   rerun-ci        a failed workflow on main gets its failed jobs re-run, once on its own
   pause-outreach  every active Instantly campaign is paused while a sending-domain record, a mailbox or its warm-up
                   fails, or bounces pass the limit
   refresh-data    a stale source runs the job that feeds it (mailCanary); a source that did not answer loses its
                   cached answer, so the next read asks again
   rerun-reviews   rerunReviewFailures runs when a FIXES row, an hour after its merge, is newer than its last run
   ai-fix          Gemini picks fixes for the lines the rules leave, from the same actions, each with a confidence;
                   Jarvis runs the ones at or above actions.confidence
   check           45 minutes after a fix, whether its briefing line is gone; pushed as fixed or still failing
   Jobs and workflows that mail third parties, post in public or deploy never run on their own: they wait for a click.

   jarvis_settings/main.actions = { auto, caps: { action: per day }, confidence }. A click is not capped by Jarvis's own caps. */

const core = require("./jarvis-core");

const SAFE = core.SAFE_ACTIONS;
const CAPS = { "rerun-held": 10, "resend-notices": 10, "publish-hub": 2, "run-job": 6, "rerun-ci": 4, "pause-outreach": 2, "refresh-data": 4, "rerun-reviews": 2, "ai-fix": 3 };
const LABELS = {
  "rerun-held": "Send held re-runs", "resend-notices": "Re-send failed owner notices", "publish-hub": "Publish the Social hub", "run-job": "Run a job again", "rerun-ci": "Re-run failed CI jobs",
  "pause-outreach": "Pause outreach", "refresh-data": "Refresh stale data", "rerun-reviews": "Re-run reviews a fix covers", "ai-fix": "Fix picked by Gemini", check: "Check a fix",
  "rating-decide": "Decide ratings", "brief-mark": "Snooze or dismiss a briefing line"
};
const NOTICE_TRIES = 3;
const NOTICE_HOURS = { from: 8, to: 19 };
const CONFIDENCE = 0.8;
const RISKY_JOBS = ["sendOwnerNotices", "sendReviewNotes", "dispatchFacebookQueue", "ensureLiveReportsBatch", "jarvisWatch"];
const RISKY_CI = /live reports|buffer batch|facebook|bluesky|mastodon|social inbox|^pages$|jarvis android/i;
const OUTREACH_TROUBLE = /^outreach:(dns:|mailbox:|warmup$|bounce$)/;
const STALE_JOBS = { "mailbox:canary-stale": "mailCanary" };
const FOLLOWED = ["run-job", "rerun-ci", "refresh-data", "ai-fix"];
const CHECK_AFTER = 45 * 60 * 1000;
const FIX_SETTLE = 60 * 60 * 1000;
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
  return { auto: typeof s.auto === "boolean" ? s.auto : true, caps, confidence: s.confidence !== "" && s.confidence !== null && Number.isFinite(c) ? Math.max(0.5, Math.min(1, Math.round(c * 100) / 100)) : CONFIDENCE };
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
    by: text(entry.by, 120) || (entry.mode === "auto" ? "jarvis" : ""), proposal: text(entry.proposal, 140), key: text(entry.key, 140),
    at: new Date(now).toISOString(), day: core.zoneParts(new Date(now)).day, expireAt: new Date(now + 180 * DAY)
  };
  await db.collection("jarvis_actions").add(row);
  return row;
}

async function recent(db, limit) {
  const snap = await db.collection("jarvis_actions").orderBy("at", "desc").limit(Math.min(Number(limit) || 50, 200)).get().catch(() => null);
  return snap ? snap.docs.map((doc) => { const d = doc.data(); delete d.expireAt; return d; }) : [];
}

// What the briefing lines ask Jarvis to fix: failed jobs and workflows (the risky ones apart), outreach trouble, stale sources.
function fixPlan(items) {
  const plan = { jobs: [], ci: [], risky: [], outreach: [], stale: [], keys: new Set() };
  const seen = new Set();
  (items || []).filter((i) => i && (i.level === "alert" || i.level === "warn")).forEach((i) => {
    const k = String(i.key || "");
    const after = k.slice(k.indexOf(":") + 1);
    let row = null;
    if (/^(job|scheduler):/.test(k)) row = { list: RISKY_JOBS.includes(after) ? "risky" : "jobs", action: "run-job", target: after };
    else if (k.startsWith("ci:")) row = { list: RISKY_CI.test(after) ? "risky" : "ci", action: "rerun-ci", target: after };
    else if (OUTREACH_TROUBLE.test(k)) row = { list: "outreach", action: "pause-outreach", target: "Instantly" };
    else if (STALE_JOBS[k]) row = { list: "stale", action: "refresh-data", target: STALE_JOBS[k], job: true };
    else if (k.startsWith("connections:down:")) row = { list: "stale", action: "refresh-data", target: k.slice("connections:down:".length) };
    if (!row) return;
    plan.keys.add(k);
    const id = row.action + " " + row.target;
    if (row.list !== "outreach" && seen.has(id)) return;
    seen.add(id);
    plan[row.list].push(Object.assign({ key: k, text: text(i.text, 240) }, row));
  });
  return plan;
}

const failedCi = (external) => (((external || {}).github || {}).ci || []).filter((r) => r.conclusion && !["success", "skipped", "cancelled", "neutral"].includes(r.conclusion));

// The actions Gemini may pick and the targets each takes; nothing that mails third parties, posts or deploys.
function aiCatalog(external) {
  const e = external || {};
  return {
    "run-job": ((e.jobs || {}).jobs || []).map((j) => j.name).filter((n) => /^[A-Za-z][A-Za-z0-9]{2,60}$/.test(n) && !RISKY_JOBS.includes(n)),
    "rerun-ci": failedCi(e).map((r) => r.name).filter((n) => !RISKY_CI.test(n)),
    "refresh-data": Object.keys(e).filter((k) => /^[a-z0-9-]{2,30}$/.test(k)).concat(Object.values(STALE_JOBS))
  };
}

function aiPrompt(lines, catalog) {
  return "Jarvis fixes problems on Carlos's sites without him. These alert lines have no automatic fix:\n" + JSON.stringify(lines.map((l) => ({ key: l.key, text: l.text })))
    + "\n\nYou may only use these actions, each with one target from its list:\n" + JSON.stringify(catalog)
    + "\nrun-job runs a scheduled job again. rerun-ci re-runs the failed jobs of a GitHub workflow on main. refresh-data drops a source's cached answer so it is read again, or runs the job that feeds it (a camelCase target)."
    + "\n\nPick a fix only for a line one of these actions can clear; skip the rest. confidence is 0 to 1: how sure you are the action clears the line."
    + "\nAnswer with JSON only: {\"fixes\":[{\"key\":\"the line's key\",\"action\":\"\",\"target\":\"\",\"confidence\":0.0,\"why\":\"one short sentence\"}]}";
}

// Gemini's fixes that name a line it was shown and an action and target from the catalog, split at the confidence threshold.
function aiPicks(raw, lines, catalog, threshold) {
  const answer = require("./jarvis-proposals").parseJson(raw);
  const keys = new Set((lines || []).map((l) => l.key));
  const seen = new Set();
  const rows = (Array.isArray(answer && answer.fixes) ? answer.fixes : []).map((f) => ({
    key: text(f && f.key, 140), action: text(f && f.action, 40), target: text(f && f.target, 120),
    confidence: Math.max(0, Math.min(1, Math.round((Number(f && f.confidence) || 0) * 100) / 100)), why: text(f && f.why, 200)
  })).filter((f) => {
    const id = f.action + " " + f.target;
    if (!keys.has(f.key) || !(catalog[f.action] || []).includes(f.target) || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  return { sure: rows.filter((f) => f.confidence >= threshold), unsure: rows.filter((f) => f.confidence < threshold) };
}

function newestFix(fixes) {
  return (fixes || []).slice().sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0] || null;
}

function lastRun(external, name) {
  const job = (((external || {}).jobs || {}).jobs || []).find((j) => j.name === name);
  return job ? job.lastAttempt || "" : "";
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
     runJob(name)    -> { ran }
     rerunCi(name)   -> { run, already } (already "re-run once" when the newest failed run was re-run before)
     sending         -> boolean, an Instantly campaign is active
     pauseOutreach(reason) -> { paused: [{ id, name }] }
     dropCache(source)
     fixes           -> the FIXES rows of url-review-failures.js
     gemini(prompt, maxTokens) -> text, or null without a key }
   items are the briefing lines of external (null when it was not read: no fixes, no checks).
   Returns { done: [rows], waiting: [{ action, count, reason }], checked: [rows] }; every action and every wait is logged. */
async function autoRun({ db, now, settings, ops, items, external }) {
  const cfg = cleanSettings((settings || {}).actions);
  const out = { done: [], waiting: [], checked: [] };
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
  if (!items) return out;

  const keysNow = new Set(items.map((i) => i.key));
  const due = rows.filter((r) => r.mode === "auto" && r.status === "done" && r.key && FOLLOWED.includes(r.action) && now - Date.parse(r.at) >= CHECK_AFTER
    && !rows.some((c) => c.action === "check" && c.key === r.key && c.at >= r.at));
  for (const r of due) {
    const fixed = !keysNow.has(r.key);
    const row = await log(db, { action: "check", mode: "auto", status: fixed ? "done" : "failed", target: r.target, key: r.key,
      detail: (fixed ? "Fixed: the line is gone after " : "Still there after ") + LABELS[r.action].toLowerCase() + (fixed ? "." : "; it is yours now.") }, now);
    rows.push(row);
    out.checked.push(row);
  }

  const plan = fixPlan(items);
  const already = (action, target) => rows.some((r) => r.mode === "auto" && (r.status === "done" || r.status === "failed")
    && ((r.action === action && r.target === target) || (r.action === "ai-fix" && r.target === action + ":" + target)));
  // detail(result) returning null logs nothing: the action found nothing to do.
  const attempt = async (action, target, key, run, detail) => {
    try {
      const res = await run();
      const line = detail(res);
      if (line === null) return res;
      const row = await log(db, { action, mode: "auto", status: "done", target, key, detail: line }, now);
      rows.push(row);
      out.done.push(row);
      return res;
    } catch (error) {
      rows.push(await log(db, { action, mode: "auto", status: "failed", target, key, detail: error.message || String(error) }, now));
      return null;
    }
  };
  const once = async (row, run, detail) => {
    if (already(row.action, row.target)) return wait(row.action, 1, row.target + " still fails after Jarvis tried once today.");
    if (left(row.action) <= 0) return wait(row.action, 1, "Over today's cap of " + cfg.caps[row.action] + ".");
    return attempt(row.action, row.target, row.key, run, detail);
  };
  const rerunCi = async (workflow) => {
    const res = await ops.rerunCi(workflow);
    if (res.already === "re-run once") throw new Error("Run " + res.run + " failed again after one re-run; it is yours now.");
    return res;
  };
  const ciLine = (res) => (res.already ? "Already " + res.already + "." : "Re-running run " + res.run + ".");
  const refresh = (s) => (Object.values(STALE_JOBS).includes(s.target) ? ops.runJob(s.target) : ops.dropCache(s.target));

  for (const j of plan.jobs) await once(j, () => ops.runJob(j.target), () => "Its last run failed; started it again.");
  for (const c of plan.ci) await once(c, () => rerunCi(c.target), ciLine);
  for (const r of plan.risky) await wait(r.action, 1, r.target + " mails third parties, posts in public or deploys; it runs on a click.");

  if (plan.outreach.length && ops.sending) {
    const reason = plan.outreach.map((o) => o.text).join(" ").slice(0, 300);
    if (left("pause-outreach") <= 0) await wait("pause-outreach", 1, "Over today's cap of " + cfg.caps["pause-outreach"] + ".");
    else {
      await attempt("pause-outreach", "Instantly", plan.outreach[0].key, () => ops.pauseOutreach(reason),
        (res) => (res.paused.length ? "Paused " + res.paused.map((c) => c.name || c.id).join(", ") + ". " + reason : null));
    }
  }

  for (const s of plan.stale) {
    if (!already(s.action, s.target)) await once(s, () => refresh(s), () => (s.job ? "Stale; started " + s.target + "." : "It did not answer; dropped its cached answer so the next read asks again."));
  }

  const fix = newestFix(ops.fixes);
  const last = lastRun(external, "rerunReviewFailures");
  if (fix && last && now - Date.parse(fix.at) >= FIX_SETTLE && Date.parse(fix.at) > Date.parse(last) && !already("rerun-reviews", fix.ref)) {
    await once({ action: "rerun-reviews", target: fix.ref, key: "" }, () => ops.runJob("rerunReviewFailures"),
      () => "Fix " + fix.ref + " (" + fix.cause + ") merged after the last re-run; started rerunReviewFailures.");
  }

  const open = items.filter((i) => (i.level === "alert" || i.level === "warn") && !plan.keys.has(i.key)).slice(0, 20);
  const asked = text(open.map((i) => i.key).sort().join(","), 200);
  if (ops.gemini && open.length && left("ai-fix") > 0 && !rows.some((r) => r.action === "ai-fix" && r.status === "skipped" && r.target === asked)) {
    const catalog = aiCatalog(external);
    let picks;
    try { picks = aiPicks(await ops.gemini(aiPrompt(open, catalog), 800), open, catalog, cfg.confidence); } catch (error) { picks = { sure: [], unsure: [], error: text(error.message || error, 160) }; }
    rows.push(await log(db, { action: "ai-fix", mode: "auto", status: "skipped", target: asked,
      detail: picks.error ? "Gemini: " + picks.error : "Gemini read " + open.length + " lines: " + picks.sure.length + " sure, " + picks.unsure.length + " under " + cfg.confidence
        + (picks.unsure.length ? " (" + picks.unsure.map((f) => f.action + " " + f.target + " at " + f.confidence).join(", ") + ")" : "") + "." }, now));
    for (const f of picks.sure) {
      if (already(f.action, f.target)) continue;
      if (left("ai-fix") <= 0) { await wait("ai-fix", 1, "Over today's cap of " + cfg.caps["ai-fix"] + "."); break; }
      const run = f.action === "run-job" ? () => ops.runJob(f.target) : f.action === "rerun-ci" ? () => rerunCi(f.target) : () => refresh(f);
      await attempt("ai-fix", f.action + ":" + f.target, f.key, run, () => f.why + " (confidence " + f.confidence + ").");
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
  const checked = r.checked || [];
  const fixed = checked.filter((row) => row.status === "done").length;
  return (parts.length ? parts.join(", ") : "no actions") + (waiting ? "; " + waiting + " waiting for a click" : "")
    + (checked.length ? "; " + fixed + " fixed, " + (checked.length - fixed) + " still failing" : "");
}

// The after push: which fixes held and which lines are still there.
function checkMessage(result) {
  const rows = (result && result.checked) || [];
  if (!rows.length) return null;
  const bad = rows.filter((r) => r.status === "failed");
  const good = rows.length - bad.length;
  const first = bad[0] || rows[0];
  return {
    kind: "alerts", tab: "systems", tag: "jarvis-checks",
    title: bad.length ? "Still failing after Jarvis's fix: " + bad.length + (good ? " (" + good + " fixed)" : "") : "Jarvis fixed " + good + " thing" + (good === 1 ? "" : "s"),
    body: (first.target + ". " + first.detail).slice(0, 180),
    lines: rows.slice(0, 6).map((r) => ((r.status === "done" ? "Fixed: " : "Still failing: ") + r.target).slice(0, 120))
  };
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
  const all = (rows || []).filter((r) => r.mode === "auto" && r.at >= since);
  const auto = all.filter((r) => r.action !== "check" && r.status !== "skipped");
  const done = auto.filter((r) => r.status === "done");
  const by = {};
  done.forEach((r) => { by[r.action] = (by[r.action] || 0) + (r.count || 1); });
  const lines = Object.keys(by).map((k) => "Jarvis did: " + LABELS[k].toLowerCase() + " x" + by[k] + ".");
  const failed = auto.filter((r) => r.status === "failed");
  if (failed.length) lines.push("Jarvis tried and failed " + failed.length + " time" + (failed.length === 1 ? "" : "s") + ": " + failed[0].detail);
  const waits = {};
  auto.filter((r) => r.status === "waiting").forEach((r) => { waits[r.action] = r; });
  Object.keys(waits).forEach((k) => lines.push("Waiting for your click: " + LABELS[k].toLowerCase() + " (" + waits[k].count + "). " + waits[k].detail));
  const unfixed = all.filter((r) => r.action === "check" && r.status === "failed");
  if (unfixed.length) lines.push("Still failing after Jarvis's fix: " + unfixed.map((r) => r.target).join(", ") + ".");
  return lines;
}

module.exports = {
  SAFE, CAPS, LABELS, NOTICE_TRIES, NOTICE_HOURS, CONFIDENCE, RISKY_JOBS, RISKY_CI, cleanSettings, cleanRerun, noticeHours, usedToday, todayRows, log, recent,
  fixPlan, aiCatalog, aiPrompt, aiPicks, newestFix, lastRun, autoRun, summary, pushMessage, checkMessage, briefLines
};
