#!/usr/bin/env node
/* The landing page of each brand face (#2311), from scripts/brand-kit/faces.js: qalaburlreview.html in English and
   qaurlreview.html in Spanish. Every profile bio links here. A page names the face, its languages and pitch, lists its
   account on each network (the ones faces.js does not mark as existing show as coming soon), its email, the other
   face, and the review in each of the face's languages. The footer lists both faces' accounts, as the guide's does.

     node scripts/build-face-pages.js           # write the pages
     node scripts/build-face-pages.js --check   # exit 1 if a page is stale

   The Mastodon profile gets rel="me" (a <link> and the anchor) so Mastodon verifies the profile's Website field. An
   account that does not exist yet gets no link at all: whoever registered the handle first would be verified. */

const fs = require("fs");
const path = require("path");
const critical = require("./build-critical-css");
const cspHashes = require("./build-csp-hashes");
const faces = require("./brand-kit/faces");
const hub = require("./social-hub/copy");

const ROOT = path.resolve(__dirname, "..");
const SITE = faces.SITE;
const ORG = SITE + "qa-review.html#organization";
const ICONS = "20261027a";
const SHARE_VERSION = "20261102";

const CSP = "default-src 'self'; base-uri 'self'; object-src 'none'; script-src 'self' https://www.googletagmanager.com https://www.google-analytics.com https://www.gstatic.com https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: https:; connect-src 'self' https://us-central1-carlosm-interactive-cv.cloudfunctions.net https://ipwho.is https://www.google-analytics.com https://*.google-analytics.com https://*.analytics.google.com https://www.google.com https://www.googletagmanager.com https://*.googleapis.com https://cloudflareinsights.com; form-action 'self';";

// Page copy in each face's own language. Spanish is Latin American (tú). A review analyzes pages; it never "reads" them.
const COPY = {
  en: {
    title: "@{handle}: QA-lab URL Review in {langs}",
    description: "Follow @{handle}, QA-lab URL Review in {langs}: Live Reports, tips, skits and live runs. One public URL in, a QA review out.",
    follow: "Follow @{handle}",
    soon: "Coming soon",
    start: "Start a review",
    feed: "Every post in one feed",
    write: "Write to us",
    langs: "Review a site in your language",
    langsLead: "The review page comes in six languages. These are the ones @{handle} posts in.",
    mail: "Email",
    mailLead: "Questions about a post or a review? Write to us.",
    also: "Also in",
    accounts: "Accounts"
  },
  es: {
    title: "@{handle}: QA-lab URL Review en {langs}",
    description: "Sigue a @{handle}, QA-lab URL Review en {langs}: informes en vivo, consejos, sketches y revisiones en directo. Entra una URL pública, sale una revisión QA.",
    follow: "Sigue a @{handle}",
    soon: "Muy pronto",
    start: "Empieza una revisión",
    feed: "Todas las publicaciones",
    write: "Escríbenos",
    langs: "Revisa un sitio en tu idioma",
    langsLead: "La página de revisión está en seis idiomas. Estos son los que publica @{handle}.",
    mail: "Correo",
    mailLead: "¿Preguntas sobre una publicación o una revisión? Escríbenos.",
    also: "También en",
    accounts: "Cuentas"
  }
};

// The call to action on each language's review card, in that language.
const REVIEW_IN = {
  en: "Start a review in English",
  es: "Empieza una revisión en español",
  pt: "Comece uma revisão em português",
  de: "Prüfung auf Deutsch starten",
  fr: "Lancer une analyse en français",
  it: "Avvia una revisione in italiano"
};

const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
const fill = (text, face) => text.replace(/\{handle\}/g, face.handle).replace(/\{langs\}/g, face.copy.langs.replace(/ · /g, ", ").replace(/, ([^,]+)$/, face.lang === "es" ? " y $1" : " and $1"));
const reviewPage = (lang) => "qa-review" + (lang === "en" ? "" : "-" + lang) + ".html";
const short = (face) => face.langs.map((l) => l.toUpperCase()).join(" · ");
const lines = (face) => face.copy.lines.map((line) => /^\*.*\*$/.test(line) ? "<em>" + esc(line.slice(1, -1)) + "</em>" : "<span>" + esc(line) + "</span>").join(" ");

