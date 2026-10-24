const test = require("node:test");
const assert = require("node:assert/strict");
const auth = require("../../functions/url-review-auth");
const customerMail = require("../../functions/url-review-customer-mail");
const sample = require("../../assets/qa-review-sample.json");

const ANA_DESKTOP = "a".repeat(64);
const ANA_PHONE = "b".repeat(64);
const BEN_DESKTOP = "c".repeat(64);

async function signIn(store, email, deviceKey) {
  const started = await auth.startEmail(store, { email, deviceKey, ip: "1.1.1.1" });
  const signed = await auth.finishEmail(store, { id: started.id, code: started.code, deviceKey });
  return { session: signed.session, deviceKey };
}

function run(extra) {
  return Object.assign({ id: "ab12cd34", email: "ana@example.com", paid: true, frameworks: sample.frameworks, report: Object.assign({}, sample.report, { id: "ab12cd34" }) }, extra);
}

async function people() {
  const store = auth.memoryStore();
  return { store, ana: await signIn(store, "ana@example.com", ANA_DESKTOP), ben: await signIn(store, "ben@example.com", BEN_DESKTOP) };
}

test("the account that ran a paid report reads it in full", async () => {
  const { store, ana } = await people();
  assert.deepEqual(await auth.reportAccess(store, ana, run(), false), { ok: true, email: "ana@example.com" });
});

test("a free-allowance report opens in full for its account only, like a paid one", async () => {
  const { store, ana, ben } = await people();
  assert.equal((await auth.reportAccess(store, ana, run({ paid: false }), true)).ok, true);
  const other = await auth.reportAccess(store, ben, run({ paid: false }), true);
  assert.equal(other.status, 403);
  assert.equal(other.locked, true);
});

test("another signed-in account holding the link gets the blurred view and a sign-in prompt, never the payment offer", async () => {
  const { store, ben } = await people();
  const other = await auth.reportAccess(store, ben, run(), false);
  assert.equal(other.ok, false);
  assert.equal(other.status, 403);
  assert.equal(other.signIn, true);
  assert.equal(other.locked, true);
  assert.match(other.error, /belongs to another account/);
  const unpaid = await auth.reportAccess(store, ben, run({ paid: false }), false);
  assert.equal(unpaid.status, 403, "someone else's unpaid report is not offered for payment");
});

test("a signed-out visitor holding the link gets the blurred view and a sign-in prompt", async () => {
  const { store } = await people();
  for (const proof of [{}, { deviceKey: BEN_DESKTOP }, { session: "f".repeat(64), deviceKey: BEN_DESKTOP }]) {
    const out = await auth.reportAccess(store, proof, run(), false);
    assert.equal(out.status, 401);
    assert.equal(out.signIn, true);
    assert.equal(out.locked, true);
  }
});

test("the owner's session copied to another device does not open the report", async () => {
  const { store, ana } = await people();
  const out = await auth.reportAccess(store, { session: ana.session, deviceKey: ANA_PHONE }, run(), false);
  assert.equal(out.status, 401);
  assert.equal(out.locked, true);
});

test("the owner of an unpaid report is offered payment; a run with no account opens for nobody", async () => {
  const { store, ana } = await people();
  const unpaid = await auth.reportAccess(store, ana, run({ paid: false }), false);
  assert.equal(unpaid.status, 402);
  assert.ok(!unpaid.locked);
  assert.equal((await auth.reportAccess(store, ana, run({ email: "" }), false)).status, 403);
  assert.equal((await auth.reportAccess(store, ana, run({ report: null }), false)).status, 404);
  assert.equal((await auth.reportAccess(store, ana, run({ report: { id: "ab12cd34", preview: true } }), false)).status, 404);
});

test("the link in the report email carries only the report id, so opened signed out it lands on the blurred view", async () => {
  const { store, ana } = await people();
  for (const lang of ["en", "es", "pt", "de", "fr", "it"]) {
    const mail = customerMail.reportMail(run(), { lang });
    const links = (mail.text.match(/https:\/\/\S+[?&]report=\S+/g) || []);
    assert.ok(links.length, lang);
    links.forEach((link) => {
      const url = new URL(link);
      assert.equal(url.searchParams.get("report"), "ab12cd34");
      assert.deepEqual([...url.searchParams.keys()].filter((key) => !/^(report|utm_\w+|coupon)$/.test(key)), [], lang + " link grants nothing beyond the id");
    });
  }
  const signedOut = await auth.reportAccess(store, {}, run(), false);
  assert.equal(signedOut.status, 401);
  assert.equal(signedOut.locked, true);
  assert.equal((await auth.reportAccess(store, ana, run(), false)).ok, true, "the same link opens in full once the owner signs in");
});
