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
  { job: "outreachSweep", cron: "*/15 * * * *", gap: 20, what: "Review the next outreach prospects and peer-group sites, all day (up to 4 a tick, capped per day, no owner notices)" },
  { job: "placesProspects", cron: "30 23 * * *", gap: 26, what: "Find local-business prospects on Google Maps for tonight's outreach sweep (up to 20 Places searches, skipped while two nights are still queued)" },
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
  { job: "jarvisIndexCheck", cron: "20 7 * * *", gap: 26, what: "Brave site: search against both sitemaps: how many pages Brave has indexed and which are missing, for Jarvis's panel and briefing (one Brave call; pages 2-5 weekly)" },
  { job: "jarvisIndexPush", cron: "0 9 * * 1", gap: 7 * 24 + 2, what: "Send the sitemap pages missing from Brave's index to IndexNow (all of them) and to Brave's Submit URL form through the review browser (up to 24, main pages first, none again within 28 days)" },
  { job: "jarvisDailyBriefing", cron: "40 7 * * *", gap: 26, what: "Jarvis daily briefing: the last 24 hours, goals and alerts, pushed; by email only with its switch on (Admin > Statistics > Settings)" },
  { job: "jarvisWeeklyStrategy", cron: "0 19 * * 0", gap: 7 * 24 + 2, what: "Jarvis weekly strategy to the owner: four weeks side by side, the proposals and Gemini's plan for next week (Admin > Statistics > Settings)" },
  { job: "jarvisWatch", cron: "5 * * * *", gap: 2, what: "Jarvis safe actions within daily caps (clean held re-runs, failed owner notices in Ley 2300 hours, a stale hub), then the watch: mail an alert-level threshold crossing (uptime, TLS, jobs, failed runs, mail bounced or refused, a lost mail canary), once a day per issue, and one push for new outreach notices" },
  { job: "jarvisGithub", cron: "20 * * * *", gap: 2, what: "Jarvis GitHub (#2526): today's and yesterday's GitHub day docs, 10 more days of the 90-day backfill, Gemini diagnoses of new failed main and PR runs (12 a day), and on Sunday evening the weekly GitHub retro, mailed with the weekly switch on" },
  { job: "jarvisLogPoll", cron: "* * * * *", gap: 1, what: "Jarvis Console (#2810): GitHub Actions runs started and finished, new issues and PRs, closes, merges and board moves in the four project repos, and the Cloud Functions log (every function's warnings and errors, the jarvis* functions' info lines), into jarvis_log for 7 days" },
  { job: "jarvisCountdowns", cron: "*/10 * * * *", gap: 1, what: "Jarvis countdown (#1977): the risky actions Jarvis queued 2 hours ago (third-party email, posts off schedule, merges and deploys, resuming outreach) run unless cancelled; email and posts that come due at night wait for 08:00-21:00 Bogotá" },
  { job: "mailCanary", cron: "10 9 * * *", gap: 26, what: "Mail round trip: SendGrid mails canary@carlosandmunoz.com, ImprovMX forwards it to the mailInbound webhook, and Jarvis alerts when it has not come back in 30 minutes (#1900)" },
  { job: "tiktokBusinessWatch", cron: "25 * * * *", gap: 2, what: "Until TikTok answers the Business application (#1889): read the qa@ mail for TikTok's decision and tell Carlos once, by push, mail and a comment on #1888" },
  { job: "mailboxGraduate", cron: "0 9 * * *", gap: 26, what: "From 24 Nov (#2382): the warmed-up secondary-domain mailboxes (health 90%+) join every open Instantly campaign at 20 a day; Carlos is told by push, mail and a comment on #2379, and the job stops once all four are in or 14 days pass" },
  { job: "jarvisEveningDigest", cron: "0 20 * * *", gap: 26, what: "Jarvis evening digest: what Jarvis pushed in the last 24 hours, what still waits for a decision and what ran, in place of the emails that moved to pushes (skipped on an empty day)" },
  { job: "engagementScout", cron: "*/30 * * * *", gap: 2, what: "Social engagement scout (#1988): read our field's posts on Mastodon, Bluesky, YouTube, Hacker News, DEV and Lobsters, score them, plan likes, reposts and follows within the daily caps, and push reply drafts for approval (Jarvis > Engagement)" },
  { job: "engagementDailyReport", cron: "30 20 * * *", gap: 26, what: "Social engagement daily report: posts read, actions planned, the reply funnel, topics and top posts, by mail and push" },
  { job: "engagementWeeklyReport", cron: "40 20 * * 0", gap: 7 * 24 + 2, what: "Social engagement weekly report, against the week before, and the report replies' results ticket on the board (#2471)" },
  { job: "engagementMonthlyReport", cron: "10 8 1 * *", gap: 31 * 24 + 2, what: "Social engagement monthly report for the month before, against the one before it" },
  { job: "ownerTags", cron: "15 10 * * *", gap: 26, what: "Owner tags (#2633): read reviewed sites' profile links and Gemini's suggestions of the accounts around them (pushed for approval), then tag report owners and approved accounts in comments under our report posts, and reply under owners' latest posts (Bluesky, Mastodon and YouTube here; X, Instagram, Threads, Facebook, LinkedIn and TikTok through the Mac's agent)" },
  { job: "emailMonthlySiteReport", cron: "45 7 1 * *", gap: 31 * 24 + 2, what: "Monthly site report" },
  { job: "emailMonthlyReviewReport", cron: "50 7 1 * *", gap: 31 * 24 + 2, what: "Monthly URL review report" },
  { job: "emailQuarterSiteReport", cron: "*/15 * * * *", gap: 1, what: "Quarter-hour site report, only when something happened" },
  { job: "emailQuarterReviewReport", cron: "*/15 * * * *", gap: 1, what: "Quarter-hour review report, only when something happened" },
  { job: "exportFirestoreWeekly", cron: "0 8 * * 0", gap: 7 * 24 + 2, what: "Firestore backup" },
  { job: "opsWatchdog", cron: "10 8 * * *", gap: 26, what: "Flag missed, failed or crashed jobs, and the system review (#2409): workflows failing on main with the cause from their logs and its fix, security alerts, stale PRs; Monday digest of budgets" },
  { job: "remindOwnerReplies", cron: "0 9 * * 1-6", gap: 50, what: "List owner replies still waiting for a decision, by email only with its switch on; the evening digest lists them too" },
  { job: "sendReviewNotes", cron: "0 10 * * 1-6", gap: 50, what: "Follow-up notes to askers (REVIEW_NOTES_LIVE=1)" },
  { job: "outreachTrials", cron: "30 10 * * 1-6", gap: 50, what: "Outreach trials (#3136): each ended 2-day trial gets its AFTER- code and its person moves on in outreach_people; the note to them goes out with REVIEW_NOTES_LIVE=1" },
  { job: "sendOwnerNotices", cron: "0 11 * * 1-6", gap: 50, what: "Owner notices for sites now on Live Reports (OWNER_NOTICES_LIVE=1)" },
  { job: "dispatchFacebookQueue", cron: "7 11 * * *", gap: 26, what: "Start the Facebook queue workflow (GitHub fires its own slot hours late)" },
  // GitHub Actions crons are UTC, as written in .github/workflows (06:41, 11:07, 08:23, 04:00, 05:00 and 01:00 Bogotá). GitHub
  // starts them hours late, so nothing that must happen at a set time hangs on them.
  { job: "auto-live-reports.yml", host: "github", cron: "41 11 * * *", gap: 26, what: "Publish yesterday's reviews as Live Reports and social posts, and post the batch to the Telegram channel @qalab_live (backup slots)" },
  { job: "pagespeed-daily.yml", host: "github", cron: "0 6 * * *", gap: 30, what: "PageSpeed on every sitemap page, mobile and desktop; safe fixes and Gemini's fixes for pages under 90 go to PRs (Jarvis merges the safe ones that score up on a 2 h countdown, the rest wait in Proposals) (#1978)" },
  { job: "open-social.yml", host: "github", cron: "13,43 * * * *", gap: 6, what: "Post the slots that have come to Bluesky and Mastodon" },
  { job: "reddit-live.yml", host: "github", cron: "50 15 * * *", gap: 26, what: "Upload the Reddit app with the day's Live Reports (after each batch; this slot is the backup); the app posts and pins the batch in r/QALabLiveReports at 16:20 UTC" },
  { job: "facebook-page.yml", host: "github", cron: "7 16 * * *", gap: 24, what: "Schedule the Facebook queue (started by dispatchFacebookQueue; this slot is the backup)" },
  { job: "field-sweep.yml", host: "github", cron: "23 13 * * *", gap: 50, what: "Propose standout items from the field for the social hub (the owner approves them in admin)" },
  { job: "sweep-roundup.yml", host: "github", cron: "29 14 * * 1", gap: 8 * 24, what: "Draft the weekly neutral sweep round-up post (the owner approves it in Jarvis or admin)" },
  { job: "sweep-seeds.yml", host: "github", cron: "0 9 16 * *", gap: 32 * 24, what: "Rebuild the country-sweep seeds from the CrUX top lists" },
  { job: "domain-index.yml", host: "github", cron: "0 10 16 * *", gap: 32 * 24, what: "Rebuild the URL Review host suggestions from the CrUX and Tranco lists" }
];

