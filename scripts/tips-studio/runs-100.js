/* Real runs, series two: one public site per post, scored by the same review anyone can run.
   Scores come from the saved report in previews/insights-test/<report>-current.json. Each claim in
   the copy was checked against the live site with curl on the analysis date. Lead with what the site
   does well, then one lesson any team can use. Posts carry no prices and no personal name. */

const fs = require("fs");
const path = require("path");
const { SITE, GUIDE, xPost } = require("./tips");
const { tagLine } = require("../social-tags");

const REPORTS = path.resolve(__dirname, "../../previews/insights-test");
const AREAS = [["SEO", "SEO"], ["GEO", "GEO"], ["Analytics", "Analytics"], ["Security", "Security"], ["Accessibility", "A11y"], ["Performance", "Speed"]];

const CATS = {
  Worldwide: { label: "Real run · worldwide", color: "#7ef6fb" },
  National: { label: "Real run · national", color: "#e2c48a" },
  Local: { label: "Real run · local", color: "#6fe3b1" }
};

// {overall} and {SEO}, {GEO}, {Analytics}, {Security}, {Accessibility}, {Performance} come from the report.
const RUNS = [
  {
    id: "wikipedia", report: "r100-wikipedia", scope: "Worldwide",
    title: ["Wikipedia leaves", "*the snippet to search.*"],
    body: "HSTS is preloaded, security.txt is published, and articles read without JavaScript. But the Main Page and the other 18 pages analyzed have no meta description, so search engines pick the snippet.",
    action: "Write a description of about 150 characters for each key page, so you choose the pitch, not the crawler.",
    tags: ["SEO", "MetaDescription", "OpenKnowledge"]
  },
  {
    id: "mozilla", report: "r100-mozilla", scope: "Worldwide",
    title: ["Mozilla: 85 languages,", "*no sitemap.*"],
    body: "The home page lists 85 hreflang alternates, HSTS is on, and framing is denied. But robots.txt names no sitemap and /sitemap.xml answers 404, so crawlers find pages only by following links.",
    action: "Publish a sitemap.xml of the pages you want found and name it in robots.txt with one Sitemap: line.",
    tags: ["SEO", "Sitemap", "i18n"]
  },
  {
    id: "mdn", report: "r100-mdn", scope: "Worldwide",
    title: ["MDN Web Docs: {overall}.", "*No JSON-LD at all.*"],
    body: "A content security policy built on default-src 'self', two-year HSTS, framing denied, and Core Web Vitals that pass for real visitors. The gap: no page analyzed carries JSON-LD naming who runs the site.",
    action: "Add one Organization block with name, url, logo, and sameAs links. AI answers use it to name and describe you.",
    tags: ["GEO", "StructuredData", "WebDev"]
  },
  {
    id: "w3c", report: "r100-w3c", scope: "Worldwide",
    title: ["W3C's home pages", "*share one title.*"],
    body: "Preloaded HSTS, a lang on every page, and fast pages for real visitors. But the English, Japanese, and Chinese home pages are all titled just \"W3C\", and the Japanese description reads \"Homepage\".",
    action: "Translate the title and description with the page. Each language version should say what it is, in its language.",
    tags: ["SEO", "i18n", "Multilingual"]
  },
  {
    id: "unesco", report: "r100-unesco", scope: "Worldwide",
    title: ["UNESCO has llms.txt,", "*but no HSTS.*"],
    body: "UNESCO publishes an llms.txt for AI tools, sets a content security policy, and limits framing to itself. But no page analyzed sends Strict-Transport-Security, and http:// moves to https with a temporary 302.",
    action: "Send Strict-Transport-Security with a max-age of a year or more, and make the http-to-https hop a 301.",
    tags: ["WebSecurity", "HSTS", "HTTPS"]
  },
  {
    id: "unicef", report: "r100-unicef", scope: "Worldwide",
    title: ["UNICEF's date filter", "*has no label.*"],
    body: "Preloaded HSTS, Organization JSON-LD, and five language versions linked to each other. But the search date filter on every page analyzed is named only by placeholder text, which vanishes as you type.",
    action: "Give every field a <label> or an aria-label. A placeholder is a hint, not a name, and it disappears on input.",
    tags: ["Accessibility", "A11y", "Forms"]
  },
  {
    id: "worldbank", report: "r100-worldbank", scope: "Worldwide",
    title: ["The World Bank:", "*GEO {GEO}.*"],
    body: "Organization JSON-LD with a site search action, a sitemap, robots.txt open to every crawler, and two-year HSTS. What it lacks is a content security policy: none of the pages analyzed sends one.",
    action: "Start with Content-Security-Policy-Report-Only to see what would break, then enforce. default-src 'self' is a start.",
    tags: ["WebSecurity", "CSP", "GEO"]
  },
  {
    id: "icrc", report: "r100-icrc", scope: "Worldwide",
    title: ["The ICRC tests a CSP.", "*Now it can enforce it.*"],
    body: "A security.txt for researchers, a sitemap named in robots.txt, and HSTS. Its content security policy runs in report-only mode, so the browser logs violations but blocks nothing.",
    action: "Read the reports for a few weeks, fix what they flag, then switch the header to Content-Security-Policy.",
    tags: ["WebSecurity", "CSP", "Humanitarian"]
  },
  {
    id: "msf", report: "r100-msf", scope: "Worldwide",
    title: ["MSF serves every page", "*without HSTS.*"],
    body: "Pages name their language, Arabic included with right-to-left set, and a sitemap answers. But none of the 20 pages analyzed sends Strict-Transport-Security, so a first visit over http can be intercepted.",
    action: "Add Strict-Transport-Security: max-age=31536000; includeSubDomains. Then consider the browser preload list.",
    tags: ["WebSecurity", "HSTS", "Humanitarian"]
  },
  {
    id: "amnesty", report: "r100-amnesty", scope: "Worldwide",
    title: ["Amnesty's robots.txt", "*turns Bingbot away.*"],
    body: "Preloaded HSTS, a content security policy, and pages that name their language. But robots.txt disallows bingbot from the whole site, and Bing's index also feeds Copilot. PerplexityBot is blocked too.",
    action: "Audit robots.txt line by line. Blocking a search crawler removes you from every product built on its index.",
    tags: ["GEO", "SEO", "AISearch"]
  },
  {
    id: "guardian", report: "r100-guardian", scope: "Worldwide",
    title: ["The Guardian front page", "*has no h1.*"],
    body: "Preloaded HSTS, a Permissions-Policy, security.txt, and Core Web Vitals that pass for real visitors. But the international and UK front pages have no h1, so screen-reader users lose the first heading.",
    action: "Give every page one h1 that names it, even a visually hidden one on a front page. Headings are how many people navigate.",
    tags: ["Accessibility", "A11y", "Headings"]
  },
  {
    id: "aljazeera", report: "r100-aljazeera", scope: "Worldwide",
    title: ["Al Jazeera marks text", "*for voice, blocks AI.*"],
    body: "Its JSON-LD names a NewsMediaOrganization and marks speakable text for voice assistants. Yet robots.txt disallows ChatGPT-User and PerplexityBot, which fetch pages to cite them in AI answers. GEO: {GEO}.",
    action: "Decide crawler by crawler. Training bots and answer bots are separate user-agents, so each can get its own rule.",
    tags: ["GEO", "AISearch", "News"]
  },
  {
    id: "dw", report: "r100-dw", scope: "Worldwide",
    title: ["DW blocks framing.", "*It skips nosniff.*"],
    body: "frame-ancestors 'none' stops other sites from framing it, HSTS is on, and every page analyzed has a canonical. But X-Content-Type-Options is missing on all 20 pages analyzed, so browsers may guess file types.",
    action: "Send X-Content-Type-Options: nosniff on every response. One header stops browsers running a file as the wrong type.",
    tags: ["WebSecurity", "HTTPHeaders", "News"]
  },
  {
    id: "elpais", report: "r100-elpais", scope: "Worldwide",
    title: ["El País sends", "*no security headers.*"],
    body: "Pages declare their regional language, like es-CO, and carry rich JSON-LD. But the pages analyzed send no HSTS, no content security policy, no X-Frame-Options, and no nosniff, and http moves to https with a 302.",
    action: "Start with four headers: Strict-Transport-Security, X-Content-Type-Options, frame-ancestors, and a report-only CSP.",
    tags: ["WebSecurity", "HTTPHeaders", "News"]
  },
  {
    id: "lemonde", report: "r100-lemonde", scope: "Worldwide",
    title: ["Le Monde has a CSP", "*that allows any https.*"],
    body: "A year of HSTS, framing limited to its own origin, and NewsMediaOrganization JSON-LD. Its content security policy exists, but default-src allows any https: source plus 'unsafe-inline' and 'unsafe-eval'.",
    action: "List the script hosts you actually use, then drop 'unsafe-eval'. A policy that allows everything blocks nothing.",
    tags: ["WebSecurity", "CSP", "News"]
  },
  {
    id: "mit", report: "r100-mit", scope: "Worldwide",
    title: ["MIT's canonical tags", "*point to its CMS.*"],
    body: "Pages declare their language and load fast for real visitors. But canonical links point to tlecms.mit.edu, a host that did not answer our request, and the home page names a news story as its canonical.",
    action: "Canonical URLs must be public, live, and the page itself. Check them after every CMS or domain change.",
    tags: ["SEO", "Canonical", "HigherEd"]
  },
  {
    id: "stanford", report: "r100-stanford", scope: "Worldwide",
    title: ["Stanford's canonical", "*leads to a 404.*"],
    body: "Preloaded HSTS, a nonce-based content security policy, a Permissions-Policy, and framing denied: Security {Security}. But the home page names stanford.edu/home as canonical, and that URL answers 404.",
    action: "Fetch every canonical URL in your test suite. It should answer 200 and name itself as canonical.",
    tags: ["SEO", "Canonical", "HigherEd"]
  },
  {
    id: "harvard", report: "r100-harvard", scope: "Worldwide",
    title: ["Any site can frame", "*Harvard's pages.*"],
    body: "Organization JSON-LD, a sitemap index, and Core Web Vitals that pass for real visitors. But the pages analyzed send neither X-Frame-Options nor frame-ancestors, so another site could load them in a hidden frame.",
    action: "Send Content-Security-Policy: frame-ancestors 'self'. It blocks clickjacking and replaces X-Frame-Options.",
    tags: ["WebSecurity", "Clickjacking", "HigherEd"]
  },
  {
    id: "nodejs", report: "r100-nodejs", scope: "Worldwide",
    title: ["Node.js has llms.txt.", "*Its pages share a pitch.*"],
    body: "An llms.txt for AI tools, security.txt, preloaded HSTS, and two sitemaps. But 19 of the 20 pages analyzed share one meta description, the home page's, so Learn and About pitch the same line in search.",
    action: "Write a description per page that says what that page answers. A shared one tells search nothing new.",
    tags: ["SEO", "MetaDescription", "OpenSource"]
  },
  {
    id: "rust", report: "r100-rust", scope: "Worldwide",
    title: ["Rust's pages", "*name no canonical.*"],
    body: "Pages declare their language, a security.txt is published, and Core Web Vitals pass for real visitors. But none of the 20 pages analyzed has a canonical link, and all of them share one meta description.",
    action: "Add a self-referencing canonical to every page. It tells search which address to rank when several reach it.",
    tags: ["SEO", "Canonical", "OpenSource"]
  },
  {
    id: "kubernetes", report: "r100-kubernetes", scope: "Worldwide",
    title: ["13 Kubernetes pages", "*share one title.*"],
    body: "Organization JSON-LD with a site search, a security.txt, and a sitemap named in robots.txt. But the English, Chinese, Bengali, and ten other home pages are all titled just \"Kubernetes\".",
    action: "Add the page's purpose to its title, in its own language. Each localized home page should stand on its own in search.",
    tags: ["SEO", "i18n", "CloudNative"]
  },
  {
    id: "apache", report: "r100-apache", scope: "Worldwide",
    title: ["Apache.org runs", "*without descriptions.*"],
    body: "Preloaded HSTS, a security.txt, a content security policy, and Core Web Vitals that pass for real visitors. But none of the 20 pages analyzed, the home page included, has a meta description.",
    action: "Give each page a description of about 150 characters. Search and AI answers quote it when they introduce you.",
    tags: ["SEO", "MetaDescription", "OpenSource"]
  },
  {
    id: "linuxfoundation", report: "r100-linuxfoundation", scope: "Worldwide",
    title: ["The Linux Foundation", "*never states a language.*"],
    body: "A sitemap, one-year HSTS, framing limited to its own origin, and no broken links among the pages analyzed. But the <html> tag has no lang attribute, so screen readers guess which voice to use.",
    action: "Add lang=\"en\" to the html tag in the site template. One attribute fixes every page at once.",
    tags: ["Accessibility", "A11y", "i18n"]
  },
  {
    id: "react", report: "r100-react", scope: "Worldwide",
    title: ["React's docs pages", "*have no description.*"],
    body: "An llms.txt for AI tools, two-year HSTS, and Core Web Vitals that pass for real visitors. But 19 of the 20 pages analyzed, Learn and Reference included, have no meta description, so search writes its own.",
    action: "Write a one-line description per page: what it teaches and for whom. Docs pages are where it pays most.",
    tags: ["SEO", "MetaDescription", "Docs"]
  },
  {
    id: "githubdocs", report: "r100-githubdocs", scope: "Worldwide",
    title: ["GitHub Docs sets", "*no canonical link.*"],
    body: "A content security policy that starts from default-src 'none', HSTS, nosniff, and framing limited to its own origin. But none of the 20 pages analyzed has a canonical link, so URL variants compete in search.",
    action: "Add a self-referencing canonical to every docs page. Versioned and translated docs need it most.",
    tags: ["SEO", "Canonical", "Docs"]
  },
  {
    id: "stripedocs", report: "r100-stripedocs", scope: "Worldwide",
    title: ["Stripe Docs skips", "*the main landmark.*"],
    body: "Preloaded HSTS, a content security policy, and a skip link to the content. But none of the 20 pages analyzed marks that content with a <main> landmark, which screen-reader users jump to directly.",
    action: "Wrap the primary content in one <main> element. Screen readers list it as a landmark you can jump to.",
    tags: ["Accessibility", "A11y", "Docs"]
  },
  {
    id: "cloudflare", report: "r100-cloudflare", scope: "Worldwide",
    title: ["Cloudflare's CSP", "*skips 5 of 20 pages.*"],
    body: "Organization JSON-LD, security.txt, a Permissions-Policy, and robots.txt that welcomes AI crawlers by name. But the home page's content security policy is missing on 5 of the 20 pages analyzed, like /galileo/.",
    action: "Set security headers once at the edge or server, not per page template. Attackers look for the weakest page.",
    tags: ["WebSecurity", "CSP", "HTTPHeaders"]
  },
  {
    id: "webdev", report: "r100-webdev", scope: "Worldwide",
    title: ["web.dev's home page", "*has an empty headline.*"],
    body: "Preloaded HSTS, a nonce-based content security policy, and Organization and WebSite JSON-LD. But the home page also carries an Article block whose headline is an empty string, with no author or date.",
    action: "Validate structured data in CI. An item with empty required fields is noise that search may ignore.",
    tags: ["StructuredData", "SEO", "WebDev"]
  },
  {
    id: "louvre", report: "r100-louvre", scope: "Worldwide",
    title: ["Three Louvre pages,", "*one title.*"],
    body: "security.txt, a strict content security policy, and framing denied. robots.txt even keeps AI bots off images only. But the exhibitions, events, and guided-tours pages all share one title.",
    action: "Give every page a unique title that leads with its topic. Tabs, bookmarks, and search results all show it.",
    tags: ["SEO", "Titles", "Museums"]
  },
  {
    id: "rijksmuseum", report: "r100-rijksmuseum", scope: "Worldwide",
    title: ["The Rijksmuseum's HSTS", "*lasts 30 days.*"],
    body: "A Permissions-Policy, a Referrer-Policy, nosniff, and a sitemap named in robots.txt. But Strict-Transport-Security sets max-age to 30 days, and http:// reaches https through a temporary 307.",
    action: "Raise HSTS max-age to at least a year, ideally two, and make the http redirect permanent with a 301.",
    tags: ["WebSecurity", "HSTS", "Museums"]
  },
  {
    id: "lonelyplanet", report: "r100-lonelyplanet", scope: "Worldwide",
    title: ["Lonely Planet's home", "*is 1.8 MB of HTML.*"],
    body: "robots.txt blocks GPTBot from training but lets answer crawlers in, and sitemaps are listed. But every page analyzed ships over 500 KB of HTML, and the home page is 1.8 MB before compression, ahead of any image.",
    action: "Move bulky inline data out of the HTML and load it when needed. Smaller documents parse and paint sooner.",
    tags: ["WebPerformance", "PageWeight", "Travel"]
  },
  {
    id: "ikea", report: "r100-ikea", scope: "Worldwide",
    title: ["IKEA's home page", "*is 1.9 MB of HTML.*"],
    body: "security.txt, HSTS, nosniff, a sitemap, and robots.txt open to AI answer crawlers at the root. But all 19 pages analyzed ship more than 500 KB of HTML, and the US home page is 1.9 MB before compression.",
    action: "Measure HTML weight in CI with a budget. Inline state and repeated markup are the usual culprits.",
    tags: ["WebPerformance", "PageWeight", "Ecommerce"]
  },
  {
    id: "gutenberg", report: "r100-gutenberg", scope: "Worldwide",
    title: ["75,000 free books,", "*no Book markup.*"],
    body: "Every ebook page has its own title, description, and share card, and pages pass Core Web Vitals for real visitors. But no page analyzed carries JSON-LD, so nothing tells search or AI which pages are books.",
    action: "Add Book JSON-LD to each title page: name, author, inLanguage, and url. AI answers cite what they can parse.",
    tags: ["StructuredData", "GEO", "OpenKnowledge"]
  },
  {
    id: "creativecommons", report: "r100-creativecommons", scope: "Worldwide",
    title: ["Creative Commons", "*moves to https with 302.*"],
    body: "A sitemap index, pages that name their language, and robots meta that allows large previews. But http:// reaches https through a temporary 302, and no page analyzed sends Strict-Transport-Security.",
    action: "Use a 301 from http to https, then add Strict-Transport-Security so browsers skip http next time.",
    tags: ["WebSecurity", "HTTPS", "HSTS"]
  },
  {
    id: "eff", report: "r100-eff", scope: "Worldwide",
    title: ["The EFF's pages", "*send no HSTS.*"],
    body: "A content security policy in report-only mode, nosniff, framing limited to its origin, and a sitemap. But no page analyzed sends Strict-Transport-Security, so browsers don't upgrade a first http visit.",
    action: "Add Strict-Transport-Security with a long max-age. It tells browsers to use https before the request leaves.",
    tags: ["WebSecurity", "HSTS", "DigitalRights"]
  },
  {
    id: "wikimedia", report: "r100-wikimedia", scope: "Worldwide",
    title: ["Wikimedia's home page", "*has no h1.*"],
    body: "Preloaded HSTS, a content security policy starting at default-src 'self', and a sitemap per language. But the home page has no h1, and several About pages have two.",
    action: "One h1 per page, naming what the page is. Screen-reader users often jump to it first.",
    tags: ["Accessibility", "A11y", "Headings"]
  },
  {
    id: "fao", report: "r100-fao", scope: "Worldwide",
    title: ["FAO's HTML is fast.", "*Visitors still wait.*"],
    body: "The home page HTML arrives in about 0.2 s, behind preloaded HSTS and a content security policy. But real Chrome visitors wait 4.7 s at the 75th percentile for the largest content to appear.",
    action: "Find your Largest Contentful Paint element, load it early, give it a size, and never lazy-load it.",
    tags: ["WebPerformance", "CoreWebVitals", "LCP"]
  },
  {
    id: "wfp", report: "r100-wfp", scope: "Worldwide",
    title: ["WFP's viewport", "*turns off zoom.*"],
    body: "A content security policy starting at default-src 'self', nosniff, and a sitemap named in robots.txt. But the viewport sets user-scalable=no, which blocks pinch-zoom for people who need larger text.",
    action: "Remove user-scalable=no and maximum-scale from the viewport tag. Let readers zoom.",
    tags: ["Accessibility", "A11y", "MobileUX"]
  },
  {
    id: "esa", report: "r100-esa", scope: "Worldwide",
    title: ["ESA's search box", "*has no name.*"],
    body: "HSTS, robots.txt open to AI answer crawlers, and a description on the home page. But the site search on every page analyzed is a text field named only by its \"Search ESA\" placeholder.",
    action: "Add a visible label or aria-label to the search field. Screen readers announce the name, not the hint.",
    tags: ["Accessibility", "A11y", "Forms"]
  },
  {
    id: "cern", report: "r100-cern", scope: "Worldwide",
    title: ["CERN's pages", "*have no description.*"],
    body: "security.txt, a sitemap in robots.txt, and pages that name their language. But none of the 20 pages analyzed has a meta description, the home page included, so search engines pick the snippet.",
    action: "Start with the home page and your ten most visited: one sentence each on what the reader will find.",
    tags: ["SEO", "MetaDescription", "Science"]
  },
  {
    id: "natgeo", report: "r100-natgeo", scope: "Worldwide",
    title: ["NatGeo sets cookies", "*without Secure.*"],
    body: "Sitemaps, Organization JSON-LD, and robots.txt open to AI answer crawlers. But the home page sets five cookies, the SWID visitor ID among them, without Secure, and no page analyzed sends HSTS, so plain http can carry them.",
    action: "Mark every cookie Secure and send Strict-Transport-Security. A visitor ID should never travel over plain http.",
    tags: ["WebSecurity", "Cookies", "Privacy"]
  },
  {
    id: "coursera", report: "r100-coursera", scope: "Worldwide",
    title: ["Coursera taps", "*take 565 ms to answer.*"],
    body: "Preloaded HSTS, nosniff, an llms.txt for AI tools, and a sitemap. But real Chrome visitors see an Interaction to Next Paint of 565 ms at the 75th percentile, more than twice the 200 ms goal.",
    action: "Break long JavaScript tasks into smaller pieces and yield to the browser, so taps get a fast response.",
    tags: ["WebPerformance", "INP", "CoreWebVitals"]
  },
  {
    id: "php", report: "r100-php", scope: "Worldwide",
    title: ["PHP's sitemap", "*lists http://php.net.*"],
    body: "security.txt, HSTS, framing limited to its origin, and robots.txt open to AI crawlers. But all 39 URLs in its sitemap use http://php.net, not the https://www.php.net address the site serves.",
    action: "Generate the sitemap from your canonical URLs: same scheme, same host. Every redirect in it wastes crawl.",
    tags: ["SEO", "Sitemap", "OpenSource"]
  },
  {
    id: "gnu", report: "r100-gnu", scope: "Worldwide",
    title: ["GNU.org answers", "*plain http with a 200.*"],
    body: "Two-year HSTS on https, nosniff, framing limited to its origin, and a sitemap. But http://www.gnu.org/ serves the page itself with a 200 instead of redirecting, so a first http visit stays unencrypted.",
    action: "Redirect every http request to https with a 301. HSTS only helps after the browser has seen https once.",
    tags: ["WebSecurity", "HTTPS", "FreeSoftware"]
  },
  {
    id: "debian", report: "r100-debian", scope: "Worldwide",
    title: ["Debian's search field", "*goes unnamed.*"],
    body: "security.txt, nosniff, a no-referrer policy, and framing limited to its origin. But the site search field on the pages analyzed has no label, aria-label, or title, so screen readers announce an unnamed field.",
    action: "Add <label for> or aria-label=\"Search\" to the field. One attribute makes it usable by voice.",
    tags: ["Accessibility", "A11y", "Forms"]
  },
  {
    id: "ubuntu", report: "r100-ubuntu", scope: "Worldwide",
    title: ["Ubuntu speaks Markdown", "*and names its nginx.*"],
    body: "robots.txt points AI crawlers to Markdown versions of pages, port 80 is closed, and the CSP starts at default-src 'self'. But the Server header reads nginx/1.14.0 (Ubuntu), naming an exact version.",
    action: "Turn off version tokens (server_tokens off in nginx). Exact versions make it easy to match known flaws.",
    tags: ["WebSecurity", "GEO", "OpenSource"]
  },
  {
    id: "paho", report: "r100-paho", scope: "Worldwide",
    title: ["PAHO has no", "*Organization JSON-LD.*"],
    body: "Preloaded HSTS, nosniff, a strict Referrer-Policy, and robots.txt that keeps AI training bots off paginated news only. But no page analyzed carries JSON-LD saying who PAHO is.",
    action: "Add Organization JSON-LD with name, logo, url, and sameAs. It helps AI answers name the right agency.",
    tags: ["GEO", "StructuredData", "PublicHealth"]
  },
  {
    id: "dian", report: "r100-dian", scope: "National",
    title: ["DIAN's home page", "*says it's in English.*"],
    body: "One-year HSTS with includeSubDomains, and http goes to https. But the Spanish home page declares lang=\"en\", and inner pages declare no language, so screen readers read Spanish with English rules.",
    action: "Set lang=\"es\" on the <html> tag of every page. Screen readers, translators, and search engines all read it.",
    tags: ["Accessibility", "Lang", "GovTech"]
  },
  {
    id: "mineducacion", report: "r100-mineducacion", scope: "National",
    title: ["MinEducación's sitemap", "*lists the old address.*"],
    body: "HSTS, a sitemap named in robots.txt, and GA4. But 2,725 sitemap URLs use http://mineducacion.gov.co, not the https://www.mineducacion.gov.co address the site serves, so every entry redirects.",
    action: "Build the sitemap from canonical URLs: https, the www host you serve. Redirecting entries waste crawl.",
    tags: ["SEO", "Sitemap", "GovTech"]
  },
  {
    id: "minsalud", report: "r100-minsalud", scope: "National",
    title: ["MinSalud's home page", "*links to 404s.*"],
    body: "HSTS marked for preload, a CSP from default-src 'self', a Permissions-Policy, and no-referrer. But several links on the home page return 404, among them the giro directo page, the national contact point, and emergencies.",
    action: "Run a link check on your home page every week. It's the page most people start from.",
    tags: ["SEO", "BrokenLinks", "PublicHealth"]
  },
  {
    id: "mintic", report: "r100-mintic", scope: "National",
    title: ["MinTIC's analytics", "*stopped years ago.*"],
    body: "One-year HSTS, nosniff, a strict Referrer-Policy, and framing limited to its SharePoint. But the only analytics tag configures UA-19365357-2, and Universal Analytics stopped processing data by July 2024.",
    action: "Check your tags feed a live property. Move from a UA- ID to a GA4 G- ID, or remove the dead tag.",
    tags: ["Analytics", "GA4", "GovTech"]
  },
  {
    id: "cancilleria", report: "r100-cancilleria", scope: "National",
    title: ["Cancillería sends", "*to two GA4 properties.*"],
    body: "nosniff, framing limited to its origin, a sitemap, and a 301 from http to https. But 17 pages configure two GA4 properties, G-R2FPS06ZSD and G-N4639JFT8D, so numbers split unless both teams know.",
    action: "Keep one GA4 property per site. If two teams need the data, share access instead of adding a second tag.",
    tags: ["Analytics", "GA4", "GovTech"]
  },
  {
    id: "dane", report: "r100-dane", scope: "National",
    title: ["DANE's viewport", "*caps zoom at 1x.*"],
    body: "nosniff, no-referrer, framing limited to its origin, and a content security policy. But the viewport sets maximum-scale=1, which can stop pinch-zoom in some browsers, even next to user-scalable=yes.",
    action: "Drop maximum-scale from the viewport. width=device-width, initial-scale=1 is all most sites need.",
    tags: ["Accessibility", "Zoom", "OpenData"]
  },
  {
    id: "procuraduria", report: "r100-procuraduria", scope: "National",
    title: ["Procuraduría's canonical", "*host doesn't resolve.*"],
    body: "nosniff, framing limited to its origin, and a 301 from http to https. But the home page names https://externo.procuraduria.gov.co as its canonical, and that host does not resolve in DNS.",
    action: "Canonicals must use your public host. Check them after migrations, when internal hostnames leak in.",
    tags: ["SEO", "Canonical", "GovTech"]
  },
  {
    id: "icetex", report: "r100-icetex", scope: "National",
    title: ["ICETEX's inner pages", "*all point to the home.*"],
    body: "nosniff, framing limited to its origin, GA4 through Tag Manager, and a sitemap in robots.txt. But 19 inner pages name https://web.icetex.gov.co/ as their canonical, which asks search engines to index the home instead.",
    action: "Each page's canonical should be its own URL. A template that defaults to the home URL hides every inner page.",
    tags: ["SEO", "Canonical", "Education"]
  },
  {
    id: "icfes", report: "r100-icfes", scope: "National",
    title: ["ICFES's HTML", "*takes 2 s to start.*"],
    body: "A sitemap index in robots.txt, framing limited to its origin, and GA4. But the home page HTML took about 2.2 s to start arriving, measured twice. Fast sites send it in under 0.8 s.",
    action: "Cache the home page HTML at a CDN or in the server. Time to first byte is a floor for everything else.",
    tags: ["WebPerformance", "TTFB", "Education"]
  },
  {
    id: "colpensiones", report: "r100-colpensiones", scope: "National",
    title: ["Colpensiones", "*answers http with 503.*"],
    body: "HSTS, nosniff, and a robots.txt that names AI answer crawlers like OAI-SearchBot and PerplexityBot and lets them in. But plain http://www.colpensiones.gov.co/ answers 503 instead of redirecting to https.",
    action: "Keep port 80 alive just to send a 301 to https. Old links and typed addresses still arrive there.",
    tags: ["WebSecurity", "HTTPS", "GovTech"]
  },
  {
    id: "migracion", report: "r100-migracion", scope: "National",
    title: ["Migración Colombia", "*has no sitemap.*"],
    body: "A 301 from http to https, a canonical on the home page, and GA4. But /robots.txt and /sitemap.xml both return 404, so crawlers get no map of the site and no rules to follow.",
    action: "Publish robots.txt with a Sitemap: line, and generate the sitemap from your CMS so it stays current.",
    tags: ["SEO", "Sitemap", "GovTech"]
  },
  {
    id: "satena", report: "r100-satena", scope: "National",
    title: ["SATENA's pages", "*have no canonical.*"],
    body: "HSTS marked for preload, nosniff, framing limited to its origin, and a strict Referrer-Policy. But none of the 20 pages analyzed declares a canonical URL, so search engines guess which version to index.",
    action: "Add a self-referencing canonical to every page, plus hreflang links between the language versions.",
    tags: ["SEO", "Canonical", "Travel"]
  },
  {
    id: "davivienda", report: "r100-davivienda", scope: "National",
    title: ["Davivienda's robots.txt", "*is a model. LCP isn't.*"],
    body: "robots.txt lets AI answer bots like OAI-SearchBot and PerplexityBot in while blocking the training bots GPTBot, CCBot, and Google-Extended. But real Chrome visitors wait 4.6 s for the largest content.",
    action: "Find the Largest Contentful Paint element on your home page and serve it first: preload, size, compress.",
    tags: ["WebPerformance", "CoreWebVitals", "Banking"]
  },
  {
    id: "movistar", report: "r100-movistar", scope: "National",
    title: ["Movistar's headers", "*have a value mix-up.*"],
    body: "HSTS, no-referrer, a Permissions-Policy, and framing limited by CSP frame-ancestors. But X-Frame-Options is set to nosniff, a value meant for X-Content-Type-Options, which is missing.",
    action: "Send X-Content-Type-Options: nosniff, and X-Frame-Options: SAMEORIGIN. Recheck headers after config changes.",
    tags: ["WebSecurity", "Headers", "Telecom"]
  },
  {
    id: "claro", report: "r100-claro", scope: "National",
    title: ["Claro's home redirect", "*drops to plain http.*"],
    body: "HSTS, nosniff, and robots.txt open to OAI-SearchBot and ChatGPT-User. But https://www.claro.com.co/ redirects to http://www.claro.com.co/personas/, which then bounces back to https.",
    action: "Write redirects with the full https:// target. An http Location adds a hop and an unencrypted request.",
    tags: ["WebSecurity", "Redirects", "Telecom"]
  },
  {
    id: "exito", report: "r100-exito", scope: "National",
    title: ["Éxito's title", "*says exito.com twice.*"],
    body: "A 301 from http to https, a canonical, robots.txt that lists its sitemaps, and an open door for GPTBot. But the home page title is \"exito.com | exito.com\", which says nothing about what the store sells.",
    action: "Write a home title that says who you are and what you offer, in under 60 characters.",
    tags: ["SEO", "Titles", "Ecommerce"]
  },
  {
    id: "falabella", report: "r100-falabella", scope: "National",
    title: ["Falabella's home", "*declares no language.*"],
    body: "HSTS, framing limited to its origin, and robots.txt that lists its sitemaps. But the home page's <html> tag has no lang attribute, so screen readers and translators must guess it's Spanish.",
    action: "Add lang=\"es-CO\" to the <html> tag in your base template. One attribute fixes every page.",
    tags: ["Accessibility", "Lang", "Ecommerce"]
  },
  {
    id: "eltiempo", report: "r100-eltiempo", scope: "National",
    title: ["El Tiempo still", "*loads a retired UA tag.*"],
    body: "A strict Referrer-Policy, framing limited to its origin, and robots.txt that lists its sitemaps. But every page analyzed still loads UA-118090425-1, and Universal Analytics stopped processing data by July 2024.",
    action: "Search your templates for UA- IDs and remove them. They add a request and collect nothing.",
    tags: ["Analytics", "GA4", "News"]
  },
  {
    id: "semana", report: "r100-semana", scope: "National",
    title: ["Semana's description", "*repeats its title.*"],
    body: "robots.txt names news sitemaps, http goes to https with a 301, and section pages have their own descriptions. But the home description just repeats the title: \"Semana - Últimas Noticias de Colombia y el Mundo\".",
    action: "Write the home description as a one-line pitch: what readers find here today, in 150 characters or less.",
    tags: ["SEO", "MetaDescription", "News"]
  },
  {
    id: "elespectador", report: "r100-elespectador", scope: "National",
    title: ["El Espectador has", "*no main landmark.*"],
    body: "nosniff, a strict Referrer-Policy, a Permissions-Policy, and a sitemap index in robots.txt. But no page analyzed has a <main> element, so screen-reader users can't jump past the menus to the story.",
    action: "Wrap each page's primary content in one <main>. Skip links and screen readers use it to find the story.",
    tags: ["Accessibility", "Landmarks", "News"]
  },
  {
    id: "uniandes", report: "r100-uniandes", scope: "National",
    title: ["Uniandes skips a link", "*in its TLS chain.*"],
    body: "HSTS, a CSP from default-src 'self', nosniff, and a Permissions-Policy. But the server sends its certificate twice and leaves out the DigiCert intermediate. Browsers patch it in; Node.js and API clients refuse.",
    action: "Serve the full chain: leaf plus intermediates. Test with openssl s_client or SSL Labs after every renewal.",
    tags: ["WebSecurity", "TLS", "Education"]
  },
  {
    id: "sura", report: "r100-sura", scope: "National",
    title: ["SURA's home page", "*has three h1s.*"],
    body: "nosniff, framing limited to its origin, a sitemap in robots.txt, and a robots section that welcomes AI crawlers. But the home page has three h1 headings, and 11 of 20 pages analyzed have more or fewer than one.",
    action: "Give each page one h1 that names its topic. Use h2 and h3 for the sections below it.",
    tags: ["Accessibility", "Headings", "Insurance"]
  },
  {
    id: "compensar", report: "r100-compensar", scope: "National",
    title: ["Compensar lets any", "*Azure site frame it.*"],
    body: "HSTS, a strict Referrer-Policy, and a sitemap in robots.txt. But CSP frame-ancestors allows *.windows.net and *.core.windows.net, hosts any Azure customer can publish on, so any of them could embed its pages.",
    action: "List only the exact origins that embed you in frame-ancestors. Cloud wildcards include strangers.",
    tags: ["WebSecurity", "CSP", "Health"]
  },
  {
    id: "ecopetrol", report: "r100-ecopetrol", scope: "National",
    title: ["Ecopetrol still", "*configures a UA ID.*"],
    body: "HSTS with preload, nosniff, framing limited to its origin, and GA4 running. But the home page still runs gtag config for UA-57542691-1, and Universal Analytics stopped processing data by July 2024.",
    action: "Remove the UA config line and keep the GA4 one. A quarterly tag audit catches these leftovers.",
    tags: ["Analytics", "GA4", "Energy"]
  },
  {
    id: "rappi", report: "r100-rappi", scope: "National",
    title: ["Rappi's viewport", "*sets maximum-scale=1.*"],
    body: "A canonical, a 301 from http to https, and robots.txt listing sitemaps for its partners. But the viewport sets maximum-scale=1, which can block pinch-zoom for people who need bigger text.",
    action: "Use width=device-width, initial-scale=1 and nothing more. Fix layout overflow instead of locking zoom.",
    tags: ["Accessibility", "Zoom", "Delivery"]
  },
  {
    id: "rtvc", report: "r100-rtvc", scope: "National",
    title: ["RTVC's search box", "*has no label.*"],
    body: "HSTS, a CSP from default-src 'self', nosniff, and a Permissions-Policy that turns off camera, mic, and location. But the search field relies on a placeholder, \"Buscar\", with no label to announce.",
    action: "Add a <label> or aria-label to every input. Placeholders vanish while typing and aren't reliably announced.",
    tags: ["Accessibility", "Forms", "PublicMedia"]
  },
  {
    id: "bibliotecanacional", report: "r100-bibliotecanacional", scope: "National",
    title: ["Biblioteca Nacional's", "*canonical says http.*"],
    body: "nosniff, framing limited by CSP, and a 301 from http to https. But the home page canonical is http://bibliotecanacional.gov.co:80/es-co: plain http, a different host, and port 80.",
    action: "Set canonicals to the exact public URL: https, your real host, no port. Check your CMS's public URL setting.",
    tags: ["SEO", "Canonical", "Libraries"]
  },
  {
    id: "supersalud", report: "r100-supersalud", scope: "National",
    title: ["Supersalud loads", "*no analytics tag.*"],
    body: "HSTS with preload, nosniff, no-referrer, and a sitemap in robots.txt. But none of the 20 pages analyzed loads a known analytics tag, so the team may not see which services citizens look for.",
    action: "Measure something, even a privacy-first, cookie-free tool. You can't improve pages you can't see used.",
    tags: ["Analytics", "Measurement", "PublicHealth"]
  },
  {
    id: "contraloria", report: "r100-contraloria", scope: "National",
    title: ["Contraloría's sitemap", "*sits on port 8080.*"],
    body: "nosniff, framing limited to its origin, GA4, and a home description. But robots.txt points crawlers to http://www.contraloria.gov.co:8080/sitemap.xml, which timed out, and plain http answers 404.",
    action: "List the sitemap's public https URL in robots.txt, then open it in a browser to check it answers.",
    tags: ["SEO", "Sitemap", "GovTech"]
  },
  {
    id: "procolombia", report: "r100-procolombia", scope: "National",
    title: ["ProColombia's canonical", "*redirects back home.*"],
    body: "HSTS with preload, nosniff, framing limited to its origin, and a sitemap. But the home page names https://procolombia.co/inicio as canonical, and /inicio sends a 301 straight back to the home page.",
    action: "A canonical must be the final URL, answering 200. Never point it at an address that redirects.",
    tags: ["SEO", "Canonical", "Trade"]
  },
  {
    id: "nequi", report: "r100-nequi", scope: "National",
    title: ["Nequi's hreflang", "*points to the home page.*"],
    body: "HSTS with preload, nosniff, a CSP from default-src 'self', and a sitemap. But /personas/creditos declares itself canonical while its es-CO, es, and x-default alternates all point to the home page.",
    action: "hreflang alternates must point to the same page in each language, including the page itself.",
    tags: ["SEO", "Hreflang", "Fintech"]
  },
  {
    id: "educacionbogota", report: "r100-educacionbogota", scope: "Local",
    title: ["Educación Bogotá", "*has no robots.txt.*"],
    body: "One-year HSTS, nosniff, framing limited to its origin, a canonical, and a working /sitemap.xml. But /robots.txt returns 404, so crawlers are never told where that sitemap lives.",
    action: "Serve a robots.txt with a Sitemap: line. Two lines of text point every crawler to your map.",
    tags: ["SEO", "RobotsTxt", "Education"]
  },
  {
    id: "movilidadbogota", report: "r100-movilidadbogota", scope: "Local",
    title: ["Movilidad Bogotá's", "*sitemap says default.*"],
    body: "HSTS, nosniff, framing limited to its origin, a canonical, and GA4. But its sitemap lists URLs like http://default/ and http://default/en-gb, because the CMS never learned its public address.",
    action: "Set the CMS base URL to your public https address, then regenerate the sitemap.",
    tags: ["SEO", "Sitemap", "Mobility"]
  },
  {
    id: "saludcapital", report: "r100-saludcapital", scope: "Local",
    title: ["Salud Capital's home", "*has three canonicals.*"],
    body: "HSTS, nosniff, a strict Referrer-Policy, a content security policy, and a clear description. But the home page carries three canonical tags naming two different URLs, so search engines may ignore them all.",
    action: "Emit exactly one canonical per page. Check the template, CMS, and SEO plugins for copies.",
    tags: ["SEO", "Canonical", "PublicHealth"]
  },
  {
    id: "metrobogota", report: "r100-metrobogota", scope: "Local",
    title: ["Metro de Bogotá's HSTS", "*lasts 17 minutes.*"],
    body: "nosniff, GA4, a declared language, and a working sitemap. But Strict-Transport-Security sets max-age=1000, about 17 minutes, so browsers forget the https-only rule almost as soon as they learn it.",
    action: "Set HSTS max-age to at least one year (31536000) once https works everywhere.",
    tags: ["WebSecurity", "HSTS", "Mobility"]
  },
  {
    id: "idrd", report: "r100-idrd", scope: "Local",
    title: ["IDRD's Referrer-Policy", "*is unsafe-url.*"],
    body: "One-year HSTS, nosniff, framing limited to its origin, and a Permissions-Policy that turns off location, mic, and camera. But Referrer-Policy: unsafe-url sends the full URL, query included, to every site linked.",
    action: "Use strict-origin-when-cross-origin. Other sites then see only your domain, never paths or search terms.",
    tags: ["WebSecurity", "Privacy", "Sports"]
  },
  {
    id: "idartes", report: "r100-idartes", scope: "Local",
    title: ["Idartes' https root", "*redirects to http.*"],
    body: "nosniff, framing limited to its origin, a clear description, and a sitemap. But https://www.idartes.gov.co/ sends a 301 to http://www.idartes.gov.co/es, and the canonical also names the http address.",
    action: "Make every redirect and canonical use https. Search for http:// in your server config and templates.",
    tags: ["WebSecurity", "HTTPS", "Arts"]
  },
  {
    id: "visitbogota", report: "r100-visitbogota", scope: "Local",
    title: ["Visit Bogotá responds", "*slowly to taps.*"],
    body: "HSTS marked for preload, nosniff, a content security policy, a canonical, and a clear description. But real Chrome visitors wait 436 ms at the 75th percentile for the page to respond to a tap or click.",
    action: "Find long tasks in the Performance panel and split them. Keep INP under 200 ms.",
    tags: ["WebPerformance", "INP", "Tourism"]
  },
  {
    id: "biblored", report: "r100-biblored", scope: "Local",
    title: ["BibloRed answers", "*plain http with a 200.*"],
    body: "Two-year HSTS marked for preload, nosniff, framing limited to its origin, and a canonical. But http://www.biblored.gov.co/ serves the page with a 200 instead of redirecting, and browsers ignore HSTS sent over http.",
    action: "Redirect every http request to https with a 301. HSTS only counts when it arrives over https.",
    tags: ["WebSecurity", "HTTPS", "Libraries"]
  },
  {
    id: "catastro", report: "r100-catastro", scope: "Local",
    title: ["Catastro Bogotá has", "*no descriptions.*"],
    body: "HSTS, nosniff, framing limited to its origin, GA4 through Tag Manager, and a declared language. But none of the 20 pages analyzed has a meta description, so Google and AI answers write their own.",
    action: "Write a one-sentence description for each key page: what it offers and who it's for, under 155 characters.",
    tags: ["SEO", "MetaDescription", "GovTech"]
  },
  {
    id: "jbb", report: "r100-jbb", scope: "Local",
    title: ["The Botanic Garden", "*loads logos over http.*"],
    body: "A declared language, a canonical, a 301 from http to https, and a sitemap named in robots.txt. But every page analyzed loads its two logo images over http://, so browsers must upgrade or block them.",
    action: "Load every asset over https or as a relative URL. A search for src=\"http:// in your theme finds them.",
    tags: ["WebSecurity", "MixedContent", "Nature"]
  },
  {
    id: "planetario", report: "r100-planetario", scope: "Local",
    title: ["The Planetarium skips", "*a link in its TLS chain.*"],
    body: "nosniff, framing limited to its origin, a declared language, and a 301 from http to https. But the server leaves out the Sectigo intermediate certificate. Browsers patch it in; Node.js and API clients refuse.",
    action: "Install the full chain your certificate authority provides, then test with openssl s_client or SSL Labs.",
    tags: ["WebSecurity", "TLS", "Science"]
  },
  {
    id: "antioquia", report: "r100-antioquia", scope: "Local",
    title: ["Antioquia's home", "*is titled \"Inicio\".*"],
    body: "HSTS marked for preload, a CSP from default-src 'self' with base-uri set, nosniff, and a strict Referrer-Policy. But the home page title is just \"Inicio\", which tells searchers nothing about the department.",
    action: "Put the organization's name in the home title, with what people come for. \"Home\" alone wastes the slot.",
    tags: ["SEO", "Titles", "GovTech"]
  },
  {
    id: "medellin", report: "r100-medellin", scope: "Local",
    title: ["Medellín's portal", "*sends no HSTS.*"],
    body: "nosniff, framing limited to its origin, a canonical, a clear description, and two sitemaps named in robots.txt. But none of the 19 pages analyzed sends Strict-Transport-Security, so a first http visit can be intercepted.",
    action: "Send HSTS with a one-year max-age once every subdomain serves https.",
    tags: ["WebSecurity", "HSTS", "GovTech"]
  },
  {
    id: "metromedellin", report: "r100-metromedellin", scope: "Local",
    title: ["Metro de Medellín", "*still runs a UA tag.*"],
    body: "HSTS marked for preload, a CSP from default-src 'self', nosniff, and Consent Mode defaults. But the home page still runs ga('create', 'UA-8498906-1'), which collects nothing since July 2024.",
    action: "Remove analytics.js UA calls. If you need numbers, send them to a GA4 property or another live tool.",
    tags: ["Analytics", "GA4", "Mobility"]
  },
  {
    id: "epm", report: "r100-epm", scope: "Local",
    title: ["EPM's canonical", "*ends at a 404.*"],
    body: "Two-year HSTS marked for preload, a CSP from default-src 'self', nosniff, and a clear description. But the canonical is /content/epm/clientesyusuarios.html, an internal CMS path that redirects to a 404.",
    action: "Map CMS paths to public URLs. Open your canonical in a browser: it must answer 200.",
    tags: ["SEO", "Canonical", "Utilities"]
  },
  {
    id: "udea", report: "r100-udea", scope: "Local",
    title: ["UdeA's pages", "*skip security headers.*"],
    body: "A declared language, a sitemap named in robots.txt, and robots rules that keep the GPTBot and Google-Extended training bots out. But pages send no HSTS, no nosniff, no frame protection, and only a report-only CSP.",
    action: "Start with HSTS, X-Content-Type-Options: nosniff, and frame-ancestors 'self'. Then enforce your CSP.",
    tags: ["WebSecurity", "Headers", "Education"]
  },
  {
    id: "eafit", report: "r100-eafit", scope: "Local",
    title: ["EAFIT's pages", "*have no main landmark.*"],
    body: "HSTS, nosniff, a strict Referrer-Policy, a Permissions-Policy, a canonical, and a clear description. But none of the 20 pages analyzed has a <main> element, so screen-reader users can't skip straight to the content.",
    action: "Wrap the primary content of every template in one <main> for skip links.",
    tags: ["Accessibility", "Landmarks", "Education"]
  },
  {
    id: "cali", report: "r100-cali", scope: "Local",
    title: ["Cali's robots.txt", "*names a missing sitemap.*"],
    body: "HSTS, nosniff, a strict Referrer-Policy, a Permissions-Policy, and a canonical. But robots.txt points crawlers to https://www.cali.gov.co/sitemap.xml, and that address returns 404.",
    action: "Open every Sitemap: line in robots.txt after each release. A 404 there means crawlers lose your map.",
    tags: ["SEO", "Sitemap", "GovTech"]
  },
  {
    id: "metrocali", report: "r100-metrocali", scope: "Local",
    title: ["Metro Cali's home", "*describes an old notice.*"],
    body: "HSTS marked for preload, nosniff, a strict Referrer-Policy, a Permissions-Policy, and a CSP. But the home page description is a single notice about a vehicle scrapping resolution, not what the system offers.",
    action: "Write a fixed home description about your service. Don't let the CMS fill it from the latest post.",
    tags: ["SEO", "MetaDescription", "Mobility"]
  },
  {
    id: "univalle", report: "r100-univalle", scope: "Local",
    title: ["Univalle's English link", "*returns a 404.*"],
    body: "nosniff, GA4, a declared language, and http that redirects to https. But the home page's English switch, /loader.php?…idioma=EN, returns 404, so international visitors hit an error on their first click.",
    action: "Test the language switcher in every release. It's often the first click for visitors from abroad.",
    tags: ["SEO", "BrokenLinks", "Education"]
  },
  {
    id: "transcaribe", report: "r100-transcaribe", scope: "Local",
    title: ["Transcaribe reorders", "*the keyboard path.*"],
    body: "A declared language, a canonical, a sitemap index in robots.txt, a 301 to https, and GA4. But 19 pages analyzed use a positive tabindex, which pulls one element ahead of everything else in keyboard order.",
    action: "Use tabindex=\"0\" or \"-1\" only. Fix focus order by ordering the HTML, not with positive numbers.",
    tags: ["Accessibility", "Keyboard", "Mobility"]
  },
  {
    id: "bucaramanga", report: "r100-bucaramanga", scope: "Local",
    title: ["Bucaramanga's home", "*has no title tag.*"],
    body: "HSTS marked for preload, nosniff, a strict Referrer-Policy, a Permissions-Policy, and framing limited to its origin. But 12 pages analyzed have no <title>, the home page included.",
    action: "Give every page a unique <title>. It's the tab label, the search result headline, and the share card text.",
    tags: ["SEO", "Titles", "GovTech"]
  },
  {
    id: "metrolinea", report: "r100-metrolinea", scope: "Local",
    title: ["Metrolínea's viewport", "*turns off zoom.*"],
    body: "nosniff, framing limited to its origin, a working sitemap, and a 301 from http to https. But the viewport sets maximum-scale=1 and user-scalable=no, which blocks pinch-zoom for riders who need larger text.",
    action: "Remove user-scalable=no and maximum-scale. Let readers zoom, and fix any layout that breaks.",
    tags: ["Accessibility", "Zoom", "Mobility"]
  },
  {
    id: "pereira", report: "r100-pereira", scope: "Local",
    title: ["Pereira's feature policy", "*allows every origin.*"],
    body: "HSTS marked for preload, a CSP from default-src 'self', nosniff, and a strict Referrer-Policy. But Permissions-Policy grants camera, microphone, geolocation, and payment to every origin with =*.",
    action: "Default to camera=(), microphone=(), geolocation=(). Grant features only where needed.",
    tags: ["WebSecurity", "PermissionsPolicy", "GovTech"]
  },
  {
    id: "manizales", report: "r100-manizales", scope: "Local",
    title: ["Manizales' visitors", "*wait 5.7 s to see it.*"],
    body: "A declared language, a canonical, a sitemap named in robots.txt, and a 301 to https. But real Chrome visitors wait 5.7 s at the 75th percentile for the largest content, and the HTML alone took 2.5 s.",
    action: "Start with the server: cache the HTML. Then preload the hero image and defer scripts that aren't needed.",
    tags: ["WebPerformance", "CoreWebVitals", "GovTech"]
  },
  {
    id: "santamarta", report: "r100-santamarta", scope: "Local",
    title: ["Santa Marta still", "*runs a UA tag.*"],
    body: "HSTS, nosniff, a strict Referrer-Policy, framing limited to its origin, and GA4. But the home page still runs ga('create', 'UA-121052958-1'), and Universal Analytics stopped processing data by July 2024.",
    action: "Delete the UA snippet and keep GA4. One live tag is easier to trust than two half-dead ones.",
    tags: ["Analytics", "GA4", "Tourism"]
  }
  // END RUNS
];

