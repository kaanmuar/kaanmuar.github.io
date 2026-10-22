const test = require("node:test");
const assert = require("node:assert/strict");
const auth = require("../../functions/url-review-auth");
const oauth = require("../../functions/url-review-oauth");
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
  const x = await auth.providerSignIn(store, { uid: "u3", email: "ana@proton.me", email_verified: false, firebase: { sign_in_provider: "twitter.com" } }, { deviceKey: DESKTOP, enabled: "email,twitter.com" });
  assert.equal(x.verifyEmail, true);
  assert.equal(x.provider, "twitter.com");
  assert.equal(unverified.email, "ana@outlook.com");
});

test("a Google sign-in keeps the profile on the account, and trusts only what it can check", async () => {
  const store = auth.memoryStore();
  const decoded = { uid: "u1", email: "ana@acme.com", email_verified: true, name: "Ana Ruiz", picture: "https://lh3.googleusercontent.com/a/x", firebase: { sign_in_provider: "google.com" } };
  const signed = await auth.providerSignIn(store, decoded, {
    deviceKey: DESKTOP,
    enabled: "google.com",
    profile: { givenName: "Ana", familyName: "Ruiz<script>", locale: "es-419", workspaceDomain: "acme.com" }
  });
  assert.equal(signed.name, "Ana Ruiz");
  assert.equal(signed.picture, "https://lh3.googleusercontent.com/a/x");
  const account = await store.get("url_review_accounts", "ana@acme.com");
  assert.deepEqual(account.profile, { name: "Ana Ruiz", givenName: "Ana", familyName: "Ruizscript", picture: "https://lh3.googleusercontent.com/a/x", locale: "es-419", workspaceDomain: "acme.com" });
  const other = await auth.providerSignIn(store, Object.assign({}, decoded, { email: "ana@gmail.com", picture: "javascript:alert(1)" }), {
    deviceKey: DESKTOP,
    enabled: "google.com",
    profile: { workspaceDomain: "acme.com", locale: "not a locale" }
  });
  assert.equal(other.picture, "");
  assert.deepEqual((await store.get("url_review_accounts", "ana@gmail.com")).profile, { name: "Ana Ruiz" });
  const byEmail = await emailSession(store, DESKTOP);
  assert.equal(byEmail.name, "");
});

