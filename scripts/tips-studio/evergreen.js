/* Evergreen posts (#1113): myth vs fact, 30-second tricks, a word of the day, and checklists. Each one names its hub
   kind; the social calendar slots myths and checklists in lane 4 and tricks and terms in lane 2.
     node scripts/tips-studio/build.js --source evergreen --batch evergreen-2026-11
   Every number is a published standard (WCAG 2.2, web.dev, Google Search Central, MDN) or comes from our own
   October 2026 real runs. Topics already in tips.js and horror-headers.js are left out. */

const { SITE, GUIDE, CATS, xPost } = require("./tips");
const { BRAND, tagLine } = require("../social-tags");

const CAMPAIGN = "evergreen-2026-11";
const MYTH = { counter: "Myth vs fact", actionLabel: "Check it" };
const TRICK = { counter: "30-second trick", actionLabel: "Try it now" };
const TERM = { counter: "Word of the day", actionLabel: "Spot it" };
const LIST = { counter: "Checklist", actionLabel: "Use it" };
const LABELS = ["Myth", "Fact"];

const TIPS = [
  Object.assign({
    id: "ttfb-curl", kind: "trick", cat: "Perf",
    title: ["Time your server", "*in one line.*"],
    body: "curl can report when the first byte of the page arrived. web.dev suggests a Time to First Byte of 0.8 seconds or less for most sites.",
    visual: { type: "code", lines: ["$ curl -o /dev/null -s \\", "  -w '%{time_starttransfer}s\\n' \\", "  https://example.com/", "0.214s"], note: "Example output · seconds until the first byte arrived" },
    action: "Run it a few times on your home page and your slowest template. Over 0.8 seconds? Look at the server before the front end.",
    tags: ["WebPerformance", "TTFB", "DevTools"]
  }, TRICK),
  Object.assign({
    id: "myth-lighthouse", kind: "myth", cat: "A11y",
    title: ["Myth: a Lighthouse 100", "*means accessible.*"],
    body: "Lighthouse checks what software can detect, such as names, contrast and ARIA. It cannot tell whether alt text makes sense or whether a screen reader user can finish the task.",
    visual: { type: "myth", labels: LABELS, myth: "A Lighthouse 100 means the site is accessible.", fact: "Lighthouse says so itself: automatic detection can only detect a subset of issues, so manual testing is also encouraged." },
    action: "After the score, try one real task with a screen reader: VoiceOver on a Mac, NVDA on Windows.",
    tags: ["Accessibility", "Lighthouse", "a11y"]
  }, MYTH),
  Object.assign({
    id: "hreflang", kind: "term", term: "hreflang", cat: "SEO",
    title: ["hreflang: the right page", "*for each language.*"],
    body: "An attribute that tells search engines which language or region each version of a page is for, so a Spanish speaker lands on the Spanish page.",
    visual: { type: "term", value: "hreflang", group: "HTML attribute · SEO", lines: ["<link rel=\"alternate\" hreflang=\"es\"", "  href=\"https://example.com/es/\">", "<link rel=\"alternate\" hreflang=\"x-default\"", "  href=\"https://example.com/\">"], note: "Every version lists all the others, and itself" },
    action: "Open one translated page and check that it links to every language version, itself included. Google ignores links that are not returned.",
    tags: ["SEO", "hreflang", "i18n"]
  }, TERM),
  Object.assign({
    id: "coverage", kind: "trick", cat: "Perf",
    title: ["Find the code", "*your page never runs.*"],
    body: "The Coverage panel in Chrome DevTools marks every byte of script and stylesheet as used or unused while you load and use the page.",
    visual: { type: "check", items: [["Cmd or Ctrl + Shift + P", "Type Coverage, choose Show Coverage", "pass"], ["Reload button in the panel", "Records while the page loads", "pass"], ["Sort by unused bytes", "Red means it never ran", "risk"]] },
    action: "Click through the page's main task, then sort by unused bytes. Split or defer the biggest file that stays mostly red.",
    tags: ["WebPerformance", "DevTools", "JavaScript"]
  }, TRICK),
  Object.assign({
    id: "myth-https", kind: "myth", cat: "Security",
    title: ["Myth: the padlock", "*means the site is secure.*"],
    body: "HTTPS encrypts the trip between the browser and the server. It says nothing about the page's scripts, headers and cookies, or about who is behind the site.",
    visual: { type: "myth", labels: LABELS, myth: "HTTPS means the site is secure.", fact: "All 227 sites in our October 2026 real runs load over HTTPS. Their security scores still range from 16 to 94 out of 100." },
    action: "Check what the padlock does not cover: response headers, cookie flags, outdated scripts and a DMARC record.",
    tags: ["WebSecurity", "HTTPS", "AppSec"]
  }, MYTH),
  Object.assign({
    id: "sri", kind: "term", term: "Subresource Integrity", cat: "Security",
    title: ["SRI:", "*a fingerprint for borrowed scripts.*"],
    body: "Subresource Integrity puts a hash of the file in the tag. If the CDN ever serves anything else, the browser refuses to run it.",
    visual: { type: "term", value: "SRI", group: "Subresource Integrity · security", lines: ["<script src=\"https://cdn.example.com/lib.js\"", "  integrity=\"sha384-…\"", "  crossorigin=\"anonymous\"></script>"], note: "Pin an exact version: a file that changes breaks the hash" },
    action: "List the scripts you load from other domains. Add an integrity hash to every one that has a fixed version.",
    tags: ["WebSecurity", "SRI", "JavaScript"]
  }, TERM),
  Object.assign({
    id: "pre-release", kind: "advice", cat: "QA",
    title: ["The 10-minute", "*pre-release check.*"],
    body: "Ten things that break at deploy time and that no unit test sees. About a minute each, on the live site, before you announce anything.",
    visual: { type: "check", items: [["Meta robots", "No noindex left from staging", "risk"], ["robots.txt", "No Disallow: / left over", "risk"], ["Canonical", "Points to production", "risk"], ["Status codes", "Pages 200, missing pages 404", "pass"], ["Mixed content", "No http:// files on https", "pass"], ["Console", "No new errors", "pass"], ["A real form", "Sends and shows success", "pass"], ["Analytics", "Production property", "pass"], ["Cache", "New CSS and JS served", "pass"], ["Sitemap", "Lists the new pages", "pass"]] },
    steps: ["Check that no page still carries a noindex left over from staging.", "Open robots.txt and make sure no Disallow: / was left over.", "Check that canonical tags point to production, not staging.", "Request a real page and a made-up one: 200 and 404.", "Look for http:// images, scripts or styles on https pages.", "Open the console and look for new errors.", "Send one real form and wait for the success message.", "Check that analytics reports to the production property.", "Hard-reload and confirm the new CSS and JavaScript are served.", "Open the sitemap and find the new pages in it."],
    action: "Copy the list into your release ticket and tick it on the live site, not on staging.",
    tags: ["QA", "ReleaseManagement", "SoftwareTesting"]
  }, LIST),
  Object.assign({
    id: "googlebot", kind: "trick", cat: "SEO",
    title: ["See your page", "*the way Googlebot does.*"],
    body: "Search Console's URL Inspection tool can fetch a live page as Google and show the rendered HTML, a screenshot, and the resources it could not load.",
    visual: { type: "check", items: [["URL Inspection", "Paste the page address", "pass"], ["Test live URL", "Google fetches it now", "pass"], ["View tested page", "HTML, screenshot, more info", "pass"]] },
    action: "Search the rendered HTML for your main heading and your key facts. If they are missing there, Google may not see them either.",
    tags: ["SEO", "TechnicalSEO", "SearchConsole"]
  }, TRICK),
  Object.assign({
    id: "inp", kind: "term", term: "Interaction to Next Paint", cat: "Perf",
    title: ["INP:", "*how fast the page answers a tap.*"],
    body: "Interaction to Next Paint measures the delay from a click, tap or key press to the next frame on screen. It replaced First Input Delay as a Core Web Vital in March 2024.",
    visual: { type: "term", value: "INP", group: "Core Web Vital · responsiveness", lines: ["✓ ≤ 200 ms", "! ≤ 500 ms", "✕ > 500 ms"], note: "At the 75th percentile of page loads, mobile and desktop apart" },
    alt: "Word of the day card. INP: how fast the page answers a tap. Interaction to Next Paint is good at 200 ms or less, needs improvement up to 500 ms, and poor over 500 ms, at the 75th percentile of page loads.",
    action: "Find the slowest tap on your page, often a menu or a filter, and break up the long task behind it.",
    tags: ["WebPerformance", "CoreWebVitals", "INP"]
  }, TERM),
  Object.assign({
    id: "myth-overlay", kind: "myth", cat: "A11y",
    title: ["Myth: one line of code", "*makes a site accessible.*"],
    body: "Overlay widgets promise WCAG compliance from a single script. In April 2025 the US Federal Trade Commission ordered one vendor to pay $1 million and stop claiming its tool makes any site compliant without evidence.",
    visual: { type: "myth", labels: LABELS, myth: "An overlay widget makes the site WCAG compliant.", fact: "The barriers live in the page's own code: missing labels, keyboard traps, unclear headings. They are fixed there." },
    action: "Spend the overlay budget on your shared templates first: header, navigation, forms and footer.",
    tags: ["Accessibility", "WCAG", "a11y"]
  }, MYTH),
  Object.assign({
    id: "vision", kind: "trick", cat: "A11y",
    title: ["Preview colour blindness", "*in two clicks.*"],
    body: "Chrome DevTools can simulate blurred vision, reduced contrast and four kinds of colour vision deficiency, right on your own page.",
    visual: { type: "check", items: [["Cmd or Ctrl + Shift + P", "Type Rendering, choose Show Rendering", "pass"], ["Emulate vision deficiencies", "Pick Deuteranopia", "pass"], ["Look at charts and errors", "Colour alone must not carry meaning", "risk"]] },
    action: "Check every error message, chart and link. If colour is the only signal, add text, an icon or an underline.",
    tags: ["Accessibility", "DevTools", "Design"]
  }, TRICK),
  Object.assign({
    id: "myth-sitemap", kind: "myth", cat: "SEO",
    title: ["Myth: a sitemap", "*gets every page indexed.*"],
    body: "A sitemap helps search engines discover your pages. Google says plainly that it does not guarantee every listed page will be crawled and indexed.",
    visual: { type: "myth", labels: LABELS, myth: "Every page in the sitemap gets indexed.", fact: "The sitemap is a hint. Google still decides, and internal links, canonical tags and page quality all weigh in." },
    action: "Open the Pages report in Search Console and filter it by your sitemap. Each page left out is listed with its reason.",
    tags: ["SEO", "Sitemap", "SearchConsole"]
  }, MYTH),
  Object.assign({
    id: "lcp", kind: "term", term: "Largest Contentful Paint", cat: "Perf",
    title: ["LCP:", "*when the main thing shows up.*"],
    body: "Largest Contentful Paint marks when the biggest image or text block in the viewport finishes rendering. Good is 2.5 seconds or less for at least 75% of page loads.",
    visual: { type: "term", value: "LCP", group: "Core Web Vital · loading", lines: ["<img src=\"hero.webp\" alt=\"…\"", "  fetchpriority=\"high\">"], note: "Never lazy-load the LCP image" },
    action: "Open the Performance panel in Chrome DevTools: its live metrics name your LCP element. Make sure it is never lazy-loaded.",
    tags: ["WebPerformance", "CoreWebVitals", "LCP"]
  }, TERM),
  Object.assign({
    id: "a11y-check", kind: "advice", cat: "A11y",
    title: ["The 5-minute", "*accessibility check.*"],
    body: "Five checks anyone can run with no special tools. Each one maps to a WCAG 2.2 success criterion, so a failure is easy to file.",
    visual: { type: "check", items: [["Zoom to 200%", "Nothing cut off · 1.4.4", "pass"], ["Narrow to 320 px", "No sideways scrolling · 1.4.10", "pass"], ["Page title", "Says what the page is · 2.4.2", "pass"], ["Link text", "Says where it goes · 2.4.4", "risk"], ["Language", "<html lang> is set · 3.1.1", "pass"]] },
    steps: ["Zoom the browser to 200% and check that nothing is cut off (WCAG 1.4.4).", "Narrow the window to 320 CSS pixels and check there is no sideways scrolling (WCAG 1.4.10).", "Read the tab title: it should say what the page is (WCAG 2.4.2).", "Read each link: its text, with its context, should say where it goes (WCAG 2.4.4).", "View source and check that the html element has a lang attribute (WCAG 3.1.1)."],
    action: "Run all five on your home page and your busiest form. File each failure with its criterion number.",
    tags: ["Accessibility", "WCAG", "QA"]
  }, LIST),
  Object.assign({
    id: "dmarc", kind: "trick", cat: "Security",
    title: ["Can anyone send mail", "*as your domain?*"],
    body: "A DMARC record tells receiving servers what to do with mail that claims your domain but fails authentication. Without one, spoofed mail has an easier way in.",
    visual: { type: "code", lines: ["$ dig +short TXT _dmarc.example.com", "\"v=DMARC1; p=quarantine;", "  rua=mailto:dmarc@example.com\""], note: "No answer means no DMARC policy" },
    action: "Run the lookup on your domain. No answer? Publish p=none with a report address, read the reports, then move to quarantine.",
    tags: ["EmailSecurity", "DMARC", "DNS"]
  }, TRICK),
  Object.assign({
    id: "skip-link", kind: "term", term: "Skip link", cat: "A11y",
    title: ["Skip link:", "*jump straight past the menu.*"],
    body: "A link at the very top of the page that takes keyboard and screen reader users straight to the main content. It is one way to meet WCAG 2.4.1, Bypass Blocks, at Level A.",
    visual: { type: "term", value: "Skip link", group: "Accessibility · WCAG 2.4.1", lines: ["<a class=\"skip\" href=\"#main\">", "  Skip to main content</a>", "…", "<main id=\"main\">"], note: "It can stay hidden until it gets keyboard focus" },
    action: "Load your page and press Tab once. The first thing that appears should be a way to skip to the content.",
    tags: ["Accessibility", "WCAG", "a11y"]
  }, TERM),
  Object.assign({
    id: "field-vs-lab", kind: "trick", cat: "Perf",
    title: ["Your Lighthouse score", "*is not your visitors.*"],
    body: "PageSpeed Insights shows two things. The top half is real-user data from the Chrome UX Report over the last 28 days. The score below it is one lab run on a simulated phone.",
    visual: { type: "check", items: [["Lab", "One run, simulated phone, throttled network", "risk"], ["Field", "Real visitors, last 28 days, 75th percentile", "pass"]] },
    action: "Read the top half first. If your page has no real-user data there, collect your own with Google's web-vitals library.",
    tags: ["WebPerformance", "CoreWebVitals", "Lighthouse"]
  }, TRICK),
  Object.assign({
    id: "myth-keywords", kind: "myth", cat: "SEO",
    title: ["Myth: meta keywords", "*still help you rank.*"],
    body: "Google said in 2009 that it does not use the keywords meta tag in web ranking. The tag does show your competitors the words you are targeting.",
    visual: { type: "myth", labels: LABELS, myth: "<meta name=\"keywords\"> helps your ranking.", fact: "Google ignores it for ranking. A clear title and meta description do the work, and the description may become your snippet." },
    action: "Search your templates for name=\"keywords\". Remove it, and write a real description for each key page instead.",
    tags: ["SEO", "MetaTags", "Content"]
  }, MYTH)
];

