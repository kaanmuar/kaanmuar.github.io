const test = require("node:test");
const assert = require("node:assert/strict");
const auth = require("../../functions/url-review-auth");
const accountData = require("../../functions/url-review-account-data");
const offers = require("../../functions/url-review-offers");
const desk = require("../../functions/url-review-desk");

const EMAIL = "ana@example.com";

async function seeded() {
  const store = auth.memoryStore();
  await store.set("url_review_accounts", EMAIL, { email: EMAIL, providers: ["google.com"], profile: { name: "Ana" }, expireAt: new Date("2027-10-22T00:00:00Z") });
  await store.set("url_review_sessions", "s".repeat(64), { email: EMAIL, deviceHash: "d".repeat(64), provider: "google.com" });
  await store.set("url_review_sign_ins", "i1", { email: EMAIL, codeHash: "c", tokenHash: "t", deviceHash: "d" });
  await store.set("url_reviews", "run1", { email: EMAIL, status: "done", url: "https://a.example/", deviceId: "abc", ip: "1.1.1.1", report: { cases: [1] } });
  await store.set("url_reviews", "run2", { email: EMAIL, status: "done", paid: true, provider: "wompi", amount: 950, currency: "USD", deviceId: "abc", report: { cases: [2] } });
  await store.set("url_reviews", "credit1", { email: EMAIL, status: "run-credit", paid: true, priceUsd: 9.5, deviceId: "abc", ip: "1.1.1.1" });
  await store.set("url_reviews", "other", { email: "bo@example.com", status: "done" });
  await store.set("url_review_notes", "n1", { email: EMAIL, status: "follow-note" });
  await store.set("url_review_notes", "n2", { email: EMAIL, status: "follow-stop" });
  await store.set("url_review_alerts", "a1", { email: EMAIL, kind: "run" });
  await store.set("url_review_stop_links", "tok", { email: EMAIL });
  await store.set("url_review_failures", "run3", { email: EMAIL, cause: "timeout" });
  await store.set("url_review_coupons", "SAVE10", { email: EMAIL, percent: 10 });
  await store.set("url_review_free_runs", EMAIL, { note: "friend" });
  await store.set("url_review_captures", "c1", { reportId: "run1", kind: "copy" });
  await store.set("url_review_captures", "c2", { reportId: "other", kind: "copy" });
  await store.set("url_review_stops", "run1", { at: "2026-10-01T00:00:00Z" });
  return store;
}

test("the export holds every row under the address and no secret", async () => {
  const store = await seeded();
  const data = await accountData.exportAccount(store, "Ana@Example.com", Date.parse("2026-10-22T00:00:00Z"));
  assert.equal(data.email, EMAIL);
  assert.equal(data.account.profile.name, "Ana");
  assert.equal(data.account.expireAt, "2027-10-22T00:00:00.000Z");
  assert.deepEqual(data.reviews.map((row) => row.id).sort(), ["credit1", "run1", "run2"]);
  assert.equal(data.notes.length, 2);
  assert.equal(data.freeAccount.note, "friend");
  assert.deepEqual(data.captures.map((row) => row.id), ["c1"]);
  assert.deepEqual(data.stops.map((row) => row.id), ["run1"]);
  const text = JSON.stringify(data);
  assert.doesNotMatch(text, /deviceHash|codeHash|tokenHash/);
  assert.doesNotMatch(text, /"tok"|s{64}/);
  assert.equal(data.sessions[0].provider, "google.com");
});