test("a Google sign-in keeps the People profile the server fetched for that same account", async () => {
  const store = auth.memoryStore();
  const decoded = { uid: "u1", email: "ana@gmail.com", email_verified: true, name: "Ana Ruiz", firebase: { sign_in_provider: "google.com", identities: { "google.com": ["1234567890"] } } };
  const person = {
    resourceName: "people/1234567890",
    emailAddresses: [{ value: "ana@gmail.com" }, { value: "Ana@Acme.com" }, { value: "ana@gmail.com" }],
    birthdays: [{ text: "x" }, { date: { year: 1990, month: 5, day: 7 } }],
    genders: [{ value: "female" }],
    phoneNumbers: [{ value: "300 123 4567", canonicalForm: "+573001234567" }],
    addresses: [{ type: "home", formattedValue: "Cra 7 #1-2\nBogotá", city: "Bogotá", countryCode: "co" }, { type: "work" }],
    organizations: [{ name: "Acme", title: "QA Lead<b>" }]
  };
  const asked = [];
  const fetch = async (url, init) => {
    asked.push({ url, auth: init.headers.authorization });
    return { ok: true, json: async () => person };
  };
  const token = "ya29.a0AfH6SMBx-test_token-value";
  await auth.providerSignIn(store, decoded, { deviceKey: DESKTOP, enabled: "google.com", googleAccessToken: token, fetch });
  assert.equal(asked.length, 1);
  assert.match(asked[0].url, /^https:\/\/people\.googleapis\.com\/v1\/people\/me\?personFields=.*birthdays/);
  assert.equal(asked[0].auth, "Bearer " + token);
  const account = await store.get("url_review_accounts", "ana@gmail.com");
  assert.deepEqual(account.profile, {
    name: "Ana Ruiz",
    emails: ["ana@gmail.com", "ana@acme.com"],
    birthday: "1990-05-07",
    gender: "female",
    phones: ["+573001234567"],
    addresses: [{ type: "home", formatted: "Cra 7 #1-2, Bogotá", city: "Bogotá", region: "", postalCode: "", countryCode: "CO" }],
    organizations: [{ name: "Acme", title: "QA Leadb", department: "" }]
  });
  assert.equal(JSON.stringify(account).includes(token), false);
  assert.equal(Date.parse(account.retainUntil) - Date.parse(account.lastSignInAt), auth.ACCOUNT_MS);

  person.birthdays = [];
  person.genders = [];
  await auth.providerSignIn(store, decoded, { deviceKey: DESKTOP, enabled: "google.com", googleAccessToken: token, fetch });
  const later = (await store.get("url_review_accounts", "ana@gmail.com")).profile;
  assert.equal(later.birthday, "");
  assert.equal(later.gender, "");

  person.resourceName = "people/999999999";
  const elsewhere = await auth.providerSignIn(store, Object.assign({}, decoded, { email: "bo@gmail.com" }), { deviceKey: DESKTOP, enabled: "google.com", googleAccessToken: token, fetch });
  assert.equal(elsewhere.ok, true);
  assert.equal((await store.get("url_review_accounts", "bo@gmail.com")).profile.birthday, undefined);

  const calls = asked.length;
  await auth.providerSignIn(store, decoded, { deviceKey: DESKTOP, enabled: "google.com", googleAccessToken: "bad token", fetch });
  await auth.providerSignIn(store, Object.assign({}, decoded, { firebase: { sign_in_provider: "google.com" } }), { deviceKey: DESKTOP, enabled: "google.com", googleAccessToken: token, fetch });
  assert.equal(asked.length, calls);
  const down = await auth.providerSignIn(store, decoded, { deviceKey: DESKTOP, enabled: "google.com", googleAccessToken: token, fetch: async () => { throw new Error("offline"); } });
  assert.equal(down.ok, true);
});

test("the provider list always offers email and only the providers switched on", () => {
  assert.deepEqual(auth.enabledProviders("").map((item) => item.id), ["email", "google.com"]);
  assert.deepEqual(auth.enabledProviders("google.com,apple.com,nope").map((item) => item.id), ["email", "google.com", "apple.com"]);
  assert.deepEqual(auth.enabledProviders("twitter.com,facebook.com,github.com").map((item) => item.id), ["email", "github.com", "facebook.com", "twitter.com"]);
});

const OAUTH_ENV = {
  REVIEW_OAUTH_DISCORD_ID: "d-id", REVIEW_OAUTH_DISCORD_SECRET: "d-secret",
  REVIEW_OAUTH_GITLAB_ID: "g-id", REVIEW_OAUTH_GITLAB_SECRET: "g-secret",
  REVIEW_OAUTH_LINKEDIN_ID: "l-id", REVIEW_OAUTH_LINKEDIN_SECRET: "l-secret",
  REVIEW_OAUTH_TWITCH_ID: "t-id", REVIEW_OAUTH_TWITCH_SECRET: "t-secret"
};
const OAUTH_OPEN = "email,linkedin,gitlab,discord,twitch,slack";
const PAGE = "https://carlosandmunoz.com/qa-review.html";

function providerFetch(user, calls) {
  return async (url, options) => {
    calls.push({ url, options });
    const body = /token$|accessToken$/.test(url) ? { access_token: "at-1", token_type: "Bearer" } : user;
    return { ok: true, status: 200, json: async () => body };
  };
}

