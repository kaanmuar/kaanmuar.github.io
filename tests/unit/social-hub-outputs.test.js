const test = require("node:test");
const assert = require("node:assert/strict");
const hub = require("../../scripts/build-social-hub");
const { isOutput, guard } = require("../../scripts/social-hub-outputs");

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
