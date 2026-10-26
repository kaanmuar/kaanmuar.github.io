/* Every recurring job of QA-lab URL Review, in one table: when it runs, where, and how long a silence
   means it was missed. functions/index.js reads the Firebase crons from here, every Firebase job writes
   ops_runs/<job> when it ends, and opsWatchdog compares the two each morning.

   Firebase crons are Bogotá time. The night (00:00-06:00, the 05:45 tick ends by 05:59) belongs to the country sweep, so it never competes with people
   for the review browser (3 instances); failures are handled at dawn, reports go out before 08:00, and
   anything that emails a person waits for Monday-Saturday daytime (Ley 2300 de 2023). */

const TIME_ZONE = "America/Bogota";
const H = 3600000;

const JOBS = [
  { job: "sweepReviews", cron: "*/15 0-5 * * *", gap: 20, what: "Review the next country-sweep sites (up to 4 a tick, each tick done in 15 minutes, capped per day)" },
  { job: "rivalSweep", cron: "7-52/15 1-5 * * *", gap: 20, what: "Find a country-sweep site's 2-3 natural competitors, review them passively and store the comparison (one step per tick)" },
  { job: "refreshSocialHubStats", cron: "40 5 * * *", gap: 26, what: "GA4 and site_events numbers for the Social hub pane, and the hub's Trending order (pulled by the 06:00 Live Reports run)" },
  { job: "ensureLiveReportsBatch", cron: "0 6 * * *", gap: 26, what: "Start the Live Reports workflow once the night's sweep is done (GitHub fires its own slots hours late)" },
  { job: "diagnoseReviewFailures", cron: "0 6 * * *", gap: 26, what: "Probe why yesterday's failed reviews failed" },
  { job: "rerunReviewFailures", cron: "30 6 * * *", gap: 26, what: "Re-run failed reviews a fix now covers" },
  { job: "fileReviewFailureBugs", cron: "5 7 * * *", gap: 26, what: "Open a bug under #320 for each new failure cause" },
  { job: "emailDailySiteReport", cron: "15 7 * * *", gap: 26, what: "Daily site report" },
  { job: "emailDailyReviewReport", cron: "20 7 * * *", gap: 26, what: "Daily URL review report" },
  { job: "emailWeeklySiteReport", cron: "30 7 * * 1", gap: 7 * 24 + 2, what: "Weekly site report" },
  { job: "emailWeeklyReviewReport", cron: "35 7 * * 1", gap: 7 * 24 + 2, what: "Weekly URL review report" },
  { job: "jarvisDailyBriefing", cron: "40 7 * * *", gap: 26, what: "Jarvis daily briefing: the last 24 hours, goals and alerts, by email (Admin > Statistics > Settings)" },
  { job: "jarvisWeeklyStrategy", cron: "0 19 * * 0", gap: 7 * 24 + 2, what: "Jarvis weekly strategy to the owner: four weeks side by side, the proposals and Gemini's plan for next week (Admin > Statistics > Settings)" },
  { job: "jarvisWatch", cron: "5 * * * *", gap: 2, what: "Jarvis safe actions within daily caps (clean held re-runs, failed owner notices in Ley 2300 hours, a stale hub), then the watch: mail an alert-level threshold crossing (uptime, TLS, jobs, failed runs), once a day per issue, and one push for new outreach notices" },
  { job: "emailMonthlySiteReport", cron: "45 7 1 * *", gap: 31 * 24 + 2, what: "Monthly site report" },
  { job: "emailMonthlyReviewReport", cron: "50 7 1 * *", gap: 31 * 24 + 2, what: "Monthly URL review report" },
  { job: "emailQuarterSiteReport", cron: "*/15 * * * *", gap: 1, what: "Quarter-hour site report, only when something happened" },
  { job: "emailQuarterReviewReport", cron: "*/15 * * * *", gap: 1, what: "Quarter-hour review report, only when something happened" },
  { job: "exportFirestoreWeekly", cron: "0 8 * * 0", gap: 7 * 24 + 2, what: "Firestore backup" },
  { job: "opsWatchdog", cron: "10 8 * * *", gap: 26, what: "Flag missed or failed jobs; Monday digest of budgets" },
  { job: "remindOwnerReplies", cron: "0 9 * * 1-6", gap: 50, what: "List owner replies still waiting for a decision (replies themselves arrive live on ownerReplies)" },
  { job: "sendReviewNotes", cron: "0 10 * * 1-6", gap: 50, what: "Follow-up notes to askers (REVIEW_NOTES_LIVE=1)" },
  { job: "sendOwnerNotices", cron: "0 11 * * 1-6", gap: 50, what: "Owner notices for sites now on Live Reports (OWNER_NOTICES_LIVE=1)" },
  { job: "dispatchFacebookQueue", cron: "7 11 * * *", gap: 26, what: "Start the Facebook queue workflow (GitHub fires its own slot hours late)" },
  // GitHub Actions crons are UTC, as written in .github/workflows (06:41, 11:07, 08:23, 04:00 and 05:00 Bogotá). GitHub
  // starts them hours late, so nothing that must happen at a set time hangs on them.
  { job: "auto-live-reports.yml", host: "github", cron: "41 11 * * *", gap: 26, what: "Publish yesterday's reviews as Live Reports and social posts (backup slots)" },
  { job: "facebook-page.yml", host: "github", cron: "7 16 * * *", gap: 24, what: "Schedule the Facebook queue (started by dispatchFacebookQueue; this slot is the backup)" },
  { job: "field-sweep.yml", host: "github", cron: "23 13 * * *", gap: 50, what: "Propose standout items from the field for the social hub (the owner approves them in admin)" },
  { job: "sweep-seeds.yml", host: "github", cron: "0 9 16 * *", gap: 32 * 24, what: "Rebuild the country-sweep seeds from the CrUX top lists" },
  { job: "domain-index.yml", host: "github", cron: "0 10 16 * *", gap: 32 * 24, what: "Rebuild the URL Review host suggestions from the CrUX and Tranco lists" }
];

