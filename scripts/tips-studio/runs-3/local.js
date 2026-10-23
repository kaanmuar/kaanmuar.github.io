/* local real runs for series three. See ../runs-3.js for the entry shape. */

module.exports = [
  {
    id: "armenia", report: "r3-armenia", scope: "Local",
    title: ["Armenia's city hall:", "*no main landmark.*"],
    body: "Two-year HSTS with preload, a content security policy, security.txt, and a permanent https redirect. But no page analyzed wraps its content in <main>, so screen reader users can't jump past the menus.",
    action: "Wrap each page's content in one <main>, which screen readers offer as a skip link.",
    tags: ["Accessibility", "Landmarks", "GovTech"]
  },
  {
    id: "ibague", report: "r3-ibague", scope: "Local",
    title: ["Ibagué's search box", "*has no label.*"],
    body: "One-year HSTS, a permanent https redirect, a meta description on every page analyzed, and the page text right in the HTML. But the search field has only a placeholder, so screen readers announce an unnamed box.",
    action: "Give every field a <label> or an aria-label. Placeholder text disappears on typing and is not a name.",
    tags: ["Accessibility", "Forms", "GovTech"]
  },
  {
    id: "neiva", report: "r3-neiva", scope: "Local",
    title: ["Neiva's sitemap lists", "*a host that won't load.*"],
    body: "Every page analyzed has a meta description, framing is limited to its origin, and nosniff is sent. But all 500 URLs in /sitemap.xml sit on www.neiva.gov.co, which did not answer, not on www.alcaldianeiva.gov.co.",
    action: "Build the sitemap from the live domain; spot-check it after a move or rebrand.",
    tags: ["SEO", "Sitemap", "GovTech"]
  },
  {
    id: "villavicencio", report: "r3-villavicencio", scope: "Local",
    title: ["Villavicencio loads", "*15 scripts before paint.*"],
    body: "Structured data that names the city hall, full share cards, one-year HSTS, and a permanent https redirect. But the home page's <head> loads 15 scripts without async or defer, and the HTML alone weighs 549 KB.",
    action: "Add defer to scripts that don't need to run before first paint, and move inline data out of the HTML.",
    tags: ["WebPerf", "RenderBlocking", "GovTech"]
  },
  {
    id: "pasto", report: "r3-pasto", scope: "Local",
    title: ["Pasto sends each visit", "*to two GA4 properties.*"],
    body: "Made-up paths get a real 404, the page text is in the HTML, and the start page declares Spanish for Colombia. But every page analyzed loads gtag.js twice, for two GA4 IDs, so one visit can land in two reports.",
    action: "Keep one GA4 property per site, loaded once, ideally through Tag Manager, and retire the old ID.",
    tags: ["Analytics", "GA4", "GovTech"]
  },
  {
    id: "popayan", report: "r3-popayan", scope: "Local",
    title: ["Popayán's links share", "*with no preview card.*"],
    body: "A meta description on every page analyzed, a canonical, nosniff, framing limited to its origin, and port 80 closed. But the pages carry no og: tags, so a shared link shows no chosen title, text, or image.",
    action: "Add og:title, og:description, og:image, og:url, and twitter:card to each page template.",
    tags: ["SEO", "OpenGraph", "GovTech"]
  },
  {
    id: "tunja", report: "r3-tunja", scope: "Local",
    title: ["Tunja's home page says", "*\"Territoriales\".*"],
    body: "One-year HSTS, nosniff, and framing limited to its origin. But the HTML holds 21 characters of text under the title Territoriales; the rest is drawn by JavaScript, which most AI crawlers do not run.",
    action: "Render the title, a description, and the main text on the server, so crawlers and AI answers can read them.",
    tags: ["GEO", "JavaScript", "GovTech"]
  },
  {
    id: "cucuta", report: "r3-cucuta", scope: "Local",
    title: ["Cúcuta redirects to", "*https, but no HSTS.*"],
    body: "A sitemap index, structured data naming the city hall, full share cards, alt text on every image, and a permanent https redirect. But no Strict-Transport-Security header is sent, so browsers never remember it.",
    action: "Send Strict-Transport-Security with max-age=31536000 on every https response once all subdomains serve https.",
    tags: ["WebSecurity", "HSTS", "GovTech"]
  },
  {
    id: "monteria", report: "r3-monteria", scope: "Local",
    title: ["Montería's pages", "*can't be zoomed.*"],
    body: "One-year HSTS with preload, nosniff, a content security policy, alt text on every image, and a permanent https redirect. But the viewport tag sets user-scalable=no, so people on phones can't pinch to zoom.",
    action: "Remove user-scalable=no and maximum-scale from the viewport tag. Low-vision visitors rely on zoom.",
    tags: ["Accessibility", "Zoom", "GovTech"]
  },
  {
    id: "riohacha", report: "r3-riohacha", scope: "Local",
    title: ["Riohacha's home links", "*to a page that 404s.*"],
    body: "A canonical and a meta description on the home page, framing limited to its origin, nosniff, and port 80 closed. But the home page link to Mecanismos de Participación Ciudadana answers 404.",
    action: "Run a link checker after each content change, and redirect moved pages instead of dropping their URLs.",
    tags: ["SEO", "BrokenLinks", "GovTech"]
  },
  {
    id: "soacha", report: "r3-soacha", scope: "Local",
    title: ["Soacha's city hall", "*sends no HSTS.*"],
    body: "A meta description on every page analyzed, framing limited to its origin, nosniff, and port 80 closed. But no Strict-Transport-Security header is sent, so browsers are never told to insist on https.",
    action: "Send Strict-Transport-Security with a max-age of a year or more: one header.",
    tags: ["WebSecurity", "HSTS", "GovTech"]
  },
  {
    id: "bello", report: "r3-bello", scope: "Local",
    title: ["Bello's JSON-LD names", "*the page, not the city.*"],
    body: "A meta description on every page analyzed, publication dates, framing limited to its origin, and nosniff. Its JSON-LD describes a WebPage and a WebSite, but no Organization says who runs the site.",
    action: "Add a GovernmentOrganization block with name, url, logo, and sameAs links to your official profiles.",
    tags: ["GEO", "StructuredData", "GovTech"]
  },
  {
    id: "itagui", report: "r3-itagui", scope: "Local",
    title: ["Itagüí's session cookie", "*skips the Secure flag.*"],
    body: "A content security policy, Referrer-Policy, Permissions-Policy, nosniff, and a permanent https redirect. But the ci_session_sede_electronica cookie is set without Secure, and no HSTS backs it up.",
    action: "Mark every cookie Secure, and session cookies HttpOnly and SameSite. One server setting covers them all.",
    tags: ["WebSecurity", "Cookies", "GovTech"]
  },
  {
    id: "palmira", report: "r3-palmira", scope: "Local",
    title: ["Palmira's home page", "*has no description.*"],
    body: "A GovernmentOrganization in JSON-LD, a sitemap index, alt text on every image, and a permanent https redirect. But 16 of the pages analyzed, the home page among them, have no meta description.",
    action: "Write a description of about 150 characters for each key page, so you choose the snippet, not the crawler.",
    tags: ["SEO", "MetaDescription", "GovTech"]
  },
  {
    id: "sdp", report: "r3-sdp", scope: "Local",
    title: ["Planeación Bogotá", "*still answers on http.*"],
    body: "A meta description on every page analyzed, framing limited to its origin, nosniff, and every link opened answered. But the plain-http home page answers 200 with no redirect, and no HSTS is sent.",
    action: "Redirect every http request to https with a 301, then add Strict-Transport-Security.",
    tags: ["WebSecurity", "HTTPS", "GovTech"]
  },
  {
    id: "ambientebogota", report: "r3-ambientebogota", scope: "Local",
    title: ["Ambiente Bogotá", "*publishes no sitemap.*"],
    body: "One-year HSTS with preload, nosniff, a strict Referrer-Policy, and framing limited to its origin. But robots.txt names no sitemap and /sitemap.xml answers 404, so crawlers find pages by links alone.",
    action: "Publish a sitemap.xml of the pages you want found and name it in robots.txt with one Sitemap: line.",
    tags: ["SEO", "Sitemap", "Environment"]
  },
  {
    id: "uaesp", report: "r3-uaesp", scope: "Local",
    title: ["UAESP's home title", "*tops 180 characters.*"],
    body: "HSTS, nosniff, framing limited to its origin, a Referrer-Policy, a GovernmentOrganization in JSON-LD, and a working sitemap. But the home page title runs past 180 characters, and Google shows about 60.",
    action: "Keep titles near 60 characters and move the mission into the description.",
    tags: ["SEO", "TitleTags", "GovTech"]
  },
  {
    id: "canalcapital", report: "r3-canalcapital", scope: "Local",
    title: ["Canal Capital's home", "*is 624 KB of HTML.*"],
    body: "A content security policy, one-year HSTS, nosniff, Permissions-Policy, a canonical, and structured data. But the home page HTML alone weighs 624 KB before any image or script, and it sends no cache-control header.",
    action: "Move inline scripts and styles into cached files, and trim long lists.",
    tags: ["WebPerf", "PageWeight", "PublicMedia"]
  },
  {
    id: "metroplus", report: "r3-metroplus", scope: "Local",
    title: ["Anyone can frame", "*Metroplús pages.*"],
    body: "A sitemap named in robots.txt, a canonical, a permanent https redirect, and every link opened answered. But no X-Frame-Options or CSP frame-ancestors is sent, so any site can load these pages in a frame.",
    action: "Send Content-Security-Policy: frame-ancestors 'self', or X-Frame-Options: SAMEORIGIN, on every page.",
    tags: ["WebSecurity", "Clickjacking", "Mobility"]
  },
  {
    id: "madrid", report: "r3-madrid", scope: "Local",
    title: ["Madrid has llms.txt,", "*but no JSON-LD.*"],
    body: "llms.txt and security.txt are published, every image has alt text, nosniff is sent, and Core Web Vitals pass for real visitors. But none of the 16 pages analyzed carries JSON-LD saying who runs the site.",
    action: "Add one GovernmentOrganization block with name, url, logo, and sameAs. AI answers use it to name you.",
    tags: ["GEO", "StructuredData", "SmartCity"]
  },
  {
    id: "barcelona", report: "r3-barcelona", scope: "Local",
    title: ["Barcelona blocks", "*ChatGPT search.*"],
    body: "Language alternates that link back, full share cards, a canonical, nosniff, and a permanent https redirect. But robots.txt disallows OAI-SearchBot and nine other AI search agents, so their answers can't cite it.",
    action: "Block training crawlers if you choose, but allow search agents like OAI-SearchBot so AI answers can cite you.",
    tags: ["GEO", "RobotsTxt", "AISearch"]
  },
  {
    id: "buenosaires", report: "r3-buenosaires", scope: "Local",
    title: ["Buenos Aires still", "*loads a retired UA tag.*"],
    body: "A sitemap of thousands of URLs, framing limited to its origin, and Spanish for Argentina declared. But the page still carries UA-260690656-1, and Google stopped processing Universal Analytics in July 2024.",
    action: "Remove the Universal Analytics tags, which collect nothing now, and keep one GA4.",
    tags: ["Analytics", "GA4", "SmartCity"]
  },
  {
    id: "munistgo", report: "r3-munistgo", scope: "Local",
    title: ["Santiago's search field", "*is a nameless box.*"],
    body: "Framing denied outright, a WordPress sitemap, language alternates that link back, and Secure cookies. But the search field's only name is its placeholder, so screen readers announce an unnamed edit box.",
    action: "Add a visible <label> or an aria-label to every input. A placeholder is a hint, not a name.",
    tags: ["Accessibility", "Forms", "SmartCity"]
  },
  {
    id: "quito", report: "r3-quito", scope: "Local",
    title: ["Quito answers 200", "*to any made-up path.*"],
    body: "Structured data naming the municipality, full share cards, alt text on every image, nosniff, and Secure cookies. But a made-up path answers 200 with the home page title, so search engines see a soft 404.",
    action: "Return a real 404 status for unknown URLs, with a helpful page and a search box.",
    tags: ["SEO", "Soft404", "SmartCity"]
  },
  {
    id: "paris", report: "r3-paris", scope: "Local",
    title: ["Paris.fr has no", "*entity markup.*"],
    body: "One-year HSTS, nosniff, a strict Referrer-Policy, a gzipped sitemap, and Core Web Vitals that pass for real visitors. But the home page has no JSON-LD naming the Ville de Paris or linking its profiles.",
    action: "Add a GovernmentOrganization block with name, url, logo, and sameAs. AI answers use it to describe you.",
    tags: ["GEO", "StructuredData", "SmartCity"]
  },
  {
    id: "nyc", report: "r3-nyc", scope: "Local",
    title: ["NYC.gov sends HSTS,", "*but not on every page.*"],
    body: "security.txt, nosniff, framing limits, and Core Web Vitals that pass for real visitors. But agency pages under /site/, like DSNY's and Health's, answer without Strict-Transport-Security, while /main sends it.",
    action: "Set security headers at the edge, not per app, so every path on the host gets the same HSTS policy.",
    tags: ["WebSecurity", "HSTS", "SmartCity"]
  },
  {
    id: "tfl", report: "r3-tfl", scope: "Local",
    title: ["TfL has no", "*security.txt.*"],
    body: "A meta description on every page analyzed, framing denied, one-year HSTS, a canonical, and a sitemap. But /.well-known/security.txt answers 404, so a researcher who finds a flaw has no published contact.",
    action: "Publish /.well-known/security.txt with Contact and Expires lines. It takes minutes.",
    tags: ["WebSecurity", "SecurityTxt", "Transport"]
  },
  {
    id: "montevideo", report: "r3-montevideo", scope: "Local",
    title: ["Montevideo's canonical", "*points to plain http.*"],
    body: "nosniff, framing limited to its origin, a main landmark, and every link opened answered. But all 20 pages analyzed name an http:// canonical on montevideo.gub.uy, a different scheme and host than the live site.",
    action: "Point each canonical at the exact https URL you serve, with the www if you use it.",
    tags: ["SEO", "Canonical", "SmartCity"]
  },
  {
    id: "inder", report: "r3-inder", scope: "Local",
    title: ["Inder Medellín calls", "*every page 'Inicio'.*"],
    body: "Every link opened answered, the page text is in the HTML, and a mobile viewport is set. But all 20 pages analyzed share the title Inder Medellín | Inicio, so search results can't tell one page from another.",
    action: "Give each page a unique title that starts with what that page is about, then the site name.",
    tags: ["SEO", "TitleTags", "Sports"]
  },
  {
    id: "bibliotecasmedellin", report: "r3-bibliotecasmedellin", scope: "Local",
    title: ["Medellín's libraries", "*have no h1 headings.*"],
    body: "Structured data naming the network, share cards, a sitemap index, and a canonical. But none of the 20 pages analyzed has exactly one h1, and the home page has none, so headings give no outline to follow.",
    action: "Give each page one h1 that names its topic, then h2 and h3 in order. Screen readers jump by heading.",
    tags: ["Accessibility", "Headings", "Libraries"]
  },
  {
    id: "idpc", report: "r3-idpc", scope: "Local",
    title: ["IDPC hides its", "*participation pages.*"],
    body: "Two-year HSTS, nosniff, framing limited to its origin, structured data, and a meta description on every page analyzed. But /transparencia/menu-participa and two pages under it tell search engines noindex.",
    action: "Audit which pages carry noindex. Public participation pages should be findable; keep it for search results.",
    tags: ["SEO", "Indexing", "Heritage"]
  },
  {
    id: "culturabogota", report: "r3-culturabogota", scope: "Local",
    title: ["Cultura Bogotá keeps", "*Universal Analytics.*"],
    body: "nosniff, a strict Referrer-Policy, framing limited to its origin, a canonical, and language alternates that link back. But beside GA4 the page still loads UA-3599876-14, which has collected nothing since July 2024.",
    action: "Remove the old UA tag and keep one GA4 setup, so pages stop loading code that sends data nowhere.",
    tags: ["Analytics", "GA4", "Culture"]
  },
  {
    id: "berlin", report: "r3-berlin", scope: "Local",
    title: ["Berlin.de's hreflang", "*leaves out German.*"],
    body: "security.txt, one-year HSTS, nosniff, a content security policy, and a sitemap index. But the home page lists its English, French, Polish, and other versions in hreflang and skips German, the page itself.",
    action: "List every language version in hreflang, including the page itself, and make each version link back.",
    tags: ["SEO", "Hreflang", "i18n"]
  },
  {
    id: "wien", report: "r3-wien", scope: "Local",
    title: ["Vienna's city map:", "*183 unnamed boxes.*"],
    body: "HSTS with preload, a content security policy, security.txt, a sitemap, and a meta description on every page analyzed. But on /stadtplan/, 183 of 188 inputs, mostly layer checkboxes, have no label to announce.",
    action: "Give each checkbox a <label for>, or aria-labelledby pointing at its visible text.",
    tags: ["Accessibility", "Forms", "SmartCity"]
  }
];