/** One face's accounts as a footer line: its page, its languages, then each account that exists. */
function footerLine(face) {
  return "<p><a href=\"" + face.site + "\" translate=\"no\">@" + face.handle + "</a> (" + short(face) + "): "
    + faces.accounts(face).map((a) => "<a href=\"" + a.url + "\" rel=\"me noopener\">" + esc(a.name) + "</a>").join(" · ") + "</p>";
}

/** The brand's Live Reports channels as a footer line, after the faces' lines. */
function channelsLine(label, href) {
  return "<p><a href=\"" + href + "\">" + esc(label) + "</a>: "
    + faces.CHANNELS.map((c) => "<a href=\"" + c.url + "\" rel=\"me noopener\">" + esc(c.name) + "</a>").join(" · ") + "</p>";
}

function channel(c) {
  return "<li><a class=\"face-net\" href=\"" + c.url + "\" rel=\"me noopener\" data-net=\"" + c.net + "\"><b>" + esc(c.app) + "</b><small translate=\"no\">" + esc(c.mention) + "</small></a></li>";
}

function network(n, face, copy) {
  const name = esc(n.label || n.name);
  const mention = "<small translate=\"no\">" + esc(n.mention(face.handle)) + "</small>";
  if (!n.exists[face.id]) return "<li class=\"face-net is-soon\"><b>" + name + "</b>" + mention + "<span class=\"face-soon\">" + esc(copy.soon) + "</span></li>";
  return "<li><a class=\"face-net\" href=\"" + n.profile(face.handle) + "\" rel=\"me noopener\" data-net=\"" + n.id + "\"><b>" + name + "</b>" + mention + "</a></li>";
}

function jsonLd(face, url, copy) {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "ProfilePage",
        "@id": url + "#webpage",
        url,
        name: fill(copy.title, face),
        description: fill(copy.description, face),
        inLanguage: face.lang,
        isPartOf: { "@type": "WebSite", "@id": SITE + "#website", name: "Carlos A. Muñoz — Interactive CV", url: SITE },
        image: SITE + "assets/share/" + face.handle + ".jpg",
        mainEntity: { "@id": url + "#face" },
        breadcrumb: { "@id": url + "#breadcrumb" }
      },
      {
        "@type": "Organization",
        "@id": url + "#face",
        name: face.name,
        alternateName: "@" + face.handle,
        url,
        email: face.email,
        logo: SITE + "assets/qa-review-mark-full.svg",
        knowsLanguage: face.langs,
        sameAs: faces.accounts(face).concat(faces.CHANNELS).map((a) => a.url),
        parentOrganization: { "@type": "Organization", "@id": ORG, name: "QA-lab URL Review", url: SITE + "qa-review.html" }
      },
      {
        "@type": "BreadcrumbList",
        "@id": url + "#breadcrumb",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "QA-lab URL Review", item: SITE + reviewPage(face.lang) },
          { "@type": "ListItem", position: 2, name: "@" + face.handle, item: url }
        ]
      }
    ]
  };
}

