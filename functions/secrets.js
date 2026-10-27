// Secret Manager secrets (firebase functions:secrets:set NAME). A function sees one in process.env only when
// its runWith or v2 options list it, so each list covers every secret its call path reads, helper modules
// included; a missing name reads as undefined at runtime. Firebase refuses to deploy a name that is also in
// functions/.env.
const MAIL = ["SENDGRID_API_KEY"];
// functions/github-app.js mints app tokens from the private key and falls back to the classic token.
const GITHUB = ["GITHUB_APP_PRIVATE_KEY", "GITHUB_BUGS_TOKEN"];
const BROWSER = ["BROWSER_KEY"];
// What a review run calls: the headless browser, PageSpeed, CrUX, Web Risk and the web search.
const SCAN = ["BROWSER_KEY", "PAGESPEED_KEY", "CRUX_KEY", "WEBRISK_KEY", "BRAVE_SEARCH_KEY"];
const SITE_TOKEN = ["REVIEW_VERIFY_KEY"];
const PAY = ["STRIPE_SECRET_KEY", "PAYPAL_CLIENT_SECRET", "PAYPAL_SANDBOX_CLIENT_SECRET"];
const GEMINI = ["GEMINI_API_KEY"];
// jarvisExternal and the jarvis-sources table: GitHub, speed, money, social, safety, search and outreach.
const JARVIS_SOURCES = [...GITHUB, "PAGESPEED_KEY", "CRUX_KEY", "WEBRISK_KEY", "BRAVE_SEARCH_KEY", "YOUTUBE_KEY", "INSTANTLY_API_KEY", ...PAY];
const CLOUDFLARE = ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ANALYTICS_TOKEN"];

const list = (...groups) => [...new Set(groups.flat())];

const BY_FUNCTION = {
  mail: list(MAIL),
  mailWithGithub: list(MAIL, GITHUB),
  diagnoseReviewFailures: list(BROWSER),
  rerunReviewFailures: list(MAIL, SCAN),
  fileReviewFailureBugs: list(GITHUB),
  sweep: list(SCAN),
  ownerReplies: list(MAIL, ["OWNER_REPLY_KEY"]),
  reviewUrl: list(MAIL, SCAN, SITE_TOKEN, PAY, GEMINI, ["PUBLISH_KEY", "QA_TEST_KEY"]),
  reviewRun: list(MAIL, SCAN, SITE_TOKEN, ["QA_TEST_KEY"]),
  reviewBrowser: list(BROWSER),
  jarvisReviewRun: list(SCAN, SITE_TOKEN),
  jarvisMail: list(MAIL, JARVIS_SOURCES, GEMINI),
  jarvisWatch: list(MAIL, JARVIS_SOURCES, BROWSER),
  jarvis: list(MAIL, JARVIS_SOURCES, BROWSER, GEMINI, CLOUDFLARE)
};

const ALL = list(...Object.values(BY_FUNCTION));

module.exports = Object.assign({ ALL }, BY_FUNCTION);
