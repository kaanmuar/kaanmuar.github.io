const test = require("node:test");
const assert = require("node:assert/strict");
const studio = require("../../functions/jarvis-studio");
const render = require("../../scripts/studio-render");

test("a Jarvis render request becomes workflow inputs, or an error to act on", () => {
  assert.deepEqual(studio.inputs({ kind: "tips", name: "evergreen", start: "2026-11-03", tips: "hsts", langs: "en", ticket: "#1981" }),
    { kind: "tips", name: "evergreen", mode: "render", start: "2026-11-03", tips: "hsts", ticket: "1981" });
  assert.deepEqual(studio.inputs({ kind: "skit", name: "friday-release", mode: "captions", langs: "en,es", tips: "x" }),
    { kind: "skit", name: "friday-release", mode: "captions", langs: "en,es" });
  assert.throws(() => studio.inputs({ kind: "video", name: "x" }), /tips or skit/);
  assert.throws(() => studio.inputs({ kind: "tips", name: "" }), /source or a skit/);
  assert.throws(() => studio.inputs({ kind: "skit", name: "friday-release", mode: "rotate" }), /nothing to rotate/);
  assert.throws(() => studio.inputs({ kind: "skit", name: "friday-release", langs: "en,ja" }), /Languages are/);
  assert.throws(() => studio.inputs({ kind: "tips", name: "evergreen", start: "11/03" }), /YYYY-MM-DD/);
});

test("the panel lists the sources the workflow accepts and each skit's takes", () => {
  const listing = ["build.js", "brands.js", "evergreen.js", "runs-auto.js", "compare.js", "translate.py", "frame.html"].map((name) => ({ type: "file", name }))
    .concat([{ type: "dir", name: "runs-3" }]);
  const names = studio.sources(listing);
  assert.deepEqual(names, ["compare", "evergreen"]);
  names.forEach((name) => assert.ok(render.isSource(name), name));
  const js = 'const SKITS = [\n  {\n    id: "friday-release",\n    lang: "en"\n  },\n  {\n    id: "new-one"\n  }\n];';
  assert.deepEqual(studio.skits(js, [{ name: "friday-release-en.mp4" }, { name: "friday-release-de.mp4" }, { name: "other-en.mp4" }]),
    [{ id: "friday-release", takes: ["en", "de"] }, { id: "new-one", takes: [] }]);
});

test("starting a render dispatches studio-render.yml on main with the checked inputs", async () => {
  const sent = [];
  const out = await studio.start(async (p, body) => { sent.push([p, body]); return {}; }, "o/r", { kind: "tips", name: "evergreen", mode: "rotate", batch: "evergreen-2026-11" });
  assert.deepEqual(sent, [["/repos/o/r/actions/workflows/studio-render.yml/dispatches", { ref: "main", inputs: { kind: "tips", name: "evergreen", mode: "rotate", batch: "evergreen-2026-11" } }]]);
  assert.match(out.note, /evergreen-2026-11-voiced release/);
  await assert.rejects(studio.start(async () => ({}), "o/r", { kind: "tips" }), /source or a skit/);
});

test("the overview survives a missing release or run list", async () => {
  const get = async (p) => {
    if (p.includes("/contents/scripts/tips-studio")) return [{ type: "file", name: "evergreen.js" }];
    if (p.includes("skits.js")) return { content: Buffer.from('  id: "friday-release",').toString("base64") };
    throw new Error("GitHub " + p + " answered 404");
  };
  assert.deepEqual(await studio.overview(get, "o/r"), { sources: ["evergreen"], skits: [{ id: "friday-release", takes: [] }], runs: [], workflow: "studio-render.yml", takes: "skit-takes" });
});
