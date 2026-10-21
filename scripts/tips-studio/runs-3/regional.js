/* regional real runs for series three. See ../runs-3.js for the entry shape. */

module.exports = [
  {
    id: "valle", report: "r3-valle", scope: "Regional",
    title: ["Valle del Cauca", "*locks the pinch-zoom.*"],
    body: "HSTS runs a full year, framing is limited, and cookies are Secure. But the viewport tag says user-scalable=no, so people who need larger text cannot pinch to zoom on a phone.",
    action: "Drop user-scalable=no and maximum-scale from the viewport tag, so people can zoom to at least 200%.",
    tags: ["Accessibility", "Zoom", "GovTech"]
  },
  {
    id: "cundinamarca", report: "r3-cundinamarca", scope: "Regional",
    title: ["Cundinamarca shares", "*a blank link card.*"],
    body: "HSTS runs a full year, framing is limited, and robots.txt opts out of model training by choice. But the home page has no Open Graph tags and no meta description, so shared links show a bare card.",
    action: "Add og:title, og:description, og:image and og:url to each key page, so a shared link shows a real preview.",
    tags: ["SEO", "OpenGraph", "SocialSharing"]
  },
  {
    id: "atlantico", report: "r3-atlantico", scope: "Regional",
    title: ["Atlántico: alt text", "*everywhere, no HSTS.*"],
    body: "Every image read has alt text, unknown paths answer a real 404, and Accessibility scores {Accessibility}. But no Strict-Transport-Security header is sent, so browsers never learn to insist on https.",
    action: "Send HSTS with max-age=31536000 on every https response, then consider preload.",
    tags: ["Security", "HSTS", "WebSecurity"]
  },
  {
    id: "santander", report: "r3-santander", scope: "Regional",
    title: ["Santander answers", "*on plain http too.*"],
    body: "Every page read has a title and a meta description, and https sends HSTS with preload. But http://santander.gov.co/ answers 200 instead of redirecting, so a first visit can stay unencrypted.",
    action: "Answer plain http requests with a 301 to https, so no visit starts unencrypted.",
    tags: ["Security", "HTTPS", "GovTech"]
  },
  {
    id: "bolivar", report: "r3-bolivar", scope: "Regional",
    title: ["Bolívar's home page", "*waits 4 s to start.*"],
    body: "A valid sitemap, structured data that parses, real 404s, and every internal link opened answered. But the server took over 4 seconds to send the first byte of the home page in repeated checks.",
    action: "Cache the home page HTML on the server or a CDN so the first byte lands under 1 s.",
    tags: ["Performance", "TTFB", "Caching"]
  },
  {
    id: "narino", report: "r3-narino", scope: "Regional",
    title: ["Nariño's home page", "*is 900 KB of HTML.*"],
    body: "Share cards are complete, the sitemap and structured data are valid, and HSTS runs a full year. But the home page HTML alone is about 900 KB, still 150 KB compressed, before any image or script loads.",
    action: "Move inline data and repeated markup out of the HTML, and page long lists.",
    tags: ["Performance", "PageWeight", "WebPerf"]
  },
  {
    id: "risaralda", report: "r3-risaralda", scope: "Regional",
    title: ["Risaralda still loads", "*Universal Analytics.*"],
    body: "Every page read has a title and a meta description, HSTS runs a year, and cookies are Secure. But the home page still carries a UA- property ID, and Universal Analytics stopped collecting data in 2023.",
    action: "Remove the old UA- snippet and keep one GA4 setup, so nothing double counts.",
    tags: ["Analytics", "GA4", "GovTech"]
  },
  {
    id: "caldas", report: "r3-caldas", scope: "Regional",
    title: ["Caldas points to", "*a sitemap that 404s.*"],
    body: "Every image read has alt text, every page has a title and a description, and unknown paths answer 404. But robots.txt sends crawlers to /sitemap.xml, and that address answers 404.",
    action: "Publish the sitemap at the address robots.txt names, or fix the Sitemap: line to point at the real file.",
    tags: ["SEO", "Sitemap", "RobotsTxt"]
  },
  {
    id: "tolima", report: "r3-tolima", scope: "Regional",
    title: ["Tolima's robots.txt", "*shuts out AI answers.*"],
    body: "Every image on the home page has alt text, HSTS runs a year, and framing is limited. But robots.txt says Disallow: / to every crawler it does not name, so AI answer bots like PerplexityBot cannot read it.",
    action: "Allow the search and AI answer crawlers you want to cite you, and block only the ones you mean to.",
    tags: ["GEO", "RobotsTxt", "AISearch"]
  },
  {
    id: "cauca", report: "r3-cauca", scope: "Regional",
    title: ["Cauca's site search", "*has no label.*"],
    body: "Every page read has a title and a description, every internal link opened answered, and unknown paths answer 404. But the search field on pages like the cabinet list has no label for screen readers.",
    action: "Give each field a <label for> or aria-label so screen readers say what to type.",
    tags: ["Accessibility", "Forms", "A11y"]
  },
  {
    id: "cvc", report: "r3-cvc", scope: "Regional",
    title: ["CVC runs two hosts", "*with two canonicals.*"],
    body: "HSTS runs a full year, framing is limited, and unknown paths answer 404. But www.cvc.gov.co and cvc.gov.co both serve the site, each names itself canonical, and the sitemap lists only the bare host.",
    action: "Pick one host, 301 the other to it, and keep canonicals and the sitemap there.",
    tags: ["SEO", "Canonical", "Environment"]
  },
  {
    id: "cornare", report: "r3-cornare", scope: "Regional",
    title: ["Cornare: {overall}.", "*Any site can frame it.*"],
    body: "Every image read has alt text, structured data parses, the sitemap is valid, and every internal link opened answered. But no X-Frame-Options or frame-ancestors is sent, so other sites can frame its pages.",
    action: "Send Content-Security-Policy: frame-ancestors 'self' (or X-Frame-Options: SAMEORIGIN) on every page.",
    tags: ["Security", "Clickjacking", "Environment"]
  },
  {
    id: "quindio", report: "r3-quindio", scope: "Regional",
    title: ["Quindío blocks paint", "*with 13 scripts.*"],
    body: "security.txt is published, HSTS runs a year, cookies are Secure, and every page read has a meta description. But the home page head loads 13 scripts without async or defer, so nothing paints until they run.",
    action: "Defer scripts that need not run first, and move the rest to the end of the body.",
    tags: ["Performance", "RenderBlocking", "WebPerf"]
  },
  {
    id: "uniatlantico", report: "r3-uniatlantico", scope: "Regional",
    title: ["Uniatlántico loads", "*gtag.js twice.*"],
    body: "The Organization JSON-LD is complete, the sitemap is valid, and unknown paths answer 404. But the home page loads gtag.js twice, for G-4ZLYE33JYK and GT-NBBP6CZF, so some visits may be counted twice.",
    action: "Load one Google tag and send to every destination from it, or route all tags through one Tag Manager.",
    tags: ["Analytics", "GoogleTag", "HigherEd"]
  },
  {
    id: "oas", report: "r3-oas", scope: "Regional",
    title: ["OAS: no viewport tag", "*on the home page.*"],
    body: "DMARC quarantines spoofed mail, http redirects permanently to https, and every internal link opened answered. But the English home page has no viewport meta tag, so phones draw it as a shrunken desktop page.",
    action: "Add <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"> to every page template.",
    tags: ["SEO", "MobileFirst", "Diplomacy"]
  },
  {
    id: "comunidadandina", report: "r3-comunidadandina", scope: "Regional",
    title: ["Andean Community:", "*no main landmark.*"],
    body: "Core Web Vitals pass for real visitors, every image has alt text, and share cards are complete. But the home page has no <main> element, so screen reader users cannot jump past the menus to the content.",
    action: "Wrap each page's primary content in one <main> element, so assistive tech can skip straight to it.",
    tags: ["Accessibility", "Landmarks", "A11y"]
  },
  {
    id: "caricom", report: "r3-caricom", scope: "Regional",
    title: ["CARICOM's SPF record", "*starts with a quote.*"],
    body: "Structured data parses, share cards are complete, and DMARC quarantines spoofed mail. But the SPF TXT record begins with a stray quote mark and is split in two, so mail servers read no SPF at all.",
    action: "Publish one TXT record that starts exactly with v=spf1 and lists every sender, then test it.",
    tags: ["Security", "SPF", "EmailSecurity"]
  },
  {
    id: "africanunion", report: "r3-au", scope: "Regional",
    title: ["African Union titles", "*run to 126 characters.*"],
    body: "Language versions point at each other, framing is limited, and unknown paths answer 404. But press release titles run long; one French release title is 126 characters, so results cut it mid-sentence.",
    action: "Keep titles near 60 characters: key words first, site name last, and trim long names in the CMS.",
    tags: ["SEO", "PageTitles", "Multilingual"]
  },
  {
    id: "bcie", report: "r3-bcie", scope: "Regional",
    title: ["CABEI's missing pages", "*answer 200, not 404.*"],
    body: "HSTS runs a full year, DMARC is enforced, framing is limited, and every image has alt text. But a made-up address answers 200 instead of 404, so crawlers can index error pages as real ones.",
    action: "Return a real 404 status for unknown paths, with a helpful page, so search engines drop dead URLs.",
    tags: ["SEO", "Soft404", "Development"]
  },
  {
    id: "caribank", report: "r3-caribank", scope: "Regional",
    title: ["CDB still tags a", "*retired UA property.*"],
    body: "HSTS runs a full year, framing is limited, and language versions point at each other. But gtag.js still loads for UA-2616244-1, and Universal Analytics stopped collecting data in 2023.",
    action: "Retire the UA- tag; feed one GA4 property through Tag Manager or gtag, not both.",
    tags: ["Analytics", "GA4", "Development"]
  },
  {
    id: "gencat", report: "r3-gencat", scope: "Regional",
    title: ["Catalonia's robots.txt", "*blocks AI answers.*"],
    body: "DMARC rejects spoofed mail, HSTS runs a year, and every image on the home page has alt text. But robots.txt opens with Disallow: / for any crawler it does not name, so bots like OAI-SearchBot stay out.",
    action: "Name the search and AI answer crawlers you want in robots.txt, so citations can point back to you.",
    tags: ["GEO", "RobotsTxt", "AISearch"]
  },
  {
    id: "bayern", report: "r3-bayern", scope: "Regional",
    title: ["Bavaria's portal", "*has no sitemap.*"],
    body: "DMARC rejects spoofed mail, HSTS runs a year, and every page read has a title and a description. But /sitemap.xml answers 404 and robots.txt names no sitemap, so crawlers find pages only through links.",
    action: "Publish a sitemap.xml of the pages you want found and name it in robots.txt with one Sitemap: line.",
    tags: ["SEO", "Sitemap", "GovTech"]
  },
  {
    id: "cagov", report: "r3-cagov", scope: "Regional",
    title: ["CA.gov scores {overall},", "*DMARC only watches.*"],
    body: "Every image has alt text, security.txt is published, Core Web Vitals pass for real visitors, and JSON-LD names a GovernmentOrganization. But DMARC is p=none, so spoofed ca.gov mail is reported, not stopped.",
    action: "After reviewing DMARC reports, move to p=quarantine and then p=reject, so forged mail is blocked.",
    tags: ["Security", "DMARC", "EmailSecurity"]
  },
  {
    id: "ontario", report: "r3-ontario", scope: "Regional",
    title: ["Ontario's canonicals", "*point to plain http.*"],
    body: "Every image has alt text, Core Web Vitals pass for real visitors, and DMARC is enforced. But pages name http:// URLs as their canonical, so search engines are told to prefer unencrypted URLs.",
    action: "Point every canonical at the final https URL, the same one you list in the sitemap.",
    tags: ["SEO", "Canonical", "HTTPS"]
  },
  {
    id: "quebec", report: "r3-quebec", scope: "Regional",
    title: ["Québec.ca: {overall}.", "*The tab order jumps.*"],
    body: "llms.txt is published, Core Web Vitals pass for real visitors, and every image has alt text. But home page links carry tabindex values like 20 and 25, so keyboard users move in an order that skips around.",
    action: "Remove positive tabindex values and order the HTML the way people should move through it.",
    tags: ["Accessibility", "Keyboard", "A11y"]
  },
  {
    id: "gba", report: "r3-gba", scope: "Regional",
    title: ["Buenos Aires Province:", "*a cert down to 0 days.*"],
    body: "HSTS runs a full year, framing is limited, and http redirects permanently to https. But the TLS certificate read on 21 October 2026 expires that same day, so browsers warn visitors unless it is renewed in time.",
    action: "Automate cert renewal and alert at 30 days left, so no expiry reaches visitors.",
    tags: ["Security", "TLS", "GovTech"]
  },
  {
    id: "jalisco", report: "r3-jalisco", scope: "Regional",
    title: ["Jalisco's home page", "*is empty without JS.*"],
    body: "Every image has alt text, the home page has a title and a description, and http redirects to https. But the HTML holds about 13 words before JavaScript runs, so AI crawlers that skip scripts see almost nothing.",
    action: "Render key text and links on the server so content arrives before scripts run.",
    tags: ["GEO", "ServerRendering", "AISearch"]
  },
  {
    id: "victoria", report: "r3-vic", scope: "Regional",
    title: ["Victoria: {overall},", "*but no JSON-LD.*"],
    body: "Core Web Vitals pass for real visitors, share cards are complete, the sitemap is valid, and Accessibility scores {Accessibility}. But the home page carries no JSON-LD saying which government runs the site.",
    action: "Add a GovernmentOrganization block with name, url, logo and sameAs, so AI answers can name you.",
    tags: ["GEO", "StructuredData", "GovTech"]
  },
  {
    id: "nsw", report: "r3-nsw", scope: "Regional",
    title: ["NSW: {overall}, images", "*with no set size.*"],
    body: "Every image has alt text, security.txt is published, and JSON-LD names the GovernmentOrganization. But 8 of 16 images on the home page carry no width or height, so the browser cannot reserve their space.",
    action: "Set width and height (or CSS aspect-ratio) on every image, so the layout does not jump as they load.",
    tags: ["Performance", "CLS", "WebPerf"]
  },
];
