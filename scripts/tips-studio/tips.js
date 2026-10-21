/* Daily tips for the QA-lab URL Review channels. Each tip is a practice a reader can apply today.
   Numbers are standards or labelled examples, never invented results. Posts carry no prices, no
   country, and no personal name. */

const SITE = "https://carlosandmunoz.com";
const GUIDE = SITE + "/qa-review-guide.html";

const CATS = {
  QA: { label: "QA", color: "#7ef6fb" },
  SEO: { label: "SEO", color: "#e2c48a" },
  GEO: { label: "GEO · AI search", color: "#b9a6ff" },
  Analytics: { label: "Analytics", color: "#f0b45a" },
  Security: { label: "Security", color: "#ff8a80" },
  A11y: { label: "Accessibility", color: "#6fe3b1" },
  Perf: { label: "Performance", color: "#8fd0ff" },
  Field: { label: "Field note", color: "#f6f1e8" }
};

const TIPS = [
  {
    id: "canonical", cat: "SEO",
    title: ["One page,", "*one canonical.*"],
    body: "When the same content answers at several addresses, ranking signals split between them. Tell search engines which address is the real one.",
    visual: { type: "code", lines: ["<link rel=\"canonical\"", "  href=\"https://example.com/pricing\">"], note: "In the <head> of every variant" },
    action: "Open your top page with and without a trailing slash and ?utm_ tags. Both should point to one canonical.",
    tags: ["SEO", "TechnicalSEO", "WebDev"]
  },
  {
    id: "html-first", cat: "GEO",
    title: ["AI search reads", "*your HTML,* not your app."],
    body: "Many answer engines do not run JavaScript. If your key facts appear only after scripts load, they may never be read or cited.",
    visual: { type: "versus", left: { label: "Seen without JS", lines: ["<div id=\"root\"></div>"], mark: "fail" }, right: { label: "Facts in the HTML", lines: ["<h1>What we do</h1>", "<p>Who it is for…</p>"], mark: "pass" } },
    action: "View source on your home page. Can you find what you sell and who it is for, without running scripts?",
    tags: ["GEO", "AISearch", "SEO"]
  },
  {
    id: "hsts", cat: "Security",
    title: ["One header.", "*180 days* of HTTPS only."],
    body: "HSTS tells browsers to never load your site over plain HTTP again. It takes one line of configuration on most hosts.",
    visual: { type: "code", lines: ["Strict-Transport-Security:", "  max-age=15552000"], note: "15,552,000 seconds = 180 days" },
    action: "Run curl -sI on your domain and look for strict-transport-security. If it is missing, add it at your host or CDN.",
    tags: ["WebSecurity", "HTTPS", "DevOps"]
  },
  {
    id: "consent-before", cat: "Analytics",
    title: ["Consent means", "*before,* too."],
    body: "The most common analytics finding is a tag that fires before the visitor chooses. Check what loads on the first paint, not only after Accept.",
    visual: { type: "check", items: [["Page loads, no choice yet", "Analytics tag fired", "fail"], ["Visitor presses Reject", "Tags stay quiet", "pass"], ["Visitor presses Accept", "Analytics starts", "pass"]] },
    action: "Open your site in a private window with DevTools on the Network tab. Filter by collect or gtag before you click anything.",
    tags: ["Analytics", "Privacy", "ConsentMode"]
  },
  {
    id: "input-names", cat: "A11y",
    title: ["Every input", "*needs a name.*"],
    body: "A placeholder disappears as soon as someone types, and screen readers may not announce it. A real label stays.",
    visual: { type: "versus", left: { label: "Placeholder only", lines: ["<input placeholder=\"Email\">"], mark: "fail" }, right: { label: "Labelled", lines: ["<label for=\"email\">Email</label>", "<input id=\"email\">"], mark: "pass" } },
    action: "Tab through your contact form with a screen reader on. Each field should say what it is.",
    tags: ["Accessibility", "a11y", "WCAG"]
  },
  {
    id: "slowest-page", cat: "Perf",
    title: ["The slowest page", "is rarely *the home page.*"],
    body: "Teams tune the home page and forget the pages people reach from search. Measure every page you link to, in the order a visitor would open them.",
    visual: { type: "bars", unit: "ms", items: [["/", 320], ["/pricing", 410], ["/blog", 1240], ["/contact", 380]], note: "Example read, response time per page" },
    action: "List your five most visited pages from analytics and time each one. Fix the slowest first.",
    tags: ["WebPerformance", "CoreWebVitals", "QA"]
  },
  {
    id: "list-first", cat: "QA",
    title: ["Write the test list", "*before* the test code."],
    body: "Picking a framework is the second question. The first is what this page does and what a real person would try on it.",
    visual: { type: "check", items: [["Forms", "Required fields, errors, success", "pass"], ["Links", "Every link answers 200 or 3xx", "pass"], ["Accessibility", "Labels, contrast, keyboard", "pass"], ["Headers", "HSTS, CSP, nosniff", "risk"], ["Consent", "Nothing fires before a choice", "risk"]] },
    action: "Before your next automation sprint, write ten cases in plain language. Then choose the tool.",
    tags: ["QA", "TestAutomation", "SoftwareTesting"]
  },
  {
    id: "share-card", cat: "SEO",
    title: ["Your share card is", "*a first impression.*"],
    body: "Without og:image and og:title, every link to your site shows up as a grey box in chats and feeds.",
    visual: { type: "code", lines: ["<meta property=\"og:title\" content=\"…\">", "<meta property=\"og:image\"", "  content=\"https://…/card.png\">", "<meta name=\"twitter:card\"", "  content=\"summary_large_image\">"], note: "1200 × 630 works across networks" },
    action: "Paste your link into a private chat with yourself. What people see there is your real first impression.",
    tags: ["SEO", "OpenGraph", "Marketing"]
  },
  {
    id: "robots-ai", cat: "GEO",
    title: ["robots.txt decides", "*who may read you.*"],
    body: "AI crawlers each have their own user agent. Blocking them by accident and allowing them on purpose are both one line.",
    visual: { type: "code", lines: ["User-agent: GPTBot", "Allow: /", "", "User-agent: PerplexityBot", "Allow: /", "", "Sitemap: https://example.com/sitemap.xml"], note: "Decide on purpose, then write it down" },
    action: "Open yoursite.com/robots.txt today. Check that it says what you mean for search and AI crawlers.",
    tags: ["GEO", "AISearch", "robotsTxt"]
  },
  {
    id: "nosniff", cat: "Security",
    title: ["Stop browsers", "*guessing file types.*"],
    body: "Without nosniff, a browser may treat an uploaded text file as a script. One header turns that guessing off.",
    visual: { type: "code", lines: ["X-Content-Type-Options: nosniff"], note: "Pairs well with correct Content-Type headers" },
    action: "Add it next to HSTS in the same rule, so both ship together.",
    tags: ["WebSecurity", "AppSec", "HTTPHeaders"]
  },
  {
    id: "utm", cat: "Analytics",
    title: ["Tag campaign links", "*the same way,* every time."],
    body: "LinkedIn, linkedin and Linked-In become three sources in your reports. Pick one spelling and keep it.",
    visual: { type: "code", lines: ["?utm_source=linkedin", "&utm_medium=social", "&utm_campaign=launch-2026-10"], note: "Lowercase, no spaces, one naming sheet" },
    action: "Make a shared sheet with the allowed sources and mediums. Link it from every campaign brief.",
    tags: ["Analytics", "GA4", "UTM"]
  },
  {
    id: "contrast", cat: "A11y",
    title: ["Contrast is math,", "*not taste.*"],
    body: "WCAG AA asks for a contrast ratio of at least 4.5 to 1 for body text and 3 to 1 for large text. Light grey on white rarely makes it.",
    visual: { type: "stat", value: "4.5 : 1", caption: "Minimum contrast for body text, WCAG 2.2 AA" },
    action: "Check your muted text colour against its background in DevTools. The colour picker shows the ratio.",
    tags: ["Accessibility", "Design", "WCAG"]
  },
  {
    id: "broken-links", cat: "QA",
    title: ["A broken link is a test", "*you forgot to write.*"],
    body: "Links rot quietly. A small check on every release keeps the 404s out of your visitors' way.",
    visual: { type: "code", lines: ["for (const href of links) {", "  const res = await request.get(href);", "  expect(res.status()).toBeLessThan(400);", "}"], note: "Playwright request fixture" },
    action: "Collect the links from your footer and navigation. Assert each one answers below 400.",
    tags: ["QA", "Playwright", "TestAutomation"]
  },
  {
    id: "img-size", cat: "Perf",
    title: ["Give images a size.", "*Stop the jump.*"],
    body: "When an image has no width and height, the page jumps as it loads. That shift is measured, and visitors feel it.",
    visual: { type: "code", lines: ["<img src=\"/hero.jpg\"", "  width=\"1200\" height=\"630\"", "  alt=\"…\" loading=\"lazy\">"], note: "Use loading=\"lazy\" below the fold only" },
    action: "Search your templates for <img without width. Add the intrinsic size to each one.",
    tags: ["WebPerformance", "CLS", "CoreWebVitals"]
  },
  {
    id: "llms-txt", cat: "GEO",
    title: ["llms.txt: a short brief", "*for answer engines.*"],
    body: "A plain text file at your root that says what the site is, which pages matter, and how to contact you. Short beats complete.",
    visual: { type: "code", lines: ["# Example Co", "> What we do, in one sentence.", "", "## Pages", "- [Pricing](https://example.com/pricing)", "- [Docs](https://example.com/docs)"], note: "Served as /llms.txt" },
    action: "Write five lines about your site the way you would brief a new colleague. Publish them as /llms.txt.",
    tags: ["GEO", "llmstxt", "AISearch"]
  },
  {
    id: "csp-report-only", cat: "Security",
    title: ["Start your CSP", "*in Report-Only.*"],
    body: "An enforced policy written on day one breaks things. Report-Only shows what would be blocked, so you can enforce with confidence a week later.",
    visual: { type: "code", lines: ["Content-Security-Policy-Report-Only:", "  default-src 'self';", "  img-src 'self' data: https:;", "  report-to csp"], note: "Watch the reports, then enforce" },
    action: "Ship the Report-Only header this week. Read the reports next week before you switch it on.",
    tags: ["WebSecurity", "CSP", "AppSec"]
  },
  {
    id: "one-h1", cat: "SEO",
    title: ["One h1 per page,", "*saying what the page is.*"],
    body: "Logos and slogans often grab the h1. Search engines and screen readers both use it to understand the page.",
    visual: { type: "check", items: [["<h1>Logo</h1>", "Says nothing about the page", "fail"], ["<h1>Welcome!</h1>", "Vague", "risk"], ["<h1>Invoice software for clinics</h1>", "Says what the page is", "pass"]] },
    action: "Read only the h1 of your top ten pages. Would a stranger know what each page is?",
    tags: ["SEO", "Accessibility", "Content"]
  },
  {
    id: "release-day", cat: "QA",
    title: ["Release day:", "*does the page still read right?*"],
    body: "Green builds and passing smoke tests do not tell you whether the public page still has its title, share card, and consent banner.",
    visual: { type: "check", items: [["Build", "Green", "pass"], ["Smoke tests", "Passed", "pass"], ["Title and description", "Still there", "pass"], ["Share card", "Image changed?", "risk"], ["Consent banner", "Nothing fires before a choice?", "risk"]] },
    action: "Add a five-minute public-page read to your release checklist, after deploy and before the announcement.",
    tags: ["QA", "ReleaseManagement", "DevOps"]
  },
  {
    id: "measure-action", cat: "Analytics",
    title: ["Measure the action,", "*not just the visit.*"],
    body: "Page views tell you someone arrived. An event on the form, the download, or the signup tells you whether the page worked.",
    visual: { type: "code", lines: ["gtag('event', 'generate_lead', {", "  method: 'contact_form'", "});"], note: "Fire it on success, not on click" },
    action: "Pick the one action each key page exists for. Make sure an event fires only when it succeeds.",
    tags: ["Analytics", "GA4", "CRO"]
  },
  {
    id: "keyboard", cat: "A11y",
    title: ["Put the mouse away.", "*Can you reach everything?*"],
    body: "Menus, dialogs, and cookie banners are where keyboard users get stuck. Tab, Shift+Tab, Enter, and Escape should be enough.",
    visual: { type: "check", items: [["Tab reaches the menu", "Visible focus ring", "pass"], ["Dialog opens", "Focus moves inside", "pass"], ["Escape", "Closes the dialog", "risk"], ["Cookie banner", "Reachable before the page", "risk"]] },
    action: "Do your main task on your own site with the keyboard only. Write down every place you got stuck.",
    tags: ["Accessibility", "a11y", "UX"]
  },
  {
    id: "self-review", cat: "Field",
    title: ["We reviewed ourselves.", "*Security: 54.*"],
    body: "Our own site scored 86 overall, and security was the weakest area. The six fixes at the top of the list were all response headers.",
    visual: { type: "versus", left: { label: "Before", lines: ["HSTS: missing", "nosniff: missing", "Referrer-Policy: missing"], mark: "fail" }, right: { label: "The fix", lines: ["Strict-Transport-Security", "X-Content-Type-Options", "Referrer-Policy"], mark: "pass" } },
    action: "Run the same headers check on your site. The first fixes are usually configuration, not code.",
    tags: ["QA", "WebSecurity", "BuildInPublic"]
  }
];

