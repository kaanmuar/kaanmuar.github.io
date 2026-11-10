const test = require("node:test");
const assert = require("node:assert");
const studio = require("../../scripts/live-studio/studio");
const { extractUrl } = require("../../scripts/live-studio/comments");
const reviews = require("../../scripts/live-studio/review");

test("the live studio speaks the tips studio's single-language voices, Spanish in es-MX, woman then man", () => {
  const { voices } = studio.studioVoices();
  assert.strictEqual(voices.length, 12);
  assert.ok(voices.every((v) => !/Multilingual/i.test(v.voice)));
  assert.match(studio.pickVoice(voices, "es", "w").voice, /^es-MX-/);
  assert.match(studio.pickVoice(voices, "es", "m").voice, /^es-MX-/);
  assert.deepStrictEqual(studio.turnVoice(0), { lang: "en", gender: "w" });
  assert.deepStrictEqual(studio.turnVoice(5), { lang: "it", gender: "w" });
  assert.deepStrictEqual(studio.turnVoice(6), { lang: "en", gender: "m" });
  assert.deepStrictEqual(studio.turnVoice(12), { lang: "en", gender: "w" });
});

test("every episode frames a real Live Report and finds the finding its walk-through explains", () => {
  assert.ok(studio.EPISODES.length >= 7);
  studio.EPISODES.forEach((ep) => {
    const raw = reviews.liveReport(ep.report);
    const picked = studio.pickFinding(ep, raw.fix);
    assert.ok(picked && picked.title.toLowerCase().includes(ep.fix.pick.toLowerCase()), ep.id + " walks through " + (picked && picked.title));
    const strings = studio.episodeStrings(ep, reviews.showReport(raw, "live"), picked);
    Object.entries(strings).forEach(([key, value]) => assert.ok(!/\{\w+\}/.test(value), ep.id + "." + key + " leaves a placeholder: " + value));
    assert.strictEqual(ep.fix.steps.length, 3, ep.id);
  });
});

test("a comment names a public web address, or nothing", () => {
  assert.deepStrictEqual(extractUrl("review mine pls: mybakery.co!"), { url: "https://mybakery.co/", host: "mybakery.co" });
  assert.strictEqual(extractUrl("https://shop.example.com/sale?x=1").host, "shop.example.com");
  assert.strictEqual(extractUrl("http://www.Tienda.com.co/menu").url, "http://www.tienda.com.co/menu");
  assert.strictEqual(extractUrl("hello there, love this"), null);
  assert.strictEqual(extractUrl("http://192.168.1.1/admin"), null);
  assert.strictEqual(extractUrl("localhost:3000"), null);
  assert.strictEqual(extractUrl("router.local"), null);
  assert.strictEqual(extractUrl("https://user:pw@bank.com"), null);
});

test("streams go to the named platforms only when their URL and key are set", () => {
  const env = { TIKTOK_RTMP_URL: "rtmp://push.tiktok.example/live/", TIKTOK_RTMP_KEY: "abc", INSTAGRAM_RTMP_URL: "rtmps://edgetee.example:443/rtmp/" };
  assert.deepStrictEqual(studio.rtmpTargets(["tiktok"], env), [{ name: "tiktok", url: "rtmp://push.tiktok.example/live/abc" }]);
  assert.throws(() => studio.rtmpTargets(["instagram"], env), /INSTAGRAM_RTMP_KEY/);
  const args = studio.outputArgs("/tmp/a.mp4", studio.rtmpTargets(["tiktok"], env), 30);
  assert.ok(args.includes("tee"));
  assert.match(args[args.length - 1], /^\[f=mp4:movflags=\+faststart\]\/tmp\/a\.mp4\|\[f=flv:onfail=ignore\]rtmp:/);
  assert.deepStrictEqual(args.slice(args.indexOf("-g"), args.indexOf("-g") + 2), ["-g", "60"]);
  assert.strictEqual(studio.outputArgs("/tmp/a.mp4", [], 30).pop(), "/tmp/a.mp4");
});

test("chapters become mp4 metadata, a YouTube list and a highlight of a social clip's length", () => {
  const chapters = [["intro", 0, 12], ["run", 12, 24], ["score", 24, 32], ["findings", 32, 46], ["fix", 46, 57], ["cta", 74, 84]]
    .map(([scene, start, end]) => ({ scene, start, end, title: "Ep · " + scene, viewer: "" }));
  assert.match(studio.chapterMeta(chapters), /^;FFMETADATA1\n\[CHAPTER\]\nTIMEBASE=1\/1000\nSTART=0\nEND=12000\ntitle=Ep · intro/);
  assert.strictEqual(studio.chapterList(chapters).split("\n")[2], "0:24 Ep · score");
  assert.deepStrictEqual(studio.highlight(chapters).map((c) => c.scene), ["intro", "score", "fix", "cta"]);
  const long = chapters.map((c) => Object.assign({}, c, { end: c.start + 16 }));
  assert.deepStrictEqual(studio.highlight(long).map((c) => c.scene), ["intro", "fix", "cta"]);
});

test("the voice reads the review page's address, the caption shows it", () => {
  assert.strictEqual(studio.spoken("es", "Abre carlosandmunoz.com/qa-review ya"), "Abre carlosandmunoz.com barra QA review ya");
});
