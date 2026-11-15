"use strict";
// Threads composer extras on the Mac agent's replies (#2710): what the queue asks for, and the agent adding each one
// where the composer has it while the text reply always goes.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const E = require("../../functions/engagement.js");
const M = require("../../functions/engagement-mac.js");
const T = require("../../functions/owner-tags.js");
const N = require("../../scripts/engagement-browser/networks.js");
const { topicOf } = require("../../scripts/threads-compose.js");
const { fakeDb } = require("./fixtures/fake-firestore.js");

const NOW = Date.parse("2026-11-05T15:00:00Z");
const CARD = "https://carlosandmunoz.com/media/social-posts/runs-3/feed/122-berlin.jpg";
const deps = (db) => ({ db, fetch: async () => ({ ok: false }), env: {}, now: NOW, inc: (n) => ({ inc: n }), push: async () => {} });
const approved = (extra) => ({ status: "approved", draft: "We check focus order before contrast.", lang: "en", ...extra });

test("a Threads reply's extras: its thread's topic in a scheduled post's words, an owner-tags card, a GIF only when asked and left today", () => {
  assert.equal(M.TOPIC_LABELS.Accessibility, topicOf("", "a11y"));
  assert.equal(M.TOPIC_LABELS.Performance, topicOf("", "perf"));
  assert.equal(M.TOPIC_LABELS.SEO, topicOf("", "seo"));
  const doc = (d) => Object.assign({ network: "threads", actions: { reply: approved() } }, d);
  assert.deepEqual(M.extrasFor(doc({ topic: "Accessibility" }), 0), { topic: "Accessibility" });
  assert.deepEqual(M.extrasFor(doc({ topic: "Performance" }), 2), { topic: "Web Performance" });
  assert.equal(M.extrasFor(doc({ topic: "Testing" }), 2), null, "only accessibility, performance and SEO threads");
  assert.equal(M.extrasFor(doc({ topic: "SEO", network: "x" }), 2), null, "only Threads");
  assert.deepEqual(M.extrasFor(doc({ topic: "Reports", ownerTags: { kind: "tags", image: CARD } }), 2), { image: CARD });
  assert.equal(M.extrasFor(doc({ ownerTags: { image: "https://evil.example/x.jpg" } }), 2), null, "only our own cards");
  assert.equal(M.extrasFor(doc({ ownerTags: { image: "https://carlosandmunoz.com/media/social-posts/../secret.jpg" } }), 2), null);
  const gif = doc({ actions: { reply: approved({ gif: "applause" }) } });
  assert.deepEqual(M.extrasFor(gif, 1), { gif: "applause" });
  assert.equal(M.extrasFor(gif, 0), null, "the day's GIFs are used up");
  assert.equal(M.extrasFor(doc({}), 2), null, "no GIF unless the draft asks");
  assert.deepEqual(M.extrasFor(Object.assign(gif, { ownerTags: { image: CARD } }), 2), { image: CARD }, "one attachment: the card wins");
});

test("Carlos asks for a GIF in his edit; the marker never goes out, and only Threads keeps the ask", () => {
  assert.deepEqual(E.gifAsk("Nice audit! [gif: slow clap]"), { text: "Nice audit!", gif: "slow clap" });
  assert.deepEqual(E.gifAsk("No GIF here"), { text: "No GIF here", gif: "" });
  const waiting = (network) => ({ network, seenAt: new Date(NOW - 3600000).toISOString(), actions: { reply: { status: "waiting", draft: "old", expiresAt: new Date(NOW + 3600000).toISOString() } } });
  const th = E.decideReply(waiting("threads"), "edit", "[GIF: applause] Focus order first, then contrast.", "carlos", NOW).reply;
  assert.equal(th.draft, "Focus order first, then contrast.");
  assert.equal(th.gif, "applause");
  const x = E.decideReply(waiting("x"), "edit", "Focus order first, then contrast. [gif: applause]", "carlos", NOW).reply;
  assert.equal(x.draft, "Focus order first, then contrast.");
  assert.equal(x.gif, undefined);
  assert.equal(E.decideReply(waiting("threads"), "approve", "", "carlos", NOW).reply.gif, undefined);
});