// The quotas the schedule is sized to. Change a number here and in the env, not in the job.
const BUDGETS = {
  sweepPerDay: { env: "SWEEP_PER_DAY", value: 96, why: "24 night ticks x 4 reviews (#1099). Review browser: 4 vCPU x ~100 s a review, ~2,900 a month, well past the ~450 the free tier covers" },
  outreachPerDay: { env: "OUTREACH_PER_DAY", value: 384, why: "96 ticks x 4 reviews (#2363); the lane only spends what scripts/sweep-outreach.js and peer groups queue, ~$0.01 a review in the review browser" },
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

// Longer than any job's timeout (rerunReviewFailures, 1800 s), so a start this old with no end is a run that crashed.
const CRASH_AFTER = 45 * 60000;

// runs: { job: { startedAt, endedAt, ok, error } }. since: when the ledger started, so a new job is not "missed".
function overdue(runs, now, since) {
  const out = [];
  JOBS.filter((row) => row.host !== "github").forEach((row) => {
    const run = (runs || {})[row.job];
    const limit = row.gap * H;
    if (run && run.startedAt && (!run.endedAt || run.startedAt > run.endedAt) && now - Date.parse(run.startedAt) > CRASH_AFTER) {
      out.push({ job: row.job, why: "started " + run.startedAt + " and never finished: it crashed (out of memory or past its timeout) before it could record" });
      return;
    }
    if (!run || !run.endedAt) {
      if (now - Date.parse(since || new Date(now).toISOString()) > limit) out.push({ job: row.job, why: "no run recorded" });
      return;
    }
    if (run.ok === false) out.push({ job: row.job, why: "failed: " + String(run.error || "").slice(0, 160) });
    else if (now - Date.parse(run.endedAt) > limit) out.push({ job: row.job, why: "last ended " + run.endedAt });
  });
  return out;
}

module.exports = { TIME_ZONE, JOBS, BUDGETS, CRASH_AFTER, job, cron, budget, overdue };