function link(platform, tip) {
  const q = new URLSearchParams({ utm_source: platform, utm_medium: "social", utm_campaign: "tips-2026-10", utm_content: tip.id });
  return GUIDE + "?" + q.toString();
}

function plainTitle(tip) { return tip.title.join(" ").replace(/\*/g, "").replace(/\s+/g, " ").trim(); }
function hashtags(tip, n) { return tip.tags.slice(0, n).map((t) => "#" + t).join(" "); }

// X counts every link as 23 characters; the text gets the rest of the 280 and the link always survives.
// Buffer's bulk upload counts the link in full, so a post over 280 that way gets the bare link,
// which X still turns into a link.
function xPost(text, url) {
  const body = clip(text, 280 - 23 - 2);
  const post = body + "\n\n" + url;
  if (post.length <= 280) return post;
  const bare = bareLink(url);
  return clip(body, 280 - bare.length - 2) + "\n\n" + bare;
}

function clip(text, room) {
  if (text.length <= room) return text;
  const cut = text.slice(0, room - 1);
  return cut.slice(0, cut.lastIndexOf(" ")).replace(/[\s,.;:…]+$/, "") + "…";
}

function bareLink(url) {
  return url.replace(/^https:\/\//, "").replace(/\.html(?=\?|$)/, "");
}

function captions(tip, index, total) {
  const head = plainTitle(tip);
  const counter = "Tip " + (index + 1) + "/" + total;
  return {
    linkedin: [head, "", tip.body, "", "Try this today: " + tip.action, "", "How a public-page review works, step by step: " + link("linkedin", tip), "", hashtags(tip, 3) + " #QA"].join("\n"),
    x: xPost(head + "\n\n" + tip.action, link("x", tip)),
    instagram: [head, "", tip.body, "", "Try this: " + tip.action, "", "Full guide: link in bio.", "", hashtags(tip, 3) + " #QA #WebDev #QAlab"].join("\n"),
    facebook: [head, "", tip.body, "", "Try this: " + tip.action, "", link("facebook", tip)].join("\n"),
    tiktok: head + " " + tip.action + " " + hashtags(tip, 3) + " #QA #techtok",
    youtubeTitle: (head + " #Shorts").slice(0, 100),
    youtube: [tip.body, "", "Try this: " + tip.action, "", "Guide: " + link("youtube", tip), "", counter + " · QA-lab URL Review"].join("\n")
  };
}

module.exports = { SITE, GUIDE, CATS, TIPS, captions, link, plainTitle, xPost };
