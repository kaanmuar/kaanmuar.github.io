/* Every recurring job of QA-lab URL Review, in one table: when it runs, where, and how long a silence
   means it was missed. functions/index.js reads the Firebase crons from here, every Firebase job writes
   ops_runs/<job> when it ends, and opsWatchdog compares the two each morning.

   Firebase crons are Bogotá time. The night (00:00-05:45) belongs to the country sweep, so it never competes with people
   for the review browser (3 instances); failures are handled at dawn, reports go out before 08:00, and
   anything that emails a person waits for Monday-Saturday daytime (Ley 2300 de 2023). */

const TIME_ZONE = "America/Bogota";
const H = 3600000;

const JOBS = [
  { job: "sweepReviews", cron: "*/15 0-5 * * *", gap: 20, what: "Review the next country-sweep site (one per tick, capped per day)" },
  { job: "ensureLiveReportsBatch", cron: "0 6 * * *", gap: 26, what: "Start the Live Reports workflow once the night's sweep is done (GitHub fires its own slots hours late)" },
  { job: "diagnoseReviewFailures", cron: "0 6 * * *", gap: 26, what: "Probe why yesterday's failed reviews failed" },
  { job: "rerunReviewFailures", cron: "30 6 * * *", gap: 26, what: "Re-run failed reviews a fix now covers" },
  { job: "fileReviewFailureBugs", cron: "5 7 * * *", gap: 26, what: "Open a bug under #320 for each new failure cause" },
  { job: "emailDailySiteReport", cron: "15 7 * * *", gap: 26, what: "Daily site report" },
  { job: "emailDailyReviewReport", cron: "20 7 * * *", gap: 26, what: "Daily URL review report" },
  { job: "emailWeeklySiteReport", cron: "30 7 * * 1", gap: 7 * 24 + 2, what: "Weekly site report" },
  { job: "emailWeeklyReviewReport", cron: "35 7 * * 1", gap: 7 * 24 + 2, what: "Weekly URL review report" },
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
  sweepPerDay: { env: "SWEEP_PER_DAY", value: 24, why: "Review browser: 4 vCPU x ~100 s a review; the free tier covers ~450 a month" },
  ownerNoticesPerDay: { env: "OWNER_NOTICES_PER_DAY", value: 15, why: "Cold mail to strangers: keep sender reputation while bounces are unknown" },
  webSearchPerMonth: { value: 2000, why: "Brave ~1,000 + Tavily 1,000 a month; the sweep spends none" },
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
