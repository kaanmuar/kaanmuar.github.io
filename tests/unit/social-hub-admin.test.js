const test = require("node:test");
const assert = require("node:assert/strict");
const admin = require("../../js/social-hub-admin");
const hub = require("../../scripts/build-social-hub");
const card = require("../../js/social-hub-card");
const { COPY } = require("../../scripts/social-hub/copy");

const post = (over) => Object.assign({
  id: "auto-2026-10-22/01-u-uber-com", kind: "review", batch: "auto-2026-10-22", date: "2026-10-22", lang: "en", clipLang: "es", cat: "",
  title: "uber.com: 66.", text: "uber.com: 66.\n\nGive every page a title.", image: "media/social-posts/auto-2026-10-22/feed/01-u-uber-com.jpg",
  alt: "Card", report: null, ytTitle: "", captions: { linkedin: "uber.com: 66.\n\nGive every page a title.", x: "Short one" }
}, over);

const pick = (over) => Object.assign({ id: "pick/web-almanac", date: "2026-10-24", lang: "es", title: "Web Almanac", text: "Worth a read.", url: "https://almanac.httparchive.org/", image: "https://example.com/a.png", youtube: "", cat: "Performance" }, over);

test("clean keeps known fields in shape and drops the rest", () => {
  const state = admin.clean({
    edits: {
      a: { captions: { linkedin: "  New\r\ncopy ", myspace: "no" }, date: "2026-11-01", hidden: "yes", extra: 1 },
      b: { date: "tomorrow" },
      c: { hidden: true }
    },
    items: [pick(), pick(), pick({ id: "pick/bad", image: "javascript:alert(1)" }), pick({ id: "pick/up", image: "assets/../secrets.png" }), pick({ id: "Not/a/pick" })],
    owner: "x"
  });
  assert.deepEqual(state.edits, { a: { captions: { linkedin: "New\ncopy" }, date: "2026-11-01" }, c: { hidden: true } });
  assert.deepEqual(state.items.map((item) => item.id), ["pick/web-almanac"]);
  assert.equal(state.owner, undefined);
  assert.deepEqual(admin.clean(null), admin.empty());
  assert.ok(admin.same(admin.clean(state), state));
});

test("an item needs a title, a day and an https or committed image; links and videos are normalised", () => {
  assert.equal(admin.cleanItem(pick({ title: " " })), null);
  assert.equal(admin.cleanItem(pick({ date: "2026-1-2" })), null);
  assert.equal(admin.cleanItem(pick({ image: "http://example.com/a.png" })), null);
  assert.equal(admin.cleanItem(pick({ image: "media/social-posts/x/feed/a.jpg" })).image, "media/social-posts/x/feed/a.jpg");
  assert.equal(admin.cleanItem(pick({ url: "javascript:alert(1)" })).url, "");
  assert.equal(admin.cleanItem(pick({ lang: "xx" })).lang, "en");
  assert.equal(admin.videoId("https://www.youtube.com/shorts/5b4Hr6r-cBk"), "5b4Hr6r-cBk");
  assert.equal(admin.videoId("https://youtu.be/5b4Hr6r-cBk?si=1"), "5b4Hr6r-cBk");
  assert.equal(admin.videoId("https://www.youtube.com/watch?v=5b4Hr6r-cBk&t=3"), "5b4Hr6r-cBk");
  assert.equal(admin.videoId("not a video"), "");
});

test("new item ids are slugs of the title and never collide", () => {
  assert.equal(admin.newId("Café: Web Almanac 2026!", []), "pick/cafe-web-almanac-2026");
  assert.equal(admin.newId("Web Almanac", [{ id: "pick/web-almanac" }, { id: "pick/web-almanac-2" }]), "pick/web-almanac-3");
  assert.equal(admin.newId("???", []), "pick/item");
});

test("apply hides posts, moves dates, swaps captions and the card text, and adds picks", () => {
  const state = admin.clean({
    edits: {
      "auto-2026-10-22/01-u-uber-com": { captions: { linkedin: "uber.com: 66.\n\nBetter copy." }, date: "2026-12-01" },
      "tips-2026-10/02-x": { hidden: true },
      "pick/web-almanac": { captions: { x: "Read the Almanac" } }
    },
    items: [pick(), pick({ id: "pick/local", image: "assets/missing.png" })]
  });
  const out = admin.apply([post(), post({ id: "tips-2026-10/02-x", kind: "tip" })], state, (file) => file !== "assets/missing.png");
  assert.deepEqual(out.map((p) => p.id), ["auto-2026-10-22/01-u-uber-com", "pick/web-almanac"]);
  assert.equal(out[0].date, "2026-12-01");
  assert.equal(out[0].text, "uber.com: 66.\n\nBetter copy.");
  assert.equal(out[0].captions.x, "Short one");
  assert.equal(out[1].kind, "pick");
  assert.equal(out[1].text, "Worth a read.\n\nhttps://almanac.httparchive.org/");
  assert.equal(out[1].captions.x, "Read the Almanac");
  assert.match(out[1].captions.linkedin, /^Web Almanac\n\nWorth a read\./);
});

