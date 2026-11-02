const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const route = require("../../scripts/face-route");
const bq = require("../../scripts/buffer-queue");
const cal = require("../../scripts/social-calendar");
const ledger = require("../../scripts/social-ledger");

function batchRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "faces-"));
  const dir = path.join(root, "media/social-posts/runs-9");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "captions.json"), JSON.stringify({
    "01-a": { linkedin: "A in English", x: "A on X" },
    "02-b": { linkedin: "B en español", x: "B en X", lang: "es", textLang: "es" },
    "03-c": { linkedin: "C auf Deutsch", lang: "de", textLang: "de" },
    "04-d": { linkedin: "D in English", x: "D on X", lang: "es", i18n: { es: { linkedin: "D en español" } } }
  }));
  fs.writeFileSync(path.join(dir, "voiced.json"), JSON.stringify([["01-a", { lang: "pt", tiktok: "A em português" }]]));
  return root;
}

test("a post's language is its caption's, its clip's voice on TikTok and YouTube, or the launch set's folder", () => {
  const root = batchRoot();
  assert.equal(route.postLang("runs-9", "01-a", { x: "A" }, "x", root), "en");
  assert.equal(route.postLang("runs-9", "01-a", { x: "A" }, "tiktok", root), "pt");
  assert.equal(route.postLang("runs-9", "02-b", { lang: "es", textLang: "es" }, "linkedin", root), "es");
  assert.equal(route.postLang("runs-9", "02-b", { lang: "es", x: "English" }, "x", root), "en");
  assert.equal(route.postLang("runs-9", "02-b", { lang: "es", x: "English" }, "tiktok", root), "es");
  assert.equal(route.postLang("launch-2026-10", "fr/hub", null, "x", root), "fr");
  assert.deepEqual(["en", "de", "fr", "it", "es", "pt", "ja"].map(route.faceOf), ["en", "en", "en", "en", "es", "es", "en"]);
});

test("es/pt stay with @qalaburlreview until @qaurlreview has the network", () => {
  assert.equal(route.route("pt", new Set(["en"])), "en");
  assert.equal(route.route("pt", new Set(["en", "es"])), "es");
  assert.equal(route.route("it", new Set(["en", "es"])), "en");
  assert.equal(route.route("es", new Set()), "en");
});

test("each face reads only its own secrets", () => {
  const env = { BLUESKY_HANDLE: "qalaburlreview.bsky.social", BLUESKY_APP_PASSWORD: "en-pw", SITE: "https://x" };
  assert.equal(route.faceEnv("es", env).BLUESKY_HANDLE, undefined);
  assert.equal(route.faceEnv("es", env).SITE, "https://x");
  const both = Object.assign({ BLUESKY_HANDLE_ES: "qaurlreview.bsky.social", BLUESKY_APP_PASSWORD_ES: "es-pw" }, env);
  assert.equal(route.faceEnv("es", both).BLUESKY_APP_PASSWORD, "es-pw");
  assert.equal(route.faceEnv("en", both).BLUESKY_APP_PASSWORD, "en-pw");
  assert.equal(route.faceEnv("en", both).BLUESKY_APP_PASSWORD_ES, undefined);
});

test("Buffer channels belong to the face they name, and an unnamed one to none", () => {
  const face = (service, name) => route.channelFace({ service, name });
  assert.deepEqual([face("twitter", "qalaburlreview"), face("youtube", "QA-lab URL Review"), face("linkedin", "qalab-url-review")], ["en", "en", "en"]);
  assert.deepEqual([face("twitter", "qaurlreview"), face("youtube", "QA-lab URL Review · ES/PT"), face("linkedin", "qaurlreview")], ["es", "es", "es"]);
  assert.equal(face("tiktok", "someone-else"), null);
});

test("--reroute moves @qalaburlreview's es/pt posts to the connected Spanish channel, never back, and not when due soon", () => {
  const root = batchRoot();
  const now = Date.parse("2026-11-02T12:00:00Z");
  const later = "2026-11-10T14:00:00.000Z";
  const en = { id: "c-en", service: "linkedin", name: "qalab-url-review", face: "en" };
  const es = { id: "c-es", service: "linkedin", name: "qaurlreview", face: "es" };
  const index = new Map([["text A in English", "runs-9/01-a"], ["text B en español", "runs-9/02-b"], ["text C auf Deutsch", "runs-9/03-c"]]);
  const item = (id, text, face, dueAt = later) => ({ node: { id, status: "scheduled", dueAt, text }, slot: "linkedin", service: "linkedin", face, profile: "linkedin (" + (face === "es" ? es.name : en.name) + ")" });
  const items = [item("p1", "A in English", "en"), item("p2", "B en español", "en"), item("p3", "C auf Deutsch", "en"), item("p4", "B en español", "es"), item("p5", "B en español", "en", "2026-11-02T12:10:00.000Z")];
  const book = ledger.read(path.join(root, "none.json"));

  assert.deepEqual(bq.rerouteTargets(index, items, book, [en], now, root), []);
  const moves = bq.rerouteTargets(index, items, book, [en, es], now, root);
  assert.deepEqual(moves.map((m) => [m.item.node.id, m.to.id, m.profile]), [["p2", "c-es", "linkedin (qaurlreview)"]]);
  assert.deepEqual(bq.rerouteTargets(index, items, book, [en, Object.assign({}, es, { isQueuePaused: true })], now, root), []);
});

