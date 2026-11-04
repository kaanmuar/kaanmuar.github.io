const test = require("node:test");
const assert = require("node:assert/strict");
const R = require("../../functions/engagement-reports");
const E = require("../../functions/engagement");

const NOW = Date.parse("2026-11-03T17:00:00Z");
const index = {
  reports: [
    { id: "upb", name: "UPB", host: "www.upb.edu.co", overall: 58, grade: "D", sector: "university", country: "CO", areas: { SEO: 70, Accessibility: 41, Performance: 63 } },
    { id: "govuk", name: "GOV.UK", host: "www.gov.uk", overall: 92, grade: "A", areas: { SEO: 86, Accessibility: 100 } },
    { id: "home", name: "Home", host: "acme-dental.com", overall: 71, areas: {} },
    { id: "banco", name: "Bancolombia", host: "www.bancolombia.com", overall: 84, areas: { SEO: 90, Security: 77 } },
    { id: "dup", name: "UPB again", host: "upb.edu.co", overall: 60 },
    { id: "broken", host: "", overall: 50 }
  ]
};
const sites = R.targets(index);
const upb = sites.find((t) => t.id === "upb");
const govuk = sites.find((t) => t.id === "govuk");
const banco = sites.find((t) => t.id === "banco");
const post = (over) => Object.assign({
  key: "bluesky_0123456789abcdef0123", network: "bluesky", id: "at://did:plc:x/app.bsky.feed.post/1", url: "https://bsky.app/profile/a/post/1",
  author: { handle: "ana.bsky.social", name: "Ana" }, text: "Just enrolled at upb.edu.co, the new site is lovely", lang: "es", createdAt: "2026-11-02T12:00:00Z", metrics: {}
}, over);
const conf = E.settings({});
const ctx = () => ({ recent: new Set(), contacted: new Map(), replied: new Set(), links: {} });
const ai = (over) => Object.assign({ aboutSite: true, lang: "es", sentiment: "positive", worth: 0.8, reply: "¡Qué bien! Hicimos una revisión gratuita de UPB y tiene hallazgos sobre accesibilidad que vale la pena ver: {link}" }, over);

test("Live Reports become sites to look for: public cards only, one per host, weakest area first (#2465)", () => {
  assert.deepEqual(sites.map((t) => t.host), ["upb.edu.co", "gov.uk", "acme-dental.com", "bancolombia.com"]);
  assert.equal(upb.weakest, "Accessibility");
  assert.deepEqual(R.queries(upb), ["upb.edu.co"]);
  assert.deepEqual(R.queries(govuk), ["gov.uk"], "a name that is the domain again is searched once");
  assert.deepEqual(R.queries(banco), ["bancolombia.com", "Bancolombia"]);
  assert.deepEqual(R.queries(sites[2]), ["acme-dental.com"], "a generic name is not searched");
});

test("each slot takes the next sites, skipping those answered or emailed in the last 30 days", () => {
  assert.deepEqual(R.pick(sites, 0, null, 2).map((t) => t.id), ["upb", "govuk"]);
  assert.deepEqual(R.pick(sites, 1, null, 2).map((t) => t.id), ["home", "banco"]);
  assert.deepEqual(R.pick(sites, 0, new Set(["upb.edu.co"]), 2).map((t) => t.id), ["govuk", "home"]);
});

test("a post names a site by domain or by its name as a word", () => {
  assert.equal(R.matchOf(post(), upb), "domain");
  assert.equal(R.matchOf(post({ text: "Bancolombia just shipped a new app" }), banco), "name");
  assert.equal(R.matchOf(post({ text: "Bancolombiano news" }), banco), "");
  const hit = R.siteOf(post({ query: "upb.edu.co" }), sites);
  assert.equal(hit.target.id, "upb");
  assert.equal(R.siteOf(post({ text: "nothing here" }), sites), null);
});