// Alt text from the post's own sentences, whole sentences only, within LinkedIn's 300 characters.
function altFor(tip) {
  const v = tip.visual;
  const what = v.type === "myth" ? ["Fact: " + v.fact] : tip.kind === "advice" ? ["Checks: " + v.items.map((i) => i[0]).join(", ") + "."] : tip.body.split(/(?<=\.)\s+/);
  const parts = [tip.counter + " card.", plainTitle(tip)].concat(what);
  return parts.reduce((out, part) => (out.length + part.length + 1 <= 300 ? (out ? out + " " : "") + part : out), "");
}
TIPS.forEach((tip) => { tip.alt = tip.alt || altFor(tip); });

function link(platform, tip) {
  const q = new URLSearchParams({ utm_source: platform, utm_medium: "social", utm_campaign: CAMPAIGN, utm_content: tip.id });
  return GUIDE + "?" + q.toString();
}

function plainTitle(tip) { return tip.title.join(" ").replace(/\*/g, "").replace(/\s+/g, " ").trim(); }

function captions(tip) {
  const head = plainTitle(tip);
  const label = tip.actionLabel + ": ";
  return {
    linkedin: [tip.counter + ": " + head, "", tip.body, "", label + tip.action, "", "How a public-page review works, step by step: " + link("linkedin", tip), "", tagLine(tip, "linkedin")].join("\n"),
    x: xPost(head + "\n\n" + tip.action, link("x", tip), tagLine(tip, "x")),
    instagram: [tip.counter + ": " + head, "", tip.body, "", label + tip.action, "", tagLine(tip, "instagram")].join("\n"),
    facebook: [tip.counter + ": " + head, "", tip.body, "", label + tip.action, "", link("facebook", tip), "", tagLine(tip, "facebook")].join("\n"),
    tiktok: head + " " + tip.action + " " + tagLine(tip, "tiktok"),
    youtubeTitle: (head + " #Shorts").slice(0, 100),
    youtube: [tip.body, "", label + tip.action, "", "Guide: " + link("youtube", tip), "", tip.counter + " · QA-lab URL Review", "", tagLine(tip, "youtube")].join("\n")
  };
}

module.exports = { SITE, GUIDE, BRAND, CATS, TIPS, captions, link, plainTitle, xPost };
