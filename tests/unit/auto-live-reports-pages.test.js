// auto-live-reports.js reads /publishable page by page (#2038): one request with every review since a stuck cursor
// ran the function out of memory, and a failed run never moved the cursor.
const test = require("node:test");
const assert = require("node:assert/strict");
const { fetchPublishable, PAGE } = require("../../scripts/auto-live-reports.js");

const page = (since, until, read, host) => ({ since, until, read, held: { thin: 1 }, unlisted: ["gone.com"], reports: [{ report: { host } }], comparisons: [] });

test("reads pages from since to until and merges them", async () => {
  const asked = [];
  const pages = { a: page("a", "b", PAGE, "one.com"), b: page("b", "c", PAGE, "two.com"), c: page("c", "d", 3, "three.com") };
  const out = await fetchPublishable("a", async (from) => { asked.push(from); return pages[from]; });
  assert.deepEqual(asked, ["a", "b", "c"]);
  assert.deepEqual([out.since, out.until, out.read, out.held.thin], ["a", "d", PAGE * 2 + 3, 3]);
  assert.deepEqual(out.reports.map((r) => r.report.host), ["one.com", "two.com", "three.com"]);
});

test("a page that fails after the first keeps what came back; a first page that fails throws", async () => {
  const out = await fetchPublishable("a", async (from) => { if (from === "b") throw new Error("publishable answered 500"); return page("a", "b", PAGE, "one.com"); });
  assert.deepEqual([out.until, out.reports.length], ["b", 1]);
  await assert.rejects(fetchPublishable("a", async () => { throw new Error("publishable answered 500"); }), /500/);
});