test("a site gets its short brand, its kind, its language and its weak areas in the order people complain (#2468)", () => {
  assert.deepEqual([upb.short, upb.niche, upb.lang, upb.weak], ["", "highered", "es", ["Performance", "Accessibility"]], "a three-letter brand is too loose to search");
  assert.deepEqual([govuk.short, govuk.niche, govuk.lang, govuk.weak], ["", "government", "en", []]);
  assert.equal(R.shortOf("dian.gov.co"), "dian");
  assert.equal(R.shortOf("www.africa-union.org".replace("www.", "")), "africa union");
  assert.equal(R.shortOf("shop.com"), "", "a generic word is no brand");
  assert.equal(R.nicheOf("", "minsalud.gov.co"), "government");
  assert.equal(R.nicheOf("banking", "x.edu"), "banking", "the sector wins over the host");
  const geneva = R.targets({ reports: [{ id: "who", name: "WHO", host: "who.int", overall: 70, country: "CH", scope: "Worldwide", sector: "health", areas: {} }] })[0];
  assert.equal(geneva.lang, "en", "a worldwide site is looked for in English, not in its host country's language");
});

const dian = R.targets({ reports: [{ id: "dian", name: "Dirección de Impuestos y Aduanas Nacionales", host: "www.dian.gov.co", overall: 55, country: "CO", areas: { Security: 40, Performance: 62, SEO: 90 } }] })[0];

test("loose searches: the brand with a complaint, then the kind of site with a word for website, deduplicated and capped (#2468)", () => {
  const loose = R.looseQueries([dian, upb, govuk, banco]);
  assert.deepEqual(loose.map((l) => [l.match, l.q]), [
    ["problem", "dian lenta"],
    ["niche", "gobierno página lenta"],
    ["niche", "universidad página lenta"],
    ["niche", "government website"]
  ]);
  assert.equal(loose[0].problem, "Performance", "slowness is searched before the lower Security score");
  assert.ok(!loose.some((l) => l.target === banco), "a brand that is the name again is left to the name search");
  assert.equal(R.looseQueries([dian, upb, govuk, banco, dian]).length, R.LOOSE_PER_RUN);
});

test("a loose post must hold every word group of its search, as whole words, accents aside (#2468)", () => {
  const loose = R.looseQueries([dian, upb]);
  const hit = R.looseOf(post({ text: "La página de la DIAN no carga desde ayer", query: "dian lenta" }), loose);
  assert.deepEqual([hit.target.id, hit.match, hit.problem], ["dian", "problem", "Performance"]);
  const niche = R.looseOf(post({ text: "¿Por qué la pagina de mi UNIVERSIDAD es tan lenta?" }), loose);
  assert.deepEqual([niche.target.id, niche.match], ["upb", "niche"]);
  assert.equal(R.looseOf(post({ text: "La universidad anunció becas nuevas" }), loose), null, "the kind of site alone is not enough");
  assert.equal(R.looseOf(post({ text: "La página de la universidad va lentamente" }), loose), null, "no match inside a word");
});

test("the link carries the post's language, the network's code, the site and a post ref", () => {
  assert.equal(R.linkFor(upb, "bluesky", "es", "bluesky_0123456789abcdef0123"), "https://qalabreview.com/es/r/bsky/upb.edu.co/012345");
  assert.equal(R.linkFor(upb, "youtube", "zz", "youtube_abcdef"), "https://qalabreview.com/en/r/yt/upb.edu.co/abcdef");
});

test("Gemini's invite keeps one link, loses other links and hashtags, and never names a score we hide", () => {
  const items = [post({ target: upb }), post({ key: "bluesky_ffffffffffffffffffff", target: govuk })];
  const rows = JSON.stringify([
    { id: items[0].key, aboutSite: true, lang: "es", worth: 0.9, reply: "Revisamos UPB en https://x.io #SEO {link} y {link}" },
    { id: items[1].key, aboutSite: true, lang: "en", worth: 0.9, reply: "We reviewed GOV.UK and it scores 92/100, have a look" }
  ]);
  const out = R.parse(rows, items);
  assert.equal(out[items[0].key].reply, "Revisamos UPB en {link} y");
  assert.equal(out[items[1].key].reply, "We reviewed GOV.UK and it scores 92/100, have a look {link}");
  const leak = R.parse(JSON.stringify([{ id: items[0].key, aboutSite: true, reply: "UPB scores 58/100, see {link}" }]), items);
  assert.equal(leak[items[0].key].reply, "", "a hidden score is never posted");
});

