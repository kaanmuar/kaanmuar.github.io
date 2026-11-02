const test = require("node:test");
const assert = require("node:assert/strict");
const { line, notes } = require("../../scripts/jarvis-whats-new.js");

test("a PR title loses its area prefix and ticket refs and starts with a capital (#2169)", () => {
  assert.equal(line("Jarvis: settles the outreach leads by itself (#2016) (#2030)"), "Settles the outreach leads by itself");
  assert.equal(line("Android 2.5.0: fits foldables (kaanmuar/kaanmuar.github.io#2140) (#25)"), "Fits foldables");
  assert.equal(line("Jarvis Marketing: every cold email (#2017)"), "Jarvis Marketing: every cold email");
  assert.equal(line("Jarvis: (#1)"), "");
});

test("merges, pipeline changes and repeats are left out (#2169)", () => {
  const out = notes(["Merge branch 'main'", "CI: cache Gradle (#1)", "Windows workflow: Node 24 (#2)", "Jarvis: calls tab (#3)", "Jarvis: calls tab (#4)", ""]);
  assert.deepEqual(out, ["Calls tab"]);
  assert.deepEqual(notes([]), []);
});

test("a long release keeps the newest five and folds the rest into one line (#2169)", () => {
  const out = notes(["a", "b", "c", "d", "e", "f", "g", "h"].map((s) => `Jarvis: ${s} (#1)`));
  assert.deepEqual(out, ["A", "B", "C", "D", "E", "And 3 smaller changes."]);
  assert.equal(notes(["a", "b", "c", "d", "e", "f"]).length, 6);
});
