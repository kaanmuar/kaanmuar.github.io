/* Jarvis actions (#1337): the safe actions Jarvis runs on its own every hour (inside jarvisWatch), within daily caps,
   and the log of every action, automatic or clicked, in jarvis_actions.

   rerun-held      send held re-runs to their askers; on its own only clean ones (a complete report with a score and an
                   asker's address), the rest wait for a click
   resend-notices  re-send owner notices whose last send failed: Monday-Saturday 08:00-19:00 Bogotá (Ley 2300 de 2023),
                   under NOTICE_TRIES, inside the day's owner-notice budget and only while OWNER_NOTICES_LIVE=1, click or not
   publish-hub     run refreshSocialHubStats when the hub stats are stale
   run-job         clicked only: run a scheduled job again

   jarvis_settings/main.actions = { auto, caps: { action: per day } }. A click is not capped by Jarvis's own caps. */

const core = require("./jarvis-core");

const SAFE = core.SAFE_ACTIONS;
const CAPS = { "rerun-held": 10, "resend-notices": 10, "publish-hub": 2 };
const LABELS = { "rerun-held": "Send held re-runs", "resend-notices": "Re-send failed owner notices", "publish-hub": "Publish the Social hub", "run-job": "Run a job again", "rerun-ci": "Re-run failed CI jobs", "rating-decide": "Decide ratings", "brief-mark": "Snooze or dismiss a briefing line" };
const NOTICE_TRIES = 3;
const NOTICE_HOURS = { from: 8, to: 19 };
const DAY = 24 * 60 * 60 * 1000;

const text = (value, max) => String(value === null || value === undefined ? "" : value).replace(/\s+/g, " ").trim().slice(0, max);

function cleanSettings(saved) {
  const s = saved || {};
  const caps = {};
  Object.keys(CAPS).forEach((key) => {
    const n = Number(s.caps && s.caps[key]);
    caps[key] = Number.isFinite(n) && s.caps[key] !== "" && s.caps[key] !== null ? Math.max(0, Math.min(100, Math.round(n))) : CAPS[key];
  });
  return { auto: typeof s.auto === "boolean" ? s.auto : true, caps };
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
     noticesLive     -> boolean (OWNER_NOTICES_LIVE=1) }
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

module.exports = { SAFE, CAPS, LABELS, NOTICE_TRIES, NOTICE_HOURS, cleanSettings, cleanRerun, noticeHours, usedToday, todayRows, log, recent, autoRun, summary, pushMessage, briefLines };
