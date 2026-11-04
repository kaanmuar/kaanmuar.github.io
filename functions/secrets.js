// Secret Manager secrets (firebase functions:secrets:set NAME). A function sees one in process.env only when
// its runWith or v2 options list it, so each list covers every secret its call path reads, helper modules
// included; a missing name reads as undefined at runtime. Firebase refuses to deploy a name that is also in
// functions/.env.
const MAIL = ["SENDGRID_API_KEY"];
// functions/github-app.js mints app tokens from the private key.
const GITHUB = ["GITHUB_APP_PRIVATE_KEY"];
const BROWSER = ["BROWSER_KEY"];
// What a review run calls: the headless browser, PageSpeed, CrUX, Web Risk, Places (the Google Business Profile
// check) and the web search.
const SCAN = ["BROWSER_KEY", "PAGESPEED_KEY", "CRUX_KEY", "WEBRISK_KEY", "PLACES_KEY", "BRAVE_SEARCH_KEY"];
const SITE_TOKEN = ["REVIEW_VERIFY_KEY"];
const PAY = ["STRIPE_SECRET_KEY", "PAYPAL_CLIENT_SECRET", "PAYPAL_SANDBOX_CLIENT_SECRET"];
const GEMINI = ["GEMINI_API_KEY"];
// jarvisExternal and the jarvis-sources table: GitHub, speed, money, social, safety, search, outreach and mailbox.
const GRAPH = ["MS_GRAPH_TENANT_ID", "MS_GRAPH_CLIENT_ID", "MS_GRAPH_CLIENT_SECRET"];
const JARVIS_SOURCES = [...GITHUB, "PAGESPEED_KEY", "CRUX_KEY", "WEBRISK_KEY", "BRAVE_SEARCH_KEY", "YOUTUBE_KEY", "INSTANTLY_API_KEY", "IMPROVMX_API_KEY", ...GRAPH, ...PAY];
const CLOUDFLARE = ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ANALYTICS_TOKEN"];

const list = (...groups) => [...new Set(groups.flat())];

const BY_FUNCTION = {
  mail: list(MAIL),
  turnstile: list(["TURNSTILE_SECRET_KEY"]),
  booking: list(MAIL, ["TURNSTILE_SECRET_KEY", "GOOGLE_CALENDAR_CLIENT_SECRET"]),
  mailWithGithub: list(MAIL, GITHUB),
  diagnoseReviewFailures: list(BROWSER),
  rerunReviewFailures: list(MAIL, SCAN),
  fileReviewFailureBugs: list(GITHUB),
  sweep: list(SCAN),
  // placesProspects (#2120): Places Text Search for local-business prospects.
  prospects: list(["PLACES_KEY"]),
  ownerReplies: list(MAIL, ["OWNER_REPLY_KEY"]),
  reviewUrl: list(MAIL, SCAN, SITE_TOKEN, PAY, GEMINI, ["PUBLISH_KEY", "QA_TEST_KEY"]),
  reviewRun: list(MAIL, SCAN, SITE_TOKEN, ["QA_TEST_KEY"]),
  reviewBrowser: list(BROWSER),
  jarvisReviewRun: list(SCAN, SITE_TOKEN),
  jarvisMail: list(MAIL, JARVIS_SOURCES, GEMINI),
  jarvisWatch: list(MAIL, JARVIS_SOURCES, BROWSER, GEMINI),
  jarvisCountdowns: list(MAIL, JARVIS_SOURCES, BROWSER),
  // jarvisGithub (#2526): the app token for the day docs and the run logs, Gemini for the diagnoses and the retro.
  jarvisGithub: list(MAIL, GITHUB, GEMINI),
  // jarvisIndexCheck and jarvisIndexPush (#2480): Brave's site: search, and Brave's form through the review browser.
  jarvisIndex: list(["BRAVE_SEARCH_KEY"], BROWSER),
  // A Gmail app password for the inbox qa@carlosandmunoz.com forwards to (functions/tiktok-business-watch.js).
  tiktokBusinessWatch: list(MAIL, GITHUB, ["QA_MAIL_APP_PASSWORD"]),
  // functions/mailbox-graduate.js (#2382): Instantly accounts and campaigns, then a mail and a comment on #2379.
  mailboxGraduate: list(MAIL, GITHUB, ["INSTANTLY_API_KEY"]),
  // The key in the webhook URL each ImprovMX alias posts to (functions/mail-inbound.js); an owner reply to qa@
  // mails the operator like ownerReplies does (#1899).
  mailInbound: list(MAIL, ["MAIL_WEBHOOK_KEY"]),
  // The daily canary mails canary@ through SendGrid (functions/mail-health.js, #1900).
  mailCanary: list(MAIL),
  // The engagement scout (#1988): Gemini reads the posts and drafts replies, YouTube search finds the videos, and
  // the reports go by mail. The poster (#1990) refreshes the YouTube channel's token through the calendar's OAuth
  // client; the Bluesky and Mastodon accounts are connected in Jarvis and kept in Firestore (engagement_private).
  engagement: list(MAIL, GEMINI, ["YOUTUBE_KEY", "GOOGLE_CALENDAR_CLIENT_SECRET"]),
  // The weekly report also opens the report replies' results ticket on the board (#2471).
  engagementWeekly: list(MAIL, GEMINI, GITHUB, ["YOUTUBE_KEY", "GOOGLE_CALENDAR_CLIENT_SECRET"]),
  // An approved YouTube comment goes out from the jarvis function at once, so it refreshes the same token.
  // CURSOR_API_KEY (github-agent, #2526) is not listed: a name missing from Secret Manager fails the deploy, so it is
  // read from functions/.env until it is set there or with functions:secrets:set and added here.
  jarvis: list(MAIL, JARVIS_SOURCES, BROWSER, GEMINI, CLOUDFLARE, ["GOOGLE_CALENDAR_CLIENT_SECRET"])
};

const ALL = list(...Object.values(BY_FUNCTION));

module.exports = Object.assign({ ALL }, BY_FUNCTION);
