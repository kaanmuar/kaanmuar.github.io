// Nightly pre-flight index (#2543): a touched file must not queue a delete for every window it never had,
// and one dropped connection must not fail the run.
const test = require("node:test");
const assert = require("node:assert/strict");

process.env.PREFLIGHT_TOKEN = process.env.PREFLIGHT_TOKEN || "test";
process.env.PREFLIGHT_RETRY_MS = "0";
process.env.PREFLIGHT_URL = "http://127.0.0.1:9";

const { planFile, collectChanged, post, id } = require("../../scripts/preflight-index");

const lines = (n) => Array.from({ length: n }, (_, i) => `line ${i}`).join("\n");

test("preflight index (#2543): an edit that keeps its windows deletes nothing", () => {
  const text = lines(10);
  const plan = planFile("social/a.md", text, text.replace("line 0", "line 0 edited"));
  assert.equal(plan.items.length, 1);
  assert.deepEqual(plan.deletes, []);
});

test("preflight index (#2543): a shrink deletes only the windows that went away", () => {
  const plan = planFile("scripts/a.js", lines(450), lines(10));
  assert.equal(plan.items.length, 1);
  assert.deepEqual(plan.deletes, [id("scripts/a.js:200"), id("scripts/a.js:400")]);
});

test("preflight index (#2543): a new file and a deleted file", () => {
  assert.deepEqual(planFile("scripts/new.js", null, lines(5)).deletes, []);
  const gone = planFile("scripts/old.js", lines(10), null);
  assert.equal(gone.items.length, 0);
  assert.deepEqual(gone.deletes, [id("scripts/old.js:0")]);
});

test("preflight index (#2543): a file that grows past the size cap drops the windows it used to have", () => {
  const plan = planFile("scripts/big.js", lines(10), false);
  assert.equal(plan.items.length, 0);
  assert.deepEqual(plan.deletes, [id("scripts/big.js:0")]);
});

test("preflight index (#2543): the same commit has nothing to index or delete", () => {
  const plan = collectChanged("HEAD", "HEAD");
  assert.deepEqual(plan.files, []);
  assert.deepEqual(plan.items, []);
  assert.deepEqual(plan.deletes, []);
});

test("preflight index (#2543): a dropped connection is retried, and a quota 429 is not", async () => {
  const orig = global.fetch;
  try {
    let calls = 0;
    global.fetch = async () => {
      calls += 1;
      if (calls === 1) throw Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNRESET" } });
      return { ok: true, status: 200, json: async () => ({ upserted: 2 }) };
    };
    assert.deepEqual(await post("/delete", { ids: ["a"] }), { upserted: 2 });
    assert.equal(calls, 2);

    calls = 0;
    global.fetch = async () => {
      calls += 1;
      return { ok: false, status: 429, text: async () => '{"error":"quota"}' };
    };
    await assert.rejects(post("/index", { items: [] }), (e) => e.quota && /\/index 429/.test(e.message));
    assert.equal(calls, 1);

    calls = 0;
    global.fetch = async () => {
      calls += 1;
      throw Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNRESET" } });
    };
    await assert.rejects(post("/index", { items: [] }), (e) => /fetch failed: ECONNRESET/.test(e.message) && !e.quota);
    assert.equal(calls, 3);
  } finally {
    global.fetch = orig;
  }
});