test("an invite waits for Carlos with the filled link; guards, the 30-day gap, mail sent and caps hold it back", () => {
  const used = {};
  const c = ctx();
  const d = R.decide(post(), ai(), upb, conf, used, NOW, c);
  assert.equal(d.verdict, "engage");
  assert.equal(d.actions.reply.status, "waiting");
  assert.equal(d.actions.reply.kind, "report-reply");
  assert.ok(d.actions.reply.draft.endsWith("https://qalabreview.com/es/r/bsky/upb.edu.co/012345"));
  assert.equal(used.bluesky.reply, 1);
  assert.equal(R.decide(post({ key: "bluesky_1111111111aaaaaaaaaa" }), ai(), upb, conf, used, NOW, c).skip, "site_recent", "one reply per site");
  const mailed = Object.assign(ctx(), { contacted: new Map([["upb.edu.co", "owner notice"]]) });
  assert.equal(R.decide(post(), ai(), upb, conf, {}, NOW, mailed).skip, "contacted");
  assert.equal(R.decide(post(), ai({ aboutSite: false }), upb, conf, {}, NOW, ctx()).skip, "not_site");
  assert.equal(R.decide(post(), ai({ political: true }), upb, conf, {}, NOW, ctx()).skip, "political");
  assert.equal(R.decide(post(), ai({ lang: "ja" }), upb, conf, {}, NOW, ctx()).skip, "lang");
  assert.equal(R.decide(post({ author: { handle: "semrush" } }), ai(), upb, conf, {}, NOW, ctx()).skip, "competitor");
  assert.equal(R.decide(post({ createdAt: "2026-10-20T00:00:00Z" }), ai(), upb, conf, {}, NOW, ctx()).skip, "old");
  assert.equal(R.decide(post({ createdAt: "2026-10-30T00:00:00Z" }), ai(), upb, conf, {}, NOW, ctx()).verdict, "engage", "site mentions stay open a week");
  assert.equal(R.decide(post(), ai(), upb, conf, { bluesky: { reply: 15 } }, NOW, ctx()).actions.reply.status, "capped");
  assert.equal(R.decide(post(), ai(), upb, E.settings({ paused: true }), {}, NOW, ctx()).actions.reply.status, "paused");
  assert.equal(R.decide(post({ network: "hn" }), ai(), upb, conf, {}, NOW, ctx()).verdict, "trend");
});

test("a niche or problem post needs Gemini's fits and a higher worth; a niche post need not be about the site (#2468)", () => {
  const nicheP = post({ match: "niche", problem: "Performance", text: "¿Por qué la página de mi universidad es tan lenta?" });
  const fit = ai({ aboutSite: false, fits: true, worth: 0.8 });
  const d = R.decide(nicheP, fit, upb, conf, {}, NOW, ctx());
  assert.equal(d.actions.reply.status, "waiting");
  assert.equal(R.decide(nicheP, ai({ aboutSite: false, fits: false }), upb, conf, {}, NOW, ctx()).skip, "not_fit");
  assert.equal(R.decide(nicheP, ai({ aboutSite: false, fits: true, worth: 0.7 }), upb, conf, {}, NOW, ctx()).verdict, "watch", "0.7 is enough for a named site, not a loose one");
  assert.equal(R.decide(post(), ai({ worth: 0.7 }), upb, conf, {}, NOW, ctx()).verdict, "engage");
  const problemP = post({ match: "problem", problem: "Performance", text: "La DIAN no carga" });
  assert.equal(R.decide(problemP, ai({ aboutSite: false, fits: true }), dian, conf, {}, NOW, ctx()).skip, "not_site", "a complaint must be about this very site");
  const items = [Object.assign(nicheP, { target: upb }), post({ key: "bluesky_eeeeeeeeeeeeeeeeeeee", target: upb })];
  const parsed = R.parse(JSON.stringify([{ id: items[0].key, fits: true, reply: "Revisamos UPB, otra universidad: {link}" }, { id: items[1].key, aboutSite: true, fits: true, reply: "Revisamos UPB: {link}" }]), items);
  assert.equal(parsed[items[0].key].fits, true);
  assert.equal(parsed[items[1].key].fits, false, "fits only counts for loose matches");
  const asked = R.prompt(items);
  assert.match(asked, /Strict check for match "problem" and "niche"/);
  assert.match(asked, /"match":"niche"/);
  assert.match(asked, /"problem":"Performance"/);
});

