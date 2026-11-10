const test = require("node:test");
const assert = require("node:assert");
const studio = require("../../scripts/live-studio/studio");
const publish = require("../../scripts/live-studio/publish");
const stock = require("../../scripts/live-studio/stock");
const { marker } = require("../../scripts/studio-render");

const play = (episode, at, viewer) => [["intro", 9], ["score", 9], ["findings", 9], ["fix", 12], ["ask", 7], ["cta", 8]].map(([scene, len], i) => {
  const start = at + [0, 9, 18, 27, 39, 46][i];
  return { scene, start, end: start + len, title: scene, line: episode + " " + scene, viewer: viewer || "", episode: undefined };
});

test("a recording of several episodes gets one highlight per episode, from the first time it played", () => {
  const chapters = play("a", 0).concat({ scene: "score", start: 54, end: 60, viewer: "ana", line: "viewer" }, play("b", 60), play("a", 120));
  const reels = studio.highlights(chapters, ["a", "b"]);
  assert.deepStrictEqual(reels.map((r) => r.episode), ["a", "b"]);
  assert.deepStrictEqual(reels[0].scenes.map((c) => c.scene), ["intro", "score", "fix", "cta"]);
  assert.ok(reels[0].scenes.every((c) => c.start < 60 && !c.viewer), "the first play of a, without the viewer's review");
  assert.strictEqual(studio.withEpisodes(chapters, ["a", "b"])[6].episode, "a", "a viewer's review belongs to the episode it interrupted");
});

test("the social-clips rule: an AI voice speaks its own single language, Carlos is an owner share", () => {
  const voices = studio.studioVoices().voices;
  assert.deepStrictEqual(publish.checkRule({ lang: "es", voice: "es-MX-DaliaNeural" }, voices), { speaker: "ai", lang: "es" });
  assert.deepStrictEqual(publish.checkRule({ lang: "ja", voice: "carlos" }, voices), { speaker: "owner", lang: "ja" });
  assert.throws(() => publish.checkRule({ lang: "fr", voice: "es-MX-DaliaNeural" }, voices), /speaks es/);
  assert.throws(() => publish.checkRule({ lang: "ja", voice: "ja-JP-NanamiNeural" }, voices), /one of en, es/);
  assert.throws(() => publish.checkRule({ lang: "en", voice: "en-US-AvaMultilingualNeural" }, voices), /multilingual/);
});

test("a highlight posts only at a social clip's length and heard above -30 dB", () => {
  assert.strictEqual(publish.unpostable({ file: "h.mp4", length: 38 }, -6), "");
  assert.match(publish.unpostable({ file: "h.mp4", length: 20 }, -6), /runs 20 s/);
  assert.match(publish.unpostable({ file: "h.mp4", length: 70 }, -6), /runs 70 s/);
  assert.match(publish.unpostable({ file: "h.mp4", length: 38 }, -31), /above -30 dB/);
  assert.match(publish.unpostable({ file: "h.mp4", length: 38 }, -Infinity), /above -30 dB/);
});

