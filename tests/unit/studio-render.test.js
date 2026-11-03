const test = require("node:test");
const assert = require("node:assert/strict");
const s = require("../../scripts/studio-render");

test("a render job takes a real source or skit and checks every field", () => {
  assert.deepEqual(s.job({ kind: "tips", name: "evergreen", start: "2026-11-03" }), { kind: "tips", name: "evergreen", mode: "render", start: "2026-11-03" });
  assert.equal(s.job({ kind: "skit", name: "friday-release", langs: "en,es" }).langs, "en,es");
  assert.throws(() => s.job({ kind: "tips", name: "build" }), /not a tips-studio source/);
  assert.throws(() => s.job({ kind: "tips", name: "runs-auto" }), /not a tips-studio source/);
  assert.throws(() => s.job({ kind: "tips", name: "../functions/index" }), /name a tips-studio source/);
  assert.throws(() => s.job({ kind: "skit", name: "no-such-skit" }), /not a skit/);
  assert.throws(() => s.job({ kind: "skit", name: "friday-release", mode: "rotate" }), /nothing to rotate/);
  assert.throws(() => s.job({ kind: "skit", name: "friday-release", langs: "en,ja" }), /langs takes/);
  assert.throws(() => s.job({ kind: "tips", name: "evergreen", langs: "en" }), /six-language cycle/);
  assert.throws(() => s.job({ kind: "tips", name: "evergreen", start: "tomorrow" }), /YYYY-MM-DD/);
  assert.throws(() => s.job({ kind: "tips", name: "evergreen", batch: "a b; rm -rf" }), /batch is/);
  assert.throws(() => s.job({ kind: "tips", name: "evergreen", ticket: "#12" }), /issue number/);
});

test("/render comments read the first /render line and only the known flags", () => {
  assert.deepEqual(s.parseCommand("Looks good.\n/render tips evergreen --start 2026-11-03 --tips a,b\nthanks"),
    { kind: "tips", name: "evergreen", start: "2026-11-03", tips: "a,b" });
  assert.deepEqual(s.parseCommand("/render skit friday-release --langs en"), { kind: "skit", name: "friday-release", langs: "en" });
  assert.equal(s.parseCommand("no command here"), null);
  assert.equal(s.parseCommand("/renderer tips x"), null);
  assert.throws(() => s.parseCommand("/render tips evergreen --force yes"), /takes --batch/);
  assert.throws(() => s.parseCommand("/render tips evergreen --start"), /each with a value/);
});

test("a push renders added sources and new skits, and only names the new posts of an edited source", () => {
  const ids = { "scripts/skits-studio/skits.js": ["friday-release"], "scripts/tips-studio/evergreen.js": ["a", "b"] };
  const now = { "scripts/skits-studio/skits.js": ["friday-release"], "scripts/tips-studio/evergreen.js": ["a", "b", "c"] };
  const changes = {
    ticket: "1981",
    files: [{ status: "A", file: "scripts/tips-studio/horror-headers.js" }, { status: "M", file: "scripts/tips-studio/evergreen.js" },
      { status: "M", file: "scripts/tips-studio/build.js" }, { status: "M", file: "scripts/skits-studio/skits.js" }],
    idsAt: (rev, file) => ids[file],
    idsNow: (file) => now[file]
  };
  const { jobs, notes } = s.planPush({ before: "abc" }, changes);
  assert.deepEqual(jobs, [{ kind: "tips", name: "horror-headers", mode: "render", ticket: "1981", by: "merge" }]);
  assert.equal(notes.length, 1);
  assert.match(notes[0], /--tips c /);
  ids["scripts/skits-studio/skits.js"] = [];
  assert.deepEqual(s.planPush({ before: "abc" }, changes).jobs.map((j) => j.kind + " " + j.name), ["tips horror-headers", "skit friday-release"]);
});

test("a clip whose peak is not above -30 dB stops the delivery", () => {
  assert.doesNotThrow(() => s.checkPeaks(["a.mp4", "b.mp4"], () => -1.2));
  assert.throws(() => s.checkPeaks(["a.mp4", "b.mp4"], (f) => (f === "b.mp4" ? -30 : -2)), /silent clips.*b\.mp4 -30 dB/);
  assert.throws(() => s.checkPeaks(["a.mp4"], () => -Infinity), /silent clips/);
});

test("a re-render keeps the language cycle a batch on main was queued with", () => {
  const voiceAt = (i, offset) => { const turn = i + offset; return s.LANGS[turn % 6] + "-" + (Math.floor(turn / 6) % 2 ? "m" : "w"); };
  assert.equal(s.offsetOf({ "01-a": { voice: "es-w" }, "02-b": { voice: "pt-w" } }), 1);
  assert.equal(s.offsetOf({ "01-own": { voice: "de-m", textLang: "de" }, "03-c": { voice: "en-w" } }), 10);
  assert.equal(s.offsetOf({}), null);
  const caps = require("../../media/social-posts/evergreen-2026-11/captions.json");
  const offset = s.offsetOf(caps);
  Object.entries(caps).filter(([, c]) => !c.textLang).forEach(([slug, c]) => assert.equal(voiceAt(Number(slug.slice(0, 2)) - 1, offset), c.voice, slug));
});

test("the PR body carries the marker publish reads back", () => {
  const j = s.job({ kind: "tips", name: "evergreen", ticket: "1990", by: "comment" });
  const body = s.prBody(j, "evergreen-2026-11", "evergreen-2026-11", ["media/social-posts/evergreen-2026-11/clip/01-hsts.mp4"]);
  assert.match(body, /Ticket: #1990\. Part of #1981\./);
  assert.match(body, /releases\/download\/evergreen-2026-11\/01-hsts\.mp4/);
  assert.match(body, /queues the batch in Buffer/);
  assert.deepEqual(s.marker(body), { kind: "tips", name: "evergreen", mode: "render", batch: "evergreen-2026-11", ticket: "1990" });
  assert.equal(s.marker("a human PR"), null);
});

test("the failure bug follows the bug format and says how to re-run", () => {
  const j = s.job({ kind: "skit", name: "friday-release", langs: "en" });
  const body = s.bugBody(j, "1981", "no take yet: es", "1. Check the takes");
  assert.match(body, /^\*\*Kind:\*\* Bug\n\*\*Area:\*\* social\n\*\*Found while:\*\* #1981\n\*\*Where it stands:\*\*/);
  assert.match(body, /## What happened[\s\S]*## Fix/);
  assert.match(body, /gh workflow run studio-render\.yml -f kind=skit -f name=friday-release -f mode=render -f langs=en/);
});

test("a refused translator's bug says how to translate by agent, not to fix code", () => {
  const j = s.job({ kind: "tips", name: "evergreen", batch: "evergreen-2026-11" });
  const body = s.bugBody(j, "1981", "translation failed; nothing was rendered (STRICT_TRANSLATE)", "");
  assert.match(body, /^\*\*Kind:\*\* Bug\n\*\*Area:\*\* social\n\*\*Found while:\*\* #1981\n\*\*Where it stands:\*\*/);
  assert.match(body, /build\.js --source evergreen --batch evergreen-2026-11 --export-strings/);
  assert.match(body, /translate\.py media\/social-posts\/evergreen-2026-11 --seed/);
  assert.match(body, /Sie and vous/);
  assert.match(body, /gh workflow run studio-render\.yml -f kind=tips -f name=evergreen -f mode=render -f batch=evergreen-2026-11/);
  assert.doesNotMatch(body, /Pre-flight plan/);
});
