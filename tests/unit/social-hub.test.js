const test = require("node:test");
const assert = require("node:assert/strict");
const hub = require("../../scripts/build-social-hub");
const card = require("../../js/social-hub-card");
const { COPY, LANGS } = require("../../scripts/social-hub/copy");

const post = (over) => Object.assign({
  id: "auto-2026-10-22/01-u-uber-com", kind: "review", batch: "auto-2026-10-22", date: "2026-10-22", lang: "en", clipLang: "es",
  cat: "", title: "uber.com: 66. The gap: page titles.", text: "Give every page a title.\n\nGuide: https://carlosandmunoz.com/qa-review-guide.html?utm_source=x&utm_medium=social",
  image: "media/social-posts/auto-2026-10-22/feed/01-u-uber-com.jpg", thumb: "assets/social/thumbs/x.webp", alt: "Card <uber>", youtube: "5b4Hr6r-cBk", report: "u-uber-com", captions: {}
}, over);

test("YouTube titles match their post across #Shorts, spaced domains and voiced languages", () => {
  assert.equal(hub.titleKey("postobon. com: 49. A lacuna. #Shorts"), hub.titleKey("postobon.com: 49. A lacuna."));
  assert.equal(hub.cleanTitle("postobon. com: 49. A lacuna: rótulos. #Shorts"), "postobon.com: 49. A lacuna: rótulos.");
  assert.equal(hub.scoreKey("teaminternational.com: 64. Il punto debole: link rotti. #Shorts"), hub.scoreKey("teaminternational.com: 64. The gap: broken links."));
  assert.equal(hub.scoreKey("Release day: is the page still right?"), "");
});

test("a card escapes its text, shortens tagged links and links the report in the page language", () => {
  const html = card.cardHtml(post(), COPY.es, "es");
  assert.match(html, /alt="Card &lt;uber&gt;"/);
  assert.match(html, /href="https:\/\/carlosandmunoz.com\/qa-review-guide.html\?utm_source=x&amp;utm_medium=social"/);
  assert.match(html, />carlosandmunoz.com\/qa-review-guide.html</);
  assert.match(html, /href="qa-review-es.html\?live=u-uber-com&amp;from=social"/);
  assert.match(html, /href="social\/auto-2026-10-22\/01-u-uber-com\.html" data-act="open"/);
  assert.match(html, /▶ ES/);
  assert.match(html, /data-act="play" data-video="5b4Hr6r-cBk"/);
});

test("a card names its topic and the clip's voice in the page language and keeps caption paragraphs apart", () => {
  const html = card.cardHtml(post({ cat: "Requested" }), COPY.de, "de");
  assert.match(html, /<span class="post-tag">Angefragt<\/span>/);
  assert.match(html, /aria-label="Clip ansehen \(mit Ton, ES\)"/);
  assert.match(html, /<span class="post-par">Give every page a title.<\/span> <span class="post-par">Guide: /);
  assert.equal(card.topic({ cat: "Brand new" }, COPY.de), "Brand new");
  for (const lang of Object.keys(LANGS)) assert.deepEqual(Object.keys(COPY[lang].cats), Object.keys(COPY.en.cats), lang);
});

