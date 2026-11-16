const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const gate = require("../../scripts/hub-gate");

function site(feeds) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hub-gate-"));
  fs.mkdirSync(path.join(root, "assets/social"), { recursive: true });
  Object.entries(feeds).forEach(([file, posts]) => fs.writeFileSync(path.join(root, "assets/social", file), JSON.stringify({ posts })));
  return root;
}

test("a post's hub page is social/<batch>/<slug>.html on the site", () => {
  assert.strictEqual(gate.hubUrl("tips-2026-10", "01-img-size"), gate.SITE + "/social/tips-2026-10/01-img-size.html");
});

test("days are counted on Bogotá time", () => {
  assert.strictEqual(gate.bogotaDay("2026-10-27T04:30:00Z"), "2026-10-26");
  assert.strictEqual(gate.bogotaDay("2026-10-27T05:00:00Z"), "2026-10-27");
});

test("a post goes out only once its hub page is live, and not before its hub day", () => {
  assert.strictEqual(gate.reason({ live: false, hubDate: "2026-10-27", at: "2026-10-27T15:00:00Z" }), "not on the hub");
  assert.match(gate.reason({ live: true, hubDate: "2026-10-27", at: "2026-10-27T03:00:00Z" }), /before its hub day \(2026-10-27\)/);
  assert.strictEqual(gate.reason({ live: true, hubDate: "2026-10-27", at: "2026-10-27T12:30:00Z" }), null);
  assert.strictEqual(gate.reason({ live: true, hubDate: "2026-10-27", at: "2026-10-29T12:30:00Z" }), null);
  assert.strictEqual(gate.reason({ live: true, hubDate: "", at: "2026-10-27T12:30:00Z" }), null);
});

test("the hub's date wins over captions.json, from any language's feed", async () => {
  const root = site({ "feed.json": [{ id: "b/01-a", date: "2026-10-28" }], "feed-es.json": [{ id: "b/02-c", date: "2026-10-30" }] });
  const asked = [];
  const check = gate.createGate({ root, fetchImpl: async (url) => { asked.push(url); return { ok: !url.endsWith("03-x.html") }; } });
  assert.deepStrictEqual(await check("b", "01-a", { date: "2026-10-20" }, "2026-10-27T15:00:00Z"),
    { url: gate.SITE + "/social/b/01-a.html", hubDate: "2026-10-28", why: "slot before its hub day (2026-10-28)" });
  assert.strictEqual((await check("b", "02-c", { date: "2026-10-30" }, "2026-10-30T15:00:00Z")).why, null);
  assert.strictEqual((await check("b", "03-x", { date: "2026-10-30" }, "2026-10-30T15:00:00Z")).why, "not on the hub");
  assert.strictEqual((await check("b", "04-new", { date: "2026-11-02" }, "2026-11-01T15:00:00Z")).hubDate, "2026-11-02");
  await check("b", "01-a", {}, "2026-10-29T15:00:00Z");
  assert.strictEqual(asked.filter((url) => url.endsWith("01-a.html")).length, 1);
});

test("an unreachable site counts as not on the hub", async () => {
  const check = gate.createGate({ root: site({}), fetchImpl: async () => { throw new Error("offline"); } });
  assert.strictEqual((await check("b", "01-a", { date: "2026-10-27" }, "2026-10-27T15:00:00Z")).why, "not on the hub");
});

test("prepareCaption strips UTMs from LI/IG/FB bodies and puts drop-URL + tagged link in firstComment (#3551)", () => {
  const text = "Lesson.\n\nhttps://carlosandmunoz.com/qa-review.html?live=u-x&utm_source=linkedin&utm_medium=social&utm_campaign=requested-reviews";
  const out = gate.prepareCaption({ text, network: "linkedin", batch: "auto-2026-11-16", slug: "01-a", lang: "es" });
  assert.ok(!/utm_/.test(out.text), "body has no utm_");
  assert.match(out.text, /live=u-x/);
  assert.match(out.firstComment, /Deja una URL pública/);
  assert.match(out.firstComment, /utm_source=linkedin/);
  assert.match(out.firstComment, /utm_campaign=auto-2026-11-16/);
});

test("prepareCaption keeps withHubLink for X and other nets without firstComment (#3551)", () => {
  const out = gate.prepareCaption({ text: "Hello world", network: "x", batch: "tips-2026-10", slug: "01-a", lang: "en" });
  assert.strictEqual(out.firstComment, null);
  assert.match(out.text, /utm_source=x/);
});