test("a long invite is cut before the link, never through it", () => {
  const long = "a".repeat(400) + " {link}";
  const out = R.fill(long, "https://tinyurl.com/abc123", "bluesky");
  assert.ok(out.length <= 300);
  assert.ok(out.endsWith("https://tinyurl.com/abc123"));
});

test("the stored post is tagged report-reply with the site, the match and the format; the day counts it", () => {
  const p = post({ query: "upb.edu.co" });
  const d = R.decide(p, ai(), upb, conf, {}, NOW, ctx());
  const doc = R.doc(p, ai(), upb, "domain", d, "https://qalabreview.com/es/r/bsky/upb.edu.co/012345", NOW);
  assert.equal(doc.campaign, "report-reply");
  assert.deepEqual(doc.report, { host: "upb.edu.co", id: "upb", name: "UPB", score: 58, shown: false, weakest: "Accessibility", match: "domain", problem: "", niche: "", query: "upb.edu.co", format: "card", link: "https://qalabreview.com/es/r/bsky/upb.edu.co/012345" });
  assert.equal(doc.topic, "Reports");
  const youtube = R.doc(post({ network: "youtube" }), ai(), govuk, "name", { verdict: "skip", skip: "not_site", actions: {} }, "", NOW);
  assert.equal(youtube.report.format, "link");
  const niche = R.doc(post({ problem: "Performance", query: "universidad página lenta" }), ai(), upb, "niche", { verdict: "skip", skip: "not_fit", actions: {} }, "", NOW);
  assert.deepEqual([niche.report.match, niche.report.problem, niche.report.niche], ["niche", "Performance", "highered"]);
  assert.deepEqual(R.rollup(4, [doc, youtube, niche]), { searched: 4, matched: 3, drafted: 1, skip: { not_site: 1, not_fit: 1 }, net: { bluesky: 2, youtube: 1 }, by: { domain: 1, name: 1, niche: 1 } });
});

test("the engagement report and its push carry the invites; the approval push names the report", () => {
  const r = E.report("daily", [{ day: "2026-11-03", report: { searched: 8, matched: 3, drafted: 2, approved: 1, posted: 1, skip: { not_site: 1 }, by: { domain: 2, niche: 1 } } }], [], [], NOW);
  assert.equal(r.invites.drafted, 2);
  const mail = E.reportMail(Object.assign(r, { from: "2026-11-03", to: "2026-11-03" }));
  assert.ok(mail.rows.some((x) => x.heading === "Report replies"));
  assert.ok(mail.rows.some((x) => x.label === "Posts about a reviewed site or its niche" && x.value === "3 (left alone: not site 1)"));
  assert.ok(mail.rows.some((x) => x.label === "Tied by" && x.value === "domain 2, niche 1"));
  assert.match(E.reportPush(r).body, /Report invites: 2 drafted, 1 posted\./);
  const p = post();
  const doc = Object.assign({ key: p.key }, R.doc(p, ai(), upb, "domain", R.decide(p, ai(), upb, conf, {}, NOW, ctx()), "https://qalabreview.com/es/r/bsky/upb.edu.co/012345", NOW));
  const push = E.replyPush(doc);
  assert.match(push.title, /^Invite to the UPB report on Bluesky\?/);
  assert.ok(push.lines.some((l) => l.startsWith("Report: upb.edu.co scores 58 (not named) · names it by domain")));
  const nicheDoc = Object.assign({}, doc, { report: Object.assign({}, doc.report, { match: "niche", niche: "highered", problem: "Performance" }) });
  assert.ok(E.replyPush(nicheDoc).lines.some((l) => l.includes("about its niche (highered, Performance)")));
  const problemDoc = Object.assign({}, doc, { report: Object.assign({}, doc.report, { match: "problem", problem: "Performance" }) });
  assert.ok(E.replyPush(problemDoc).lines.some((l) => l.includes("a complaint about Performance")));
});