test("every caption is in the clip's language, so no network puts English on a translated clip", () => {
  for (const lang of studio.LANGS) {
    const text = publish.episodeText("hotel-high-season", lang);
    assert.ok(text.translated, lang);
    const c = publish.caption({ batch: "live-x", slug: "01-hotel-high-season-" + lang, lang, speaker: "ai", voice: "v", episode: "hotel-high-season", title: text.title, hook: text.hook, score: "79", date: "2026-11-10" });
    assert.strictEqual(c.kind, "live");
    assert.strictEqual(c.lang, lang);
    assert.strictEqual(c.textLang, lang);
    assert.ok(c.linkedin.includes(publish.PHRASES[lang].live) && c.facebook.includes(publish.PHRASES[lang].review), lang);
    assert.ok(c.instagram.includes(publish.PHRASES[lang].bio), lang);
    assert.ok(!/\*/.test(c.title), "the show's emphasis marks stay out of captions");
    assert.ok([...c.x.replace(/https:\S+/, "x".repeat(23))].length <= 280, lang + " x fits");
    assert.match(c.youtubeTitle, /#Shorts$/);
    if (lang !== "en") assert.notStrictEqual(text.title, studio.episode("hotel-high-season").title, lang + " title is translated");
  }
  assert.strictEqual(publish.caption({ batch: "b", slug: "s", lang: "pt", speaker: "owner", voice: "carlos", title: "t", hook: "h", score: "", date: "d" }).voice, "carlos");
});

test("the calendar starts each post on every network the queues read, a day apart", () => {
  const csv = publish.calendarCsv(["01-a-es", "02-b-es"], "2026-11-10").trim().split("\n");
  assert.strictEqual(csv[0], "Date,Time,Channel,Post,Asset");
  const rows = csv.slice(1).map((l) => l.split(","));
  assert.deepStrictEqual([...new Set(rows.map((r) => r[2]))].sort(), ["facebook", "instagram", "instagram-story", "linkedin", "tiktok", "x", "youtube"]);
  assert.ok(rows.filter((r) => r[3] === "02-b-es").every((r) => r[0] === "2026-11-11"));
  assert.ok(rows.filter((r) => r[2] === "tiktok").every((r) => r[4] === "clip/" + r[3] + ".mp4"));
  assert.ok(rows.filter((r) => r[2] === "instagram-story").every((r) => r[4] === "story/" + r[3] + ".jpg"));
});

test("the media stock lists every clip with where it is and where its post went", () => {
  const cut = { recording: "hotel-high-season-es-2026-11-10-01-30.mp4", episodes: ["hotel-high-season"], lang: "es", voice: "es-MX-DaliaNeural",
    clips: [{ file: "01-intro.mp4", episode: "hotel-high-season", scene: "intro", length: 9 }, { file: "highlight.mp4", episode: "hotel-high-season", scene: "highlight", length: 38 }] };
  const rows = stock.rows(cut, { recorded: "2026-11-10T01:30:00Z", peaks: { "highlight.mp4": -5 }, posts: { "highlight.mp4": "live-x/01-hotel-high-season-es" } });
  assert.deepStrictEqual(rows.map((r) => r.scene), ["intro", "highlight", "full"]);
  assert.strictEqual(rows[1].file, "hotel-high-season-es-2026-11-10-01-30-highlight.mp4");
  assert.strictEqual(rows[1].url, "https://github.com/kaanmuar/kaanmuar.github.io/releases/download/live-stock/hotel-high-season-es-2026-11-10-01-30-highlight.mp4");
  assert.deepStrictEqual([rows[1].lang, rows[1].speaker, rows[1].duration, rows[1].peak], ["es", "ai", 38, -5]);
  const manifest = stock.merge(stock.merge({ version: 1, clips: [] }, rows), [Object.assign({}, rows[0], { duration: 10 })]);
  assert.strictEqual(manifest.clips.length, 3, "a re-run replaces its rows");
  const books = { buffer: { posts: { "live-x/01-hotel-high-season-es": [{ channel: "tiktok", profile: "tiktok (QA-lab)", result: "queued" }] } }, facebook: { posts: {} } };
  assert.deepStrictEqual(stock.posted(rows[1], books).map((p) => p.channel + ":" + p.result), ["tiktok:queued"]);
  assert.deepStrictEqual(stock.posted(rows[0], books), []);
  assert.strictEqual(stock.nextLang(manifest), "pt", "the turn moves on from the last AI-voiced live");
  assert.strictEqual(stock.nextLang({ clips: manifest.clips.map((c) => Object.assign({}, c, { speaker: "owner" })) }), "en", "owner shares do not move it");
});

test("the review PR carries the studio-render marker, so merging it publishes the batch", () => {
  const body = publish.prBody({ batch: "live-x", rule: { lang: "es", speaker: "ai" }, ticket: 3173,
    posts: [{ slug: "01-hotel-high-season-es", clip: { length: 38 } }], cut: { recording: "r.mp4", voice: "es-MX-DaliaNeural", episodes: ["hotel-high-season"] } });
  assert.deepStrictEqual(marker(body), { kind: "live", name: "hotel-high-season", mode: "render", batch: "live-x", ticket: "3173" });
  assert.match(body, /releases\/download\/live-x\/01-hotel-high-season-es\.mp4/);
});

test("a live that showed a trial code is cut evergreen: its ticker covered, each call to action re-rendered, a viewer's left out (#3254)", () => {
  const cut = require("../../scripts/live-studio/cut");
  const fs = require("fs");
  const os = require("os");
  const path = require("path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cut-3254-"));
  const meta = { trial: "TRY-ABC234", lang: "es", voice: "es-MX-DaliaNeural", episodes: ["link-in-bio"] };
  assert.strictEqual(cut.evergreen(Object.assign({}, meta, { trial: "" }), dir, () => assert.fail("no render without a code")), null);
  const calls = [];
  const render = (m, out) => {
    calls.push(out);
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, "evergreen.json"), JSON.stringify({ lang: "es", voice: m.voice, ticker: "ticker.mp4", cta: { "link-in-bio": { file: "link-in-bio-cta.mp4", dur: 11.5, line: "Escanea…" } } }));
  };
  const ever = cut.evergreen(meta, dir, render);
  assert.strictEqual(ever.ticker, path.join(dir, "evergreen", "ticker.mp4"));
  assert.strictEqual(cut.evergreen(meta, dir, render).cta["link-in-bio"].dur, 11.5);
  assert.strictEqual(calls.length, 1, "a matching render is reused");
  assert.throws(() => cut.evergreen(Object.assign({}, meta, { episodes: ["link-in-bio", "bank-login-a11y"] }), dir, render), /every episode/);

  const intro = { scene: "intro", episode: "link-in-bio", start: 0, end: 8, line: "Hola" };
  const cta = { scene: "cta", episode: "link-in-bio", start: 70, end: 80, line: "TRY-ABC234" };
  assert.deepStrictEqual(cut.piece(intro, ever), { start: 0, len: 8, line: "Hola", ticker: ever.ticker });
  assert.deepStrictEqual(cut.piece(cta, ever), { file: ever.cta["link-in-bio"].file, len: 11.5, line: "Escanea…" });
  assert.strictEqual(cut.piece(Object.assign({}, cta, { viewer: "ana" }), ever), null);
  assert.strictEqual(cut.piece(cta, { ticker: ever.ticker, cta: {} }), null, "Carlos's call to action has no evergreen render");
  assert.deepStrictEqual(cut.piece(cta, null), { start: 70, len: 10, line: "TRY-ABC234" });

  const args = cut.joinArgs([cut.piece(intro, ever), cut.piece(cta, ever)], "rec.mp4");
  assert.deepStrictEqual(args.slice(0, 12), ["-ss", "0.000", "-t", "8.000", "-i", "rec.mp4", "-stream_loop", "-1", "-i", ever.ticker, "-t", "11.500"]);
  const graph = args[args.indexOf("-filter_complex") + 1];
  assert.match(graph, new RegExp("\\[0:v\\]\\[1:v\\]overlay=0:" + studio.TICKER.y + ":shortest=1"));
  assert.match(graph, /\[2:v\]setpts=PTS-STARTPTS\[v1\]/);
  assert.match(graph, /\[v0\]\[a0\]\[v1\]\[a1\]concat=n=2:v=1:a=1\[v\]\[a\]$/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("publish posts no clip of a live that still shows its trial code, and keeps its chaptered recording out of the stock", () => {
  const meta = { trial: "TRY-ABC234" };
  assert.strictEqual(publish.stale({ trial: "" }, { clips: [{}] }), "");
  assert.match(publish.stale(meta, { clips: [{ file: "highlight.mp4" }] }), /not evergreen/);
  assert.match(publish.stale(meta, { evergreen: true, clips: [{ evergreen: true }, { file: "x" }] }), /not evergreen/);
  assert.strictEqual(publish.stale(meta, { evergreen: true, clips: [{ evergreen: true }] }), "");
  const c = { recording: "live-es.mp4", episodes: ["link-in-bio"], lang: "es", voice: "es-MX-DaliaNeural", clips: [{ file: "highlight.mp4", scene: "highlight", length: 40 }] };
  assert.ok(stock.rows(c, {}).some((r) => r.scene === "full"));
  assert.ok(!stock.rows(Object.assign({ trial: "TRY-ABC234" }, c), {}).some((r) => r.scene === "full"));
});

test("the evergreen call to action and ticker speak every language without a code (#3254)", () => {
  const i18n = require("../../scripts/live-studio/i18n/i18n.json");
  assert.ok(!/TRY-|tomorrow/.test(studio.UI.evergreen + require("../../scripts/live-studio/episodes").LINES.ctaEvergreen));
  studio.LANGS.filter((l) => l !== "en").forEach((lang) => {
    assert.ok(i18n.ui[lang].evergreen, lang);
    studio.EPISODES.forEach((ep) => assert.match(i18n.clips[ep.id + "-" + lang].say_cta_evergreen, /carlosandmunoz\.com\/qa-review/));
  });
});
