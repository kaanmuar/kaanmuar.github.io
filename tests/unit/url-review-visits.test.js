const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const auth = require("../../functions/url-review-auth");
const visits = require("../../functions/url-review-visits");
const accountData = require("../../functions/url-review-account-data");

const DESKTOP = "a".repeat(64);
const PHONE = "b".repeat(64);
const T0 = Date.parse("2026-11-01T15:00:00Z");
const S = 1000;

async function signedIn(store, deviceKey) {
  const started = await auth.startEmail(store, { email: "ana@example.com", deviceKey, ip: "1.1.1.1", now: T0 - 60 * S });
  return auth.finishEmail(store, { id: started.id, code: started.code, deviceKey, now: T0 - 60 * S });
}

const ping = (store, session, kind, at, extra) => visits.note(store, Object.assign({ session, deviceKey: DESKTOP, kind, page: "/qa-review-es.html", lang: "es", now: at }, extra));
const rows = (store) => [...store.cols.get(visits.COLLECTION).entries()].map(([id, row]) => Object.assign({ id }, row));

test("a view opens a visit on the account; beats add the visible time, capped between pings", async () => {
  const store = auth.memoryStore();
  const { session } = await signedIn(store, DESKTOP);
  const first = await ping(store, session, "view", T0);
  assert.equal(first.ok, true);
  assert.equal(first.fresh, true);
  await ping(store, session, "beat", T0 + 30 * S);
  await ping(store, session, "beat", T0 + 60 * S);
  await ping(store, session, "view", T0 + 70 * S, { page: "https://carlosandmunoz.com/qa-review-account.html?x=1" });
  await ping(store, session, "beat", T0 + 10 * 60 * S);
  const [visit] = rows(store);
  assert.equal(rows(store).length, 1);
  assert.equal(visit.email, "ana@example.com");
  assert.equal(visit.activeMs, 60 * S + visits.STEP_MS);
  assert.equal(visit.views, 2);
  assert.deepEqual(visit.pages, ["qa-review-es.html", "qa-review-account.html"]);
  assert.equal(visit.entry, "qa-review-es.html");
  assert.equal(visit.lang, "es");
  assert.equal(visit.startedAt, new Date(T0).toISOString());
  assert.equal(visit.lastAt, new Date(T0 + 10 * 60 * S).toISOString());
  assert.equal(visit.expireAt.getTime(), T0 + visits.KEEP_MS);
});

test("time out of sight counts nothing: a hide counts up to it, a show restarts the clock", async () => {
  const store = auth.memoryStore();
  const { session } = await signedIn(store, DESKTOP);
  await ping(store, session, "view", T0);
  await ping(store, session, "hide", T0 + 20 * S);
  await ping(store, session, "show", T0 + 20 * 60 * S);
  await ping(store, session, "beat", T0 + 20 * 60 * S + 30 * S);
  assert.equal(rows(store)[0].activeMs, 50 * S);
});

test("after 30 minutes without a ping the next one opens a new visit, which is a return", async () => {
  const store = auth.memoryStore();
  const { session } = await signedIn(store, DESKTOP);
  await ping(store, session, "view", T0);
  await ping(store, session, "hide", T0 + 10 * S);
  const back = await ping(store, session, "show", T0 + 10 * S + visits.GAP_MS);
  assert.equal(back.fresh, true);
  assert.equal(rows(store).length, 2);
  assert.equal(rows(store).find((v) => v.id === back.visitId).views, 0);
});

test("no sign-in, an expired one, or another device's key records nothing", async () => {
  const store = auth.memoryStore();
  const { session } = await signedIn(store, DESKTOP);
  assert.equal((await visits.note(store, { kind: "view", deviceKey: DESKTOP, now: T0 })).status, 401);
  assert.equal((await visits.note(store, { session, deviceKey: PHONE, kind: "view", now: T0 })).status, 401);
  assert.equal((await visits.note(store, { session, deviceKey: DESKTOP, kind: "view", now: T0 + auth.SESSION_MS })).status, 401);
  assert.equal(store.cols.has(visits.COLLECTION), false);
});

test("only review page names are kept", () => {
  assert.equal(visits.cleanPage("/qa-review-pay-pt.html"), "qa-review-pay-pt.html");
  assert.equal(visits.cleanPage("qa-review.html#top"), "qa-review.html");
  assert.equal(visits.cleanPage("/index.html"), "");
  assert.equal(visits.cleanPage("/qa-review.html/<script>"), "");
});

test("the account export carries the visits and deleting the account removes them", async () => {
  const store = auth.memoryStore();
  const { session } = await signedIn(store, DESKTOP);
  await ping(store, session, "view", T0);
  const data = await accountData.exportAccount(store, "ana@example.com", T0);
  assert.equal(data.visits.length, 1);
  await accountData.deleteAccount(store, "ana@example.com", { now: T0 });
  assert.equal(rows(store).length, 0);
});

test("every URL Review page loads the visit script, which sends nothing without a sign-in", () => {
  const root = path.join(__dirname, "../..");
  const pages = fs.readdirSync(root).filter((f) => /^qa-review.*\.html$/.test(f));
  assert.ok(pages.length >= 21);
  for (const page of pages) assert.match(fs.readFileSync(path.join(root, page), "utf8"), /<script src="js\/qa-review-visit\.js\?v=[^"]+" defer><\/script>/, page);
  const script = fs.readFileSync(path.join(root, "js/qa-review-visit.js"), "utf8");
  assert.match(script, /if \(stopped \|\| !saved \|\| !saved\.session/);
});