function shortDate(iso) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

const TIPS = RUNS.map((run, index) => {
  const report = JSON.parse(fs.readFileSync(path.join(REPORTS, run.report + "-current.json"), "utf8"));
  const score = report.insights.score;
  const analyzed = shortDate(report.fetchedAt);
  const fill = (text) => text.replace(/\{(\w+)\}/g, (all, key) => key === "overall" ? score.overall : score.areas[key] ? score.areas[key].score : all);
  return Object.assign({}, run, {
    title: run.title.map(fill),
    body: fill(run.body),
    action: fill(run.action),
    cat: run.scope,
    counter: "Real run " + String(index + 1).padStart(2, "0") + " / " + String(RUNS.length).padStart(2, "0"),
    actionLabel: "Lesson",
    footRight: "Analyzed on " + analyzed,
    analyzed,
    overall: score.overall,
    visual: {
      type: "scores",
      overall: score.overall,
      areas: AREAS.map(([key, label]) => [label, score.areas[key].score]),
      note: report.host + " · " + report.pages.length + (report.pages.length === 1 ? " page analyzed · " : " pages analyzed · ") + analyzed
    }
  });
});

function link(platform, run) {
  return GUIDE + "?utm_source=" + platform + "&utm_medium=social&utm_campaign=runs-100-2026-11&utm_content=" + run.id;
}

