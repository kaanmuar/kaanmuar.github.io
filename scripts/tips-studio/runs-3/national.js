/* national real runs for series three. See ../runs-3.js for the entry shape. */

module.exports = [
  {
    id: "policiaco",
    report: "r3-policiaco",
    scope: "National",
    title: ["Policía Nacional's", "*search has no label.*"],
    body: "HSTS with preload, framing limited to its own origin, a declared language, and every internal link opened answered. But the home page search box and volume slider have no label, so screen readers announce blank fields.",
    action: "Tie each field to a <label for>, or give it an aria-label. A screen reader can only announce a name that exists.",
    tags: ["Accessibility", "FormLabels", "GovTech"]
  },
  {
    id: "gobmx",
    report: "r3-gobmx",
    scope: "National",
    title: ["Gob.mx can be framed", "*by any other site.*"],
    body: "A permanent https redirect, real 404s for unknown paths, and pages that read well without JavaScript. But the start page sends no X-Frame-Options, no CSP frame-ancestors, and no HSTS, so any site can load it in a frame.",
    action: "Send frame-ancestors 'self' in a CSP, or X-Frame-Options: SAMEORIGIN. It stops clickjacking on forms.",
    tags: ["Security", "Clickjacking", "GovTech"]
  },
  {
    id: "fiscaliaco",
    report: "r3-fiscaliaco",
    scope: "National",
    title: ["Fiscalía's pages", "*share one title.*"],
    body: "A meta description on every page read, Organization JSON-LD, preloaded HSTS, and a Permissions-Policy. But the home, Quiénes somos, and Misión y visión pages are all titled just \"Fiscalía General de la Nación\".",
    action: "Lead each title with the page topic, then the institution, so results stand apart.",
    tags: ["SEO", "PageTitles", "GovTech"]
  },
  {
    id: "argentinagob",
    report: "r3-argentinagob",
    scope: "National",
    title: ["Argentina.gob.ar waits", "*on 28 scripts.*"],
    body: "A meta description on every page read, full share cards, a sitemap, and every internal link opened answered. But the home page head loads 28 scripts with no async or defer, and nothing paints until each one arrives.",
    action: "Add defer to scripts the first screen doesn't need. The page can paint while they load.",
    tags: ["Performance", "RenderBlocking", "GovTech"]
  },
  {
    id: "igac",
    report: "r3-igac",
    scope: "National",
    title: ["IGAC still loads", "*Universal Analytics.*"],
    body: "A declared language, a permanent https redirect, dates on its pages, and content shaped as questions and answers. But the home page still carries a Universal Analytics tag, which Google stopped processing in July 2024.",
    action: "Remove retired UA- tags and keep the GA4 one. Dead tags add weight, collect nothing, and confuse audits.",
    tags: ["Analytics", "GA4", "GovTech"]
  },
  {
    id: "gobpe",
    report: "r3-gobpe",
    scope: "National",
    title: ["Gob.pe still answers", "*on plain http.*"],
    body: "A meta description on every page read, full share cards, real 404s, and every internal link opened answered. But the plain-http address serves the whole portal with a 200, no redirect, so typed addresses stay unencrypted.",
    action: "Redirect every http request to https with a 301. HSTS only protects people who have visited before.",
    tags: ["Security", "HTTPS", "GovTech"]
  },
  {
    id: "ramajudicial",
    report: "r3-ramajudicial",
    scope: "National",
    title: ["Rama Judicial's site", "*sends no HSTS.*"],
    body: "A sitemap with valid URLs, cookies that are Secure and HttpOnly, framing limited, and a fast home page. But no page read sends HSTS, and plain http answers with a temporary 307, so a first visit can be downgraded.",
    action: "Send HSTS with a one-year max-age, and make the http redirect a 301 or 308.",
    tags: ["Security", "HSTS", "GovTech"]
  },
  {
    id: "gobec",
    report: "r3-gobec",
    scope: "National",
    title: ["Gob.ec's home page:", "*no main landmark.*"],
    body: "A one-year HSTS, real 404s for unknown paths, dates on its pages, and pages that read well without JavaScript. But the home page has no <main> landmark and its search field has no label, so screen readers lose their way.",
    action: "Wrap content in one <main> and label the search box; screen readers jump to both.",
    tags: ["Accessibility", "Landmarks", "GovTech"]
  },
  {
    id: "corteconst",
    report: "r3-corteconst",
    scope: "National",
    title: ["Corte Constitucional", "*is blank without JS.*"],
    body: "A meta description, a share image, a declared language, and a start page that arrives fast. But that HTML holds no readable text and no h1: the content is drawn by JavaScript, which most AI crawlers do not run.",
    action: "Server-render the main text and headings. AI crawlers and slow phones read HTML first.",
    tags: ["GEO", "AISearch", "JavaScript"]
  },
  {
    id: "gobes",
    report: "r3-administracion-es",
    scope: "National",
    title: ["Spain's Galician home", "*keeps a Spanish title.*"],
    body: "A sitemap, language alternates that point at each other, HSTS, and FAQ-style content. But the Galician home page is titled \"Punto de Acceso General | Inicio\", word for word the Spanish one, so search can't tell them apart.",
    action: "Translate the title and description too, so each language version names itself.",
    tags: ["SEO", "i18n", "Multilingual"]
  },
  {
    id: "superfinanciera",
    report: "r3-superfinanciera",
    scope: "National",
    title: ["Superfinanciera's map", "*lists a private IP.*"],
    body: "A meta description on every page read, HSTS, a permanent https redirect, and FAQ-style content. But all of its sitemaps, about 66,000 URLs, point at a 10.x internal IP address no crawler can reach.",
    action: "Build sitemap URLs from the public https host, and recheck after any server move.",
    tags: ["SEO", "Sitemap", "Finance"]
  },
  {
    id: "govbr",
    report: "r3-govbr",
    scope: "National",
    title: ["Gov.br's Organization", "*has no name.*"],
    body: "Full share cards, language alternates, alt text on every image, and every internal link opened answered. But the home page's Organization and WebSite JSON-LD give a URL with no name, so AI answers get an unnamed entity.",
    action: "Add name, and sameAs links to official profiles, to the Organization block. AI answers use it to name the site.",
    tags: ["GEO", "StructuredData", "GovTech"]
  },
  {
    id: "supersociedades",
    report: "r3-supersociedades",
    scope: "National",
    title: ["Supersociedades loads", "*its GA4 tag twice.*"],
    body: "A sitemap with valid URLs, structured data that parses, real 404s for unknown paths, and FAQ-style content. But the home page loads and configures the same GA4 tag twice, so page views can be counted double.",
    action: "Load each analytics tag once, from the template or a tag manager, never both.",
    tags: ["Analytics", "GA4", "DataQuality"]
  },
  {
    id: "canadaca",
    report: "r3-canadaca",
    scope: "National",
    title: ["Canada.ca sends no", "*content security policy.*"],
    body: "Language alternates in both directions, a sitemap, HSTS, and alt text on every image. But the English home page sends no content security policy and no Referrer-Policy, so nothing limits where scripts load from.",
    action: "Start with a report-only CSP, read the reports for a few weeks, then enforce it. Add a Referrer-Policy too.",
    tags: ["Security", "CSP", "GovTech"]
  },
  {
    id: "fnaco",
    report: "r3-fnaco",
    scope: "National",
    title: ["FNA's product pages", "*point back home.*"],
    body: "Descriptions and share cards on every page read, Consent Mode that starts in denied, and every link opened answered. But Ahorro, Cesantías, and other product pages name the home page as their canonical URL.",
    action: "Give each page a self-referencing canonical. Pointing it home asks search to drop the page from results.",
    tags: ["SEO", "Canonical", "Finance"]
  },
  {
    id: "mygovau",
    report: "r3-mygovau",
    scope: "National",
    title: ["myGov links through", "*its CMS paths.*"],
    body: "Structured data that parses, a security.txt, alt text on every image, and a start page that arrives fast. But 17 links on the English home page use /content/mygov/ paths that 301 to /en/, so every click takes an extra hop.",
    action: "Have the CMS write public URLs into links; keep redirects for old links only.",
    tags: ["SEO", "Redirects", "GovTech"]
  },
  {
    id: "insco",
    report: "r3-insco",
    scope: "National",
    title: ["INS stops visitors", "*from zooming in.*"],
    body: "Every internal link opened answered, real 404s, framing limited, and a declared language. But the viewport tag sets maximum-scale=1 and user-scalable=no, so people with low vision cannot pinch to zoom on a phone.",
    action: "Drop maximum-scale and user-scalable=no from the viewport tag. Let people zoom; the layout can cope.",
    tags: ["Accessibility", "Zoom", "Health"]
  },
  {
    id: "govtnz",
    report: "r3-govtnz",
    scope: "National",
    title: ["Govt.nz's home page", "*is slow to arrive.*"],
    body: "A meta description on every page read, full share cards, Secure cookies, HSTS, and alt text on every image. But the home page HTML took 1.6 to 3.3 seconds to arrive in each read, before any image or script loads.",
    action: "Cache the home page HTML at the edge. Good sites deliver it in under 0.8 s.",
    tags: ["Performance", "TTFB", "GovTech"]
  },
  {
    id: "invima",
    report: "r3-invima",
    scope: "National",
    title: ["Invima's site", "*sends no HSTS.*"],
    body: "Share cards with an image, a sitemap with valid URLs, a permanent https redirect, and every internal link opened answered. But no page read sends HSTS, so a browser's first visit can still be steered to plain http.",
    action: "Send HSTS, max-age=31536000, on every https response, then consider preload.",
    tags: ["Security", "HSTS", "Health"]
  },
  {
    id: "eestiee",
    report: "r3-eestiee",
    scope: "National",
    title: ["Eesti.ee has llms.txt", "*but blank HTML.*"],
    body: "An llms.txt, a sitemap, share cards, HSTS, and DMARC that guards its mail. But the start page HTML holds no readable text and no h1, and made-up paths answer 200, because the app is drawn in JavaScript.",
    action: "Pre-render pages to HTML and 404 unknown paths: AI crawlers read HTML, not apps.",
    tags: ["GEO", "AISearch", "SPA"]
  },
  {
    id: "ideam",
    report: "r3-ideam",
    scope: "National",
    title: ["IDEAM's topic icons", "*have no alt text.*"],
    body: "HSTS, a permanent https redirect, dates on its pages, and real 404s for unknown paths. But 12 of the 41 images on the home page, the topic menu icons among them, have no alt attribute, so screen readers may read file names.",
    action: "Give each icon alt text that names its link, or alt=\"\" when the link already has visible text.",
    tags: ["Accessibility", "AltText", "Climate"]
  },
  {
    id: "govsg",
    report: "r3-govsg",
    scope: "National",
    title: ["Gov.sg's sitemap lists", "*a noindex page.*"],
    body: "A GovernmentOrganization entity, descriptions and share cards on every page read, and alt text on every image. But /explainers/ is listed in the sitemap while telling search engines not to index it.",
    action: "List only pages you want indexed; a noindex entry sends crawlers mixed signals.",
    tags: ["SEO", "Sitemap", "GovTech"]
  },
  {
    id: "alkosto",
    report: "r3-alkosto",
    scope: "National",
    title: ["Alkosto's images", "*arrive without a size.*"],
    body: "Organization and store JSON-LD, a meta description on every page read, HSTS, and DMARC that guards its mail. But 184 of the 195 images on the home page carry no width or height, so the layout jumps as they load.",
    action: "Set width and height on every img, or an aspect-ratio in CSS. The browser then reserves the space early.",
    tags: ["Performance", "CLS", "Retail"]
  },
  {
    id: "suomifi",
    report: "r3-suomifi",
    scope: "National",
    title: ["Suomi.fi keeps HSTS", "*for only a week.*"],
    body: "A content security policy, a security.txt, DMARC, and Core Web Vitals that pass for real visitors. But its HSTS max-age is 604800 seconds, seven days, so a browser that stays away a week forgets to insist on https.",
    action: "Raise HSTS max-age to at least a year, 31536000 seconds. Short values protect only frequent visitors.",
    tags: ["Security", "HSTS", "GovTech"]
  },
  {
    id: "caracoltv",
    report: "r3-caracoltv",
    scope: "National",
    title: ["Caracol TV blocks", "*ChatGPT's visits.*"],
    body: "Descriptions and share cards on every page read, a NewsMediaOrganization entity, and alt text on every image. But robots.txt disallows ChatGPT-User, the agent that opens a page when a person asks ChatGPT about it.",
    action: "Block training crawlers if you choose, but allow user-triggered agents. They bring readers to your pages.",
    tags: ["GEO", "AISearch", "Media"]
  },
  {
    id: "usagov",
    report: "r3-usagov",
    scope: "National",
    title: ["USA.gov's Organization", "*has no name.*"],
    body: "Language alternates, a sitemap that matches the pages read, alt text on every image, and Core Web Vitals that pass for real visitors. But its Organization JSON-LD has a logo and URL with no name or sameAs.",
    action: "Name the organization and list its official profiles in sameAs. AI answers use them to say who runs the site.",
    tags: ["GEO", "StructuredData", "GovTech"]
  },
  {
    id: "isaco",
    report: "r3-isaco",
    scope: "National",
    title: ["ISA's home page has", "*no h1 and no main.*"],
    body: "Structured data that parses, full share cards, HSTS, and DMARC that guards its mail. But the home page has no h1 and no <main> landmark, so screen-reader users get no heading or region to jump to.",
    action: "Wrap the content in one <main> and give the page one h1. They are the two shortcuts screen readers lean on most.",
    tags: ["Accessibility", "Landmarks", "Energy"]
  },
  {
    id: "defensoriaco",
    report: "r3-defensoriaco",
    scope: "National",
    title: ["Defensoría's HTML", "*weighs over 1 MB.*"],
    body: "Language alternates, HSTS, alt text on every image, and every internal link opened answered. But the home page HTML weighs about 1.2 MB before any image or script, and all 20 pages read top 500 KB.",
    action: "Move inline data, styles, and menus out of the HTML. Phones parse every byte first.",
    tags: ["Performance", "PageWeight", "GovTech"]
  },
  {
    id: "mincit",
    report: "r3-mincit",
    scope: "National",
    title: ["MinCIT reports to", "*two GA4 properties.*"],
    body: "HSTS, a permanent https redirect, Secure cookies, and FAQ-style content. But the home page sends its visits to two GA4 properties, so two dashboards count the same people and can tell different stories.",
    action: "Make one GA4 property the source of truth, and document why any second exists.",
    tags: ["Analytics", "GA4", "GovTech"]
  },
  {
    id: "anico",
    report: "r3-anico",
    scope: "National",
    title: ["ANI loads its GA4", "*tag twice.*"],
    body: "Language alternates, a sitemap, alt text on every image, and every internal link opened answered. But the home page loads and configures the same GA4 tag twice, so each visit can be counted as two page views.",
    action: "Search the templates for a second gtag snippet. One tag, loaded once, keeps every report honest.",
    tags: ["Analytics", "GA4", "Infrastructure"]
  }
];
