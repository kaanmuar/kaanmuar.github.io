const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const ledger = require("../../scripts/social-ledger");
const q = require("../../scripts/open-social-queue");

const HOUR = 3600e3;
const NOW = Date.parse("2026-10-26T20:00:00.000Z");
const post = (slug, at, over = {}) => ({ batch: "auto-2026-10-25", slug, at, image: __filename, cap: Object.assign({ x: "example.com: 77.\n\ncarlosandmunoz.com/qa-review?live=u-example-com&utm_source=x&utm_medium=social", alt: "Score card", lang: "es" }, over) });

test("facets mark each link by UTF-8 bytes, skip file names, and add the scheme", () => {
  const text = "Revisión ✅ robots.txt y llms.txt: carlosandmunoz.com/qa-review?live=a…\n\nhttps://carlosandmunoz.com/social/b/c.html?utm_source=bluesky";
  const links = q.facets(text);
  assert.deepEqual(links.map((f) => f.features[0].uri), ["https://carlosandmunoz.com/qa-review?live=a", "https://carlosandmunoz.com/social/b/c.html?utm_source=bluesky"]);
  const bytes = Buffer.from(text);
  links.forEach((f) => {
    const uri = f.features[0].uri;
    assert.equal(bytes.subarray(f.index.byteStart, f.index.byteEnd).toString(), uri.startsWith("https://carlosandmunoz.com/qa") ? uri.slice(8) : uri);
  });
});

test("only slots that came within the last 12 hours are due, oldest first", () => {
  const list = [post("c", NOW - HOUR), post("a", NOW - 13 * HOUR), post("b", NOW - 3 * HOUR), post("d", NOW + 60e3)];
  assert.deepEqual(q.due(list, NOW).map((p) => p.slug), ["b", "c"]);
});

test("captions are tagged for the network and end with the hub post within Bluesky's 300", () => {
  const long = post("01-u-example-com", NOW, { x: "word ".repeat(70).trim() + "\n\ncarlosandmunoz.com/qa-review?live=u&utm_source=x" });
  const text = q.caption(long, "bluesky");
  assert.ok([...text].length <= 300, [...text].length + " chars");
  assert.match(text, /\/social\/auto-2026-10-25\/01-u-example-com\.html\?utm_source=bluesky&/);
  assert.doesNotMatch(text, /utm_source=x\b/);
  assert.match(q.caption(post("02", NOW), "mastodon"), /live=u-example-com&utm_source=mastodon&/);
  const cut = q.caption(post("03", NOW, { x: "word ".repeat(20) + "block only training…\n\ncarlosandmunoz.com/qa-review?live=" + "u".repeat(120) }), "bluesky");
  assert.match(cut, /training…\n\n/);
});

test("posts reads the x slot in Bogotá time and skips held captions", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "open-social-"));
  const dir = path.join(root, "media/social-posts/b1");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "captions.json"), JSON.stringify({ "01-a": { x: "A" }, "02-b": { x: "B", hold: true }, "03-c": { linkedin: "C" } }));
  fs.writeFileSync(path.join(dir, "calendar.csv"), "Date,Time,Channel,Post,Asset\n2026-10-26,09:30,x,01-a,feed/01-a.jpg\n2026-10-26,10:00,linkedin,01-a,feed/01-a.jpg\n2026-10-26,11:00,x,02-b,feed/02-b.jpg\n");
  const list = q.posts("b1", root);
  assert.deepEqual(list.map((p) => [p.slug, new Date(p.at).toISOString()]), [["01-a", "2026-10-26T14:30:00.000Z"]]);
});

function fakeClient(recent = []) {
  const sent = [];
  return { sent, login: async () => "qalab.bsky.social", recent: async () => recent, post: async (p) => { sent.push(p); if (p.key.endsWith("/boom")) throw new Error("Bluesky 400: bad"); return { id: "at://x/" + sent.length, url: "https://bsky.app/p/" + sent.length }; } };
}
const gate = (held) => async (batch, slug) => ({ why: held.includes(slug) ? "not on the hub" : null });

test("run skips what the ledger or the account already has, holds what the hub lacks, and stops at PER_RUN", async () => {
  const book = ledger.empty();
  ledger.record(book, "auto-2026-10-25/sent", { channel: "bluesky", profile: "old", result: "sent", at: "2026-10-26T18:00:00.000Z" });
  const list = ["sent", "there", "held", "boom", "p1", "p2", "p3", "p4", "p5"].map((slug, i) => post(slug, NOW - (9 - i) * 60e3));
  const client = fakeClient([{ id: "at://x/0", text: '{"text":"… https://carlosandmunoz.com/social/auto-2026-10-25/there.html?utm_source=bluesky"}', url: "https://bsky.app/p/0" }]);
  const counts = await q.run("bluesky", client, list, book, { live: true, now: NOW, gate: gate(["held"]) });
  assert.deepEqual({ posted: counts.posted, already: counts.already, held: counts.held, failed: counts.failed }, { posted: q.PER_RUN, already: 1, held: 1, failed: 1 });
  assert.deepEqual(client.sent.map((p) => p.key.split("/").pop()), ["boom", "p1", "p2", "p3", "p4"]);
  assert.equal(client.sent[1].lang, "es");
  const get = (slug) => ledger.find(book, "auto-2026-10-25/" + slug, "bluesky", "qalab.bsky.social");
  assert.equal(get("there").result, "sent");
  assert.equal(get("there").url, "https://bsky.app/p/0");
  assert.equal(get("held").error, "Hub first: not on the hub");
  assert.equal(get("boom").result, "failed");
  assert.equal(get("p1").result, "sent");
  assert.equal(get("p5"), null);
  assert.equal(get("sent"), null);
});

test("a dry run never logs in", async () => {
  const client = { login: async () => { throw new Error("logged in"); } };
  const counts = await q.run("mastodon", client, [post("p1", NOW - 60e3)], ledger.empty(), { live: false, now: NOW, gate: gate([]) });
  assert.equal(counts.posted, 0);
});