function plainTitle(run) { return run.title.join(" ").replace(/\*/g, "").replace(/\s+/g, " ").trim(); }

function captions(run) {
  const head = plainTitle(run);
  const fair = "One automated analysis of public pages on " + run.analyzed + ". A starting point, not a verdict.";
  return {
    linkedin: [head, "", run.body, "", "The lesson for every team: " + run.action, "", fair, "How the review works, step by step: " + link("linkedin", run), "", tagLine(run, "linkedin")].join("\n"),
    x: xPost(head + "\n\n" + run.action, link("x", run), tagLine(run, "x")),
    instagram: [head, "", run.body, "", "Lesson: " + run.action, "", fair, "Guide: link in bio.", "", tagLine(run, "instagram")].join("\n"),
    facebook: [head, "", run.body, "", "Lesson: " + run.action, "", fair, link("facebook", run), "", tagLine(run, "facebook")].join("\n"),
    tiktok: head + " " + run.action + " " + tagLine(run, "tiktok"),
    youtubeTitle: (head + " #Shorts").slice(0, 100),
    youtube: [run.body, "", "Lesson: " + run.action, "", fair, "", "Guide: " + link("youtube", run), "", "Real runs · QA-lab URL Review", "", tagLine(run, "youtube")].join("\n")
  };
}

module.exports = { SITE, GUIDE, CATS, TIPS, captions, link, plainTitle };
