/* The live studio's scripted episodes (#3140). Each one frames a real report from Live Reports (assets/live-reports/<report>.json)
   in a situation a viewer knows, and walks one of its findings from the problem to the fix.
   Lines are English; run.js translates them with scripts/tips-studio/translate.py for the other five languages.
   {host}, {name}, {score}, {grade}, {pages}, {fails}, {risks}, {passes}, {f1} to {f3} and {read} are filled from the report.
   fix.pick matches the title of the finding the walk-through explains; fix.before and fix.after are the code it changes,
   and fix.metric the before/after pair the split screen compares (a goal, never a promised result). */

const SCENES = ["intro", "run", "score", "findings", "fix", "beforeafter", "ask", "cta"];
// Chapter names in the recording's metadata and cut.js's chapters.txt.
const SCENE_TITLES = { intro: "Intro pitch", run: "Live review", score: "Score reveal", findings: "Findings", fix: "Fix walk-through",
  beforeafter: "Before and after", ask: "Your turn", cta: "Call to action" };

const LINES = {
  run: "Let's run it. {host}: {pages} pages, six areas. SEO, AI search, analytics, security, accessibility and speed.",
  score: "{score} out of 100. Grade {grade}. {fails} checks fail, {risks} are at risk, and {passes} pass.",
  findings: "Fix these three first. One: {f1}. Two: {f2}. Three: {f3}.",
  ask: "Your turn. Comment your site's address below, and we review it live, right here on stream.",
  cta: "Scan the code, or open carlosandmunoz.com/qa-review. Paste your address and get your own report in minutes.",
  ctaTrial: "Scan the code for a free two-day trial: three full reviews of your own site. The link on screen has the code, and it works until tomorrow."
};

const UI = {
  live: "Live",
  realReport: "Real report from Live Reports",
  read: "Read",
  today: "Today's site",
  reviewing: "Reviewing",
  review: "Review",
  pages: "pages",
  score: "Score",
  fail: "Fail",
  risk: "At risk",
  pass: "Pass",
  fixFirst: "Fix these first",
  walkthrough: "Fix walk-through",
  example: "Example",
  before: "Before",
  after: "After",
  goal: "Goal",
  yourTurn: "Your turn",
  commentUrl: "Comment your site's URL",
  weReview: "We review it live, on stream",
  waiting: "Waiting for your link",
  exampleUrl: "yourwebsite.com",
  scan: "Scan to review your site",
  coupon: "Live code",
  trial: "Free 2-day trial",
  trialRuns: "3 full reviews",
  next: "Up next",
  askedBy: "Asked by",
  queued: "In the queue",
  fromLive: "Already in Live Reports",
  running: "Running a fresh review",
  noRun: "Scan the code to run it yourself",
  follow: "Follow for the next live",
  host: "Your host",
  aiVoice: "AI voice",
  areaSEO: "SEO",
  areaGEO: "AI search",
  areaAnalytics: "Analytics",
  areaSecurity: "Security",
  areaAccessibility: "Accessibility",
  areaPerformance: "Speed"
};

