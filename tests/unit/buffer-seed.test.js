const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { batchIndex, matchPost, staleScheduled } = require("../../scripts/buffer-queue");

function posts() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "buffer-seed-"));
  const write = (file, text) => {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), text);
  };
  write("tips/captions.json", JSON.stringify({ "01-hsts": { linkedin: "One header.\n\n180 days", tiktok: "One header. Run curl" }, "02-alt": { linkedin: "Alt text" } }));
  write("tips/calendar.csv", "Date,Time,Channel,Post,Asset\n2026-10-26,17:55,youtube,01-hsts,clip/01-hsts.mp4\n2026-10-27,17:55,youtube,02-alt,clip/02-alt.mp4\n2026-10-27,08:00,x,02-alt,feed/02-alt.jpg\n");
  write("runs/captions.json", JSON.stringify({ "01-ilo": { linkedin: "ilo.org" } }));
  write("runs/calendar.csv", "Date,Time,Channel,Post,Asset\n2026-10-27,08:00,x,01-ilo,feed/01-ilo.jpg\n");
  write("launch/calendar.csv", "Date,Time,Channel,Language,Post,Format,Asset,How,Caption key\n2026-10-19,13:30,YouTube Shorts,es,talking,Video,es/talking.mp4,Buffer composer,youtube\n");
  write("launch/es/talking-captions.json", JSON.stringify({ linkedin: "Alguien preguntó", youtube: "Alguien preguntó si el sitio funciona" }));
  return batchIndex(root);
}

test("a Buffer post matches its batch post by image or clip address, wherever it is served from", () => {
  const index = posts();
  assert.strictEqual(matchPost(index, { assets: [{ source: "https://carlosandmunoz.com/media/social-posts/tips/feed/02-alt.jpg" }] }), "tips/02-alt");
  assert.strictEqual(matchPost(index, { assets: [{ source: "https://github.com/o/r/releases/download/tips/01-hsts.mp4?x=1" }] }), "tips/01-hsts");
});

test("then by caption, spacing aside, including the launch set's captions per language", () => {
  const index = posts();
  assert.strictEqual(matchPost(index, { text: "One header.  180 days" }), "tips/01-hsts");
  assert.strictEqual(matchPost(index, { text: "Alguien preguntó si el sitio funciona" }), "launch/es/talking");
});

test("then by its calendar slot, which is Bogotá time, unless two posts share it", () => {
  const index = posts();
  const voiced = { text: "Un solo encabezado.", assets: [{ source: "https://buffer-media-uploads.s3.amazonaws.com/uploads/x.mp4" }] };
  assert.strictEqual(matchPost(index, Object.assign({ dueAt: "2026-10-26T22:55:00.000Z" }, voiced), "youtube"), "tips/01-hsts");
  assert.strictEqual(matchPost(index, Object.assign({ dueAt: "2026-10-26T22:55:00.000Z" }, voiced), "tiktok"), null);
  assert.strictEqual(matchPost(index, { text: "?", dueAt: "2026-10-27T13:00:00.000Z" }, "x"), null);
  assert.strictEqual(matchPost(index, { text: "?", dueAt: "2026-10-19T18:30:00.000Z" }, "youtube"), "launch/es/talking");
  assert.strictEqual(matchPost(index, { text: "nothing like it" }, "linkedin"), null);
  assert.strictEqual(matchPost(index, Object.assign({ dueAt: "2026-10-26T22:55:00.000Z" }, voiced), "youtube", (name) => name === "tips/01-hsts"), null);
  assert.strictEqual(matchPost(index, { text: "One header. Run curl" }, "tiktok", () => true), "tips/01-hsts");
});

test("--delete-unmatched picks only scheduled posts still to come that match no batch post and no ledger entry", () => {
  const index = posts();
  const now = Date.parse("2026-10-25T05:00:00.000Z");
  const item = (id, node, slot = "tiktok") => ({ slot, profile: slot + " (x)", node: Object.assign({ id, status: "scheduled", dueAt: "2026-10-27T23:00:00.000Z", text: "Stale launch post" }, node) });
  const items = [
    item("stale"),
    item("matched", { text: "One header. Run curl" }),
    item("sent", { status: "sent", sentAt: "2026-10-27T23:00:00.000Z" }),
    item("past", { dueAt: "2026-10-24T23:00:00.000Z" }),
    item("undated", { dueAt: null }),
    item("slotted", { dueAt: "2026-10-26T22:55:00.000Z" }, "youtube"),
    item("ledgered"),
    item("claimed", { dueAt: "2026-10-27T22:55:00.000Z" }, "youtube")
  ];
  const book = { posts: {
    "tips/02-alt": [{ channel: "tiktok", profile: "tiktok (x)", id: "ledgered", result: "queued" }, { channel: "youtube", profile: "youtube (x)", id: "other", result: "queued" }]
  } };
  assert.deepStrictEqual(staleScheduled(index, items, book, now).map((i) => i.node.id), ["stale", "claimed"]);
});