test("calendars give each post its first slot per channel, in Bogotá time, for both calendar layouts", () => {
  const auto = admin.parseCalendar("Date,Time,Channel,Post,Asset\n2026-10-25,07:30,linkedin,01-a,feed/01-a.jpg\n2026-10-25,17:45,youtube,01-a,clip/01-a.mp4\n2026-10-26,07:30,linkedin,01-a,feed/01-a.jpg\n", "auto-2026-10-24");
  assert.deepEqual(auto, { "auto-2026-10-24/01-a": { linkedin: "2026-10-25T07:30:00-05:00", youtube: "2026-10-25T17:45:00-05:00" } });
  const launch = admin.parseCalendar("Date,Time,Channel,Language,Post,Format,Asset,How,Caption key\n2026-10-19,08:30,LinkedIn,de,talking,Image,x,Buffer CSV,linkedin\n2026-10-20,09:00,Instagram story,de,talking,Image,x,Buffer CSV,instagram\n2026-10-20,09:00,Pinterest,de,talking,Image,x,Buffer CSV,x\n", "launch-2026-10");
  assert.deepEqual(launch, { "launch-2026-10/de/talking": { linkedin: "2026-10-19T08:30:00-05:00", "instagram-story": "2026-10-20T09:00:00-05:00" } });
  assert.equal(admin.batchOf("launch-2026-10/de/talking"), "launch-2026-10");
});

test("channel status: queued before the slot, out after it, YouTube from the uploads ledger", () => {
  const now = Date.parse("2026-10-25T18:00:00-05:00");
  const slots = { linkedin: "2026-10-25T07:30:00-05:00", facebook: "2026-10-26T17:10:00-05:00", youtube: "2026-10-25T17:45:00-05:00" };
  const byNet = (list) => Object.fromEntries(list.map((c) => [c.net, c.state]));
  assert.deepEqual(byNet(admin.channels(slots, null, now)), { linkedin: "out", x: "none", instagram: "none", "instagram-story": "none", facebook: "queued", youtube: "missing", tiktok: "none" });
  assert.equal(byNet(admin.channels(slots, "5b4Hr6r-cBk", now)).youtube, "live");
  const facebook = admin.channels(slots, null, now).find((c) => c.net === "facebook");
  assert.equal(facebook.via, "Facebook Page");
  assert.equal(admin.statusLabel(facebook), "Queued Oct 26, 17:10");
  assert.equal(admin.statusLabel(admin.channels(slots, null, now)[0]), "Out Oct 25");
  const later = admin.channels({ facebook: "2026-12-01T17:10:00-05:00", linkedin: "2026-12-01T07:30:00-05:00" }, null, now);
  assert.deepEqual(later.filter((c) => c.at).map((c) => c.state), ["queued", "planned"]);
  assert.equal(admin.statusLabel(later.find((c) => c.net === "facebook")), "Planned Dec 1, 17:10");
});

test("a pick with a remote image renders on the hub with its own thumbnail, link and kind label", () => {
  const item = Object.assign(admin.itemPost(admin.cleanItem(pick({ youtube: "5b4Hr6r-cBk" }))), { thumb: "https://example.com/a.png" });
  const html = card.cardHtml(item, COPY.es, "es");
  assert.match(html, /src="https:\/\/example.com\/a.png"/);
  assert.match(html, />Recomendado</);
  assert.match(html, /href="https:\/\/almanac.httparchive.org\/"/);
  assert.match(html, /data-video="5b4Hr6r-cBk"/);
  const page = hub.page("en", [Object.assign(item, { upcoming: false, date: "2026-10-01" })], "2026-10-24");
  const ld = JSON.parse(page.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  assert.equal(ld["@graph"].find((node) => node["@type"] === "ItemList").itemListElement[0].item.image, "https://example.com/a.png");
});

test("the committed hub applies the committed edits", () => {
  const { posts } = hub.collect();
  const ids = new Set(posts.map((p) => p.id));
  const fs = require("fs");
  const path = require("path");
  const file = path.join(__dirname, "../../assets/social/edits.json");
  const state = admin.clean(fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : null);
  Object.entries(state.edits).forEach(([id, edit]) => { if (edit.hidden) assert.ok(!ids.has(id), id); });
  assert.ok(posts.every((p) => p.thumb));
});