// --- The report pass end to end, on an in-memory Firestore --------------------------------------------------

const { fakeDb } = require("./fixtures/fake-firestore.js");
const J = require("../../functions/jarvis-engagement");

function passFetch(calls) {
  const bsky = (id, text) => ({ uri: "at://did:plc:ana/app.bsky.feed.post/" + id, cid: "c" + id, author: { handle: "ana.bsky.social", did: "did:plc:ana", displayName: "Ana" }, record: { text, langs: ["es"], createdAt: "2026-11-02T12:00:00Z" }, likeCount: 4 });
  return async (url, opts) => {
    calls.push(url);
    const json = (body) => ({ ok: true, status: 200, json: async () => body });
    if (url.includes("live-reports/index.json")) return json(index);
    if (url.includes("createSession")) return json({ accessJwt: "t", did: "did:plc:us", handle: "us.bsky.social" });
    if (url.includes("searchPosts")) {
      const q = decodeURIComponent(url.split("&q=")[1]);
      if (q === "universidad página lenta") return json({ posts: [bsky("3", "La página de mi universidad está lenta otra vez"), bsky("4", "Universidad lenta en responder")] });
      return json({ posts: q === "upb.edu.co" ? [bsky("1", "Me matriculé en upb.edu.co, qué buena la web nueva"), bsky("2", "Un post sin nada que ver")] : [] });
    }
    if (url.includes("generativelanguage")) {
      const items = JSON.parse(JSON.parse(opts.body).contents[0].parts[0].text.split("\n").pop());
      return json({ candidates: [{ content: { parts: [{ text: JSON.stringify(items.map((p) => ({ id: p.id, aboutSite: p.match !== "niche", fits: p.match === "niche", about: "enrolment", lang: "es", sentiment: "positive", worth: 0.9, reply: "¡Felicidades! Hicimos una revisión gratuita de " + p.site.name + " con hallazgos sobre " + p.site.weakest + " que vale la pena ver: {link}" }))) }] } }] });
    }
    return { ok: false, status: 503, json: async () => ({}) };
  };
}

