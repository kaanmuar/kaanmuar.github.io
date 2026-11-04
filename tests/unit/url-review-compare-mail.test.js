/**
 * The owner notice for a comparison: who compared, the scores, the problems, and market presence.
 *
 *   npm run test:review
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const compare = require("../../functions/url-review-compare");
const multi = require("../../functions/url-review-multi");
const mail = require("../../functions/url-review-compare-mail");
const owner = require("../../functions/owner-mail");

const own = require(path.join(__dirname, "fixtures", "review-wordpress.json"));
const rival = require(path.join(__dirname, "fixtures", "review-excalidraw.json"));
const email = "ana@example.org";

function record(report, extra) {
  return Object.assign({
    id: report.id,
    email,
    name: "Ana Ruiz",
    status: "complete",
    createdAt: "2026-10-19T07:50:51.800Z",
    report
  }, extra);
}

function values(notice) {
  return notice.rows.map((row) => (row.heading ? row.heading : row.label + ": " + row.value)).join("\n");
}

test("a finished competitor comparison is mailed with the scores, problems, and market presence", () => {
  const cmp = compare.compareSites(Object.assign({ id: own.id }, own), rival);
  const notice = mail.runNotice(record(Object.assign({}, rival, { compare: cmp }), {
    paid: true,
    city: "Medellín",
    country: "CO",
    frameworks: ["Playwright"],
    pages: 20,
    depth: 2,
    reason: "See how the competitor compares",
    requestedUrl: "https://excalidraw.com/"
  }));
  assert.match(notice.subject, /wordpress\.org vs excalidraw\.com/);
  assert.match(notice.subject, new RegExp(cmp.overall.own + "–" + cmp.overall.rival));
  assert.match(notice.intro, /Ana Ruiz \(ana@example.org\) compared wordpress.org with excalidraw.com/);
  const body = values(notice);
  assert.match(body, /Health score: wordpress.org \d+\/100 · excalidraw.com \d+\/100/);
  assert.ok(body.includes(cmp.rivalOnly[0].title));
  if (cmp.ownOnlyCount) assert.match(body, /Problems only wordpress.org has/);
  if (cmp.shared) assert.match(body, /Problems both have/);
  assert.match(body, /Market presence/);
  assert.match(body, /Tranco|presence /);
  assert.match(body, /Playwright/);
  assert.match(body, /Medellín, CO/);
  assert.match(notice.respondUrl, /report=1da3e97435771b0a24&vs=d82f8cb45ec6484174/);
  const laid = owner.ownerMail(notice);
  assert.match(laid.text, /Respond: https:\/\/carlosandmunoz.com\/qa-review.html\?report=/);
  assert.match(laid.html, /Open the comparison/);
});

test("an account comparison includes a site that could not be compared, and nothing is mailed for a refused one", () => {
  const records = [record(own), record(rival)];
  const open = compare.savedComparison(records, email, [own.id, rival.id], () => true);
  const notice = mail.accountNotice(open, { email, name: "Ana Ruiz" });
  assert.match(notice.subject, /wordpress\.org vs excalidraw\.com/);
  assert.match(values(notice), /Started from: Account page/);
  assert.match(notice.respondUrl, /&vs=/);

  const locked = compare.savedComparison(records, email, [own.id, rival.id], (row) => row.id === own.id);
  const held = mail.accountNotice(locked, { email, name: "Ana Ruiz" });
  assert.match(values(held), /not open in full yet/);
  assert.equal(held.buttonLabel, "Open the base report");

  assert.equal(mail.accountNotice({ error: "Pick at least two of your reviews to compare." }, { email }), null);
  assert.equal(mail.runNotice(record(rival)), null);
});

test("a saved comparison lists every indicator and the problems, and names reports that are not paid", () => {
  const records = [record(own), record(rival)];
  const picked = multi.pickProblem(records, email, [own.id, rival.id]);
  const saved = multi.savedRecord(email, picked, "review", Date.parse("2026-10-20T15:04:00Z"));
  const notice = mail.savedNotice("cmp123", saved, records, { email, open: new Set([own.id]) });
  assert.match(notice.subject, /^Comparison saved: wordpress\.org vs excalidraw\.com, \d+–\d+/);
  assert.match(notice.intro, /saved a comparison of wordpress.org, excalidraw.com/);
  assert.match(notice.respondUrl, /comparison=cmp123/);
  const body = values(notice);
  assert.match(body, /Started from: Review page/);
  assert.match(body, /Reports not paid: excalidraw.com/);
  assert.match(body, /Side by side/);
  assert.match(body, /Health score: wordpress.org \d+\/100 · excalidraw.com \d+\/100/);
  assert.match(body, /Problems only excalidraw.com has/);
  assert.match(body, /Compared at: 2026-10-20 15:04 UTC/);
  assert.equal(mail.savedNotice("cmp123", { ids: [own.id] }, records, { email }), null);
});