function page(face) {
  const lang = face.lang;
  const copy = COPY[lang];
  const ui = hub.COPY[lang];
  const other = faces.FACES[face.other];
  const url = SITE + face.site;
  const share = SITE + "assets/share/" + face.handle + ".jpg?v=" + SHARE_VERSION;
  const title = fill(copy.title, face);
  const description = fill(copy.description, face);
  const sfx = lang === "en" ? "" : "-" + lang;
  const mastodon = faces.NETWORKS.find((n) => n.id === "mastodon");
  const me = mastodon.exists[face.id] ? "\n    <link rel=\"me\" href=\"" + mastodon.profile(face.handle) + "\">" : "";
  const x = faces.NETWORKS.find((n) => n.id === "x");
  const xSite = "@" + (x.exists[face.id] ? face.handle : faces.FACES.en.handle);
  const pitch = face.bios.long.split("\n\n");
  const [lede, ...more] = pitch.slice(0, -2);
  const posts = pitch[pitch.length - 2];
  const alternates = [[face.lang, face], [other.lang, other], ["x-default", faces.FACES.en]]
    .map(([code, f]) => "    <link rel=\"alternate\" hreflang=\"" + code + "\" href=\"" + SITE + f.site + "\">").join("\n");
  const ogAlt = "    <meta property=\"og:locale:alternate\" content=\"" + hub.LANGS[other.lang].locale + "\">";
  const json = JSON.stringify(jsonLd(face, url, copy), null, 1).replace(/</g, "\\u003c");
  const [live, soon] = [true, false].map((on) => faces.ordered().filter((n) => !!n.exists[face.id] === on).map((n) => network(n, face, copy)));
  const nets = live.concat(faces.CHANNELS.map(channel), soon).join("\n            ");
  const reviews = face.langs.map((code) =>
    "<li lang=\"" + code + "\"><a class=\"face-net face-lang\" href=\"" + reviewPage(code) + "\" hreflang=\"" + code + "\">"
    + "<img src=\"https://hatscripts.github.io/circle-flags/flags/" + hub.LANGS[code].flag + ".svg\" alt=\"\" width=\"22\" height=\"22\">"
    + "<b>" + esc(hub.LANGS[code].native) + "</b><small>" + esc(REVIEW_IN[code]) + " →</small></a></li>").join("\n            ");
  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="${CSP}">
    <meta name="referrer" content="strict-origin-when-cross-origin">
    <title>${esc(title)}</title>
    <meta name="description" content="${esc(description)}">
    <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1">
    <meta name="theme-color" content="#071116" data-fixed>
    <link rel="canonical" href="${url}">
${alternates}${me}
    <link rel="icon" href="assets/qa-review-mark.svg?v=${ICONS}" type="image/svg+xml">
    <link rel="icon" href="assets/qa-review-icon-32.png?v=${ICONS}" sizes="32x32" type="image/png">
    <link rel="icon" href="assets/qa-review-icon-16.png?v=${ICONS}" sizes="16x16" type="image/png">
    <link rel="icon" href="assets/qa-review-favicon.ico?v=${ICONS}" sizes="48x48">
    <link rel="apple-touch-icon" href="assets/qa-review-apple-touch-icon.png?v=${ICONS}">
    <link rel="manifest" href="qa-review.webmanifest?v=${ICONS}">
    <meta property="og:type" content="profile">
    <meta property="og:site_name" content="QA-lab URL Review">
    <meta property="og:locale" content="${hub.LANGS[lang].locale}">
${ogAlt}
    <meta property="og:url" content="${url}">
    <meta property="og:title" content="${esc(title)}">
    <meta property="og:description" content="${esc(description)}">
    <meta property="og:image" content="${share}">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">
    <meta property="og:image:type" content="image/jpeg">
    <meta property="og:image:alt" content="${esc("@" + face.handle + ": " + face.copy.lines.join(" ").replace(/\*/g, "") + " " + face.copy.langs)}">
    <meta property="profile:username" content="${face.handle}">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:site" content="${xSite}">
    <meta name="twitter:title" content="${esc(title)}">
    <meta name="twitter:description" content="${esc(description)}">
    <meta name="twitter:image" content="${share}">
    <script type="application/ld+json">
${json}
    </script>
    <script src="js/site-analytics.js?v=20261030a" defer></script>
    <script src="js/qa-review-consent.js?v=20261101a" defer></script>
    <script src="js/qa-review-visit.js?v=20261101a" defer></script>
    <script src="js/site-theme.js"></script>
    <script>SiteTheme.boot();</script>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="css/site-look.css?v=${version("css/site-look.css")}">
    <link rel="stylesheet" href="css/social-hub.css?v=${version("css/social-hub.css")}">
    <link rel="stylesheet" href="css/fusion-band.css?v=${version("css/fusion-band.css")}">
    <link rel="stylesheet" href="css/face-page.css?v=${version("css/face-page.css")}">
</head>
<body>
<a class="skip-link" href="#main">${esc(ui.skip)}</a>
<header class="topbar">
    <div class="brand"><a href="${reviewPage(lang)}"><img class="logo" src="assets/qa-review-mark.svg?v=${ICONS}" alt="" width="36" height="36"><span translate="no">QA-lab<small>URL Review</small></span></a></div>
    <nav class="actions" aria-label="QA-lab URL Review">
        <a class="btn btn-ghost" href="${reviewPage(lang)}">${esc(ui.nav.review)}</a>
        <a class="btn btn-ghost" href="${face.hub}">Social</a>
        <a class="btn btn-ghost" href="qa-review-guide.html?lang=${lang}">${esc(ui.nav.guide)}</a>
        <a class="btn btn-ghost" href="${other.site}" hreflang="${other.lang}" lang="${other.lang}" translate="no">${esc(short(other))}</a>
    </nav>
</header>
<main id="main" class="face" tabindex="-1">
    <section class="face-hero fx-band" aria-labelledby="face-title">
        <div class="fx-bg" data-fx data-fx-mode="2" data-fx-place="band" aria-hidden="true"><canvas class="fx"></canvas></div>
        <p class="hub-eyebrow" translate="no">QA-lab URL Review · ${esc(short(face))}</p>
        <p class="face-handle" translate="no">@${face.handle}</p>
        <h1 id="face-title">${lines(face)}</h1>
        <p class="face-lede">${esc(lede)}</p>
${more.map((text, i) => "        <p class=\"face-lede\" lang=\"" + face.langs[i + 1] + "\">" + esc(text) + "</p>\n").join("")}        <ul class="face-areas">${face.copy.areas.split(" · ").map((area) => "<li>" + esc(area) + "</li>").join("")}</ul>
        <div class="face-cta">
            <a class="btn btn-primary" href="${reviewPage(lang)}" data-track="face_start_review">${esc(copy.start)}</a>
            <a class="btn btn-ghost" href="${face.hub}">${esc(copy.feed)}</a>
            <a class="btn btn-ghost" href="mailto:${face.email}">${esc(copy.write)}</a>
        </div>
    </section>
    <section class="face-block" aria-labelledby="follow-title">
        <h2 id="follow-title">${esc(fill(copy.follow, face))}</h2>
        <p class="face-muted">${esc(posts)}</p>
        <ul class="face-nets">
            ${nets}
        </ul>
    </section>
    <section class="face-block" aria-labelledby="langs-title">
        <h2 id="langs-title">${esc(copy.langs)}</h2>
        <p class="face-muted">${esc(fill(copy.langsLead, face))}</p>
        <ul class="face-nets">
            ${reviews}
        </ul>
    </section>
    <div class="face-block face-pair">
        <section class="face-card" aria-labelledby="mail-title">
            <h2 id="mail-title">${esc(copy.mail)}</h2>
            <p class="face-muted">${esc(copy.mailLead)}</p>
            <p><a class="face-mail" href="mailto:${face.email}" translate="no">${face.email}</a></p>
        </section>
        <section class="face-card" aria-labelledby="other-title">
            <h2 id="other-title">${esc(copy.also)} <span lang="${other.lang}">${esc(other.copy.langs)}</span></h2>
            <p class="face-muted" lang="${other.lang}">${esc(other.copy.lines.join(" ").replace(/\*/g, ""))}</p>
            <p><a class="btn btn-ghost" href="${other.site}" hreflang="${other.lang}" translate="no">@${other.handle} →</a></p>
        </section>
    </div>
</main>
<footer class="hub-footer face-footer">
    <p class="face-footer-title">${esc(copy.accounts)}</p>
    ${Object.values(faces.FACES).map(footerLine).join("\n    ")}
    ${channelsLine(ui.nav.live, "qa-review" + sfx + ".html#live-reports")}
    <p><a href="qa-review${sfx}.html">${esc(ui.nav.review)}</a> · <a href="qa-review-legal.html?lang=${lang}">${esc(ui.legal)}</a> · <a href="accessibility.html?lang=${lang}">${esc(ui.accessibility)}</a> · <a href="index.html">Carlos A. Muñoz, CV</a></p>
</footer>
<script type="module" src="js/fusion/boot.js?v=${version("js/fusion/boot.js")}"></script>
</body>
</html>
`;
}

// Cache key from the file itself, as the social hub does.
function version(file) {
  return require("crypto").createHash("sha1").update(fs.readFileSync(path.join(ROOT, file))).digest("hex").slice(0, 10);
}

function outputs() {
  const files = {};
  for (const face of Object.values(faces.FACES)) files[face.site] = cspHashes.apply(critical.inline(page(face), face.site));
  return files;
}

function main() {
  const check = process.argv.includes("--check");
  const files = outputs();
  const stale = Object.entries(files).filter(([file, html]) => !fs.existsSync(path.join(ROOT, file)) || fs.readFileSync(path.join(ROOT, file), "utf8") !== html).map(([file]) => file);
  if (check) {
    if (stale.length) {
      console.error("Face pages are stale; run node scripts/build-face-pages.js\n" + stale.join("\n"));
      process.exit(1);
    }
    console.log("Face pages match scripts/brand-kit/faces.js (" + Object.keys(files).length + " pages)");
    return;
  }
  stale.forEach((file) => fs.writeFileSync(path.join(ROOT, file), files[file]));
  console.log("Face pages: wrote " + stale.length + " of " + Object.keys(files).length);
}

if (require.main === module) main();

module.exports = { COPY, page, footerLine, channelsLine, outputs };
