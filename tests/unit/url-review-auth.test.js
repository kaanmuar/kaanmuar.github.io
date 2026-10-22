const test = require("node:test");
const assert = require("node:assert/strict");
const auth = require("../../functions/url-review-auth");
const customerMail = require("../../functions/url-review-customer-mail");

const DESKTOP = "a".repeat(64);
const PHONE = "b".repeat(64);

async function emailSession(store, deviceKey) {
  const started = await auth.startEmail(store, { email: "Ana@Example.com", deviceKey, ip: "1.1.1.1" });
  return auth.finishEmail(store, { id: started.id, code: started.code, deviceKey });
}

test("an email code typed on the device that asked opens a session for that device only", async () => {
  const store = auth.memoryStore();
  const signed = await emailSession(store, DESKTOP);
  assert.equal(signed.ok, true);
  assert.equal(signed.email, "ana@example.com");
  assert.equal((await auth.checkSession(store, { session: signed.session, deviceKey: DESKTOP })).ok, true);
  const elsewhere = await auth.checkSession(store, { session: signed.session, deviceKey: PHONE });
  assert.equal(elsewhere.ok, false);
  assert.equal(elsewhere.status, 401);
  assert.equal(elsewhere.signIn, true);
});

test("a link asked for on the desktop and opened on a phone signs no one in", async () => {
  const store = auth.memoryStore();
  const started = await auth.startEmail(store, { email: "ana@example.com", deviceKey: DESKTOP });
  const phone = await auth.finishEmail(store, { id: started.id, token: started.token, deviceKey: PHONE });
  assert.equal(phone.ok, false);
  assert.equal(phone.status, 403);
  assert.equal(phone.code, "other-device");
  assert.equal(store.cols.get("url_review_sessions"), undefined);
  const desktop = await auth.finishEmail(store, { id: started.id, token: started.token, deviceKey: DESKTOP });
  assert.equal(desktop.ok, true);
  const again = await auth.finishEmail(store, { id: started.id, token: started.token, deviceKey: DESKTOP });
  assert.equal(again.code, "expired");
});

test("a run without a session, or with a forged one, is refused", async () => {
  const store = auth.memoryStore();
  assert.equal((await auth.checkSession(store, { deviceKey: DESKTOP })).status, 401);
  assert.equal((await auth.checkSession(store, { session: "c".repeat(64), deviceKey: DESKTOP })).status, 401);
});

test("wrong codes run out, and an expired session is refused", async () => {
  const store = auth.memoryStore();
  const started = await auth.startEmail(store, { email: "ana@example.com", deviceKey: DESKTOP });
  for (let i = 0; i < auth.MAX_TRIES; i += 1) {
    const wrong = await auth.finishEmail(store, { id: started.id, code: "000000" === started.code ? "111111" : "000000", deviceKey: DESKTOP });
    assert.equal(wrong.code, "wrong-code");
  }
  assert.equal((await auth.finishEmail(store, { id: started.id, code: started.code, deviceKey: DESKTOP })).status, 429);
  const signed = await emailSession(store, DESKTOP);
  const later = Date.now() + auth.SESSION_MS + 1000;
  assert.equal((await auth.checkSession(store, { session: signed.session, deviceKey: DESKTOP, now: later })).ok, false);
});

test("sign-in emails are limited per address", async () => {
  const store = auth.memoryStore();
  for (let i = 0; i < 5; i += 1) assert.equal((await auth.startEmail(store, { email: "ana@example.com", deviceKey: DESKTOP })).ok, true);
  assert.equal((await auth.startEmail(store, { email: "ana@example.com", deviceKey: DESKTOP })).status, 429);
});

test("a provider sign-in needs an open provider and a verified email", async () => {
  const store = auth.memoryStore();
  const google = { uid: "u1", email: "ana@gmail.com", email_verified: true, firebase: { sign_in_provider: "google.com" } };
  const signed = await auth.providerSignIn(store, google, { deviceKey: DESKTOP, enabled: "email,google.com" });
  assert.equal(signed.ok, true);
  assert.equal(signed.provider, "google.com");
  const account = await store.get("url_review_accounts", "ana@gmail.com");
  assert.deepEqual(account.providers, ["google.com"]);
  assert.equal(account.plan, null);
  const closed = await auth.providerSignIn(store, Object.assign({}, google, { firebase: { sign_in_provider: "apple.com" } }), { deviceKey: DESKTOP, enabled: "email,google.com" });
  assert.equal(closed.status, 400);
  const unverified = await auth.providerSignIn(store, { uid: "u2", email: "ana@outlook.com", email_verified: false, firebase: { sign_in_provider: "microsoft.com" } }, { deviceKey: DESKTOP, enabled: "email,microsoft.com" });
  assert.equal(unverified.verifyEmail, true);
  assert.equal(unverified.email, "ana@outlook.com");
});

test("the provider list always offers email and only the providers switched on", () => {
  assert.deepEqual(auth.enabledProviders("").map((item) => item.id), ["email", "google.com"]);
  assert.deepEqual(auth.enabledProviders("google.com,apple.com,nope").map((item) => item.id), ["email", "google.com", "apple.com"]);
});

test("the sign-in email carries the code and a same-device link in every page language", () => {
  customerMail.LANGS.forEach((lang) => {
    const mail = customerMail.signInMail(lang, { id: "abc", token: "def", code: "123456" });
    assert.match(mail.subject, /123456/);
    assert.match(mail.text, /signin=abc&key=def/);
    assert.match(mail.html, /123456/);
  });
});