test("the queue hands Threads replies their extras within the day's GIF cap, and the result keeps what came of them", async () => {
  const db = fakeDb();
  const day = "engagement_daily/" + E.bogotaDay(NOW);
  await db.collection("engagement_daily").doc(E.bogotaDay(NOW)).set({ n: { threads: { gif: M.GIF_PER_DAY.threads - 1 } } });
  const post = (key, d) => db.collection("engagement_posts").doc(key).set(Object.assign({ seenAt: new Date(NOW).toISOString(), score: 5, lang: "en", via: "mac", url: "https://www.threads.com/@ana/post/C" + key.slice(-2), author: { handle: "ana" } }, d));
  await post("threads_aaaaaaaaaaaaaaaaaaaa", { network: "threads", id: "Caa", topic: "Accessibility", actions: { reply: approved({ gif: "applause" }) } });
  await post("threads_bbbbbbbbbbbbbbbbbbbb", { network: "threads", id: "Cbb", topic: "SEO", actions: { reply: approved({ gif: "thumbs up" }) } });
  await post("x_cccccccccccccccccccc", { network: "x", id: "3", topic: "SEO", actions: { reply: approved() } });

  const q = await M.queue(deps(db), { networks: ["threads", "x"] });
  const extras = Object.fromEntries(q.tasks.map((t) => [t.key, t.extras]));
  assert.equal([extras.threads_aaaaaaaaaaaaaaaaaaaa, extras.threads_bbbbbbbbbbbbbbbbbbbb].filter((x) => x.gif).length, 1, "one GIF was left today");
  assert.equal(extras.threads_bbbbbbbbbbbbbbbbbbbb.topic, "SEO");
  assert.equal(extras.x_cccccccccccccccccccc, undefined);

  const withGif = q.tasks.find((t) => t.extras && t.extras.gif);
  await M.result(deps(db), { key: withGif.key, action: "reply", ok: true, url: withGif.url, extras: { gif: "added", topic: "no topic field", bogus: "x" } });
  assert.deepEqual(db.data.get("engagement_posts/" + withGif.key).actions.reply.extras, { gif: "added", topic: "no topic field" });
  assert.equal(db.data.get(day).n.threads.gif, M.GIF_PER_DAY.threads);
});

test("owner tags keep each post's card for the composer", () => {
  const feed = { posts: [{ id: "runs-3/122-berlin", kind: "review", report: "berlin", image: "media/social-posts/runs-3/feed/122-berlin.jpg" }] };
  const ledger = { posts: { "runs-3/122-berlin": [{ channel: "threads", result: "sent", url: "https://www.threads.com/@qaurlreview/post/Cxyz", at: "2026-11-01" }] } };
  const [p] = T.ourPosts(feed, [ledger], [{ id: "berlin", host: "berlin.de" }]);
  assert.equal(p.image, "media/social-posts/runs-3/feed/122-berlin.jpg");
});

// --- The agent, on mock pages --------------------------------------------------------------------------------------

/** A page whose elements exist as `has(selectorPath, state)` says; every click, key and file is logged. */
function mockPage(has) {
  const log = [];
  const state = { reopened: 0, files: false, posted: false };
  let page;
  const loc = (p) => ({
    _p: p,
    first: () => loc(p + ">first"), last: () => loc(p + ">last"), nth: (i) => loc(p + ">nth" + i),
    locator: (s) => loc(p ? p + " " + s : s),
    filter: (o) => loc(p + "|" + (o.has ? o.has._p : String(o.hasText || ""))),
    getByRole: (role, o) => loc(p + " role=" + role + (o && o.name ? String(o.name) : "")),
    getByPlaceholder: (re) => loc(p + " placeholder=" + re),
    getByText: (re) => loc(p + " text=" + re),
    or: (other) => loc("(" + p + " OR " + other._p + ")"),
    page: () => page,
    count: async () => (has(p, state) ? 1 : 0),
    waitFor: async (o) => { if (has(p, state) !== !(o && o.state === "hidden")) throw new Error("Timeout waiting for " + p); },
    click: async () => { log.push("click " + p); if (/Post\|Publicar/.test(p)) state.posted = true; if (/aria-label="Reply"/.test(p)) state.reopened += 1; },
    scrollIntoViewIfNeeded: async () => {},
    innerText: async () => "",
    allInnerTexts: async () => [],
    getAttribute: async () => "",
    setInputFiles: async (f) => { log.push("files " + f); state.files = true; }
  });
  page = Object.assign(loc(""), {
    url: () => "https://www.threads.com/@ana/post/Cabc",
    goto: async (u) => { log.push("goto " + u); },
    evaluate: async () => null,
    waitForEvent: async () => { throw new Error("no file chooser"); },
    keyboard: { type: async (t) => { log.push("type " + t); }, press: async (k) => { log.push("press " + k); } },
    mouse: { wheel: async () => {} }
  });
  return { page, log, state };
}