test("each page offers the topics of its posts, translated, and versions its CSS and JS by content", () => {
  const html = hub.page("fr", [post({ cat: "Worldwide" }), post({ id: "b/2", cat: "Worldwide" }), post({ id: "b/3", cat: "Local" })], "2026-10-24");
  assert.match(html, /<option value="all">Tous les thèmes<\/option><option value="Worldwide">Mondial<\/option><option value="Local">Local<\/option>/);
  assert.match(html, /css\/social-hub.css\?v=[0-9a-f]{10}"/);
  assert.match(html, /script-src [^;]*https:\/\/www\.gstatic\.com[ ;]/, "js/site-analytics.js loads the Firebase SDK from gstatic to store hub events");
  assert.match(html, /id="hub-clear"[^>]*>Effacer les filtres</);
});

test("a Trending chip appears only when posts carry a trending rank, and the feed keeps the rank", () => {
  assert.doesNotMatch(hub.page("es", [post()], "2026-10-24"), /data-kind="trending"/);
  const html = hub.page("es", [post({ trend: 1 })], "2026-10-24");
  assert.match(html, /data-kind="all" aria-pressed="true">Todo<\/button><button type="button" class="hub-chip" data-kind="trending" aria-pressed="false">Tendencias</);
  for (const lang of Object.keys(LANGS)) assert.ok(COPY[lang].kinds.trending, lang);
  assert.equal(JSON.parse(hub.feedJson([post({ trend: 3 })], "2026-10-24")).posts[0].trend, 3);
});

test("posted cards come first, newest first, then the ones to come, soonest first", () => {
  const order = card.arrange([post({ id: "a", date: "2026-11-30" }), post({ id: "b", date: "2026-10-01" }), post({ id: "c", date: "2026-11-02", queued: true }), post({ id: "d", date: "2026-10-20" })], "2026-10-24");
  assert.deepEqual(order.map((p) => p.id + (p.upcoming ? "+" : "")), ["d", "b", "c+", "a+"]);
  assert.match(card.cardHtml(order[2], COPY.fr, "fr"), /post-scheduled">Programmée</);
});

test("a post to come is Scheduled only when a network has it queued, Planned otherwise, and untagged when held", () => {
  const tags = (over, lang) => card.cardHtml(card.arrange([post(Object.assign({ date: "2026-11-02" }, over))], "2026-10-24")[0], COPY[lang], lang).match(/post-(scheduled|planned)">([^<]+)</);
  assert.deepEqual(tags({ queued: true }, "en").slice(1), ["scheduled", "Scheduled"]);
  assert.deepEqual(tags({ queued: true }, "es").slice(1), ["scheduled", "Programada"]);
  assert.deepEqual(tags({}, "en").slice(1), ["planned", "Planned"]);
  assert.deepEqual(tags({}, "es").slice(1), ["planned", "Planeada"]);
  assert.equal(tags({ held: true }, "en"), null);
  assert.equal(tags({ queued: true, date: "2026-10-20" }, "en"), null);
  for (const lang of Object.keys(LANGS)) assert.notEqual(COPY[lang].planned, COPY[lang].scheduled, lang);
});

test("queued means queued or sent in the Buffer or Facebook ledger, never failed", () => {
  const ids = hub.queuedIds([
    { posts: { "b/01-a": [{ channel: "x", result: "failed" }, { channel: "linkedin", result: "queued" }], "b/02-b": [{ channel: "x", result: "failed", error: "Hub first: not on the hub" }] } },
    { posts: { "b/03-c": [{ channel: "facebook", result: "sent" }] } }
  ]);
  assert.deepEqual([...ids].sort(), ["b/01-a", "b/03-c"]);
});

test("the feed marks queued and held posts only while they are still to come", () => {
  const feed = JSON.parse(hub.feedJson([
    post({ id: "b/q", date: "2026-11-02", queued: true }), post({ id: "b/h", date: "2026-11-02", held: true }),
    post({ id: "b/p", date: "2026-11-02" }), post({ id: "b/old", date: "2026-10-01", queued: true })
  ], "2026-10-24")).posts.map((p) => [p.id, p.queued || false, p.held || false]);
  assert.deepEqual(feed, [["b/q", true, false], ["b/h", false, true], ["b/p", false, false], ["b/old", false, false]]);
});

test("a post page to come says Scheduled or Planned in its language", () => {
  const es = (over) => hub.postPage(post(Object.assign({ lang: "es", date: "2026-11-02" }, over)), [], [], "2026-10-24");
  assert.match(es({ queued: true }), /post-scheduled">Programada</);
  assert.match(es({}), /post-planned">Planeada</);
  assert.doesNotMatch(es({ held: true }), /post-(scheduled|planned)/);
});

test("each page shows posts to come after posted ones, keeps them out of JSON-LD, links six languages", () => {
  const posts = [post({ id: "b/late", date: "2026-11-30", title: "Not yet" }), post()];
  const html = hub.page("de", posts, "2026-10-24");
  assert.ok(html.indexOf("Not yet") > html.indexOf("uber.com: 66."));
  assert.match(html, /post-planned">Geplant</);
  assert.match(html, /<html lang="de">/);
  assert.match(html, /<link rel="canonical" href="https:\/\/carlosandmunoz.com\/qa-review-social-de.html">/);
  for (const code of Object.keys(LANGS).concat("x-default")) assert.match(html, new RegExp("hreflang=\"" + code + "\""));
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  const list = ld["@graph"].find((node) => node["@type"] === "ItemList");
  assert.equal(list.numberOfItems, 1);
  assert.equal(list.itemListElement[0].item.video.embedUrl, "https://www.youtube.com/embed/5b4Hr6r-cBk");
  assert.equal(list.itemListElement[0].item.video.inLanguage, "es");
  assert.ok(!JSON.stringify(ld).includes("Not yet"));
  assert.match(html, /2 Beiträge/);
});

test("every language has the full interface copy", () => {
  const keys = (obj) => Object.keys(obj).sort().join(",");
  for (const lang of Object.keys(LANGS)) {
    assert.equal(keys(COPY[lang]), keys(COPY.en), lang);
    assert.equal(keys(COPY[lang].kinds), keys(COPY.en.kinds), lang);
    assert.equal(keys(COPY[lang].kind), keys(COPY.en.kind), lang);
  }
});

test("the filter offers a chip for each kind that has posts, in lane order, labelled in the page language", () => {
  assert.deepEqual(hub.KINDS, ["tip", "trick", "review", "news", "pick", "advice", "compare", "myth", "quiz", "term", "skit", "series", "launch"]);
  for (const lang of Object.keys(LANGS)) for (const kind of hub.KINDS) assert.ok(COPY[lang].kinds[kind] && COPY[lang].kind[kind], lang + " " + kind);
  const html = hub.page("pt", [post({ id: "a/1", kind: "myth" }), post({ id: "a/2", kind: "trick" }), post({ id: "a/3" })], "2026-10-24");
  const chips = [...html.matchAll(/class="hub-chip" data-kind="([a-z]+)"[^>]*>([^<]+)</g)].map((m) => m[1] + ":" + m[2]);
  assert.deepEqual(chips, ["all:Tudo", "trick:Truques", "review:Análises de sites", "myth:Mito ou verdade"]);
  assert.match(html, /<select id="hub-media"><option value="all">Tudo<\/option><option value="image">Imagens<\/option><option value="video">Vídeos<\/option><\/select>/);
  assert.match(card.cardHtml(post({ kind: "term" }), COPY.it, "it"), /<span class="post-tag post-kind-term">Glossario<\/span>/);
});

test("the sort, network, date range and report controls are labelled in every language and list only networks with posts", () => {
  const sortKeys = (lang) => Object.keys(COPY[lang].sorts).join();
  for (const lang of Object.keys(LANGS)) {
    assert.equal(sortKeys(lang), card.SORTS.join(), lang);
    for (const key of ["sort", "sortDir", "media", "network", "allNets", "range", "from", "to", "withReport"]) assert.ok(COPY[lang][key], lang + " " + key);
    assert.deepEqual(Object.keys(COPY[lang].ranges), ["7", "30", "90", "all", "custom"], lang);
    for (const pair of Object.values(COPY[lang].dirs)) assert.equal(pair.length, 2, lang);
  }
  const html = hub.page("de", [post({ id: "a/1", nets: ["tiktok", "linkedin"] }), post({ id: "a/2", nets: ["facebook"] })], "2026-10-24");
  assert.match(html, /<select id="hub-net"><option value="all">Alle Netzwerke<\/option><option value="tiktok">TikTok<\/option><option value="linkedin">LinkedIn<\/option><option value="facebook">Facebook<\/option><\/select>/);
  assert.match(html, /<select id="hub-sort"><option value="date">Datum<\/option><option value="title">Titel<\/option>/);
  assert.match(html, /id="hub-dir" type="button" aria-label="Sortierrichtung: Neueste zuerst" data-dir="desc">Neueste zuerst</);
  assert.match(html, /<input id="hub-report" type="checkbox"><span>Mit vollständigem Bericht<\/span>/);
});

test("a post's networks come from both ledgers and its clip, in Follow-row order", () => {
  const books = [
    { posts: { "a/1": [{ channel: "x", result: "sent" }, { channel: "tiktok", result: "queued" }, { channel: "linkedin", result: "failed" }] } },
    { posts: { "a/1": [{ channel: "facebook", result: "sent" }] } }
  ];
  const nets = hub.networkIds(books);
  assert.deepEqual(hub.postNets({ id: "a/1-es", base: "a/1", youtube: "abc" }, nets), ["youtube", "tiktok", "x", "facebook"]);
  assert.deepEqual(hub.postNets({ id: "a/2", youtube: null }, nets), []);
});

test("sorting keeps posted posts ahead of scheduled ones by date, and puts posts without the count last", () => {
  const p = (id, date, extra) => Object.assign({ id, date, title: id, kind: "tip" }, extra);
  const list = card.arrange([
    p("b", "2026-10-20", { stats: { tiktok: { views: 50, likes: 2 }, x: { views: 10 } } }),
    p("a", "2026-10-22", { stats: { x: { views: 90 } } }),
    p("c", "2026-10-25"),
    p("d", "2026-11-02"),
    p("e", "2026-10-30")
  ], "2026-10-26");
  const ids = (out) => out.map((post) => post.id).join("");
  assert.equal(ids(card.sortPosts(list, "date", "desc")), "cabed");
  assert.equal(ids(card.sortPosts(list, "date", "asc")), "baced");
  assert.equal(ids(card.sortPosts(list, "title", "asc")), "abcde");
  assert.equal(ids(card.sortPosts(list, "title", "desc")), "edcba");
  assert.equal(ids(card.sortPosts(list, "views", "desc")), "abced", "a 90 beats b 60, then arrange order");
  assert.equal(ids(card.sortPosts(list, "views", "asc")), "baced");
  assert.equal(ids(card.sortPosts(list, "views", "desc", "tiktok")), "bcaed");
  assert.equal(card.metric(list[2], "likes"), 2);
  assert.equal(card.metric(list[0], "likes"), null);
  assert.equal(card.defaultDir("title"), "asc");
  assert.equal(card.defaultDir("comments"), "desc");
});

test("a card shows its numbers summed over networks, or for the filtered network, with a per-network tooltip", () => {
  const stats = { tiktok: { views: 1200, likes: 30 }, x: { impressions: 400, views: 300, comments: 2 } };
  const html = card.cardHtml(post({ stats }), COPY.en, "en");
  assert.match(html, /<p class="post-stats" title="TikTok: plays 1200, likes 30 · X: impressions 400, plays 300, comments 2">/);
  assert.match(html, /<span class="sr-only">Plays: <\/span><svg[^>]*>.*?<\/svg>1\.5K<\/span>/);
  assert.match(html, /<span class="sr-only">Comments: <\/span>/);
  const tiktok = card.cardHtml(post({ stats }), COPY.en, "en", "tiktok");
  assert.doesNotMatch(tiktok, /Comments: /);
  assert.match(tiktok, /title="TikTok: plays 1200, likes 30"/);
  assert.doesNotMatch(card.cardHtml(post(), COPY.en, "en"), /post-stats/);
});

test("a batch names its kind in captions.json, and a batch without one keeps the kind of its name", () => {
  const batch = "media/social-posts/tips-horror-headers-2026-10/";
  const files = new Set([batch + "captions.json", batch + "feed/01-missing-csp.jpg"]);
  const [horror] = hub.batchPosts(files, new Set());
  assert.equal(horror.kind, "series");
  const tips = "media/social-posts/tips-2026-10/";
  const slug = Object.keys(require("../../" + tips + "captions.json"))[0];
  assert.equal(hub.batchPosts(new Set([tips + "captions.json", tips + "feed/" + slug + ".jpg"]), new Set())[0].kind, "tip");
});

test("each post page types its kind in JSON-LD: news, tricks with steps, glossary terms and skits with their clip", () => {
  const ld = (p) => JSON.parse(hub.postPage(p, [p], [], "2026-10-24").match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1])["@graph"][0];
  assert.deepEqual(ld(post({ kind: "news" }))["@type"], ["SocialMediaPosting", "NewsArticle"]);
  const trick = ld(post({ kind: "trick", steps: ["Run curl -sI on the page.", "Look for strict-transport-security."] }));
  assert.deepEqual(trick["@type"], ["SocialMediaPosting", "HowTo"]);
  assert.deepEqual(trick.step.map((s) => s.position + " " + s.text), ["1 Run curl -sI on the page.", "2 Look for strict-transport-security."]);
  assert.equal(ld(post({ kind: "term", term: "HSTS" })).about.name, "HSTS");
  const skit = ld(post({ kind: "skit" }));
  assert.deepEqual(skit["@type"], ["SocialMediaPosting", "VideoObject"]);
  assert.equal(skit.embedUrl, "https://www.youtube.com/embed/5b4Hr6r-cBk");
  assert.equal(skit.video, undefined);
  assert.equal(ld(post({ kind: "skit", youtube: null }))["@type"], "SocialMediaPosting");
  assert.equal(ld(post({ kind: "myth" }))["@type"], "SocialMediaPosting");
});

test("a quiz links its answer in the same language once the answer is out, and the answer stays off the hub until then", () => {
  const quiz = post({ id: "c/01-which", kind: "quiz", title: "Which bank scored higher?", answer: "c/02-reveal", date: "2026-11-02" });
  const quizEs = post({ id: "c/01-which-es", kind: "quiz", lang: "es", title: "¿Qué banco sacó más?", answer: "c/02-reveal", date: "2026-11-02" });
  const reveal = post({ id: "c/02-reveal", kind: "compare", title: "Bank A: 81, Bank B: 64.", date: "2026-11-03" });
  const revealEs = post({ id: "c/02-reveal-es", kind: "compare", lang: "es", title: "Banco A: 81, banco B: 64.", date: "2026-11-03" });
  const posts = [quiz, quizEs, reveal, revealEs];
  hub.pairQuizzes(posts);
  assert.deepEqual(posts.map((p) => p.answer || p.question), ["c/02-reveal", "c/02-reveal-es", "c/01-which", "c/01-which-es"]);
  assert.deepEqual(hub.unspoiled(posts, "2026-11-02").map((p) => p.id), ["c/01-which", "c/01-which-es"]);
  assert.equal(hub.unspoiled(posts, "2026-11-03").length, 4);

  const before = hub.postPage(quizEs, [quizEs], [], "2026-11-02", revealEs);
  assert.match(before, /class="post-answer-on">Respuesta el 3 nov 2026</);
  assert.doesNotMatch(before, /"hasPart"|Banco A/);
  const after = hub.postPage(quizEs, [quizEs], [], "2026-11-03", revealEs);
  assert.match(after, /href="\/social\/c\/02-reveal-es\.html">Ver la respuesta →</);
  assert.match(after, /"acceptedAnswer": \{\n[^}]*"text": "Banco A: 81, banco B: 64\."/);
  assert.match(hub.postPage(revealEs, [revealEs], [], "2026-11-03", null, quizEs), /href="\/social\/c\/01-which-es\.html">← La pregunta</);
});

test("each RSS item names its kind in the feed's language", () => {
  assert.match(hub.rss("fr", [post({ kind: "quiz" })], "2026-10-24"), /<category>Quiz<\/category>/);
  assert.match(hub.rss("de", [post({ kind: "compare" })], "2026-10-24"), /<category>Vergleich<\/category>/);
});

test("each RSS feed lists posted items only, linked to its own language page", () => {
  const xml = hub.rss("de", [post(), post({ id: "later", date: "2099-01-01", title: "Later" })], "2026-10-24");
  assert.match(xml, /<language>de<\/language>/);
  assert.match(xml, /<link>https:\/\/carlosandmunoz\.com\/social\/auto-2026-10-22\/01-u-uber-com\.html<\/link>/);
  assert.match(xml, /youtube\.com\/shorts\/5b4Hr6r-cBk/);
  assert.doesNotMatch(xml, /Later/);
});

test("the social sitemap lists the six hub pages and each posted post page with its image and clip", () => {
  const xml = hub.sitemap([post(), post({ id: "later", date: "2099-01-01" })], "2026-10-24");
  const page = xml.split("<url>").find((block) => block.includes("social/auto-2026-10-22/01-u-uber-com.html</loc>"));
  assert.equal((xml.match(/qa-review-social(-[a-z]{2})?\.html<\/loc>/g) || []).length, 6);
  assert.match(page, /image:loc>https:\/\/carlosandmunoz\.com\/media\/social-posts\/auto-2026-10-22\/feed\/01-u-uber-com\.jpg/);
  assert.match(page, /embed\/5b4Hr6r-cBk/);
  assert.doesNotMatch(xml, /social\/later\.html/);
});

test("a post page is canonical, in its own language, links its other languages and is noindex until its day", () => {
  const de = post({ id: "promo-x/02-topic-de", kind: "launch", lang: "de", group: "promo-x/topic", captions: { x: "Hallo <welt>" } });
  const en = post({ id: "promo-x/01-topic-en", kind: "launch", lang: "en", group: "promo-x/topic" });
  const html = hub.postPage(de, [en, de], [en], "2026-10-21");
  assert.match(html, /<html lang="de">/);
  assert.match(html, /<link rel="canonical" href="https:\/\/carlosandmunoz\.com\/social\/promo-x\/02-topic-de\.html">/);
  assert.match(html, /hreflang="en" href="https:\/\/carlosandmunoz\.com\/social\/promo-x\/01-topic-en\.html"/);
  assert.match(html, /hreflang="x-default" href="[^"]+01-topic-en\.html"/);
  assert.match(html, /<meta name="robots" content="noindex, follow">/);
  assert.match(html, /Hallo &lt;welt&gt;/);
  assert.match(html, /"@type": "SocialMediaPosting"/);
  assert.match(html, new RegExp(COPY.de.allPosts));
  assert.doesNotMatch(hub.postPage(de, [de], [], "2026-10-24"), /noindex|hreflang/);
});

test("the hub promo writes every topic in six languages and queues each twice, woman then man", () => {
  const promo = require("../../scripts/tips-studio/promo-social-hub");
  assert.equal(promo.TIPS.length, 36);
  const queued = promo.TIPS.filter((tip) => !tip.hold);
  assert.equal(queued.length, 12);
  assert.deepEqual(queued.map((tip) => tip.voice), Array(6).fill("w").concat(Array(6).fill("m")));
  const byTopic = {};
  queued.forEach((tip) => { (byTopic[tip.topic] = byTopic[tip.topic] || []).push(tip.lang); });
  Object.values(byTopic).forEach((langs) => { assert.equal(langs.length, 2); assert.notEqual(langs[0], langs[1]); });
  assert.equal(new Set(queued.map((tip) => tip.date)).size, 12);
  for (const tip of promo.TIPS) {
    const cap = promo.captions(tip);
    assert.ok(cap.x.length <= 280, tip.id);
    assert.ok(tip.alt.length <= 300, tip.id);
    assert.match(cap.facebook, new RegExp("qa-review-social" + (tip.lang === "en" ? "" : "-" + tip.lang) + "\\.html\\?utm_source=facebook&utm_medium=social&utm_campaign=social-hub-promo&utm_content=" + tip.id));
  }
});

test("the calendar parser keeps the header keys", () => {
  assert.deepEqual(hub.csvRows("Date,Language,Post\n2026-10-19,de,talking\n"), [{ Date: "2026-10-19", Language: "de", Post: "talking" }]);
});

test("a post with translated captions gets a page per language, and each hub page shows it once in its own language", () => {
  const post = { id: "b/01-x", lang: "en", clipLang: "de", title: "Fix it", text: "Fix it.", alt: "Card", captions: { linkedin: "Fix it.", x: "Fix it.", tiktok: "Behebe es." },
    i18n: { es: { title: "Arréglalo", linkedin: "Arréglalo.", x: "Arréglalo." }, xx: { title: "?" } } };
  const posts = hub.expand([post]).map((p) => Object.assign(p, { group: p.base || p.id }));
  assert.deepEqual(posts.map((p) => p.id), ["b/01-x", "b/01-x-es"]);
  assert.deepEqual([posts[1].title, posts[1].text, posts[1].clipLang, posts[1].captions.x, posts[1].captions.tiktok], ["Arréglalo", "Arréglalo.", "de", "Arréglalo.", "Behebe es."]);
  assert.deepEqual(hub.forLang(posts, "es").map((p) => p.id), ["b/01-x-es"]);
  assert.deepEqual(hub.forLang(posts, "fr").map((p) => p.id), ["b/01-x"]);
});

test("the YouTube feed adds new uploads and re-titles the ones it still lists, and leaves older ones as they were", () => {
  const ledger = { videos: { a: { title: "Old title #Shorts", published: "2026-10-19T06:02:40+00:00" }, b: { title: "Gone from the feed", published: "2026-10-01T00:00:00+00:00" } } };
  const entry = (id, title, published) => "<entry><yt:videoId>" + id + "</yt:videoId><published>" + published + "</published><media:title>" + title + "</media:title></entry>";
  const counts = hub.mergeFeed(ledger, "<feed>" + entry("a", "New &amp; right title #Shorts", "2026-10-19T06:02:40+00:00") + entry("c", "Fresh", "2026-10-24T00:00:00+00:00") + "</feed>");
  assert.deepEqual(counts, { added: 1, retitled: 1 });
  assert.equal(ledger.videos.a.title, "New & right title #Shorts");
  assert.equal(ledger.videos.b.title, "Gone from the feed");
  assert.deepEqual(Object.keys(ledger.videos), ["b", "a", "c"]);
});