test("deleting the account removes its rows, keeps payments without the report, and keeps the stop", async () => {
  const store = await seeded();
  const dropped = [];
  const authApi = {
    users: [{ uid: "u1" }],
    async getUserByEmail() {
      if (!this.users.length) throw Object.assign(new Error("gone"), { code: "auth/user-not-found" });
      return this.users[0];
    },
    async deleteUser(uid) { dropped.push(uid); this.users.shift(); }
  };
  const counts = await accountData.deleteAccount(store, EMAIL, { authApi, now: Date.parse("2026-10-22T00:00:00Z") });
  assert.deepEqual(dropped, ["u1"]);
  assert.equal(counts.authUsers, 1);
  assert.equal(counts.paymentsKept, 2);
  assert.equal(await store.get("url_review_accounts", EMAIL), null);
  assert.equal(await store.get("url_review_free_runs", EMAIL), null);
  assert.equal(await store.get("url_reviews", "run1"), null);
  assert.equal(await store.get("url_review_captures", "c1"), null);
  assert.ok(await store.get("url_review_captures", "c2"));
  assert.equal(await store.get("url_review_stops", "run1"), null);
  assert.ok(await store.get("url_reviews", "other"));
  const paid = await store.get("url_reviews", "run2");
  assert.equal(paid.report, undefined);
  assert.equal(paid.deviceId, undefined);
  assert.equal(paid.amount, 950);
  assert.equal(paid.accountDeletedAt, "2026-10-22T00:00:00.000Z");
  const credit = await store.get("url_reviews", "credit1");
  assert.equal(credit.ip, undefined);
  assert.equal(credit.priceUsd, 9.5);
  for (const col of ["url_review_sessions", "url_review_sign_ins", "url_review_alerts", "url_review_stop_links", "url_review_failures", "url_review_coupons"]) {
    assert.deepEqual(await store.where(col, "email", EMAIL), [], col);
  }
  assert.deepEqual((await store.where("url_review_notes", "email", EMAIL)).map((row) => row.status), ["follow-stop"]);
});

test("a report paid after its run gets its own payment row, without the report", () => {
  const row = offers.reportPayment({ email: " Ana@Example.com", frameworks: ["iso"], report: { cases: [1] }, ip: "1.1.1.1" }, { reportId: "run9", provider: "wompi", amount: 950, reference: undefined });
  assert.deepEqual(row, { status: "paid-report", paid: true, purpose: "report", email: EMAIL, frameworks: ["iso"], reportId: "run9", provider: "wompi", amount: 950 });
});

test("the desk counts a paid report once, through its payment row", () => {
  const rows = [
    { id: "run9", email: EMAIL, status: "complete", paid: true, report: { cases: [] } },
    { id: "paid-report-run9", email: EMAIL, status: "paid-report", paid: true, reportId: "run9" },
    { id: "run8", email: EMAIL, status: "complete", paid: true, report: { cases: [] } }
  ];
  assert.equal(desk.snapshot(rows, [], [], [], []).tally.paid, 2);
});

test("deleting the account drops a paid run whose payment has its own row, and keeps that row", async () => {
  const store = auth.memoryStore();
  await store.set("url_reviews", "run9", { email: EMAIL, status: "complete", paid: true, provider: "wompi", report: { cases: [1] } });
  await store.set("url_reviews", "paid-report-run9", offers.reportPayment({ email: EMAIL }, { reportId: "run9", provider: "wompi", amount: 950, deviceId: "abc" }));
  const counts = await accountData.deleteAccount(store, EMAIL, { now: Date.parse("2026-10-22T00:00:00Z") });
  assert.equal(await store.get("url_reviews", "run9"), null);
  const kept = await store.get("url_reviews", "paid-report-run9");
  assert.equal(kept.reportId, "run9");
  assert.equal(kept.amount, 950);
  assert.equal(kept.deviceId, undefined);
  assert.equal(counts.paymentsKept, 1);
});

test("deleting twice leaves the kept rows as they are", async () => {
  const store = await seeded();
  await accountData.deleteAccount(store, EMAIL, { now: Date.parse("2026-10-22T00:00:00Z") });
  const counts = await accountData.deleteAccount(store, EMAIL, { now: Date.parse("2026-11-22T00:00:00Z") });
  assert.equal(counts.paymentsKept, undefined);
  assert.equal((await store.get("url_reviews", "run2")).accountDeletedAt, "2026-10-22T00:00:00.000Z");
});
