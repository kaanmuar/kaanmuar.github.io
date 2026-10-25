const test = require("node:test");
const assert = require("node:assert/strict");
const { LANGS, UI, SKITS, promptFor, pageFor } = require("../../scripts/skits-studio/skits");

test("every skit is written in all six languages, with three lines, a scene tag and post copy", () => {
  assert.deepEqual(LANGS, ["en", "es", "pt", "de", "fr", "it"]);
  SKITS.forEach((skit) => {
    assert.deepEqual(Object.keys(skit.lang).sort(), LANGS.slice().sort(), skit.id);
    LANGS.forEach((lang) => {
      const t = skit.lang[lang];
      assert.equal(t.lines.length, 3, skit.id + " " + lang);
      ["room", "a", "b", "scene", "found", "finding", "title", "body", "cta", "alt"].forEach((key) => assert.ok(t[key], skit.id + " " + lang + " " + key));
      assert.ok(t.title.length <= 100, skit.id + " " + lang + " title fits a YouTube title");
      if (t.crop) t.crop.forEach((n) => assert.ok(n >= 0 && n <= 1));
    });
  });
  LANGS.forEach((lang) => ["end", "endNote", "window", "play", "bio"].forEach((key) => assert.ok(UI[lang][key], lang + " " + key)));
});

test("a prompt carries the take's own lines and language and never names a tripod", () => {
  SKITS.forEach((skit) => LANGS.forEach((lang) => {
    const prompt = promptFor(skit, lang);
    skit.lang[lang].lines.forEach((line) => assert.ok(prompt.includes('"' + line + '"'), lang + ": " + line));
    assert.match(prompt, /16:9/);
    assert.doesNotMatch(prompt, /tripod/i);
  }));
  assert.equal(pageFor("en"), "https://carlosandmunoz.com/qa-review.html");
  assert.equal(pageFor("de"), "https://carlosandmunoz.com/qa-review-de.html");
});
