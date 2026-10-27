const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const FILE = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "tags-")), "trending.json");
const today = new Date().toISOString().slice(0, 10);
fs.writeFileSync(FILE, JSON.stringify({ date: today, tags: [
  { tag: "CyberSecurity", topic: "Security", score: 3 }, { tag: "AIAgents", topic: "AI", score: 2 }, { tag: "Docker", topic: "Stack", score: 9 }
] }));
process.env.TRENDING_TAGS = FILE;

const { tagsFor, LIMITS, BRAND } = require("../../scripts/social-tags.js");
const { matches } = require("../../scripts/trending-tags.js");

const hsts = { id: "hsts", cat: "Security", tags: ["WebSecurity", "HTTPS", "DevOps"] };

test("every network stays within its tag limit, ends with the brand tag, and repeats nothing", () => {
  for (const network of Object.keys(LIMITS)) {
    for (const lang of ["en", "es", "pt", "de", "fr", "it"]) {
      const tags = tagsFor(hsts, network, lang);
      assert.ok(tags.length <= LIMITS[network], network + " " + tags.join(" "));
      assert.equal(tags[tags.length - 1], BRAND);
      assert.equal(new Set(tags.map((t) => t.toLowerCase())).size, tags.length, tags.join(" "));
      assert.ok(tags.every((t) => /^#[\p{L}\p{N}]+$/u.test(t)), tags.join(" "));
    }
  }
});

test("the post's own main tag leads, and Instagram keeps to five", () => {
  const tags = tagsFor(hsts, "instagram", "en");
  assert.equal(tags[0], "#WebSecurity");
  assert.equal(tags.length, 5);
});

test("a trending tag on the post's topic is used; one outside our topics never is", () => {
  const all = Object.keys(LIMITS).flatMap((n) => tagsFor(hsts, n, "en"));
  assert.ok(all.includes("#CyberSecurity"));
  assert.ok(!all.includes("#Docker"));
});

test("clips in another language carry tags in that language", () => {
  assert.ok(tagsFor(hsts, "tiktok", "es").includes("#Ciberseguridad"));
  assert.ok(tagsFor(hsts, "youtube", "de").includes("#Cybersicherheit"));
  assert.ok(!tagsFor(hsts, "linkedin", "en").includes("#Ciberseguridad"));
});

test("a review clip's TikTok caption calls to action in the clip's language", () => {
  process.env.AUTO_BATCH = path.join(path.dirname(FILE), "no-batch.json");
  const { captions, OWN_LINE } = require("../../scripts/tips-studio/runs-auto.js");
  const run = { id: "r1", scope: "Requested", title: ["A *title*"], body: "Body.", action: "Lesson.", analyzed: "24 Oct 2026", tags: ["QA"], cat: "Requested" };
  assert.match(captions(run).tiktok, /Review your own site: https:\/\/\S+\/qa-review\.html /);
  for (const lang of ["es", "pt", "de", "fr", "it"]) {
    const tiktok = captions(Object.assign({}, run, { lang })).tiktok;
    assert.ok(tiktok.includes(OWN_LINE[lang] + ": "), lang);
    assert.ok(tiktok.includes("/qa-review-" + lang + ".html "), lang);
    assert.ok(!tiktok.includes(OWN_LINE.en), lang);
  }
});

test("trending tags older than three days are ignored", () => {
  const stale = path.join(path.dirname(FILE), "stale.json");
  fs.writeFileSync(stale, JSON.stringify({ date: "2020-01-01", tags: [{ tag: "StaleTrendOnly", topic: "Security", score: 3 }] }));
  const out = execFileSync(process.execPath, ["-e", "console.log(JSON.stringify(require('./scripts/social-tags.js').tagsFor(" + JSON.stringify(hsts) + ", 'tiktok', 'en')))"],
    { cwd: path.resolve(__dirname, "../.."), env: Object.assign({}, process.env, { TRENDING_TAGS: stale }), encoding: "utf8" });
  assert.ok(!JSON.parse(out).includes("#StaleTrendOnly"));
});

test("trends only count when they are about our field and not about sensitive news", () => {
  const counts = matches(["ChatGPT down for millions", "Avengers Doomsday trailer", "Vincent Kompany", "Ransomware gang killed in raid", "Chrome ships a new CSS feature"], false);
  assert.deepEqual(Object.keys(counts).sort(), ["CSS", "ChatGPT", "Chrome"]);
  assert.ok(!matches(["agents"], false).AIAgents, "ambiguous words count only from tech sources");
  assert.ok(matches(["agents"], true).AIAgents);
});
