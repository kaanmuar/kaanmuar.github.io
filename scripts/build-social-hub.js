#!/usr/bin/env node
/* The social hub: every post we publish, in one feed, on six pages (qa-review-social.html and -es, -pt, -de, -fr, -it).

     node scripts/build-social-hub.js             # add new YouTube uploads, write thumbnails, feed and pages
     node scripts/build-social-hub.js --offline   # same, without asking YouTube
     node scripts/build-social-hub.js --check     # exit 1 if the feed or a page is stale (offline, same as-of day)

   Sources, committed files only: media/social-posts/<batch>/captions.json with feed/<slug>.jpg (tips, runs and
   the daily Live Reports batches), media/social-posts/launch-2026-10/<lang>/<topic>-captions.json with its
   calendar.csv, assets/live-reports/index.json for report links, and assets/social/youtube.json, the uploads
   ledger. The channel feed lists only the latest 15 uploads, so the ledger keeps every one it has seen.
   assets/social/edits.json holds the owner's edits from the Social hub pane in admin.html (captions, dates,
   hidden posts, items added by hand); online builds refresh it from Firestore socialHub/live.
   Writes assets/social/feed.json (cards), assets/social/captions.json (per-network captions, loaded on copy),
   assets/social/rss*.xml (an RSS feed per language), sitemap-social.xml (post images and clips per page),
   assets/social/thumbs/*.webp and the six pages. Share cards come from scripts/build-share-images.js social. Posts still queued on the networks follow the posted ones,
   marked Scheduled, and stay out of the JSON-LD until their day. */

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const card = require("../js/social-hub-card");
const admin = require("../js/social-hub-admin");
const { PROFILES, CAPTIONS, LANGS, COPY } = require("./social-hub/copy");

const ROOT = path.resolve(__dirname, "..");
const SITE = card.SITE;
const OUT = "assets/social";
const LEDGER = OUT + "/youtube.json";
const EDITS = OUT + "/edits.json";
const FIRESTORE = "https://firestore.googleapis.com/v1/projects/carlosm-interactive-cv/databases/(default)/documents";
const CHANNEL = "UCf-yFKiAHooXPsRsCXFKBjg";
const PRERENDER = 24;
const TEXT_MAX = 1200;
const LAUNCH = "launch-2026-10";
const ORG = SITE + "qa-review.html#organization";
const SHARE_VERSION = "20261024";
const RSS_MAX = 50;

const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");
const readJson = (file) => JSON.parse(read(file));
const exists = (file) => fs.existsSync(path.join(ROOT, file));

function tracked() {
  return new Set(execFileSync("git", ["ls-files", "media/social-posts"], { cwd: ROOT, encoding: "utf8" }).split("\n").filter(Boolean));
}

