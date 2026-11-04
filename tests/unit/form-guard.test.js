const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const guard = require("../../functions/form-guard");

const root = path.join(__dirname, "..", "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

function siteverify(answer, seen = []) {
  return async (url, init) => {
    seen.push({ url, body: Object.fromEntries(new URLSearchParams(init.body)) });
    if (answer instanceof Error) throw answer;
    return { ok: true, json: async () => answer };
  };
}

const pass = { success: true, action: "message", hostname: "carlosandmunoz.com" };

test("a Turnstile token passes only with success, the form's action and a live hostname", async () => {
  const seen = [];
  const ok = await guard.verifyTurnstile({ secret: "s", token: "t", ip: "1.2.3.4", action: "message", fetchImpl: siteverify(pass, seen) });
  assert.deepEqual(ok, { ok: true });
  assert.equal(seen[0].url, "https://challenges.cloudflare.com/turnstile/v0/siteverify");
  assert.deepEqual(seen[0].body, { secret: "s", response: "t", remoteip: "1.2.3.4" });

  const call = (answer, action = "message") => guard.verifyTurnstile({ secret: "s", token: "t", action, fetchImpl: siteverify(answer) });
  assert.equal((await call({ success: false, "error-codes": ["invalid-input-response"] })).reason, "token");
  assert.equal((await call(pass, "rating")).reason, "action");
  assert.equal((await call(Object.assign({}, pass, { hostname: "localhost" }))).reason, "hostname");
  assert.equal((await call(Object.assign({}, pass, { hostname: "evil.example" }))).reason, "hostname");
});

test("a missing token, secret or reachable Siteverify fails closed", async () => {
  const never = async () => { throw new Error("should not call Siteverify"); };
  assert.equal((await guard.verifyTurnstile({ secret: "s", token: "", action: "message", fetchImpl: never })).reason, "token");
  assert.equal((await guard.verifyTurnstile({ secret: "s", token: "x".repeat(2049), action: "message", fetchImpl: never })).reason, "token");
  assert.equal((await guard.verifyTurnstile({ secret: "", token: "t", action: "message", fetchImpl: never })).reason, "config");
  assert.equal((await guard.verifyTurnstile({ secret: "s", token: "t", action: "other", fetchImpl: never })).reason, "config");
  const down = await guard.verifyTurnstile({ secret: "s", token: "t", action: "message", fetchImpl: siteverify(new Error("offline")) });
  assert.equal(down.reason, "unreachable");
  const bad = await guard.verifyTurnstile({ secret: "s", token: "t", action: "message", fetchImpl: async () => ({ ok: false, status: 503 }) });
  assert.equal(bad.reason, "unreachable");
});

function fakeDb() {
  const docs = new Map();
  return {
    docs,
    collection: (name) => ({ doc: (id) => ({ path: name + "/" + id }) }),
    runTransaction: async (fn) => fn({
      get: async (ref) => ({ exists: docs.has(ref.path), data: () => docs.get(ref.path) }),
      set: (ref, value) => docs.set(ref.path, value)
    })
  };
}

test("each connection gets a few posts per window, keyed by a hash of its address", async () => {
  const db = fakeDb();
  const now = 1_700_000_000_000;
  for (let i = 0; i < guard.LIMIT_POSTS; i++) assert.equal(await guard.takeFormSlot(db, "1.2.3.4", now + i), true);
  assert.equal(await guard.takeFormSlot(db, "1.2.3.4", now + 10), false);
  assert.equal(await guard.takeFormSlot(db, "5.6.7.8", now + 10), true, "another visitor is not held back");
  assert.equal(await guard.takeFormSlot(db, "1.2.3.4", now + guard.LIMIT_WINDOW_MS), true, "the window resets");
  assert.ok([...db.docs.keys()].every((key) => !key.includes("1.2.3.4")), "the raw address is not stored");
});

test("the forms post through submitGuardedForm with a Turnstile token, never straight to Firestore", () => {
  const rules = read("firestore.rules");
  for (const name of ["messages", "ratings"]) {
    const block = rules.slice(rules.indexOf("match /" + name + "/{id}"));
    assert.match(block.slice(0, block.indexOf("allow update")), /allow create: if false;/);
  }
  const index = read("functions/index.js");
  assert.doesNotMatch(index, /getFormChallenge|captchaImage|abuse\/forms/);
  assert.match(index, /submitGuardedForm = functions\.runWith\(\{ secrets: SECRETS\.turnstile/);
  assert.deepEqual(require("../../functions/secrets").turnstile, ["TURNSTILE_SECRET_KEY"]);

  const app = read("js/cv-app.js");
  assert.doesNotMatch(app, /getFormChallenge|addDoc\(fb\.collection\(fb\.db, kind/);
  assert.match(app, /'1x00000000000000000000AA'/);
  const page = read("index.html");
  const csp = page.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
  assert.match(csp, /script-src [^;]*https:\/\/challenges\.cloudflare\.com/);
  assert.match(csp, /frame-src [^;]*https:\/\/challenges\.cloudflare\.com/);
  assert.match(page, /id="message-turnstile"/);
  assert.match(page, /id="rating-turnstile"/);
});
