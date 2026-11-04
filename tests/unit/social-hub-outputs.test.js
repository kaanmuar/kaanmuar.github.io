const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const hub = require("../../scripts/build-social-hub");
const { isOutput, keep, guard, discard } = require("../../scripts/social-hub-outputs");

const post = (over) => Object.assign({
  id: "auto-2026-10-22/01-u-uber-com", kind: "review", batch: "auto-2026-10-22", date: "2026-10-22", lang: "en",
  title: "uber.com: 66.", text: "Give every page a title.", image: "media/social-posts/auto-2026-10-22/feed/01-u-uber-com.jpg",
  thumb: hub.thumbFor("auto-2026-10-22/01-u-uber-com"), alt: "Card", captions: {}
}, over);

test("every file the hub builder writes is one the pull request guard keeps out of PRs", () => {
  const posts = [post(), post({ id: "evergreen-2026-11/es/02-tip", batch: "evergreen-2026-11", lang: "es", thumb: hub.thumbFor("evergreen-2026-11/es/02-tip") })];
  const files = Object.keys(hub.outputs(posts, "2026-11-02")).concat(posts.map((p) => p.thumb));
  assert.ok(files.length > 20);
  assert.deepEqual(files.filter((file) => !isOutput(file)), []);
});

test("the hub's sources, ledgers and other site files are not outputs", () => {
  [
    "media/social-posts/auto-2026-10-22/captions.json", "assets/social/buffer.json", "assets/social/facebook.json",
    "assets/social/open-social.json", "assets/social/edits.json", "assets/social/youtube.json", "assets/social/metrics.json",
    "assets/social/trends.json", "assets/social/sweep-roundup/2026-11-02.jpg", "scripts/build-social-hub.js",
    "js/social-hub-card.js", "qa-review.html", "qa-review-social.css", "social.html"
  ].forEach((file) => assert.equal(isOutput(file), false, file));
});

test("the guard fails a change that commits hub outputs and passes one that does not", () => {
  const errors = [];
  const { error, log } = console;
  console.error = (text) => errors.push(text);
  console.log = () => {};
  try {
    assert.equal(guard(["scripts/build-social-hub.js", "media/social-posts/x/captions.json"]), 0);
    assert.equal(guard(["scripts/build-social-hub.js", "assets/social/feed-es.json", "social/x/01.html"]), 1);
  } finally {
    Object.assign(console, { error, log });
  }
  assert.match(errors.join("\n"), /assets\/social\/feed-es\.json[\s\S]*social\/x\/01\.html[\s\S]*--restore/);
});

test("keep drops generated hub files and leaves the pages a branch may commit", () => {
  assert.deepEqual(keep(["index.html", "social/a.html", "assets/social/feed.json", "style.css", "sitemap-social.xml"]), ["index.html", "style.css"]);
});

test("discard puts uncommitted hub files back and leaves the other edits", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hub-discard-"));
  const git = (...args) => execFileSync("git", args, { cwd: dir, encoding: "utf8" });
  git("init", "-q");
  git("config", "user.email", "test@example.com");
  git("config", "user.name", "test");
  fs.mkdirSync(path.join(dir, "social"), { recursive: true });
  fs.mkdirSync(path.join(dir, "assets", "social"), { recursive: true });
  fs.writeFileSync(path.join(dir, "index.html"), "<p>home</p>\n");
  fs.writeFileSync(path.join(dir, "social", "a.html"), "<p>hub</p>\n");
  fs.writeFileSync(path.join(dir, "assets", "social", "feed.json"), "{}\n");
  git("add", "-A");
  git("commit", "-q", "-m", "base");
  fs.writeFileSync(path.join(dir, "index.html"), "<p>home edited</p>\n");
  fs.writeFileSync(path.join(dir, "social", "a.html"), "<p>hub edited</p>\n");
  fs.writeFileSync(path.join(dir, "social", "b.html"), "<p>new hub page</p>\n");
  fs.writeFileSync(path.join(dir, "assets", "social", "feed.json"), "{\"n\":1}\n");
  fs.writeFileSync(path.join(dir, "assets", "social", "captions.json"), "{}\n");
  git("add", "assets/social/captions.json");
  const logs = [];
  const { log } = console;
  console.log = (text) => logs.push(text);
  try {
    assert.equal(discard(dir), 4);
  } finally {
    console.log = log;
  }
  assert.equal(fs.readFileSync(path.join(dir, "social", "a.html"), "utf8"), "<p>hub</p>\n");
  assert.equal(fs.readFileSync(path.join(dir, "assets", "social", "feed.json"), "utf8"), "{}\n");
  assert.equal(fs.existsSync(path.join(dir, "social", "b.html")), false);
  assert.equal(fs.existsSync(path.join(dir, "assets", "social", "captions.json")), false);
  assert.equal(fs.readFileSync(path.join(dir, "index.html"), "utf8"), "<p>home edited</p>\n");
  assert.equal(git("status", "--porcelain").replace(/\n$/, ""), " M index.html");
  assert.match(logs.join("\n"), /Discarded 4 generated social hub files/);
  fs.rmSync(dir, { recursive: true, force: true });
});