async function oauthStart(store, provider, deviceKey) {
  const started = await oauth.startOAuth(store, { provider, deviceKey, enabled: OAUTH_OPEN, env: OAUTH_ENV, redirectUri: PAGE });
  assert.equal(started.ok, true);
  return started;
}

test("a provider without a client id and secret is not offered, even when listed", () => {
  assert.deepEqual(oauth.ready(OAUTH_ENV), ["linkedin", "gitlab", "discord", "twitch"]);
  const offered = auth.enabledProviders(OAUTH_OPEN + ",google.com", oauth.ready(OAUTH_ENV));
  assert.deepEqual(offered.map((item) => item.id), ["email", "google.com", "linkedin", "gitlab", "discord", "twitch"]);
  assert.equal(offered.find((item) => item.id === "gitlab").oauth, true);
  assert.deepEqual(auth.enabledProviders(OAUTH_OPEN).map((item) => item.id), ["email"]);
  assert.deepEqual(auth.enabledProviders("google.com", oauth.ready(OAUTH_ENV)).map((item) => item.id), ["email", "google.com"]);
});

test("an OAuth start stores the device under a state and sends the provider a PKCE challenge where it takes one", async () => {
  const store = auth.memoryStore();
  const gitlab = await oauthStart(store, "gitlab", DESKTOP);
  const url = new URL(gitlab.url);
  assert.equal(url.origin + url.pathname, "https://gitlab.com/oauth/authorize");
  assert.equal(url.searchParams.get("state"), gitlab.state);
  assert.equal(url.searchParams.get("client_id"), "g-id");
  assert.equal(url.searchParams.get("redirect_uri"), PAGE);
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  const row = await store.get("url_review_oauth", gitlab.state);
  assert.equal(row.deviceHash, auth.deviceHash(DESKTOP));
  const expected = require("crypto").createHash("sha256").update(row.verifier).digest("base64url");
  assert.equal(url.searchParams.get("code_challenge"), expected);
  assert.equal(oauth.challengeOf("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"), "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  const linkedin = new URL((await oauthStart(store, "linkedin", DESKTOP)).url);
  assert.equal(linkedin.searchParams.get("code_challenge"), null);
  const twitch = new URL((await oauthStart(store, "twitch", DESKTOP)).url);
  assert.deepEqual(Object.keys(JSON.parse(twitch.searchParams.get("claims")).userinfo).slice(0, 2), ["email", "email_verified"]);
  assert.equal((await oauth.startOAuth(store, { provider: "slack", deviceKey: DESKTOP, enabled: OAUTH_OPEN, env: OAUTH_ENV, redirectUri: PAGE })).status, 400);
  assert.equal((await oauth.startOAuth(store, { provider: "gitlab", deviceKey: "", enabled: OAUTH_OPEN, env: OAUTH_ENV, redirectUri: PAGE })).status, 400);
});

test("an OAuth code finishes only on the device that started it, and only once", async () => {
  const store = auth.memoryStore();
  const calls = [];
  const user = { sub: "g-7", email: "Ana@GitLab.example", email_verified: true, name: "Ana Ruiz", picture: "https://gitlab.com/a.png" };
  const finish = (state, deviceKey) => oauth.finishOAuth(store, { state, code: "c-1", deviceKey, enabled: OAUTH_OPEN, env: OAUTH_ENV, fetch: providerFetch(user, calls) });
  const started = await oauthStart(store, "gitlab", DESKTOP);
  const phone = await finish(started.state, PHONE);
  assert.equal(phone.status, 403);
  assert.equal(phone.code, "other-device");
  assert.equal(phone.error, auth.OTHER_DEVICE);
  assert.equal(calls.length, 0);
  assert.equal((await finish(started.state, DESKTOP)).code, "expired");
  const again = await oauthStart(store, "gitlab", DESKTOP);
  const signed = await finish(again.state, DESKTOP);
  assert.equal(signed.ok, true);
  assert.equal(signed.email, "ana@gitlab.example");
  assert.equal(signed.provider, "gitlab");
  assert.equal(signed.name, "Ana Ruiz");
  const sent = new URLSearchParams(calls[0].options.body);
  assert.equal(sent.get("code_verifier"), (await store.get("url_review_oauth", again.state)).verifier);
  assert.equal(sent.get("redirect_uri"), PAGE);
  assert.equal(sent.get("client_secret"), "g-secret");
  assert.equal(calls[1].options.headers.authorization, "Bearer at-1");
  assert.equal((await auth.checkSession(store, { session: signed.session, deviceKey: DESKTOP })).ok, true);
  assert.equal((await finish(again.state, DESKTOP)).code, "expired");
  const late = await oauthStart(store, "gitlab", DESKTOP);
  const expired = await oauth.finishOAuth(store, { state: late.state, code: "c-1", deviceKey: DESKTOP, enabled: OAUTH_OPEN, env: OAUTH_ENV, fetch: providerFetch(user, calls), now: Date.now() + oauth.STATE_MS + 1000 });
  assert.equal(expired.code, "expired");
  assert.equal((await finish("f".repeat(48), DESKTOP)).code, "expired");
});

test("a Discord account without a verified email gets a code by email instead of a session", async () => {
  const store = auth.memoryStore();
  const finish = async (user) => {
    const started = await oauthStart(store, "discord", DESKTOP);
    return oauth.finishOAuth(store, { state: started.state, code: "c-1", deviceKey: DESKTOP, enabled: OAUTH_OPEN, env: OAUTH_ENV, fetch: providerFetch(user, []) });
  };
  const unverified = await finish({ id: "80351110224678912", username: "ana", email: "ana@proton.me", verified: false });
  assert.equal(unverified.verifyEmail, true);
  assert.equal(unverified.email, "ana@proton.me");
  assert.equal(unverified.provider, "discord");
  assert.equal(store.cols.get("url_review_sessions"), undefined);
  assert.equal((await finish({ id: "80351110224678912", username: "ana" })).status, 400);
  const signed = await finish({ id: "80351110224678912", username: "ana", global_name: "Ana", avatar: "8342729096ea3675442027381ff50dfe", email: "ana@proton.me", verified: true });
  assert.equal(signed.ok, true);
  assert.equal(signed.name, "Ana");
  assert.equal(signed.picture, "https://cdn.discordapp.com/avatars/80351110224678912/8342729096ea3675442027381ff50dfe.png");
  assert.deepEqual((await store.get("url_review_accounts", "ana@proton.me")).providers, ["discord"]);
});

test("a cancelled or refused provider sign-in opens nothing", async () => {
  const store = auth.memoryStore();
  const cancelled = await oauthStart(store, "linkedin", DESKTOP);
  const result = await oauth.finishOAuth(store, { state: cancelled.state, error: "user_cancelled_login", deviceKey: DESKTOP, enabled: OAUTH_OPEN, env: OAUTH_ENV, fetch: providerFetch({}, []) });
  assert.equal(result.code, "cancelled");
  const refused = await oauthStart(store, "linkedin", DESKTOP);
  const failing = async () => ({ ok: false, status: 400, json: async () => ({ error: "invalid_grant" }) });
  assert.equal((await oauth.finishOAuth(store, { state: refused.state, code: "c-1", deviceKey: DESKTOP, enabled: OAUTH_OPEN, env: OAUTH_ENV, fetch: failing })).status, 502);
  assert.equal(store.cols.get("url_review_sessions"), undefined);
});

test("the sign-in email carries the code and a same-device link in every page language", () => {
  customerMail.LANGS.forEach((lang) => {
    const mail = customerMail.signInMail(lang, { id: "abc", token: "def", code: "123456" });
    assert.match(mail.subject, /123456/);
    assert.match(mail.text, /signin=abc&key=def/);
    assert.match(mail.html, /123456/);
  });
});