// YouTube titles end in #Shorts and the translator sometimes spaces a domain ("postobon. com").
function titleKey(title) {
  return String(title || "").toLowerCase().replace(/#shorts/g, "").replace(/\.\s+(?=[a-z]{2,}\b)/g, ".").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

// A site-review clip is titled "<host>: <score>." in whichever language it was voiced in.
function scoreKey(title) {
  const match = cleanTitle(title).toLowerCase().match(/^([a-z0-9.-]+\.[a-z]{2,}): (\d{1,3})\./);
  return match ? "score " + match[1] + " " + match[2] : "";
}

function cleanTitle(title) {
  return String(title || "").replace(/\s*#shorts\s*/gi, " ").replace(/(\w)\. (com|co|org|net|gov|edu|io)\b/g, "$1.$2").trim();
}

function firstLine(text) {
  return String(text || "").split("\n").map((line) => line.trim()).find(Boolean) || "";
}

function csvRows(text) {
  const [head, ...rows] = text.trim().split("\n").map((line) => line.split(","));
  return rows.map((cells) => Object.fromEntries(head.map((key, i) => [key, (cells[i] || "").trim()])));
}

function thumbFor(id) {
  return OUT + "/thumbs/" + id.replace(/[^a-z0-9]+/gi, "-").toLowerCase() + ".webp";
}

function liveIds() {
  return new Set((readJson("assets/live-reports/index.json").reports || []).map((report) => report.id));
}

function batchPosts(files, reports) {
  const posts = [];
  const batches = [...files].filter((file) => /^media\/social-posts\/[^/]+\/captions\.json$/.test(file)).map((file) => file.split("/")[2]).sort();
  for (const batch of batches) {
    const captions = readJson("media/social-posts/" + batch + "/captions.json");
    for (const [slug, c] of Object.entries(captions)) {
      const image = "media/social-posts/" + batch + "/feed/" + slug + ".jpg";
      if (!files.has(image)) continue;
      const report = slug.replace(/^\d+-/, "");
      // The text captions are English unless the post was written in its own language (c.textLang);
      // c.lang is the language the clip was voiced in (TikTok and YouTube copy).
      posts.push({
        id: batch + "/" + slug,
        kind: batch.startsWith("tips") ? "tip" : batch.startsWith("promo") ? "launch" : "review",
        batch,
        date: c.date,
        lang: LANGS[c.textLang] ? c.textLang : "en",
        clipLang: LANGS[c.lang] ? c.lang : null,
        cat: c.cat || "",
        title: cleanTitle(c.title),
        text: c.linkedin || c.facebook || "",
        image,
        alt: c.alt || cleanTitle(c.title),
        report: reports.has(report) ? report : null,
        ytTitle: c.youtubeTitle || "",
        captions: Object.fromEntries(CAPTIONS.map(([net]) => [net, c[net] || ""]).filter(([, text]) => text))
      });
    }
  }
  return posts;
}

// The launch set: ten topics written by hand in all six languages, first posted on the calendar's dates.
function launchPosts(files) {
  const dir = "media/social-posts/" + LAUNCH;
  if (!files.has(dir + "/calendar.csv")) return [];
  const first = {};
  csvRows(read(dir + "/calendar.csv")).forEach((row) => {
    const key = row.Language + "/" + row.Post;
    if (!first[key] || row.Date < first[key]) first[key] = row.Date;
  });
  const posts = [];
  [...files].filter((file) => file.startsWith(dir + "/") && file.endsWith("-captions.json")).sort().forEach((file) => {
    const [lang, name] = file.slice(dir.length + 1).split("/");
    const topic = name.replace(/-captions\.json$/, "");
    const image = dir + "/" + lang + "/" + topic + "-portrait.jpg";
    if (!LANGS[lang] || !files.has(image) || !first[lang + "/" + topic]) return;
    const c = readJson(file);
    posts.push({
      id: LAUNCH + "/" + lang + "/" + topic,
      kind: "launch",
      batch: LAUNCH,
      date: first[lang + "/" + topic],
      lang,
      clipLang: lang,
      cat: "",
      title: cleanTitle(c.youtubeTitle) || firstLine(c.linkedin),
      text: c.linkedin || c.facebook || "",
      image,
      alt: firstLine(c.linkedin),
      report: null,
      ytTitle: c.youtubeTitle || "",
      captions: Object.fromEntries(CAPTIONS.map(([net]) => [net, c[net] || ""]).filter(([, text]) => text))
    });
  });
  return posts;
}

function isTracked(file) {
  try {
    execFileSync("git", ["ls-files", "--error-unmatch", file], { cwd: ROOT, stdio: "ignore" });
    return true;
  } catch (error) {
    return false;
  }
}

function collect() {
  const files = tracked();
  const edits = admin.clean(exists(EDITS) ? readJson(EDITS) : null);
  const posts = admin.apply(batchPosts(files, liveIds()).concat(launchPosts(files)), edits, isTracked);
  const ledger = exists(LEDGER) ? readJson(LEDGER) : { videos: {} };
  const byTitle = new Map();
  Object.entries(ledger.videos).forEach(([id, video]) => {
    [titleKey(video.title), scoreKey(video.title)].forEach((key) => {
      if (key && !byTitle.has(key)) byTitle.set(key, id);
    });
  });
  posts.forEach((post) => {
    post.youtube = post.youtube || byTitle.get(titleKey(post.ytTitle)) || (post.kind === "review" && byTitle.get(scoreKey(post.title))) || null;
    post.thumb = admin.remote(post.image) ? post.image : thumbFor(post.id);
    post.text = body(post);
  });
  posts.sort((a, b) => (b.date || "").localeCompare(a.date || "") || a.id.localeCompare(b.id));
  return { posts, ledger };
}

async function growLedger() {
  const ledger = exists(LEDGER) ? readJson(LEDGER) : { channel: CHANNEL, videos: {} };
  ledger.channel = CHANNEL;
  const res = await fetch("https://www.youtube.com/feeds/videos.xml?channel_id=" + CHANNEL, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error("YouTube feed answered " + res.status);
  const xml = await res.text();
  const decode = (s) => s.replace(/&quot;/g, "\"").replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
  let added = 0;
  for (const entry of xml.split("<entry>").slice(1)) {
    const id = (entry.match(/<yt:videoId>([^<]+)</) || [])[1];
    const title = (entry.match(/<media:title>([^<]*)</) || [])[1];
    const published = (entry.match(/<published>([^<]+)</) || [])[1];
    if (!id || ledger.videos[id]) continue;
    ledger.videos[id] = { title: decode(title || ""), published: published || "" };
    added += 1;
  }
  ledger.videos = Object.fromEntries(Object.entries(ledger.videos).sort(([, a], [, b]) => (a.published || "").localeCompare(b.published || "")));
  fs.mkdirSync(path.join(ROOT, OUT), { recursive: true });
  fs.writeFileSync(path.join(ROOT, LEDGER), JSON.stringify(ledger, null, 1) + "\n");
  return added;
}

// socialHub/live is public to read (firestore.rules), so the build needs no credentials.
async function liveEdits() {
  const res = await fetch(FIRESTORE + "/socialHub/live", { signal: AbortSignal.timeout(15000) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("Firestore answered " + res.status);
  const doc = await res.json();
  return admin.clean(JSON.parse((doc.fields && doc.fields.json && doc.fields.json.stringValue) || "{}"));
}

async function pullEdits() {
  const edits = await liveEdits();
  if (!edits) return 0;
  fs.mkdirSync(path.join(ROOT, OUT), { recursive: true });
  fs.writeFileSync(path.join(ROOT, EDITS), JSON.stringify(edits, null, 1) + "\n");
  return Object.keys(edits.edits).length + edits.items.length;
}

const needsThumb = (post) => !admin.remote(post.thumb) && !exists(post.thumb);

async function writeThumbs(posts) {
  const missing = posts.filter(needsThumb);
  if (!missing.length) return 0;
  const sharp = require("sharp");
  fs.mkdirSync(path.join(ROOT, OUT, "thumbs"), { recursive: true });
  for (const post of missing) {
    await sharp(path.join(ROOT, post.image)).resize(540, 675, { fit: "cover" }).webp({ quality: 72 }).toFile(path.join(ROOT, post.thumb));
  }
  return missing.length;
}

// Captions open with the post's own title; the card already shows it as the heading.
function body(post) {
  const lines = post.text.split("\n");
  const head = titleKey(lines[0]);
  return head && (head === titleKey(post.title) || titleKey(post.title).startsWith(head)) ? lines.slice(1).join("\n").trim() : post.text;
}

function feedJson(posts, asOf) {
  const cards = posts.map((post) => ({
    id: post.id, kind: post.kind, date: post.date, lang: post.lang, clipLang: post.clipLang, cat: post.cat, title: post.title,
    text: post.text.length > TEXT_MAX ? post.text.slice(0, TEXT_MAX).replace(/\s+\S*$/, "") + "…" : post.text,
    image: post.image, thumb: post.thumb, alt: post.alt, youtube: post.youtube, report: post.report
  }));
  return JSON.stringify({ version: 1, asOf, count: cards.length, posts: cards }) + "\n";
}

function captionsJson(posts) {
  return JSON.stringify(Object.fromEntries(posts.map((post) => [post.id, post.captions]))) + "\n";
}

function jsonLd(lang, shown, total, copy) {
  const url = SITE + card.pageFor(lang);
  const posting = (post) => {
    const item = {
      "@type": "SocialMediaPosting",
      "@id": card.permalink(post, lang, true),
      url: card.permalink(post, lang, true),
      headline: post.title.slice(0, 110),
      articleBody: post.text.slice(0, 500),
      datePublished: post.date,
      inLanguage: post.lang,
      image: { "@type": "ImageObject", contentUrl: imageUrl(post), caption: post.alt || post.title },
      author: { "@id": ORG },
      publisher: { "@id": ORG }
    };
    if (post.cat) item.keywords = post.cat;
    if (post.youtube) {
      item.video = {
        "@type": "VideoObject",
        name: post.title,
        description: post.text.slice(0, 300) || post.title,
        inLanguage: post.clipLang || post.lang,
        uploadDate: post.date,
        thumbnailUrl: "https://i.ytimg.com/vi/" + post.youtube + "/hqdefault.jpg",
        embedUrl: "https://www.youtube.com/embed/" + post.youtube,
        contentUrl: "https://www.youtube.com/shorts/" + post.youtube
      };
    }
    return item;
  };
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        "@id": url + "#page",
        url,
        name: copy.h1,
        description: copy.description,
        inLanguage: lang,
        isPartOf: { "@type": "WebSite", name: "QA-lab URL Review", url: SITE + "qa-review.html" },
        publisher: { "@id": ORG },
        mainEntity: { "@id": url + "#feed" },
        breadcrumb: { "@id": url + "#breadcrumb" }
      },
      {
        "@type": "ItemList",
        "@id": url + "#feed",
        numberOfItems: total,
        itemListOrder: "https://schema.org/ItemListOrderDescending",
        itemListElement: shown.map((post, i) => ({ "@type": "ListItem", position: i + 1, item: posting(post) }))
      },
      {
        "@type": "Organization",
        "@id": ORG,
        name: "QA-lab URL Review",
        url: SITE + "qa-review.html",
        logo: SITE + "assets/qa-review-mark.svg",
        sameAs: PROFILES.map((profile) => profile.url)
      },
      {
        "@type": "BreadcrumbList",
        "@id": url + "#breadcrumb",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "QA-lab URL Review", item: SITE + "qa-review" + (lang === "en" ? "" : "-" + lang) + ".html" },
          { "@type": "ListItem", position: 2, name: "Social", item: url }
        ]
      }
    ]
  };
}

const CSP = "default-src 'self'; base-uri 'self'; object-src 'none'; script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://www.google-analytics.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: https:; connect-src 'self' https://us-central1-carlosm-interactive-cv.cloudfunctions.net https://ipwho.is https://www.google-analytics.com https://*.google-analytics.com https://*.googleapis.com; frame-src https://www.youtube-nocookie.com; form-action 'self';";

function page(lang, posts, asOf) {
  const copy = COPY[lang];
  const sfx = lang === "en" ? "" : "-" + lang;
  const url = SITE + card.pageFor(lang);
  const visible = card.arrange(posts, asOf);
  const shown = visible.slice(0, PRERENDER);
  const published = shown.filter((post) => !post.upcoming);
  const share = SITE + "assets/share/qa-review-social" + sfx + ".jpg?v=" + SHARE_VERSION;
  const esc = card.esc;
  const alternates = ["x-default"].concat(Object.keys(LANGS)).map((code) => {
    const href = SITE + card.pageFor(code === "x-default" ? "en" : code);
    return "    <link rel=\"alternate\" hreflang=\"" + code + "\" href=\"" + href + "\">";
  }).join("\n");
  const ogAlt = Object.keys(LANGS).filter((code) => code !== lang).map((code) => "    <meta property=\"og:locale:alternate\" content=\"" + LANGS[code].locale + "\">").join("\n");
  const langLinks = Object.entries(LANGS).map(([code, info]) =>
    "<a href=\"" + card.pageFor(code) + "\" hreflang=\"" + code + "\" lang=\"" + code + "\"" + (code === lang ? " aria-current=\"page\"" : "") + ">"
    + "<img src=\"https://hatscripts.github.io/circle-flags/flags/" + info.flag + ".svg\" alt=\"\" width=\"18\" height=\"18\">" + esc(info.native) + "</a>").join("");
  const follow = PROFILES.map((profile) => "<a class=\"hub-follow-" + profile.net + "\" href=\"" + profile.url + "\" rel=\"me noopener\" data-net=\"" + profile.net + "\">" + esc(profile.name) + "</a>").join("");
  const kinds = ["all", "tip", "review", "launch", "video"].map((kind) =>
    "<button type=\"button\" class=\"hub-chip\" data-kind=\"" + kind + "\" aria-pressed=\"" + (kind === "all") + "\">" + esc(copy.kinds[kind]) + "</button>").join("");
  const langOptions = "<option value=\"all\">" + esc(copy.allLangs) + "</option>" + Object.entries(LANGS).map(([code, info]) => "<option value=\"" + code + "\">" + esc(info.native) + "</option>").join("");
  const hubCopy = Object.assign({}, copy, { captions: CAPTIONS, lang, asOf });
  const json = (value) => JSON.stringify(value, null, 1).replace(/</g, "\\u003c");
  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="${CSP}">
    <title>${esc(copy.title)}</title>
    <meta name="description" content="${esc(copy.description)}">
    <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1">
    <meta name="theme-color" content="#0d6e76">
    <link rel="canonical" href="${url}">
${alternates}
    <link rel="icon" href="assets/qa-review-mark.svg?v=20261013c" type="image/svg+xml">
    <link rel="apple-touch-icon" href="apple-touch-icon.png">
    <link rel="alternate" type="application/json" href="${SITE}${OUT}/feed.json" title="QA-lab URL Review social feed">
    <link rel="alternate" type="application/rss+xml" href="${SITE}${OUT}/rss${sfx}.xml" title="QA-lab URL Review · Social (RSS)">
    <meta property="og:type" content="website">
    <meta property="og:site_name" content="QA-lab URL Review">
    <meta property="og:locale" content="${LANGS[lang].locale}">
${ogAlt}
    <meta property="og:url" content="${url}">
    <meta property="og:title" content="${esc(copy.h1)} · QA-lab URL Review">
    <meta property="og:description" content="${esc(copy.lead)}">
    <meta property="og:image" content="${share}">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">
    <meta property="og:image:type" content="image/jpeg">
    <meta property="og:image:alt" content="${esc(copy.card.title + " " + copy.card.em + " " + copy.card.sub)}">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:site" content="@qalaburlreview">
    <meta name="twitter:title" content="${esc(copy.h1)} · QA-lab URL Review">
    <meta name="twitter:description" content="${esc(copy.lead)}">
    <meta name="twitter:image" content="${share}">
    <meta name="twitter:image:alt" content="${esc(copy.card.title + " " + copy.card.em + " " + copy.card.sub)}">
    <script type="application/ld+json">
${json(jsonLd(lang, published, visible.filter((post) => !post.upcoming).length, copy))}
    </script>
    <script src="js/site-analytics.js?v=20261024a"></script>
    <script src="js/qa-review-consent.js?v=20261028p"></script>
    <script src="js/site-theme.js"></script>
    <script>SiteTheme.boot();</script>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="css/social-hub.css?v=${asOf.replace(/-/g, "")}">
</head>
<body>
<header class="topbar">
    <div class="brand"><a href="qa-review${sfx}.html"><img class="logo" src="assets/qa-review-mark.svg?v=20261013c" alt="" width="36" height="36"><span translate="no">QA-lab<small>URL Review</small></span></a></div>
    <nav class="actions" aria-label="QA-lab URL Review">
        <a class="btn btn-ghost" href="qa-review${sfx}.html">${esc(copy.nav.review)}</a>
        <a class="btn btn-ghost" href="qa-review${sfx}.html#live-reports">${esc(copy.nav.live)}</a>
        <a class="btn btn-ghost" href="qa-review-guide.html?lang=${lang}">${esc(copy.nav.guide)}</a>
    </nav>
</header>
<main class="hub">
    <section class="hub-hero">
        <p class="hub-eyebrow" translate="no">QA-lab URL Review · Social</p>
        <h1>${esc(copy.h1)}</h1>
        <p class="hub-lead">${esc(copy.lead)}</p>
        <nav class="hub-follow" aria-label="${esc(copy.follow)}"><span>${esc(copy.follow)}</span>${follow}</nav>
        <nav class="hub-langs" aria-label="${esc(copy.language)}">${langLinks}</nav>
    </section>
    <section class="hub-tools" aria-label="${esc(copy.search)}">
        <div class="hub-chips" role="group">${kinds}</div>
        <label class="hub-field"><span>${esc(copy.language)}</span><select id="hub-lang">${langOptions}</select></label>
        <label class="hub-field hub-search"><span class="sr-only">${esc(copy.search)}</span><input id="hub-q" type="search" placeholder="${esc(copy.search)}" autocomplete="off"></label>
        <p class="hub-count" id="hub-count" aria-live="polite">${esc(copy.count.replace("{n}", visible.length))}</p>
    </section>
    <section class="hub-feed" id="hub-feed" aria-label="${esc(copy.h1)}">
${shown.map((post) => "        " + card.cardHtml(post, copy, lang)).join("\n")}
    </section>
    <p class="hub-empty" id="hub-empty" hidden>${esc(copy.empty)}</p>
    <p class="hub-more-wrap"><button class="btn btn-primary" id="hub-more" type="button"${visible.length > PRERENDER ? "" : " hidden"}>${esc(copy.loadMore)}</button></p>
</main>
<footer class="hub-footer"><p>${esc(copy.footer)}</p><p><a href="qa-review-legal.html?lang=${lang}">Legal</a> · <a href="accessibility.html?lang=${lang}">${esc(copy.accessibility)}</a> · <a href="${OUT}/rss${sfx}.xml">RSS</a> · <a href="${OUT}/feed.json">JSON feed</a></p></footer>
<dialog class="hub-dialog" id="hub-dialog" aria-label="${esc(copy.share)}"><form method="dialog"><button class="hub-close" value="close" aria-label="${esc(copy.close)}">×</button></form><div id="hub-dialog-body"></div></dialog>
<script>window.SocialHubCopy = ${JSON.stringify(hubCopy).replace(/</g, "\\u003c")};</script>
<script src="js/social-hub-card.js?v=${asOf.replace(/-/g, "")}"></script>
<script src="js/social-hub.js?v=${asOf.replace(/-/g, "")}"></script>
</body>
</html>
`;
}

const imageUrl = (post) => (admin.remote(post.image) ? post.image : SITE + post.image);
const xml = (value) => String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const rfc822 = (day) => new Date(day + "T12:00:00Z").toUTCString();
const live = (posts, asOf) => card.arrange(posts, asOf).filter((post) => !post.upcoming);

function rss(lang, posts, asOf) {
  const sfx = lang === "en" ? "" : "-" + lang;
  const items = live(posts, asOf).slice(0, RSS_MAX).map((post) => {
    const text = post.text + (post.youtube ? "\n\nhttps://www.youtube.com/shorts/" + post.youtube : "");
    return `    <item>
      <title>${xml(post.title)}</title>
      <link>${xml(card.permalink(post, lang, true))}</link>
      <guid isPermaLink="false">${xml(post.id)}</guid>
      <pubDate>${rfc822(post.date)}</pubDate>${post.cat ? "\n      <category>" + xml(post.cat) + "</category>" : ""}
      <description>${xml(text)}</description>
${admin.remote(post.image)
    ? `      <media:content url="${xml(post.image)}" medium="image"/>`
    : `      <enclosure url="${xml(SITE + post.image)}" length="${fs.statSync(path.join(ROOT, post.image)).size}" type="image/jpeg"/>
      <media:content url="${xml(SITE + post.image)}" medium="image" type="image/jpeg"/>`}
    </item>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/">
  <channel>
    <title>QA-lab URL Review · Social</title>
    <link>${SITE}${card.pageFor(lang)}</link>
    <description>${xml(COPY[lang].rss.description)}</description>
    <language>${lang}</language>
    <lastBuildDate>${rfc822(asOf)}</lastBuildDate>
    <atom:link href="${SITE}${OUT}/rss${sfx}.xml" rel="self" type="application/rss+xml"/>
    <image><url>${SITE}apple-touch-icon.png</url><title>QA-lab URL Review · Social</title><link>${SITE}${card.pageFor(lang)}</link></image>
${items.join("\n")}
  </channel>
</rss>
`;
}

// Each page lists the images written in its language and the clips voiced in it.
function sitemap(posts, asOf) {
  const shown = live(posts, asOf);
  const urls = Object.keys(LANGS).map((lang) => {
    const images = shown.filter((post) => post.lang === lang).slice(0, 1000).map((post) =>
      `    <image:image><image:loc>${xml(imageUrl(post))}</image:loc></image:image>`);
    const videos = shown.filter((post) => post.youtube && (post.clipLang || post.lang) === lang).map((post) => `    <video:video>
      <video:thumbnail_loc>https://i.ytimg.com/vi/${xml(post.youtube)}/hqdefault.jpg</video:thumbnail_loc>
      <video:title>${xml(post.title.slice(0, 100))}</video:title>
      <video:description>${xml((post.text || post.title).slice(0, 2048))}</video:description>
      <video:player_loc>https://www.youtube.com/embed/${xml(post.youtube)}</video:player_loc>
      <video:publication_date>${post.date}</video:publication_date>
    </video:video>`);
    return `  <url>
    <loc>${SITE}${card.pageFor(lang)}</loc>
    <lastmod>${asOf}</lastmod>
${images.concat(videos).join("\n")}
  </url>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1" xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">
${urls.join("\n")}
</urlset>
`;
}

function outputs(posts, asOf) {
  const files = { [OUT + "/feed.json"]: feedJson(posts, asOf), [OUT + "/captions.json"]: captionsJson(posts), "sitemap-social.xml": sitemap(posts, asOf) };
  Object.keys(LANGS).forEach((lang) => {
    files[card.pageFor(lang)] = page(lang, posts, asOf);
    files[OUT + "/rss" + (lang === "en" ? "" : "-" + lang) + ".xml"] = rss(lang, posts, asOf);
  });
  return files;
}

async function main() {
  const args = process.argv.slice(2);
  const check = args.includes("--check");
  if (!check && !args.includes("--offline")) {
    try {
      console.log("YouTube: " + (await growLedger()) + " new uploads in the ledger");
    } catch (error) {
      console.warn("YouTube feed skipped: " + error.message);
    }
    try {
      console.log("Admin: " + (await pullEdits()) + " edited or added posts");
    } catch (error) {
      console.warn("Admin edits skipped: " + error.message);
    }
  }
  const { posts } = collect();
  const feedFile = path.join(ROOT, OUT, "feed.json");
  const asOf = check && fs.existsSync(feedFile) ? JSON.parse(fs.readFileSync(feedFile, "utf8")).asOf : new Date().toISOString().slice(0, 10);
  const files = outputs(posts, asOf);
  if (check) {
    const stale = Object.entries(files).filter(([file, text]) => !exists(file) || read(file) !== text).map(([file]) => file);
    const noThumb = posts.filter(needsThumb).map((post) => post.thumb);
    if (stale.length || noThumb.length) {
      console.error("Social hub is stale; run node scripts/build-social-hub.js\n" + stale.concat(noThumb.slice(0, 5)).join("\n"));
      process.exit(1);
    }
    console.log("Social hub matches its sources (" + posts.length + " posts, as of " + asOf + ")");
    return;
  }
  const thumbs = await writeThumbs(posts);
  fs.mkdirSync(path.join(ROOT, OUT), { recursive: true });
  Object.entries(files).forEach(([file, text]) => fs.writeFileSync(path.join(ROOT, file), text));
  const videos = posts.filter((post) => post.youtube).length;
  console.log("Social hub: " + posts.length + " posts (" + videos + " with a clip), " + thumbs + " new thumbnails, as of " + asOf);
}

if (require.main === module) main().catch((error) => { console.error(error); process.exit(1); });

module.exports = { titleKey, scoreKey, cleanTitle, csvRows, thumbFor, batchPosts, launchPosts, collect, liveEdits, feedJson, page, rss, sitemap, outputs };
