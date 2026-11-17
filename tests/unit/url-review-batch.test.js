const test = require("node:test");
const assert = require("node:assert/strict");
const batch = require("../../functions/url-review-batch");
const mail = require("../../functions/url-review-batch-mail");

test("parseList accepts one URL per line and an optional url header", () => {
  const out = batch.parseList("url\nhttps://one.example/\ntwo.example\n# skip\n\nhttps://three.example/path");
  assert.equal(out.error, undefined);
  assert.equal(out.urls.length, 3);
  assert.equal(out.urls[0].lead, true);
  assert.equal(out.urls[0].host, "one.example");
  assert.equal(out.urls[1].host, "two.example");
  assert.equal(out.urls[2].url, "https://three.example/path");
});

test("parseList hard-blocks duplicates and invalid lines", () => {
  const dup = batch.parseList("https://a.example/\nhttps://www.a.example/x");
  assert.equal(dup.code, "listInvalid");
  assert.ok(dup.problems.some((row) => row.code === "duplicate"));

  const bad = batch.parseList("https://ok.example/\nnot a url here");
  assert.equal(bad.code, "listInvalid");
  assert.ok(bad.problems.some((row) => row.code === "space" || row.code === "invalid"));
});

test("parseList prepends an optional lead URL and caps at BATCH_MAX", () => {
  const led = batch.parseList("https://b.example/\nhttps://c.example/", { leadUrl: "https://lead.example/" });
  assert.equal(led.urls[0].host, "lead.example");
  assert.equal(led.urls[0].lead, true);
  assert.equal(led.urls.length, 3);

  const many = batch.parseList(["a", "b", "c", "d", "e", "f", "g"].map((h) => "https://" + h + ".example/").join("\n"));
  assert.equal(many.code, "tooMany");
  assert.equal(many.max, batch.BATCH_MAX);
});

test("creditProblem blocks a short pass", () => {
  assert.equal(batch.creditProblem(6, 3), null);
  assert.equal(batch.creditProblem(2, 3).code, "needCredits");
  assert.equal(batch.creditProblem(0, 2).code, "needCredits");
});

test("applyRow and stopBatch update status", () => {
  const saved = batch.savedRecord("a@b.co", batch.parseList("https://a.example/\nhttps://b.example/"), { frameworks: ["Playwright"], pages: 20, depth: 2 });
  const mid = batch.applyRow(saved, 0, { state: "done", reviewId: "abc", overall: 71 });
  assert.equal(mid.status, "running");
  assert.equal(mid.rows[0].overall, 71);
  const stopped = batch.stopBatch(Object.assign({}, saved, { rows: mid.rows }));
  assert.equal(stopped.status, "stopped");
  assert.equal(stopped.rows[0].state, "done");
  assert.equal(stopped.rows[1].state, "skipped");
});

test("resetStuck turns interrupted running rows back to waiting", () => {
  const saved = batch.savedRecord("a@b.co", batch.parseList("https://a.example/\nhttps://b.example/"), {});
  saved.rows[0] = Object.assign({}, saved.rows[0], { state: "running" });
  const next = batch.resetStuck(saved);
  assert.equal(next.rows[0].state, "waiting");
  assert.equal(next.rows[1].state, "waiting");
  assert.equal(next.status, "running");
  assert.equal(batch.ROW_RETRIES, 3);
});

test("batch mail covers a finished batch", () => {
  const parsed = batch.parseList("https://a.example/\nhttps://b.example/");
  const saved = batch.savedRecord("a@b.co", parsed, { name: "Ada", lang: "en" });
  saved.status = "done";
  saved.rows[0] = Object.assign({}, saved.rows[0], { state: "done", reviewId: "111", overall: 80 });
  saved.rows[1] = Object.assign({}, saved.rows[1], { state: "failed", note: "timeout" });
  const owner = mail.ownerNotice("batch1", saved, { email: "a@b.co", name: "Ada" });
  const asker = mail.askerMail("batch1", saved, { email: "a@b.co", name: "Ada" });
  assert.match(owner.subject, /Bulk review done/);
  assert.match(asker.subject, /bulk review is ready/i);
  assert.match(asker.text, /a\.example/);
  assert.match(asker.html, /batch=batch1/);
});

test("listOf keeps own batches newest first", () => {
  const docs = [
    { id: "old", email: "a@b.co", createdAt: "2026-01-01T00:00:00Z", status: "done", hosts: ["a.example"], rows: [{ state: "done" }, { state: "done" }], urls: ["https://a.example/"] },
    { id: "new", email: "a@b.co", createdAt: "2026-02-01T00:00:00Z", status: "running", hosts: ["b.example", "c.example"], rows: [{ state: "done" }, { state: "waiting" }], urls: [] },
    { id: "other", email: "x@y.co", createdAt: "2026-03-01T00:00:00Z", status: "done", hosts: ["z.example"], rows: [{ state: "done" }], urls: [] }
  ];
  const listed = batch.listOf(docs, "a@b.co");
  assert.equal(listed.length, 2);
  assert.equal(listed[0].id, "new");
  assert.equal(listed[0].done, 1);
  assert.equal(listed[0].total, 2);
  assert.deepEqual(listed[0].hosts, ["b.example", "c.example"]);
  assert.equal(listed[1].id, "old");
});
