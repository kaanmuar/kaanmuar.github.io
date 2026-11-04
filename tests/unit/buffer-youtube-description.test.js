const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { inputsFor, youtubeDescription } = require("../../scripts/buffer-queue");

const root = path.resolve(__dirname, "../..");

test("youtubeDescription drops < and > and leaves the rest of the sentence", () => {
  assert.equal(youtubeDescription("Keep only <li> inside <ul> and <ol>."), "Keep only li inside ul and ol.");
  assert.equal(youtubeDescription("Add <meta name=\"viewport\" content=\"width=device-width\">."), "Add meta name=\"viewport\" content=\"width=device-width\".");
  assert.equal(youtubeDescription(undefined), undefined);
  assert.equal(youtubeDescription(null), null);
  assert.equal(youtubeDescription(""), "");
});

test("the YouTube payload for 04-u-platzi-com has no angle brackets", () => {
  const captions = JSON.parse(fs.readFileSync(path.join(root, "media/social-posts/auto-2026-11-03/captions.json"), "utf8"));
  const cap = captions["04-u-platzi-com"];
  assert.match(cap.youtube, /<ul>/);
  const [made] = inputsFor(
    { id: "yt", service: "youtube", face: "en" },
    "04-u-platzi-com",
    cap,
    "https://carlosandmunoz.com/media/social-posts/auto-2026-11-03",
    "https://clips.example/auto-2026-11-03",
    {},
    "auto-2026-11-03"
  );
  assert.equal(made.slot, "youtube");
  assert.doesNotMatch(made.input.text, /[<>]/);
  assert.match(made.input.text, /ul und ol dürfen jedoch nur direkt li-, script- oder template-Elemente enthalten/);
  assert.match(made.input.text, /utm_source=youtube&utm_medium=social&utm_campaign=auto-2026-11-03$/);
  assert.equal(made.input.metadata.youtube.title, cap.youtubeTitle);
  const linkedin = inputsFor({ id: "in", service: "linkedin", face: "en" }, "04-u-platzi-com", cap, "https://site", "", {}, "auto-2026-11-03")[0];
  assert.match(linkedin.input.text, /<ul>/);
});