const EPISODES = [
  {
    id: "hotel-high-season",
    title: "Hotel booking site, three weeks before high season",
    chip: "3 weeks to high season",
    hook: ["Your rooms are ready.", "*Is your booking site?*"],
    report: "visitbogota",
    intro: "High season starts in three weeks. Guests book on their phones, and a slow page sends them to the hotel next door. Let's check a real travel site, the way a guest meets it.",
    fix: {
      pick: "took",
      say: "The start page takes about two and a half seconds just to arrive, before a single photo. Cache the HTML at the edge, trim the redirects, and measure again.",
      steps: ["Cache the HTML at a CDN edge", "Cut redirects before the first byte", "Re-run the review to confirm"],
      before: "Cache-Control: no-store\nx-cache: MISS",
      after: "Cache-Control: public, max-age=300, stale-while-revalidate=600\nx-cache: HIT",
      metric: { label: "Time to first byte", before: "2,416 ms", after: "under 800 ms", unit: "Google's good threshold" }
    },
    beforeafter: "Before: two point four seconds of white screen. The goal: under eight hundred milliseconds, where Google calls it good."
  },
  {
    id: "restaurant-menu-phone",
    title: "Restaurant menu on a phone",
    chip: "Menu on a phone",
    hook: ["They found your menu.", "*Can they read it?*"],
    report: "rappi",
    intro: "Tonight, someone picks a place to eat from the sofa, on a phone. The menu has small print, prices, allergens. Let's review a real food delivery site the way that phone sees it.",
    fix: {
      pick: "zooming",
      say: "The page stops people from zooming. Someone who can't read the small print can't pinch to enlarge it. One line in the viewport tag fixes it.",
      steps: ["Open the page's head", "Remove user-scalable=no and maximum-scale", "Pinch the menu on a real phone"],
      before: "<meta name=\"viewport\"\n  content=\"width=device-width, initial-scale=1,\n  maximum-scale=1, user-scalable=no\">",
      after: "<meta name=\"viewport\"\n  content=\"width=device-width, initial-scale=1\">",
      metric: { label: "Pinch to zoom", before: "Blocked", after: "Allowed", unit: "WCAG 1.4.4 Resize text" }
    },
    beforeafter: "Before: the menu is frozen at one size. After: anyone can pinch and read the allergens."
  },
  {
    id: "black-friday-store",
    title: "Online store on Black Friday",
    chip: "Black Friday",
    hook: ["Black Friday traffic is coming.", "*Will your store hold?*"],
    report: "falabella",
    intro: "Black Friday. Your ads are paid, your prices are cut, and shoppers compare you with three other tabs. Let's review a real national store and see what breaks first.",
    fix: {
      pick: "JSON-LD",
      say: "Three blocks of product data don't parse. Google can't read the price or the stock, so the deal never shows in the results. Validate the JSON and fix the stray comma.",
      steps: ["Paste each block in the Schema Markup Validator", "Fix the broken JSON", "Check prices in Google's rich results test"],
      before: "{ \"@type\": \"Product\",\n  \"offers\": { \"price\": \"1299.00\", },\n}",
      after: "{ \"@type\": \"Product\",\n  \"offers\": { \"price\": \"1299.00\",\n    \"priceCurrency\": \"COP\" } }",
      metric: { label: "Product data blocks", before: "3 broken", after: "0 broken", unit: "Prices readable in search" }
    },
    beforeafter: "Before: Google sees a broken block and no price. After: the Black Friday price can show right in the results."
  },
  {
    id: "bank-login-a11y",
    title: "Bank login and accessibility",
    chip: "Bank login",
    hook: ["Everyone needs to log in.", "*Can everyone?*"],
    report: "bancolombia",
    intro: "A bank's login is the one page every customer must get through, including people who use a screen reader. Let's review a real bank and listen to its forms.",
    fix: {
      pick: "form controls",
      say: "Some fields have no label. A screen reader just says edit text, and the customer has to guess. Give each field a real label and the right autocomplete.",
      steps: ["Find every input without a label", "Pair it with a label, or add aria-label", "Test it with VoiceOver or NVDA"],
      before: "<input type=\"text\"\n  placeholder=\"User\">",
      after: "<label for=\"user\">User</label>\n<input id=\"user\" type=\"text\"\n  autocomplete=\"username\">",
      metric: { label: "Screen reader says", before: "\"Edit text\"", after: "\"User, edit text\"", unit: "WCAG 1.3.1 and 4.1.2" }
    },
    beforeafter: "Before: edit text, edit text. After: user, password. Same form, now everyone can use it."
  },
  {
    id: "link-in-bio",
    title: "Influencer link in bio",
    chip: "Link in bio",
    hook: ["One link in your bio.", "*Does it make the click count?*"],
    report: "ted",
    intro: "Your bio has one link, and every follower who taps it lands in an in-app browser on a phone. Let's review a real creator platform and see what that tap finds.",
    fix: {
      pick: "meta description",
      say: "Some pages have no description. When the link gets shared, the preview has nothing to say, and AI answers skip it. Write one sentence per page.",
      steps: ["List the pages your bio links to", "Write one honest sentence for each", "Add it as description and og:description"],
      before: "<head>\n  <title>Topics</title>\n</head>",
      after: "<head>\n  <title>Topics</title>\n  <meta name=\"description\"\n    content=\"Talks by topic, in 15 minutes or less.\">\n</head>",
      metric: { label: "Pages without a description", before: "5", after: "0", unit: "Better previews and AI answers" }
    },
    beforeafter: "Before: a bare link with no preview. After: a card that tells your followers why to tap."
  },
  {
    id: "agency-launch-day",
    title: "Software agency, launch day",
    chip: "Launch day",
    hook: ["The client launches at noon.", "*Ship it, or check it?*"],
    report: "shopify",
    intro: "Launch day at the agency. The client's site goes live at noon and the team wants a last look. Even a grade A site has gaps. Let's review one.",
    fix: {
      pick: "frame the page",
      say: "Other sites can put this page inside a frame, which opens the door to clickjacking. One response header closes it before launch.",
      steps: ["Add the header at the CDN or server", "Allow only your own origin", "Re-run the review after the deploy"],
      before: "HTTP/2 200\ncontent-type: text/html",
      after: "HTTP/2 200\ncontent-type: text/html\ncontent-security-policy: frame-ancestors 'self'\nx-frame-options: SAMEORIGIN",
      metric: { label: "Framing by other sites", before: "Allowed", after: "Blocked", unit: "Clickjacking closed" }
    },
    beforeafter: "Before: any site can frame the page. After launch: only your own origin can."
  },
  {
    id: "review-your-site",
    title: "Review your site live",
    chip: "Open format",
    hook: ["Drop your link.", "*We review it live.*"],
    report: "lonelyplanet",
    open: true,
    intro: "This is the open format. Comment your website's address, and we review it on stream. While the first links come in, here's a real travel site to warm up.",
    fix: {
      pick: "HSTS",
      say: "The site doesn't send HSTS, so a first visit can still start on plain http. One header tells browsers to always use https.",
      steps: ["Serve the site on https everywhere", "Send the HSTS header", "Raise max-age to a year once it works"],
      before: "HTTP/2 200\ncontent-type: text/html",
      after: "HTTP/2 200\ncontent-type: text/html\nstrict-transport-security: max-age=31536000;\n  includeSubDomains",
      metric: { label: "HSTS", before: "Missing", after: "One year", unit: "Always https" }
    },
    beforeafter: "Before: the first visit can be downgraded. After: the browser goes straight to https."
  }
];

// The line a viewer's review is voiced with: the same scenes, filled from the viewer's own report.
const VIEWER = {
  intro: "{user} asked for {host}. Let's review it, live.",
  queued: "{user} asked for {host}. It's in the queue: scan the code to run it yourself right now."
};

module.exports = { SCENES, SCENE_TITLES, LINES, UI, EPISODES, VIEWER };