test("a report pass looks for this slot's sites, drafts the invite with its link, tags and counts it, and pushes it (#2465)", async () => {
  const db = fakeDb();
  const calls = [];
  const pushed = [];
  db.data.set("url_review_owner_notice_log/n1", { host: "gov.uk", sentAt: "2026-10-20T00:00:00Z" });
  const deps = { db, fetch: passFetch(calls), env: { GEMINI_API_KEY: "k", BLUESKY_HANDLE: "us", BLUESKY_APP_PASSWORD: "p" }, now: NOW, inc: (n) => ({ inc: n }), push: async (m) => { pushed.push(m); } };
  const out = await J.reportPass(deps, conf, {});
  assert.equal(out.searched, 3, "gov.uk had our mail this month");
  assert.ok(!calls.some((u) => u.includes("q=gov.uk")));
  assert.ok(calls.some((u) => u.includes("q=Bancolombia")), "a telling name is searched besides the domain");
  assert.ok(calls.some((u) => u.includes("q=" + encodeURIComponent("universidad página lenta"))), "the site's kind and weak area are searched in its language");
  assert.equal(out.matched, 2, "the post that names no site, and the one without a word for website, are dropped");
  assert.equal(out.drafted, 1);
  const kept = Array.from(db.data.entries()).filter(([p]) => p.startsWith("engagement_posts/"));
  assert.equal(kept.length, 2);
  const niche = kept.find(([, d]) => d.report.match === "niche")[1];
  assert.deepEqual([niche.report.host, niche.report.niche, niche.report.problem, niche.skip], ["upb.edu.co", "highered", "Performance", "site_recent"], "one invite per site, even across match kinds");
  const [path, doc] = kept.find(([, d]) => d.report.match === "domain");
  assert.equal(doc.campaign, "report-reply");
  assert.equal(doc.report.host, "upb.edu.co");
  assert.equal(doc.actions.reply.status, "waiting");
  assert.match(doc.actions.reply.draft, /Accessibility que vale la pena ver: https:\/\/qalabreview\.com\/es\/r\/bsky\/upb\.edu\.co\/[a-f0-9]{6}$/);
  assert.ok(!/58/.test(doc.actions.reply.draft), "a score under 80 is not named");
  const day = db.data.get("engagement_daily/" + E.bogotaDay(NOW));
  assert.deepEqual(day.report.drafted, 1);
  assert.deepEqual(day.report.searched, 3);
  assert.deepEqual(day.report.by, { domain: 1, niche: 1 });
  assert.equal(day.runs, undefined, "a pass is part of the scout's run, not a run of its own");
  assert.equal(pushed.length, 1);
  assert.match(pushed[0].title, /^Invite to the UPB report on Bluesky\?/);

  await J.decide(Object.assign({}, deps, { now: NOW + 60000 }), { key: path.split("/")[1], decision: "dismiss" }, "carlos");
  assert.deepEqual(db.data.get("engagement_daily/" + E.bogotaDay(NOW)).report.dismissed, 1);

  db.data.set(path, Object.assign({}, doc, { actions: { reply: Object.assign({}, doc.actions.reply, { status: "posted" }) } }));
  const again = await J.reportPass(Object.assign({}, deps, { now: NOW + 3600000 }), conf, {});
  assert.equal(again.searched, 2, "upb.edu.co was answered this month, gov.uk was emailed");
});

// --- The weekly results ticket (#2471) -----------------------------------------------------------------------

const social = {
  visits: 12, reviews: 3, paid: 1, usd: 19,
  networks: [{ network: "bluesky", name: "Bluesky", campaign: "social-reply-bluesky", visits: 12, reviews: 3, paid: 1, usd: 19 }],
  posts: [{ network: "bluesky", name: "Bluesky", ref: "a1b2c3", host: "upb.edu.co", visits: 9, reviews: 3, paid: 1, usd: 19, url: "https://bsky.app/p/1", title: "UPB | new site", status: "posted", replyUrl: "https://bsky.app/p/2" }]
};
const week = { from: "2026-10-26", to: "2026-11-01", invites: { searched: 28, matched: 6, drafted: 4, approved: 2, edited: 1, dismissed: 1, posted: 3, skips: [{ label: "not_site", value: 2 }], networks: [{ label: "bluesky", value: 4 }, { label: "mastodon", value: 2 }] } };

