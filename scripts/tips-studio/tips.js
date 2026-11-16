/* Daily tips for the QA-lab URL Review channels. Each tip is a practice a reader can apply today.
   Numbers are standards or labelled examples, never invented results. Posts carry no prices, no
   country, and no personal name. */

const SITE = "https://carlosandmunoz.com";
const GUIDE = SITE + "/qa-review-guide.html";
const { BRAND, tagLine } = require("../social-tags");

const CATS = {
  QA: { label: "QA", color: "#7ef6fb" },
  SEO: { label: "SEO", color: "#e2c48a" },
  GEO: { label: "GEO · AI search", color: "#b9a6ff" },
  Analytics: { label: "Analytics", color: "#f0b45a" },
  Privacy: { label: "Privacy", color: "#f4a6c8" },
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
    more: "Google treats a canonical as a strong hint, not an order. Redirects, sitemaps and internal links should all point to the same address.",
    visual: { type: "code", lines: ["<link rel=\"canonical\"", "  href=\"https://example.com/pricing\">"], note: "In the <head> of every variant" },
    action: "Open your top page with and without a trailing slash and ?utm_ tags. Both should point to one canonical.",
    tags: ["SEO", "TechnicalSEO", "WebDev"]
  },
  {
    id: "html-first", cat: "GEO",
    title: ["AI search reads", "*your HTML,* not your app."],
    body: "Many answer engines do not run JavaScript. If your key facts appear only after scripts load, they may never be read or cited.",
    more: "Google can render JavaScript, but rendering may come later than the first crawl. Facts in the first HTML response are read on the first visit.",
    visual: { type: "versus", left: { label: "Seen without JS", lines: ["<div id=\"root\"></div>"], mark: "fail" }, right: { label: "Facts in the HTML", lines: ["<h1>What we do</h1>", "<p>Who it is for…</p>"], mark: "pass" } },
    action: "View source on your home page. Can you find what you sell and who it is for, without running scripts?",
    tags: ["GEO", "AISearch", "SEO"]
  },
  {
    id: "hsts", cat: "Security",
    title: ["One header.", "*180 days* of HTTPS only."],
    body: "HSTS tells browsers to never load your site over plain HTTP again. It takes one line of configuration on most hosts.",
    more: "With a max-age of one year, includeSubDomains and preload, a domain can join the HTTPS-only list built into major browsers at hstspreload.org.",
    visual: { type: "code", lines: ["Strict-Transport-Security:", "  max-age=15552000"], note: "15,552,000 seconds = 180 days" },
    action: "Run curl -sI on your domain and look for strict-transport-security. If it is missing, add it at your host or CDN.",
    tags: ["WebSecurity", "HTTPS", "DevOps"]
  },
  {
    id: "consent-before", cat: "Analytics",
    title: ["Consent means", "*before,* too."],
    body: "The most common analytics finding is a tag that fires before the visitor chooses. Check what loads on the first paint, not only after Accept.",
    more: "Consent Mode needs its default state set before any tag loads. A default of denied keeps cookies off until the visitor chooses.",
    visual: { type: "check", items: [["Page loads, no choice yet", "Analytics tag fired", "fail"], ["Visitor presses Reject", "Tags stay quiet", "pass"], ["Visitor presses Accept", "Analytics starts", "pass"]] },
    action: "Open your site in a private window with DevTools on the Network tab. Filter by collect or gtag before you click anything.",
    tags: ["Analytics", "Privacy", "ConsentMode"]
  },
  {
    id: "input-names", cat: "A11y",
    title: ["Every input", "*needs a name.*"],
    body: "A placeholder disappears as soon as someone types, and screen readers may not announce it. A real label stays.",
    more: "WCAG 2.2 asks for labels in success criterion 3.3.2, and for a name assistive technology can read in 4.1.2.",
    visual: { type: "versus", left: { label: "Placeholder only", lines: ["<input placeholder=\"Email\">"], mark: "fail" }, right: { label: "Labelled", lines: ["<label for=\"email\">Email</label>", "<input id=\"email\">"], mark: "pass" } },
    action: "Tab through your contact form with a screen reader on. Each field should say what it is.",
    tags: ["Accessibility", "a11y", "WCAG"]
  },
  {
    id: "slowest-page", cat: "Perf",
    title: ["The slowest page", "is rarely *the home page.*"],
    body: "Teams tune the home page and forget the pages people reach from search. Measure every page you link to, in the order a visitor would open them.",
    more: "Google judges Core Web Vitals at the 75th percentile of real visits, so slow pages and slow phones count, not just the average.",
    visual: { type: "bars", unit: "ms", items: [["/", 320], ["/pricing", 410], ["/blog", 1240], ["/contact", 380]], note: "Example analysis, response time per page" },
    action: "List your five most visited pages from analytics and time each one. Fix the slowest first.",
    tags: ["WebPerformance", "CoreWebVitals", "QA"]
  },
  {
    id: "list-first", cat: "QA",
    title: ["Write the test list", "*before* the test code."],
    body: "Picking a framework is the second question. The first is what this page does and what a real person would try on it.",
    more: "A test list in plain language doubles as documentation: anyone on the team can read what the page is meant to do.",
    visual: { type: "check", items: [["Forms", "Required fields, errors, success", "pass"], ["Links", "Every link answers 200 or 3xx", "pass"], ["Accessibility", "Labels, contrast, keyboard", "pass"], ["Headers", "HSTS, CSP, nosniff", "risk"], ["Consent", "Nothing fires before a choice", "risk"]] },
    action: "Before your next automation sprint, write ten cases in plain language. Then choose the tool.",
    tags: ["QA", "TestAutomation", "SoftwareTesting"]
  },
  {
    id: "share-card", cat: "SEO",
    title: ["Your share card is", "*a first impression.*"],
    body: "Without og:image and og:title, every link to your site shows up as a grey box in chats and feeds.",
    more: "Chat apps and networks cache a link's preview. After you fix og:image, refresh it in each network's debugger, such as Facebook's Sharing Debugger.",
    visual: { type: "code", lines: ["<meta property=\"og:title\" content=\"…\">", "<meta property=\"og:image\"", "  content=\"https://…/card.png\">", "<meta name=\"twitter:card\"", "  content=\"summary_large_image\">"], note: "1200 × 630 works across networks" },
    action: "Paste your link into a private chat with yourself. What people see there is your real first impression.",
    tags: ["SEO", "OpenGraph", "Marketing"]
  },
  {
    id: "robots-ai", cat: "GEO",
    title: ["robots.txt decides", "*who may read you.*"],
    body: "AI crawlers each have their own user agent. Blocking them by accident and allowing them on purpose are both one line.",
    more: "robots.txt is a request, not a lock. Well-behaved crawlers follow it; anything private still needs a login.",
    visual: { type: "code", lines: ["User-agent: GPTBot", "Allow: /", "", "User-agent: PerplexityBot", "Allow: /", "", "Sitemap: https://example.com/sitemap.xml"], note: "Decide on purpose, then write it down" },
    action: "Open /robots.txt on your own site today. Check that it says what you mean for search and AI crawlers.",
    tags: ["GEO", "AISearch", "robotsTxt"]
  },
  {
    id: "nosniff", cat: "Security",
    title: ["Stop browsers", "*guessing file types.*"],
    body: "Without nosniff, a browser may treat an uploaded text file as a script. One header turns that guessing off.",
    more: "With nosniff, browsers also refuse a script or stylesheet whose Content-Type does not match what the page asked for.",
    visual: { type: "code", lines: ["X-Content-Type-Options: nosniff"], note: "Pairs well with correct Content-Type headers" },
    action: "Add it next to HSTS in the same rule, so both ship together.",
    tags: ["WebSecurity", "AppSec", "HTTPHeaders"]
  },
  {
    id: "utm", cat: "Analytics",
    title: ["Tag campaign links", "*the same way,* every time."],
    body: "LinkedIn, linkedin and Linked-In become three sources in your reports. Pick one spelling and keep it.",
    more: "GA4 treats UTM values as case-sensitive, so Email and email land in separate rows of the same report.",
    visual: { type: "code", lines: ["?utm_source=linkedin", "&utm_medium=social", "&utm_campaign=launch-2026-10"], note: "Lowercase, no spaces, one naming sheet" },
    action: "Make a shared sheet with the allowed sources and mediums. Link it from every campaign brief.",
    tags: ["Analytics", "GA4", "UTM"]
  },
  {
    id: "contrast", cat: "A11y",
    title: ["Contrast is math,", "*not taste.*"],
    body: "WCAG AA asks for a contrast ratio of at least 4.5 to 1 for body text and 3 to 1 for large text. Light grey on white rarely makes it.",
    more: "Icons and the borders of form fields need contrast too: WCAG 1.4.11 asks for at least 3 to 1 against what sits next to them.",
    visual: { type: "stat", value: "4.5 : 1", caption: "Minimum contrast for body text, WCAG 2.2 AA" },
    action: "Check your muted text colour against its background in DevTools. The colour picker shows the ratio.",
    tags: ["Accessibility", "Design", "WCAG"]
  },
  {
    id: "broken-links", cat: "QA",
    title: ["A broken link is a test", "*you forgot to write.*"],
    body: "Links rot quietly. A small check on every release keeps the 404s out of your visitors' way.",
    more: "A page that moved should answer with a 301 to its new address, so visitors and search engines follow it instead of hitting a 404.",
    visual: { type: "code", lines: ["for (const href of links) {", "  const res = await request.get(href);", "  expect(res.status()).toBeLessThan(400);", "}"], note: "Playwright request fixture" },
    action: "Collect the links from your footer and navigation. Assert each one answers below 400.",
    tags: ["QA", "Playwright", "TestAutomation"]
  },
  {
    id: "img-size", cat: "Perf",
    title: ["Give images a size.", "*Stop the jump.*"],
    body: "When an image has no width and height, the page jumps as it loads. That shift is measured, and visitors feel it.",
    more: "Cumulative Layout Shift counts as good at 0.1 or less, measured at the 75th percentile of page loads.",
    visual: { type: "code", lines: ["<img src=\"/hero.jpg\"", "  width=\"1200\" height=\"630\"", "  alt=\"…\" loading=\"lazy\">"], note: "Use loading=\"lazy\" below the fold only" },
    action: "Search your templates for <img without width. Add the intrinsic size to each one.",
    tags: ["WebPerformance", "CLS", "CoreWebVitals"]
  },
  {
    id: "llms-txt", cat: "GEO",
    title: ["llms.txt: a short brief", "*for answer engines.*"],
    body: "A plain text file at your root that says what the site is, which pages matter, and how to contact you. Short beats complete.",
    more: "llms.txt is a community proposal from 2024, not a formal standard. Treat it as a brief for readers, not a ranking switch.",
    visual: { type: "code", lines: ["# Example Co", "> What we do, in one sentence.", "", "## Pages", "- [Pricing](https://example.com/pricing)", "- [Docs](https://example.com/docs)"], note: "Served as /llms.txt" },
    action: "Write five lines about your site the way you would brief a new colleague. Publish them as /llms.txt.",
    tags: ["GEO", "llmstxt", "AISearch"]
  },
  {
    id: "csp-report-only", cat: "Security",
    title: ["Start your CSP", "*in Report-Only.*"],
    body: "An enforced policy written on day one breaks things. Report-Only shows what would be blocked, so you can enforce with confidence a week later.",
    more: "Report-Only never blocks anything, so it can run next to an enforced policy while you test a stricter one.",
    visual: { type: "code", lines: ["Content-Security-Policy-Report-Only:", "  default-src 'self';", "  img-src 'self' data: https:;", "  report-to csp"], note: "Watch the reports, then enforce" },
    action: "Ship the Report-Only header this week. Read the reports next week before you switch it on.",
    tags: ["WebSecurity", "CSP", "AppSec"]
  },
  {
    id: "one-h1", cat: "SEO",
    title: ["One h1 per page,", "*saying what the page is.*"],
    body: "Logos and slogans often grab the h1. Search engines and screen readers both use it to understand the page.",
    more: "Screen reader users often jump straight to the h1 to learn where they are. Make it the first thing the page says about itself.",
    visual: { type: "check", items: [["<h1>Logo</h1>", "Says nothing about the page", "fail"], ["<h1>Welcome!</h1>", "Vague", "risk"], ["<h1>Invoice software for clinics</h1>", "Says what the page is", "pass"]] },
    action: "Read only the h1 of your top ten pages. Would a stranger know what each page is?",
    tags: ["SEO", "Accessibility", "Content"]
  },
  {
    id: "release-day", cat: "QA",
    title: ["Release day:", "*is the page still right?*"],
    body: "Green builds and passing smoke tests do not tell you whether the public page still has its title, share card, and consent banner.",
    more: "Staging rarely matches production exactly. CDN rules, environment variables and tag managers often differ, so check the live page itself.",
    visual: { type: "check", items: [["Build", "Green", "pass"], ["Smoke tests", "Passed", "pass"], ["Title and description", "Still there", "pass"], ["Share card", "Image changed?", "risk"], ["Consent banner", "Nothing fires before a choice?", "risk"]] },
    action: "Add a five-minute public-page check to your release checklist, after deploy and before the announcement.",
    tags: ["QA", "ReleaseManagement", "DevOps"]
  },
  {
    id: "measure-action", cat: "Analytics",
    title: ["Measure the action,", "*not just the visit.*"],
    body: "Page views tell you someone arrived. An event on the form, the download, or the signup tells you whether the page worked.",
    more: "A standard GA4 property can mark up to 30 key events, so choose the actions that mean the page did its job.",
    visual: { type: "code", lines: ["gtag('event', 'generate_lead', {", "  method: 'contact_form'", "});"], note: "Fire it on success, not on click" },
    action: "Pick the one action each key page exists for. Make sure an event fires only when it succeeds.",
    tags: ["Analytics", "GA4", "CRO"]
  },
  {
    id: "keyboard", cat: "A11y",
    title: ["Put the mouse away.", "*Can you reach everything?*"],
    body: "Menus, dialogs, and cookie banners are where keyboard users get stuck. Tab, Shift+Tab, Enter, and Escape should be enough.",
    more: "WCAG 2.4.7 asks for a visible focus indicator, and 2.1.2 says keyboard focus must never get trapped in one part of the page.",
    visual: { type: "check", items: [["Tab reaches the menu", "Visible focus ring", "pass"], ["Dialog opens", "Focus moves inside", "pass"], ["Escape", "Closes the dialog", "risk"], ["Cookie banner", "Reachable before the page", "risk"]] },
    action: "Do your main task on your own site with the keyboard only. Write down every place you got stuck.",
    tags: ["Accessibility", "a11y", "UX"]
  },
  {
    id: "chat-consent", cat: "Privacy",
    title: ["A chat widget tracks", "*before anyone asks.*"],
    body: "Most chat widgets set cookies and call home on the first page view, before the visitor answers the cookie banner. A plain button can wait for the click.",
    more: "Under the EU ePrivacy rules, cookies that are not strictly necessary need consent first, and a chat nobody has opened is rarely necessary.",
    visual: { type: "code", lines: ["<button id=\"chat\">Chat with us</button>", "chat.onclick = () => loadChat();"], note: "Load the widget on the first click" },
    action: "Open your site in a private window, press Reject, and look for chat cookies under DevTools > Application.",
    tags: ["Privacy", "Cookies", "Chatbots"]
  },
  {
    id: "a11y-statement", cat: "A11y",
    title: ["Selling online in the EU?", "*Link an accessibility statement.*"],
    body: "Since 28 June 2025 the European Accessibility Act has required one from shops that sell to EU consumers, unless the business is a micro-enterprise.",
    more: "Under the Act, a micro-enterprise has fewer than ten staff and an annual turnover or balance sheet of no more than 2 million euros.",
    visual: { type: "check", items: [["Standard", "EN 301 549, WCAG 2.1 AA", "pass"], ["Known gaps", "Listed, with dates", "risk"], ["Contact", "For access problems", "risk"], ["Footer link", "On every page", "pass"]] },
    action: "Search your footer for \"accessibility\". If nothing comes up, write the statement this week.",
    tags: ["Accessibility", "EAA", "A11y"]
  },
  {
    id: "imprint", cat: "Privacy",
    title: ["A site in Germany or Austria?", "*Show who runs it.*"],
    body: "Business sites there must link an Impressum from every page: the provider's name, a postal address, an email, and register and VAT numbers.",
    more: "In Germany the Impressum duty moved from the Telemediengesetz to the Digitale-Dienste-Gesetz in May 2024. The content stayed the same.",
    visual: { type: "check", items: [["Name and legal form", "The provider", "pass"], ["Postal address", "Not a PO box", "pass"], ["Email", "Answered", "pass"], ["Register and VAT", "When you have them", "risk"]] },
    action: "Open a product page and find the Impressum. It should take one click from the footer.",
    tags: ["Impressum", "Legal", "WebDev"]
  },
  {
    id: "old-libraries", cat: "Security",
    title: ["That old jQuery", "*has known flaws.*"],
    body: "Front-end libraries pinned years ago carry published flaws anyone can look up, and the version is often right in the script address.",
    more: "jQuery versions before 3.5.0 carry published cross-site scripting flaws, CVE-2020-11022 and CVE-2020-11023.",
    visual: { type: "versus", left: { label: "Before", lines: ["jquery-1.12.4.min.js", "Pinned in 2016"], mark: "fail" }, right: { label: "The fix", lines: ["A supported major version", "Checked on every release"], mark: "pass" } },
    action: "Run retire.js or npm audit on your front end, and upgrade whatever it flags.",
    tags: ["WebSecurity", "Dependencies", "JavaScript"]
  },
  {
    id: "domain-lock", cat: "Security",
    title: ["Can your domain be moved", "*without you?*"],
    body: "A hijacked registrar account or a forged request can transfer a domain away. A transfer lock and automatic renewal take a minute to switch on.",
    more: "For a domain you cannot lose, ask about a registry lock: any change then needs a manual check at the registry itself.",
    visual: { type: "code", lines: ["$ whois example.com | grep -i status", "Domain Status: clientTransferProhibited"], note: "What a locked domain shows" },
    action: "Look up your domain's status. If clientTransferProhibited is missing, turn on the lock at your registrar.",
    tags: ["WebSecurity", "Domains", "DNS"]
  },
  {
    id: "mta-sts", cat: "Security",
    title: ["Your mail can travel", "*unencrypted.*"],
    body: "An attacker on the path can strip STARTTLS. MTA-STS tells sending servers to insist on TLS, and TLS-RPT tells you when delivery fails.",
    more: "The MTA-STS policy file is served over HTTPS, and its max_age line tells sending servers how long to remember it.",
    visual: { type: "code", lines: ["_mta-sts    TXT \"v=STSv1; id=2026102201\"", "_smtp._tls  TXT \"v=TLSRPTv1; rua=mailto:tls@example.com\"", "", "# mta-sts.example.com/.well-known/mta-sts.txt", "version: STSv1", "mode: testing"], note: "Start in testing, then enforce" },
    action: "Publish both records in testing mode, read the reports for two weeks, then switch the policy to enforce.",
    tags: ["EmailSecurity", "MTASTS", "DNS"]
  },
  {
    id: "safe-browsing", cat: "Security",
    title: ["If Google flags your site,", "*visitors see a red page.*"],
    body: "Chrome, Firefox, and Safari show a full-page warning instead of any site on Google's Safe Browsing lists. A hacked plugin is a common cause.",
    more: "Google Safe Browsing protects more than five billion devices, so a listing reaches nearly every visitor.",
    visual: { type: "check", items: [["Search Console", "Security issues report", "pass"], ["Alerts", "Reach the owner", "pass"], ["Plugins", "Updated, unused ones removed", "risk"]] },
    action: "Open the Security issues report in Search Console today, and make sure its emails reach someone.",
    tags: ["WebSecurity", "SafeBrowsing", "Malware"]
  },
  {
    id: "carbon", cat: "Perf",
    title: ["Every visit", "*has a carbon cost.*"],
    body: "Bytes moved through data centres, networks, and devices use energy. The Sustainable Web Design model turns page weight into grams of CO₂e.",
    more: "Images are often the heaviest part of a page. Modern formats like AVIF and WebP cut their weight with no visible change.",
    visual: { type: "bars", unit: "g CO₂e", items: [["0.5 MB", 0.07], ["2 MB", 0.3], ["5 MB", 0.74]], note: "First visit, Sustainable Web Design model v4, global average grid" },
    action: "Check your start page's transfer size in DevTools. Each megabyte you cut saves about 0.15 g on every first visit.",
    tags: ["WebPerformance", "Sustainability", "PageWeight"]
  },
  {
    id: "self-review", cat: "Field",
    title: ["We reviewed ourselves.", "*Security: 54.*"],
    body: "In October 2026 our own site scored 86 overall, and security was the weakest area. The six fixes at the top of the list were all response headers.",
    more: "Security headers are set once at the host or CDN, so a single rule can cover every page of the site.",
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

// X counts every link as 23 characters; the text gets the rest of the 280 and the link always survives.
// Buffer's bulk upload counts the link in full, so a post over 280 that way gets the bare link,
// which X still turns into a link. Tags go in only when the text fits whole with them.
function xPost(text, url, tags) {
  const words = (tags || "").split(" ").filter(Boolean);
  for (let n = words.length; n > 0; n -= 1) {
    for (const u of [url, bareLink(url)]) {
      const post = text + "\n\n" + u + "\n" + words.slice(-n).join(" ");
      if (post.length <= 280) return post;
    }
  }
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
    linkedin: [head, "", tip.body, "", "Try this today: " + tip.action, "", "How a public-page review works, step by step: " + link("linkedin", tip), "", tagLine(tip, "linkedin")].join("\n"),
    x: xPost(head + "\n\n" + tip.action, link("x", tip), tagLine(tip, "x")),
    instagram: [head, "", tip.body, "", "Try this: " + tip.action, "", "Full guide: link in bio.", "", tagLine(tip, "instagram")].join("\n"),
    facebook: [head, "", tip.body, "", "Try this: " + tip.action, "", link("facebook", tip), "", tagLine(tip, "facebook")].join("\n"),
    tiktok: head + " " + tip.action + " " + tagLine(tip, "tiktok"),
    youtubeTitle: (head + " #Shorts").slice(0, 100),
    youtube: [tip.body, "", "Try this: " + tip.action, ""].concat(tip.more ? ["Did you know? " + tip.more, ""] : [], "Guide: " + link("youtube", tip), "", counter + " · QA-lab URL Review", "", tagLine(tip, "youtube")).join("\n")
  };
}

module.exports = { SITE, GUIDE, BRAND, CATS, TIPS, captions, link, plainTitle, xPost };