// The post and its Reply button are there; the dialog has its reply box and Post until Post is pressed.
const base = (p, s) => {
  if (/captcha/.test(p)) return false;
  if (/^div\[data-pressable-container/.test(p)) return true;
  if (/^\[role="dialog"\]>first$/.test(p)) return !s.posted;
  if (/^\[role="dialog"\] \[contenteditable="true"\]>first$/.test(p)) return !s.posted;
  if (/^\[role="dialog"\] role=button\/\^\(Post\|Publicar\)\$\//.test(p)) return true;
  return null;
};
const typed = (log) => log.filter((l) => l.startsWith("type ")).map((l) => l.slice(5)).join("");
const fast = (t) => t.mock.method(globalThis, "setTimeout", (fn) => setImmediate(fn));
const task = (extras, more) => Object.assign({ key: "threads_a", network: "threads", url: "https://www.threads.com/@ana/post/Cabc", draft: "Focus order first.", extras }, more || {});

test("no composer control there: each extra says why, and the plain text reply still goes", async (t) => {
  fast(t);
  const { page, log, state } = mockPage((p, s) => base(p, s) || false);
  const r = await N.NETWORKS.threads.reply(page, task({ gif: "applause", topic: "SEO", image: CARD }, { imageError: "the image did not download: it answered 404" }));
  assert.deepEqual(r.extras, { gif: "no GIF button", topic: "no topic field", image: "the image did not download: it answered 404" });
  assert.equal(typed(log), "Focus order first.");
  assert.ok(state.posted);
  assert.equal(state.reopened, 1);
});

test("a step that closes the reply dialog costs the extras, never the reply: the dialog opens again bare", async (t) => {
  fast(t);
  let closed = false;
  const { page, log, state } = mockPage((p, s) => {
    if (/^\[role="dialog"\] \[contenteditable="true"\]>first$/.test(p)) return !s.posted && !(closed && s.reopened < 2);
    const b = base(p, s);
    if (b !== null) return b;
    return /Add a GIF|role=searchbox|giphy/.test(p);
  });
  const plain = page.locator;
  page.locator = (s) => {
    const l = plain(s);
    if (!/giphy/.test(s)) return l;
    return Object.assign(l, { first: () => Object.assign(plain(s).first(), { click: async () => { log.push("click gif"); closed = true; } }) });
  };
  const r = await N.NETWORKS.threads.reply(page, task({ gif: "applause" }));
  assert.equal(r.extras.gif, "lost when the reply box closed");
  assert.equal(state.reopened, 2, "the Reply button again");
  assert.equal(typed(log), "applauseFocus order first.", "the GIF search, then the reply in the new dialog");
  assert.ok(state.posted);
});

test("the topic field and the file input take their extras before the text", async (t) => {
  fast(t);
  const { page, log, state } = mockPage((p, s) => {
    const b = base(p, s);
    if (b !== null) return b;
    if (/placeholder=.*Community or topic/.test(p)) return true;
    if (/^\[role="dialog"\] input\[type="file"\]/.test(p)) return true;
    if (/^\[role="dialog"\] img, video$/.test(p)) return s.files;
    return false;
  });
  const r = await N.NETWORKS.threads.reply(page, task({ topic: "Accessibility", gif: "applause" }, { imageFile: "/tmp/card.jpg" }));
  assert.deepEqual(r.extras, { gif: "the image went instead", topic: "added", image: "added" });
  assert.ok(log.includes("files /tmp/card.jpg"));
  assert.equal(typed(log), "AccessibilityFocus order first.", "the topic into its field, then the reply");
  assert.ok(state.posted);
});

test("the card image downloads only from our own media, to a temp file", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "composer-"));
  let fetched = 0;
  const ok = async () => { fetched += 1; return { ok: true, status: 200, headers: { get: () => "image/jpeg" }, arrayBuffer: async () => new Uint8Array([255, 216, 255]).buffer }; };
  assert.deepEqual(await N.downloadImage({ extras: {} }, ok, dir), {});
  assert.equal((await N.downloadImage({ extras: { image: "https://example.com/x.jpg" } }, ok, dir)).error, "not one of our card images");
  assert.equal(fetched, 0);
  const got = await N.downloadImage({ key: "threads_a", extras: { image: CARD } }, ok, dir);
  assert.equal(path.extname(got.file), ".jpg");
  assert.equal(fs.readFileSync(got.file).length, 3);
  const missing = await N.downloadImage({ key: "k", extras: { image: CARD } }, async () => ({ ok: false, status: 404, headers: { get: () => "text/html" } }), dir);
  assert.match(missing.error, /did not download: it answered 404/);
  fs.rmSync(dir, { recursive: true, force: true });
});