test("a post queued or sent from either face is on the network; a moved one is not", () => {
  const book = { posts: { "b/1": [{ channel: "x", profile: "twitter (qalaburlreview)", result: "moved" }, { channel: "x", profile: "twitter (qaurlreview)", result: "queued" }], "b/2": [{ channel: "x", profile: "twitter (qalaburlreview)", result: "moved" }] } };
  assert.equal(bq.onNetwork(book, "b/1", "x"), true);
  assert.equal(bq.onNetwork(book, "b/2", "x"), false);
  assert.equal(bq.onNetwork(book, "b/1", "linkedin"), false);
});

test("each live face plans its own days, at most its cadence a day, and the default face's plan is unchanged", () => {
  const rows = (date) => cal.NETWORKS.map((channel) => ({ date, time: "09:00", channel, asset: "feed/x.jpg" }));
  const post = (id, lane, face) => ({ id, batch: id.split("/")[0], slug: id.split("/")[1], kind: "tip", lane, face, date: "2026-11-05", hold: false, sent: false, rows: rows("2026-11-05") });
  const en = [2, 3, 4, 5, 2, 3, 4, 5].map((lane, i) => post("tips-en/0" + i, lane, "en"));
  const es = [2, 3, 4, 5, 2, 3, 4, 5].map((lane, i) => post("tips-es/0" + i, lane, "es"));
  const alone = cal.plan(en, { from: "2026-11-05" });
  const both = cal.plan(en.concat(es), { from: "2026-11-05" });
  const days = (moves, face) => moves.filter((m) => m.post.face === face).reduce((acc, m) => Object.assign(acc, { [m.day]: (acc[m.day] || 0) + 1 }), {});
  assert.deepEqual(days(both.moves, "en"), days(alone.moves, "en"));
  assert.ok(Object.values(days(both.moves, "es")).every((n) => n <= 3));
  assert.equal(both.moves.filter((m) => m.post.face === "es").length, 8);
  assert.ok([...both.days.keys()].every((key) => /^(en|es)\|/.test(key)));
});

test("post numbers read each Facebook Page with its own face's token", () => {
  const metrics = require("../../scripts/social-metrics");
  const entries = [{ post: "a/1", id: "1" }, { post: "a/2", id: "2", profile: "Facebook Page" }, { post: "a/3", id: "3", profile: "Facebook Page (qaurlreview)" }];
  assert.deepEqual(metrics.pageEntries(entries, "en").map((e) => e.id), ["1", "2"]);
  assert.deepEqual(metrics.pageEntries(entries, "es").map((e) => e.id), ["3"]);
  assert.equal(route.pageProfile("es"), "Facebook Page (qaurlreview)");
});

test("an account belongs to the face whose handle it logs in as, whichever secrets hold it", () => {
  assert.equal(route.accountFace("qalaburlreview.bsky.social"), "en");
  assert.equal(route.accountFace("qalaburlreview@mastodon.social"), "en");
  assert.equal(route.accountFace("threads.net/@qaurlreview"), "es");
  assert.equal(route.accountFace("instagram.com/qaurlreview"), "es");
  assert.equal(route.accountFace("instagram.com/someone"), null);
});

test("text posts speak their caption's language: a face posts the hub's translation, a fallback face the English", () => {
  const cap = { x: "On X", linkedin: "In English", lang: "pt", i18n: { pt: { linkedin: "Em português" }, de: { linkedin: "Auf Deutsch" } } };
  assert.equal(route.textLang(cap, "linkedin"), "pt");
  assert.equal(route.textLang(cap, "x"), "en");
  assert.equal(route.captionFor(cap, "linkedin", "es"), "Em português");
  assert.equal(route.captionLang(cap, "linkedin", "es"), "pt");
  assert.equal(route.captionFor(cap, "linkedin", "en"), "In English");
  assert.equal(route.captionLang(cap, "linkedin", "en"), "en");
  assert.equal(route.captionFor(cap, "x", "es"), "On X");
  const own = { x: "Viernes", lang: "es", textLang: "es" };
  assert.equal(route.captionFor(own, "x", "en"), "Viernes");
  assert.equal(route.captionLang(own, "x", "en"), "es");
  const de = { linkedin: "In English", lang: "de", i18n: { de: { linkedin: "Auf Deutsch" } } };
  assert.equal(route.captionFor(de, "linkedin", "en"), "Auf Deutsch");
});

test("Buffer posts each face's caption, and --reroute rewrites a moved post into the new face's language", () => {
  const root = batchRoot();
  const cap = JSON.parse(fs.readFileSync(path.join(root, "media/social-posts/runs-9/captions.json"), "utf8"))["04-d"];
  const es = { id: "c2", service: "linkedin", face: "es" };
  const en = { id: "c1", service: "linkedin", face: "en" };
  const text = (channel) => bq.inputsFor(channel, "04-d", cap, "https://x.test", "", {}, "runs-9")[0].input.text;
  assert.match(text(es), /^D en español/);
  assert.match(text(en), /^D in English/);
  assert.match(bq.translated("runs-9/04-d", "linkedin", "es", "linkedin", root), /^D en español/);
  assert.equal(bq.translated("runs-9/04-d", "linkedin", "en", "linkedin", root), null);
  assert.equal(bq.translated("runs-9/02-b", "linkedin", "es", "linkedin", root), null);
});
