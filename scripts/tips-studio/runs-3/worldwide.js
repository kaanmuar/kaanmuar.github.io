/* worldwide real runs for series three. See ../runs-3.js for the entry shape. */

module.exports = [
  {
    id: "ilo", report: "r3-ilo", scope: "Worldwide",
    title: ["ILO: secure and fast,", "*but no entity markup.*"],
    body: "security.txt is published, HSTS covers subdomains, and DMARC rejects spoofed mail. But no page analyzed carries JSON-LD, so the Facebook, LinkedIn and YouTube profiles it links are never tied to the ILO.",
    action: "Add Organization markup with url, logo and sameAs so AI answers name you right.",
    tags: ["GEO", "StructuredData", "UnitedNations"]
  },
  {
    id: "wto", report: "r3-wto", scope: "Worldwide",
    title: ["WTO: no viewport tag", "*on the start page.*"],
    body: "HSTS is on, framing is limited to the same origin, and DMARC rejects spoofed mail. But the start page has no viewport meta tag, so phones draw the desktop layout zoomed out, and Google indexes mobile first.",
    action: "Add a viewport meta tag with width=device-width, initial-scale=1, then test on a phone.",
    tags: ["SEO", "MobileFirst", "WorldTrade"]
  },
  {
    id: "wmo", report: "r3-wmo", scope: "Worldwide",
    title: ["WMO's sitemap points", "*at other hosts.*"],
    body: "HSTS is sent with preload, every image analyzed has alt text, and language versions link back to each other. But the sitemap lists 878 community.wmo.int URLs, and search engines skip sitemap URLs from another host.",
    action: "Keep each sitemap to its own host. Give each subdomain its own sitemap, named in that subdomain's robots.txt.",
    tags: ["SEO", "Sitemap", "Weather"]
  },
  {
    id: "itu", report: "r3-itu", scope: "Worldwide",
    title: ["ITU: framing locked,", "*but no HSTS.*"],
    body: "Framing is limited to the same origin, pages carry author and date signals, and the text reads without JavaScript. But no response sends Strict-Transport-Security, and the home page takes three 302 hops to load.",
    action: "Send Strict-Transport-Security with a max-age of at least a year, and point / straight at the final page.",
    tags: ["Security", "HSTS", "Telecom"]
  },
  {
    id: "ipcc", report: "r3-ipcc", scope: "Worldwide",
    title: ["IPCC: no page language", "*for screen readers.*"],
    body: "DMARC quarantines spoofed mail, framing is limited, and the start page reads well without JavaScript. But its <html> tag has no lang attribute, so screen readers guess the voice and browsers guess the translation.",
    action: "Add lang=\"en\" to the html tag, and the matching code on each translated page.",
    tags: ["Accessibility", "WCAG", "Climate"]
  },
  {
    id: "unwomen", report: "r3-unwomen", scope: "Worldwide",
    title: ["UN Women: complete,", "*but heavy pages.*"],
    body: "Every page analyzed has a meta description, every image has alt text, and HSTS is preloaded. But /en sends over 700 KB of HTML before any image or script, and all 17 pages analyzed weigh more than 500 KB.",
    action: "Move what inflates the HTML, like inline data or repeated menus, into cached files.",
    tags: ["Performance", "PageWeight", "UNWomen"]
  },
  {
    id: "ietf", report: "r3-ietf", scope: "Worldwide",
    title: ["IETF writes the RFCs,", "*but no security.txt.*"],
    body: "Framing is denied, every page analyzed has a meta description, and Core Web Vitals pass for real visitors. But /.well-known/security.txt answers 404, so a researcher has no published place to report a flaw.",
    action: "Publish /.well-known/security.txt with Contact and Expires lines, per RFC 9116.",
    tags: ["Security", "SecurityTxt", "OpenStandards"]
  },
  {
    id: "postgresql", report: "r3-postgresql", scope: "Worldwide",
    title: ["PostgreSQL's search box", "*has no name.*"],
    body: "HSTS is sent, framing is denied by both header and CSP, and every image analyzed has alt text. But the search box on every page has only a placeholder, so screen readers announce it as an unnamed field.",
    action: "Give each input a <label> or an aria-label. Placeholder text vanishes on typing and is not a name.",
    tags: ["Accessibility", "Forms", "PostgreSQL"]
  },
  {
    id: "golang", report: "r3-golang", scope: "Worldwide",
    title: ["go.dev receives mail,", "*but has no SPF.*"],
    body: "HSTS is preloaded, framing is limited with frame-ancestors, and Core Web Vitals pass for real visitors. But go.dev has Google MX records and no SPF or DMARC record, so anyone can send mail in its name.",
    action: "Publish SPF for the senders you use and a DMARC policy. Start at p=none with reports, then tighten.",
    tags: ["Security", "EmailSecurity", "Golang"]
  },
  {
    id: "typescript", report: "r3-typescript", scope: "Worldwide",
    title: ["TypeScript: a sitemap", "*no one is told about.*"],
    body: "HSTS is preloaded, DMARC rejects spoofed mail, and Core Web Vitals pass for real visitors. A sitemap lives at /sitemap-index.xml, but /robots.txt answers 404, so no crawler is told where to find it.",
    action: "Publish a robots.txt with one Sitemap line that names the sitemap index",
    tags: ["SEO", "RobotsTxt", "TypeScript"]
  },
  {
    id: "vuejs", report: "r3-vuejs", scope: "Worldwide",
    title: ["Vue.js lists 94 links", "*but names no entity.*"],
    body: "Every page analyzed has a meta description and every image alt text, HSTS is on, and an llms.txt lists 94 links. But no page analyzed carries JSON-LD, so search and AI answers get no entity naming the project.",
    action: "Add WebSite and Organization blocks with sameAs links to GitHub and social profiles.",
    tags: ["GEO", "JSONLD", "VueJS"]
  },
  {
    id: "unicode", report: "r3-unicode", scope: "Worldwide",
    title: ["Unicode still loads", "*Universal Analytics.*"],
    body: "Pages show publish dates, some headings are phrased as questions, and the text reads without JavaScript. But the start page still loads analytics.js with two UA- properties, which Google stopped processing in 2024.",
    action: "Remove the old analytics.js tags: a request and cookies for data no one receives.",
    tags: ["Analytics", "GA4", "Unicode"]
  },
  {
    id: "blender", report: "r3-blender", scope: "Worldwide",
    title: ["Blender: security.txt,", "*no main landmark.*"],
    body: "security.txt is published, DMARC rejects spoofed mail, framing is limited, and Core Web Vitals pass for real visitors. But none of the 20 pages analyzed has a <main> element for screen readers to jump to.",
    action: "Wrap each template's content in one <main> element, and point a skip link at it.",
    tags: ["Accessibility", "Landmarks", "Blender"]
  },
  {
    id: "openstreetmap", report: "r3-osm", scope: "Worldwide",
    title: ["OpenStreetMap's search", "*has no label.*"],
    body: "HSTS is preloaded, security.txt is published, cookies are Secure, and every image analyzed has alt text. But the Search, From and To boxes on the start page have only placeholders, so screen readers can't name them.",
    action: "Add a visually hidden <label> or an aria-label to each map input, matching its placeholder.",
    tags: ["Accessibility", "Forms", "OpenData"]
  },
  {
    id: "gitlab", report: "r3-gitlab", scope: "Worldwide",
    title: ["GitLab: llms.txt,", "*an entity half done.*"],
    body: "An llms.txt with 7 sections, language versions that link back, and consent defaults set to denied for the EU and other listed regions. But the Organization JSON-LD has only name and url: no logo, no sameAs.",
    action: "Add logo and sameAs links to the Organization block, so AI answers can match the brand to its profiles.",
    tags: ["GEO", "StructuredData", "DevOps"]
  },
  {
    id: "shopify", report: "r3-shopify", scope: "Worldwide",
    title: ["Shopify: rich entity,", "*but frameable.*"],
    body: "A Corporation entity with seven sameAs links, an llms.txt, security.txt, and HSTS with preload. But the pages analyzed send neither X-Frame-Options nor a CSP frame-ancestors, so any site can frame them.",
    action: "Send Content-Security-Policy: frame-ancestors 'self' on pages that no partner needs to embed.",
    tags: ["Security", "Clickjacking", "Ecommerce"]
  },
  {
    id: "figma", report: "r3-figma", scope: "Worldwide",
    title: ["Figma guards its pages,", "*but has no llms.txt.*"],
    body: "Every image analyzed has alt text, security.txt is published, HSTS is preloaded, and robots.txt blocks GPTBot, CCBot and Google-Extended while answer bots may read. But /llms.txt answers with a 404.",
    action: "Publish an llms.txt that lists your key pages with one-line summaries. Some AI tools read it first.",
    tags: ["GEO", "LlmsTxt", "Design"]
  },
  {
    id: "oneworld", report: "r3-oneworld", scope: "Worldwide",
    title: ["oneworld: fast,", "*but zoom is locked.*"],
    body: "Core Web Vitals pass for real visitors, every page analyzed has a meta description, and an llms.txt is published. But the viewport sets maximum-scale=1 and user-scalable=no, so people can't pinch to zoom.",
    action: "Drop maximum-scale and user-scalable from the viewport so people can zoom to 200%.",
    tags: ["Accessibility", "Zoom", "Airlines"]
  },
  {
    id: "worldathletics", report: "r3-athletics", scope: "Worldwide",
    title: ["World Athletics:", "*images without size.*"],
    body: "HSTS is on, framing is limited, DMARC quarantines spoofed mail, and the start page reads without JavaScript. But 56 of the 58 images on the start page have no width or height, so the layout jumps as they load.",
    action: "Set width and height, or a CSS aspect-ratio, on every image to reserve its space.",
    tags: ["Performance", "CLS", "Athletics"]
  },
  {
    id: "fiba", report: "r3-fiba", scope: "Worldwide",
    title: ["FIBA: missing pages", "*answer 200.*"],
    body: "HSTS is preloaded, DMARC rejects spoofed mail, security.txt and llms.txt are published, and articles carry author and date. But a made-up path answers 200 with \"Page Not Found\", so crawlers may index it.",
    action: "Return a real 404 status on the not-found page, keeping the same friendly design.",
    tags: ["SEO", "Soft404", "Basketball"]
  },
  {
    id: "wipo", report: "r3-wipo", scope: "Worldwide",
    title: ["WIPO grants analytics", "*before anyone agrees.*"],
    body: "DMARC rejects spoofed mail, language versions link back to each other, and pages analyzed well without JavaScript. But the Consent Mode default sets analytics_storage and ad_storage to granted before a visitor chooses.",
    action: "Default both to denied where consent is required, and grant them on acceptance.",
    tags: ["Analytics", "ConsentMode", "Privacy"]
  },
  {
    id: "oxfam", report: "r3-oxfam", scope: "Worldwide",
    title: ["Oxfam: three scripts", "*hold up the page.*"],
    body: "An NGO entity in JSON-LD, DMARC set to reject, framing limited, and language versions that link back. But three scripts sit in the <head> of /en without async or defer, so nothing paints until they load.",
    action: "Add defer to scripts that don't need to run before first paint, or move them to the end of the body.",
    tags: ["Performance", "RenderBlocking", "NGO"]
  },
  {
    id: "ted", report: "r3-ted", scope: "Worldwide",
    title: ["TED: ideas worth", "*zooming into.*"],
    body: "HSTS is on, every image analyzed has alt text, talks carry author and date, and Consent Mode starts denied. But the viewport sets maximum-scale=1.0 and user-scalable=no, which blocks pinch zoom on phones.",
    action: "Drop maximum-scale and user-scalable=no from the viewport, so people with low vision can enlarge text.",
    tags: ["Accessibility", "Zoom", "TEDTalks"]
  },
  {
    id: "icann", report: "r3-icann", scope: "Worldwide",
    title: ["ICANN's WebSite block", "*has no url.*"],
    body: "HSTS is preloaded, framing is limited, cookies are Secure, and a consent tool is present. But the WebSite JSON-LD on /en has a name and a date and no url, so it can't be tied to the domain.",
    action: "Add url, plus a search action if you have one, to each language's WebSite block.",
    tags: ["GEO", "StructuredData", "InternetGovernance"]
  },
  {
    id: "gavi", report: "r3-gavi", scope: "Worldwide",
    title: ["Gavi: strong headers,", "*no structured data.*"],
    body: "HSTS for two years, framing limited, DMARC set to reject, and an llms.txt with 11 sections. But none of the 20 pages analyzed carries JSON-LD, so search and AI answers get no entity for the alliance.",
    action: "Start with one Organization block on the home page: name, url, logo, and sameAs to your official profiles.",
    tags: ["GEO", "JSONLD", "GlobalHealth"]
  },
  {
    id: "scouts", report: "r3-scout", scope: "Worldwide",
    title: ["Scouts: a consent tool,", "*no Consent Mode.*"],
    body: "HSTS is preloaded, every image analyzed has alt text, every page a meta description, and language versions link back. OneTrust loads, but no Consent Mode default is set, so Google tags may fire before a choice.",
    action: "Set consent defaults to denied before Tag Manager loads; OneTrust then updates them.",
    tags: ["Analytics", "ConsentMode", "Scouting"]
  },
  {
    id: "globalfund", report: "r3-globalfund", scope: "Worldwide",
    title: ["The Global Fund", "*sets no cache rules.*"],
    body: "DMARC rejects spoofed mail, every image analyzed has alt text, every page a meta description, and Core Web Vitals pass for real visitors. But the start page sends no Cache-Control, so browsers and CDNs guess.",
    action: "Send Cache-Control on HTML, such as a short max-age, and a long max-age on fingerprinted assets.",
    tags: ["Performance", "Caching", "PublicHealth"]
  },
  {
    id: "fide", report: "r3-fide", scope: "Worldwide",
    title: ["FIDE: plain http", "*still serves the site.*"],
    body: "DMARC rejects spoofed mail, the sitemap answers with valid URLs, and the text reads without JavaScript. But the plain-http home page answers 200 instead of redirecting, and no HSTS header is sent.",
    action: "Redirect every http request to https with a 301, then add Strict-Transport-Security.",
    tags: ["Security", "HTTPS", "Chess"]
  },
  {
    id: "isoc", report: "r3-isoc", scope: "Worldwide",
    title: ["Internet Society:", "*a retired frame rule.*"],
    body: "HSTS is preloaded, an Organization entity is published, and articles carry author and date. But framing is limited only by X-Frame-Options: ALLOW-FROM, which current browsers ignore, so the page can be framed.",
    action: "Replace ALLOW-FROM with Content-Security-Policy: frame-ancestors 'self' plus the one partner you allow.",
    tags: ["Security", "Clickjacking", "InternetSociety"]
  },
  {
    id: "libreoffice", report: "r3-libreoffice", scope: "Worldwide",
    title: ["LibreOffice links share", "*without a preview.*"],
    body: "HSTS covers subdomains, framing is denied, every page analyzed has a meta description, and the sitemap matches the pages analyzed. But the start page has no og: or twitter: tags, so shared links get a bare preview.",
    action: "Add og:title, og:description, og:image and og:url to each template, plus twitter:card.",
    tags: ["SEO", "OpenGraph", "LibreOffice"]
  },
  {
    id: "msc", report: "r3-msc", scope: "Worldwide",
    title: ["MSC: Tag Manager", "*with no consent tool.*"],
    body: "Every image analyzed has alt text, every page a meta description, cookies are Secure, and an llms.txt is published. But Google Tag Manager loads and no consent tool or Consent Mode default appears in the HTML.",
    action: "Add a consent tool, set Consent Mode defaults to denied, and fire tags only after a visitor agrees.",
    tags: ["Analytics", "Consent", "Sustainability"]
  }
];