// The quotas the schedule is sized to. Change a number here and in the env, not in the job.
const BUDGETS = {
  sweepPerDay: { env: "SWEEP_PER_DAY", value: 96, why: "24 night ticks x 4 reviews (#1099). Review browser: 4 vCPU x ~100 s a review, ~2,900 a month, well past the ~450 the free tier covers" },
  ownerNoticesPerDay: { env: "OWNER_NOTICES_PER_DAY", value: 15, why: "Cold mail to strangers: keep sender reputation while bounces are unknown" },
  rivalsPerDay: { env: "RIVALS_PER_DAY", value: 4, why: "Up to 2 web searches and 3 passive reviews a site; 20 night ticks fit 4 sites" },
  webSearchPerMonth: { value: 2000, why: "Brave ~1,000 + Tavily 1,000 a month; the country sweep spends none, the rival sweep up to 8 a night" },
  sweepSocialPerBatch: { value: 2, why: "Buffer and Facebook queues stay led by requested reviews" }
};

function job(name) {
  const row = JOBS.find((item) => item.job === name);
  if (!row) throw new Error("No ops schedule for " + name);
  return row;
}

function cron(name) {
  return job(name).cron;
}

function budget(name, env) {
  const row = BUDGETS[name];
  const set = row.env && env ? Number(env[row.env]) : NaN;
  return set > 0 ? set : row.value;
}

// runs: { job: { endedAt, ok, error } }. since: when the ledger started, so a new job is not "missed".
function overdue(runs, now, since) {
  const out = [];
  JOBS.filter((row) => row.host !== "github").forEach((row) => {
    const run = (runs || {})[row.job];
    const limit = row.gap * H;
    if (!run || !run.endedAt) {
      if (now - Date.parse(since || new Date(now).toISOString()) > limit) out.push({ job: row.job, why: "no run recorded" });
      return;
    }
    if (run.ok === false) out.push({ job: row.job, why: "failed: " + String(run.error || "").slice(0, 160) });
    else if (now - Date.parse(run.endedAt) > limit) out.push({ job: row.job, why: "last ended " + run.endedAt });
  });
  return out;
}

module.exports = { TIME_ZONE, JOBS, BUDGETS, job, cron, budget, overdue };
