const test = require("node:test");
const assert = require("node:assert/strict");

const core = require("../../js/admin-jarvis-core.js");
const jarvis = require("../../functions/jarvis.js");
const device = require("../../functions/jarvis-device.js");

const NOW = Date.parse("2026-11-01T20:00:00Z");
const DAY = 24 * 3600 * 1000;
const json = (body) => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) });

function memDb() {
  const docs = {};
  const col = {
    doc: (id) => ({ set: async (row) => { docs[id] = row; }, delete: async () => { delete docs[id]; } }),
    get: async () => ({ docs: Object.keys(docs).map((id) => ({ id, data: () => docs[id] })) })
  };
  return { docs, collection: (name) => { assert.equal(name, "jarvis_seen"); return col; } };
}

const FOLD_OPEN = { id: "install-fold-0001", app: "android", kind: "foldable-open", posture: "flat", width: 832, height: 750, name: "Galaxy Z Fold8 Ultra", model: "SM-F976U", dex: false, windowed: false };

test("device: a report is made safe; unknown kinds and postures are dropped", () => {
  assert.equal(core.cleanDevice({ kind: "toaster" }), null);
  assert.equal(core.cleanDevice(null), null);
  const c = core.cleanDevice({ kind: "phone", posture: "upside-down", width: "412.4", height: -3, name: "<b>Pixel</b>\n", app: "ios", dex: "yes" });
  assert.deepEqual(c, { kind: "phone", posture: null, width: 412, height: null, name: "bPixel/b", model: null, app: "web", dex: false, windowed: false });
});

test("device: the label reads the same on the app and the page", () => {
  assert.equal(core.deviceLabel(FOLD_OPEN), "Foldable, open · 832×750 dp");
  assert.equal(core.deviceLabel(Object.assign({}, FOLD_OPEN, { posture: "tabletop" })), "Foldable, open · tabletop · 832×750 dp");
  assert.equal(core.deviceLabel({ kind: "desktop", dex: true, width: 1920, height: 1080, app: "android" }), "Desktop · Samsung DeX · 1920×1080 dp");
  assert.equal(core.deviceLabel({ kind: "desktop", width: 1440, height: 900 }), "Desktop · 1440×900 px");
  assert.equal(core.deviceLabel({}), "Unknown device");
});

test("device: Ask is short on phone-sized screens and in tabletop, longer on large ones", () => {
  assert.match(core.askHint({ kind: "foldable-folded", width: 412 }), /phone-sized screen: answer in at most four/);
  assert.match(core.askHint({ kind: "foldable-open", posture: "tabletop", width: 832 }), /half-folded on a table/);
  assert.match(core.askHint({ kind: "tablet", width: 500 }), /phone-sized/);
  assert.match(core.askHint(FOLD_OPEN), /large screen \(foldable, open\): answer in up to eight sentences/);
  assert.equal(core.askHint(undefined), "");
});

test("device: the browser tells a Fold, folded or open, from a phone, a tablet and a desktop", () => {
  const android = "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Mobile Safari/537.36";
  const fold = (o) => core.browserDevice(Object.assign({ ua: android, model: "SM-F976U", mobile: true, touch: true, coarse: true }, o));
  assert.equal(fold({ width: 412, height: 900, screenW: 412, screenH: 960 }).kind, "foldable-folded");
  assert.deepEqual([fold({ width: 832, height: 750, screenW: 832, screenH: 790 }).kind, fold({ width: 832, height: 750, screenW: 832, screenH: 790 }).posture], ["foldable-open", "flat"]);
  assert.equal(fold({ width: 832, height: 750, screenW: 832, screenH: 790, posture: "folded", segments: { across: 1, down: 2 } }).posture, "tabletop");
  assert.equal(fold({ width: 750, height: 832, screenW: 790, screenH: 832, posture: "folded", segments: { across: 2, down: 1 } }).posture, "book");
  assert.equal(fold({ width: 832, height: 600, screenW: 832, screenH: 790, posture: "folded" }).posture, "tabletop");
  const plain = (ua, o) => core.browserDevice(Object.assign({ ua }, o)).kind;
  assert.equal(plain(android, { width: 412, height: 900, screenW: 412, screenH: 900, touch: true, coarse: true }), "phone");
  assert.equal(plain("Mozilla/5.0 (Linux; Android 14; SM-X910) AppleWebKit/537.36 Chrome/141.0 Safari/537.36", { width: 1200, height: 800, screenW: 1200, screenH: 800, touch: true, coarse: true }), "tablet");
  assert.equal(plain("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15", { width: 1440, height: 900, screenW: 1440, screenH: 900 }), "desktop");
  assert.equal(plain("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15", { width: 1024, height: 1366, screenW: 1024, screenH: 1366, touch: true, coarse: true }), "tablet");
  assert.equal(plain("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148", { width: 390, height: 844, screenW: 390, screenH: 844 }), "phone");
});

test("device: one row per install, listed newest first with this one marked; old rows are dropped", async () => {
  const db = memDb();
  assert.equal(await device.seen(db, { kind: "phone" }, "owner@x", NOW), null);
  assert.equal(await device.seen(db, Object.assign({}, FOLD_OPEN, { kind: "toaster" }), "owner@x", NOW), null);
  await device.seen(db, FOLD_OPEN, "owner@x", NOW - 60000);
  await device.seen(db, Object.assign({}, FOLD_OPEN, { posture: "tabletop" }), "owner@x", NOW);
  await device.seen(db, { id: "browser-mac-0001", app: "web", kind: "desktop", width: 1440, height: 900, name: "Chrome on Mac" }, "owner@x", NOW - 3600000);
  db.docs.stale = { kind: "phone", seenAt: new Date(NOW - 31 * DAY).toISOString() };
  const rows = await device.list(db, NOW, { id: "install-fold-0001" });
  assert.deepEqual(rows.map((r) => [r.name, r.label, r.mine]), [
    ["Galaxy Z Fold8 Ultra", "Foldable, open · tabletop · 832×750 dp", true],
    ["Chrome on Mac", "Desktop · 1440×900 px", false]
  ]);
  assert.equal(rows[0].by, "owner@x");
  assert.equal("stale" in db.docs, false);
  await device.forget(db, { id: "install-fold-0001" });
  assert.deepEqual((await device.list(db, NOW)).map((r) => r.name), ["Chrome on Mac"]);
});

test("device: Ask fits a typed answer to the screen, and a spoken one stays spoken", async () => {
  let prompt = "";
  const fetchImpl = async (url, init) => { prompt = JSON.parse(init.body).contents[0].parts[0].text; return json({ candidates: [{ content: { parts: [{ text: "Fine." }] } }] }); };
  await jarvis.ask(fetchImpl, { GEMINI_API_KEY: "k" }, "How is it going?", {}, { device: { kind: "foldable-folded", width: 412 } });
  assert.match(prompt, /phone-sized screen/);
  await jarvis.ask(fetchImpl, { GEMINI_API_KEY: "k" }, "How is it going?", {}, { device: FOLD_OPEN });
  assert.match(prompt, /up to eight sentences/);
  await jarvis.ask(fetchImpl, { GEMINI_API_KEY: "k" }, "How is it going?", {}, { device: FOLD_OPEN, spoken: true });
  assert.match(prompt, /spoken sentences/);
  await jarvis.ask(fetchImpl, { GEMINI_API_KEY: "k" }, "How is it going?", {});
  assert.match(prompt, /at most six sentences/);
});