test("the weekly results ticket sums the invites and the clicks, runs and payments per network and per post", () => {
  const issue = R.resultsIssue(week, social);
  assert.equal(issue.title, "Results: report replies 2026-10-26 to 2026-11-01 · 3 posted, 12 clicks, 3 runs, 1 paid");
  assert.equal(issue.parent, 2465);
  assert.deepEqual(issue.labels, ["area:engagement"]);
  assert.match(issue.body, /^\*\*Kind:\*\* Results\n\*\*Area:\*\* engagement\nParent: #2465/);
  assert.match(issue.body, /\| Approved \| 3 \(1 edited, 1 dismissed\) \|/);
  assert.match(issue.body, /\| Bluesky \| 4 \| 12 \| 3 \| 1 \| 19\.00 USD \|/);
  assert.match(issue.body, /\| Mastodon \| 2 \| 0 \| 0 \| 0 \| 0\.00 USD \|/);
  assert.match(issue.body, /\| \[Bluesky: UPB \/ new site\]\(https:\/\/bsky\.app\/p\/1\) \| upb\.edu\.co \| 9 \| 3 \| 1 \| 19\.00 USD \| \[posted\]\(https:\/\/bsky\.app\/p\/2\) \|/);
  assert.match(issue.body, /Left alone: not site 2\./);
  assert.equal(R.resultsIssue({ from: "a", to: "b", invites: { searched: 30, matched: 0 } }, { visits: 0, reviews: 0, paid: 0, usd: 0, networks: [], posts: [] }), null, "a week with nothing found and no click opens no ticket");
});

test("the results ticket is opened once a week, and again when opening it failed", async () => {
  const db = fakeDb();
  const day = E.bogotaDay(NOW);
  db.data.set("engagement_daily/" + day, { report: { searched: 4, matched: 2, drafted: 1, posted: 1, net: { bluesky: 2 } } });
  const opened = [];
  let fail = true;
  const deps = { db, now: NOW, social: async (ctx) => { assert.equal(ctx.days, 7); return social; }, openIssue: async (issue) => { if (fail) throw new Error("GitHub 502"); opened.push(issue); return { number: 2600, html_url: "https://github.com/x/2600" }; } };
  await assert.rejects(J.resultsTicket(deps), /GitHub 502/);
  assert.equal(db.data.has("engagement_issues/" + day), false, "a failed open frees the week");
  fail = false;
  const out = await J.resultsTicket(deps);
  assert.deepEqual([out.opened, out.number], [true, 2600]);
  assert.match(opened[0].body, /\| Bluesky \| 2 \| 12 \| 3 \| 1 \| 19\.00 USD \|/);
  assert.equal(db.data.get("engagement_issues/" + day).issue, 2600);
  const again = await J.resultsTicket(deps);
  assert.equal(again.opened, false);
  assert.equal(opened.length, 1);
});

test("report replies (#2470): answeredHosts names sites with a report reply waiting, approved or posted in the last 30 days", async () => {
  const day = (n) => new Date(NOW - n * 86400000).toISOString();
  const docs = [
    { campaign: "report-reply", report: { host: "upb.edu.co" }, seenAt: day(3), actions: { reply: { status: "waiting" } } },
    { campaign: "report-reply", report: { host: "upb.edu.co" }, seenAt: day(20), actions: { reply: { status: "posted", postedAt: day(1) } } },
    { campaign: "report-reply", report: { host: "gov.uk" }, seenAt: day(40), actions: { reply: { status: "approved", decidedAt: day(29) } } },
    { campaign: "report-reply", report: { host: "old.com" }, seenAt: day(31), actions: { reply: { status: "posted", postedAt: day(31) } } },
    { campaign: "report-reply", report: { host: "skip.com" }, seenAt: day(2), actions: {} },
    { campaign: "report-reply", report: { host: "gone.com" }, seenAt: day(2), actions: { reply: { status: "dropped" } } },
    { campaign: "report-reply", report: { host: "seen.com" }, seenAt: day(2), actions: { reply: { status: "replied" } } }
  ];
  const asked = [];
  const db = { collection: (name) => ({ where: (field, op, hosts) => ({ limit: () => ({ get: async () => {
    asked.push([name, field, op, hosts]);
    return { docs: docs.filter((d) => hosts.includes(d.report.host)).map((d) => ({ data: () => d })) };
  } }) }) }) };
  const hosts = ["https://www.upb.edu.co/", "gov.uk", "old.com", "skip.com", "gone.com", "seen.com", "upb.edu.co", ""];
  const out = await R.answeredHosts(db, hosts, NOW);
  assert.deepEqual([...out], [["upb.edu.co", day(1)], ["gov.uk", day(29)]]);
  assert.deepEqual(asked, [["engagement_posts", "report.host", "in", ["upb.edu.co", "gov.uk", "old.com", "skip.com", "gone.com", "seen.com"]]]);
  assert.deepEqual([...(await R.answeredHosts(db, hosts, NOW, R.ANSWERED.concat("replied"))).keys()], ["upb.edu.co", "gov.uk", "seen.com"]);
  assert.equal((await R.answeredHosts(db, [], NOW)).size, 0);
});
