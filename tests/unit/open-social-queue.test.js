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
  assert.equal(list[0].url, "https://carlosandmunoz.com/media/social-posts/b1/feed/01-a.jpg");
});

test("Threads posts at the x slot; Instagram at its own feed and story slots, with the instagram caption and the story image", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "open-social-"));
  const dir = path.join(root, "media/social-posts/b2");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "captions.json"), JSON.stringify({ "01-a": { x: "A on X", instagram: "A on Instagram #qa" }, "02-b": { x: "B" } }));
  fs.writeFileSync(path.join(dir, "calendar.csv"), "Date,Time,Channel,Post,Asset\n2026-10-27,13:40,instagram-story,01-a,story/01-a.jpg\n2026-10-27,15:45,instagram,01-a,feed/01-a.jpg\n2026-10-27,21:05,x,01-a,feed/01-a.jpg\n2026-10-27,15:45,instagram,02-b,feed/02-b.jpg\n");
  const at = (list) => list.map((p) => [p.slug, new Date(p.at).toISOString()]);
  assert.deepEqual(at(q.posts("b2", root, "threads")), [["01-a", "2026-10-28T02:05:00.000Z"]]);
  assert.deepEqual(at(q.posts("b2", root, "instagram")), [["01-a", "2026-10-27T20:45:00.000Z"]]);
  const [story] = q.posts("b2", root, "instagram-story");
  assert.equal(story.url, "https://carlosandmunoz.com/media/social-posts/b2/story/01-a.jpg");
  assert.equal(q.caption(story, "instagram-story"), "");
  const [feed] = q.posts("b2", root, "instagram");
  assert.match(q.caption(feed, "instagram"), /^A on Instagram #qa\n\nhttps:\/\/carlosandmunoz\.com\/social\/b2\/01-a\.html\?utm_source=instagram&/);
  assert.match(q.caption(q.posts("b2", root, "threads")[0], "threads"), /utm_source=threads&/);
  assert.deepEqual(Object.keys(q.NETWORKS), Object.keys(q.ROUTES));
});

test("Threads drops the hashtag line, and each post knows its clip and the quiz it answers (#2701)", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "open-social-"));
  const dir = path.join(root, "media/social-posts/b3");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "captions.json"), JSON.stringify({ "01-quiz": { x: "A or B?\n#GEO #QAlab", kind: "quiz", answer: "02-a", lang: "es" }, "02-a": { x: "A 86, B 85.\n#GEO #QAlab", kind: "compare" } }));
  fs.writeFileSync(path.join(dir, "voiced.json"), JSON.stringify({ "02-a": { lang: "pt" } }));
  fs.writeFileSync(path.join(dir, "calendar.csv"), "Date,Time,Channel,Post,Asset\n2026-10-27,10:00,x,01-quiz,feed/01-quiz.jpg\n2026-10-28,10:00,x,02-a,feed/02-a.jpg\n");
  const [quiz, answer] = q.posts("b3", root, "threads");
  assert.equal(quiz.quiz, undefined);
  assert.equal(answer.quiz, "01-quiz");
  assert.match(quiz.clip.url, /\/releases\/download\/b3\/01-quiz\.mp4$/);
  assert.deepEqual([quiz.clip.lang, answer.clip.lang], ["es", "pt"]);
  assert.deepEqual([quiz.answerCap.kind, answer.quizCap.kind, quiz.quizCap, answer.answerCap], ["compare", "quiz", undefined, undefined]);
  assert.doesNotMatch(q.caption(answer, "threads"), /#GEO/);
  assert.match(q.caption(answer, "bluesky"), /#GEO #QAlab/);
});

test("the Threads client falls back to the plain card when a richer container is refused, and publishes once (#2701)", async () => {
  const made = [];
  let published = 0;
  const real = global.fetch;
  global.fetch = async (url, opts = {}) => {
    const u = String(url);
    const body = opts.body ? Object.fromEntries(new URLSearchParams(String(opts.body))) : null;
    if (opts.method === "HEAD") return { ok: !u.endsWith(".mp4") };
    if (u.endsWith("/me/threads") && body) {
      made.push(body);
      if (body.topic_tag) return { ok: false, status: 400, json: async () => ({ error: { message: "topic refused" } }) };
      return { ok: true, json: async () => ({ id: "c" + made.length }) };
    }
    if (u.endsWith("/me/threads_publish")) { published += 1; return { ok: true, json: async () => ({ id: "p1" }) }; }
    if (u.includes("fields=status")) return { ok: true, json: async () => ({ status: "FINISHED" }) };
    return { ok: true, json: async () => ({ permalink: "https://www.threads.com/@qaurlreview/post/p1" }) };
  };
  try {
    const client = q.NETWORKS.threads({ THREADS_TOKEN: "t" });
    const r = await client.post({ text: "Caption", url: "https://carlosandmunoz.com/a.jpg", alt: "Card", lang: "es", topic: "GEO", clip: { url: "https://github.com/o/r/releases/download/b/a.mp4", lang: "es" } });
    assert.deepEqual(r, { id: "p1", url: "https://www.threads.com/@qaurlreview/post/p1", uses: ["image"] });
    assert.deepEqual(made.map((b) => b.media_type + (b.topic_tag ? "+topic" : "")), ["IMAGE+topic", "IMAGE"]);
    assert.equal(published, 1);
  } finally {
    global.fetch = real;
  }
});

test("a Threads quiz goes out as its card with the place's location, then our poll reply; a refused GIF reply falls back to the poll (#2716-#2718)", async () => {
  const made = [];
  let published = 0;
  const real = global.fetch;
  global.fetch = async (url, opts = {}) => {
    const u = String(url);
    const body = opts.body ? Object.fromEntries(new URLSearchParams(String(opts.body))) : null;
    if (opts.method === "HEAD") return { ok: true };
    if (u.includes("/location_search?")) return { ok: true, json: async () => ({ data: [{ id: "77", name: "Bogotá", country: "Colombia" }] }) };
    if (u.endsWith("/me/threads") && body) {
      made.push(body);
      if (body.gif_attachment) return { ok: false, status: 400, json: async () => ({ error: { message: "gif refused" } }) };
      return { ok: true, json: async () => ({ id: "c" + made.length }) };
    }
    if (u.endsWith("/me/threads_publish")) { published += 1; return { ok: true, json: async () => ({ id: "p" + published }) }; }
    if (u.includes("fields=status")) return { ok: true, json: async () => ({ status: "FINISHED" }) };
    return { ok: true, json: async () => ({ permalink: "https://www.threads.com/@qaurlreview/post/p1" }) };
  };
  try {
    const client = q.NETWORKS.threads({ THREADS_TOKEN: "t" });
    const cap = { kind: "quiz", title: "Bogotá o Medellín: ¿qué sitio?" };
    const r = await client.post({ text: "Quiz", url: "https://carlosandmunoz.com/a.jpg", alt: "Card", lang: "es", cap, place: "Bogotá, Colombia", key: "b/01-quiz" });
    assert.equal(r.id, "p1");
    assert.deepEqual(r.uses, ["image", "location", "reply-poll", "reply poll"]);
    assert.equal(made[0].location_id, "77");
    assert.deepEqual(made.slice(1).map((b) => [b.reply_to_id, Boolean(b.gif_attachment), JSON.parse(b.poll_attachment).option_b]), [["p1", true, "Medellín"], ["p1", false, "Medellín"]]);
    assert.equal(published, 2);
  } finally {
    global.fetch = real;
  }
});

test("Threads fetches a clip from the signed address the release download redirects to, which robots.txt allows (#2728)", async () => {
  const made = [];
  const real = global.fetch;
  global.fetch = async (url, opts = {}) => {
    const u = String(url);
    const body = opts.body ? Object.fromEntries(new URLSearchParams(String(opts.body))) : null;
    if (opts.method === "HEAD" && u.endsWith(".mp4")) return { ok: false, status: 302, headers: { get: (h) => (h === "location" ? "https://release-assets.githubusercontent.com/signed/a.mp4?sig=1" : null) } };
    if (opts.method === "HEAD") return { ok: true, status: 200 };
    if (u.endsWith("/me/threads") && body) { made.push(body); return { ok: true, json: async () => ({ id: "c" + made.length }) }; }
    if (u.endsWith("/me/threads_publish")) return { ok: true, json: async () => ({ id: "p1" }) };
    if (u.includes("fields=status")) return { ok: true, json: async () => ({ status: "FINISHED" }) };
    return { ok: true, json: async () => ({ permalink: "" }) };
  };
  try {
    const r = await q.NETWORKS.threads({ THREADS_TOKEN: "t" }).post({ text: "Clip", url: "https://carlosandmunoz.com/a.jpg", alt: "Card", lang: "es", clip: { url: "https://github.com/o/r/releases/download/b/a.mp4", lang: "es" } });
    assert.deepEqual(r.uses, ["carousel", "video"]);
    assert.equal(made.find((b) => b.media_type === "VIDEO").video_url, "https://release-assets.githubusercontent.com/signed/a.mp4?sig=1");
  } finally {
    global.fetch = real;
  }
});

test("Threads and Instagram are skipped until their secrets are set", () => {
  assert.equal(q.NETWORKS.threads({}).ready, false);
  assert.equal(q.NETWORKS.instagram({ FACEBOOK_PAGE_TOKEN: "t" }).ready, false);
  assert.equal(q.NETWORKS["instagram-story"]({ FACEBOOK_PAGE_TOKEN: "t", INSTAGRAM_USER_ID: "1" }).ready, true);
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
  assert.equal(client.sent[1].lang, "en");
  const get = (slug) => ledger.find(book, "auto-2026-10-25/" + slug, "bluesky", "qalab.bsky.social");
  assert.equal(get("there").result, "sent");
  assert.equal(get("there").url, "https://bsky.app/p/0");
  assert.equal(get("held").error, "Hub first: not on the hub");
  assert.equal(get("boom").result, "failed");
  assert.equal(get("p1").result, "sent");
  assert.equal(get("p5"), null);
  assert.equal(get("sent"), null);
});

test("Telegram is one brand channel with its own ledger, ready once the bot token and the channel are set", () => {
  assert.equal(q.NETWORKS.telegram({ TELEGRAM_BOT_TOKEN: "t" }).ready, false);
  assert.equal(q.NETWORKS.telegram({ TELEGRAM_BOT_TOKEN: "t", TELEGRAM_CHANNEL: "@qalab_live" }).ready, true);
  assert.ok(q.BRAND.has("telegram"));
  assert.equal(q.LEDGERS.telegram, "assets/social/telegram.json");
  assert.deepEqual(q.ROUTES.telegram, { slot: "x", caption: "x" });
});

test("a brand channel posts each post in its own language", async () => {
  const es = post("es1", NOW - 60e3, { lang: "es", i18n: { es: { x: "Hola desde example.com\n\ncarlosandmunoz.com/qa-review?utm_source=x" } } });
  const en = post("en1", NOW - 30e3, { lang: "en" });
  const client = fakeClient();
  const book = ledger.empty();
  await q.run("telegram", client, [es, en], book, { live: true, now: NOW, gate: gate([]), face: q.ownFace });
  assert.deepEqual(client.sent.map((p) => p.lang), ["es", "en"]);
  assert.match(client.sent[0].text, /^Hola desde example\.com\n\ncarlosandmunoz\.com\/qa-review\?utm_source=telegram\n\nhttps:\/\/carlosandmunoz\.com\/social\/auto-2026-10-25\/es1\.html\?utm_source=telegram&/);
  assert.equal(ledger.find(book, "auto-2026-10-25/es1", "telegram", "qalab.bsky.social").result, "sent");
});

test("the Telegram client sends the feed image from the site with the caption, and links the channel post", async () => {
  const calls = [];
  const real = global.fetch;
  global.fetch = async (url, opts = {}) => {
    calls.push([String(url).replace(/bot[^/]+/, "bot*"), opts.method || "GET", opts.body ? JSON.parse(opts.body) : null]);
    if (String(url).includes("/getChat")) return { ok: true, json: async () => ({ ok: true, result: { username: "qalab_live" } }) };
    if (String(url).includes("/sendPhoto")) return { ok: true, json: async () => ({ ok: true, result: { message_id: 7 } }) };
    return { ok: true, status: 200, headers: { get: () => "image/jpeg" } };
  };
  try {
    const client = q.NETWORKS.telegram({ TELEGRAM_BOT_TOKEN: "t", TELEGRAM_CHANNEL: "@qalab_live" });
    assert.equal(await client.login(), "Telegram @qalab_live");
    assert.deepEqual(await client.recent(), []);
    const r = await client.post({ text: "Caption", url: "https://carlosandmunoz.com/media/social-posts/b/feed/a.jpg" });
    assert.deepEqual(r, { id: "7", url: "https://t.me/qalab_live/7", uses: ["image"] });
    const send = calls.find((c) => c[0].endsWith("/sendPhoto"));
    assert.deepEqual(send[2], { chat_id: "@qalab_live", photo: "https://carlosandmunoz.com/media/social-posts/b/feed/a.jpg", caption: "Caption" });
  } finally {
    global.fetch = real;
  }
});

// Answers each request by the first route its URL contains, logging every request; anything else is a plain 200.
function stubFetch(routes) {
  const calls = [];
  const real = global.fetch;
  global.fetch = async (url, opts = {}) => {
    const u = String(url);
    calls.push({ url: u, method: opts.method || "GET" });
    const route = routes.find(([match]) => u.includes(match));
    return route ? route[1](u, opts) : ok({});
  };
  return { calls, restore: () => { global.fetch = real; } };
}
const ok = (json, status = 200) => ({ ok: status < 300, status, json: async () => json, arrayBuffer: async () => new ArrayBuffer(8) });
const clipOf = (slug, lang) => ({ url: "https://github.com/o/r/releases/download/b/" + slug + ".mp4", lang });

test("run hands a composer network the clip, both halves of the quiz and the quiz's own post there", async () => {
  const book = ledger.empty();
  ledger.record(book, "auto-2026-10-25/q", { channel: "bluesky", profile: "qalab.bsky.social", result: "sent", id: "at://x/q", at: "2026-10-25T18:00:00.000Z" });
  const answer = Object.assign(post("a", NOW - 60e3), { quiz: "q", quizCap: { kind: "quiz", title: "Q" }, clip: clipOf("a", "en") });
  const client = fakeClient();
  await q.run("bluesky", client, [answer], book, { live: true, now: NOW, gate: gate([]) });
  assert.equal(client.sent[0].quote, "at://x/q");
  assert.equal(client.sent[0].quizCap.title, "Q");
  assert.deepEqual(client.sent[0].clip, clipOf("a", "en"));
  assert.match(client.sent[0].hub, /\/social\/auto-2026-10-25\/a\.html\?utm_source=bluesky&/);
});

test("the Bluesky client quotes the quiz with the card when the video service refuses the clip, uploading each once (#2704)", async () => {
  const records = [];
  const f = stubFetch([
    ["createSession", () => ok({ did: "did:plc:me", handle: "qalab.bsky.social", accessJwt: "j", didDoc: { service: [{ id: "#atproto_pds", serviceEndpoint: "https://pds.example" }] } })],
    ["releases/download", () => ok({})],
    ["getServiceAuth", () => ok({ token: "svc" })],
    ["uploadVideo", () => ok({ error: "Unauthorized", message: "email not verified" }, 401)],
    ["uploadBlob", () => ok({ blob: { $type: "blob", ref: { $link: "img" } } })],
    ["getPosts", (u) => ok({ posts: [{ uri: new URL(u).searchParams.get("uris"), cid: "bafyquiz" }] })],
    ["createRecord", (u, o) => { records.push(JSON.parse(o.body).record); return ok({ uri: "at://did:plc:me/app.bsky.feed.post/abc" }); }]
  ]);
  try {
    const client = q.NETWORKS.bluesky({ BLUESKY_HANDLE: "h", BLUESKY_APP_PASSWORD: "p" });
    await client.login();
    const r = await client.post({ text: "Berlin 86, Vienna 85.", image: __filename, alt: "Card", lang: "es", key: "b/02-a", quote: "at://did:plc:me/app.bsky.feed.post/quiz", clip: clipOf("02-a", "es") });
    assert.deepEqual(r, { id: "at://did:plc:me/app.bsky.feed.post/abc", url: "https://bsky.app/profile/qalab.bsky.social/post/abc", uses: ["image", "quote"] });
    assert.equal(records.length, 1);
    assert.equal(records[0].embed.$type, "app.bsky.embed.recordWithMedia");
    assert.deepEqual(records[0].embed.record, { $type: "app.bsky.embed.record", record: { uri: "at://did:plc:me/app.bsky.feed.post/quiz", cid: "bafyquiz" } });
    assert.equal(records[0].embed.media.$type, "app.bsky.embed.images");
    assert.equal(f.calls.filter((c) => c.url.includes("uploadVideo")).length, 1);
    assert.equal(new URL(f.calls.find((c) => c.url.includes("getServiceAuth")).url).searchParams.get("aud"), "did:web:pds.example");
  } finally {
    f.restore();
  }
});

test("the Bluesky client posts the card when a video record is refused as invalid, and stops at a server error (#2704)", async () => {
  const records = [];
  const f = stubFetch([
    ["createSession", () => ok({ did: "did:plc:me", handle: "qalab.bsky.social", accessJwt: "j" })],
    ["releases/download", () => ok({})],
    ["getServiceAuth", () => ok({ token: "svc" })],
    ["uploadVideo", () => ok({ jobId: "j1", state: "JOB_STATE_COMPLETED", blob: { $type: "blob", ref: { $link: "vid" } } })],
    ["uploadBlob", () => ok({ blob: { $type: "blob", ref: { $link: "img" } } })],
    ["createRecord", (u, o) => {
      records.push(JSON.parse(o.body).record);
      return records.length === 1 ? ok({ error: "InvalidRecord", message: "bad video" }, 400) : ok({ error: "InternalServerError" }, 500);
    }]
  ]);
  try {
    const client = q.NETWORKS.bluesky({ BLUESKY_HANDLE: "h", BLUESKY_APP_PASSWORD: "p" });
    await client.login();
    await assert.rejects(client.post({ text: "Clip", image: __filename, alt: "Card", lang: "en", key: "b/03", clip: clipOf("03", "en") }), /500/);
    assert.deepEqual(records.map((r) => r.embed.$type), ["app.bsky.embed.video", "app.bsky.embed.images"]);
    assert.deepEqual(records[0].embed.video, { $type: "blob", ref: { $link: "vid" } });
  } finally {
    f.restore();
  }
});

test("the Mastodon client posts a quiz as a poll without media, and drops a refused content warning but keeps the card (#2705)", async () => {
  const statuses = [];
  let uploads = 0;
  const f = stubFetch([
    ["/api/v2/media", () => { uploads += 1; return ok({ id: "m1", url: "https://files.example/m1.jpg" }); }],
    ["/api/v1/statuses", (u, o) => {
      const body = JSON.parse(o.body);
      statuses.push(body);
      return body.spoiler_text ? ok({ error: "Validation failed" }, 422) : ok({ id: "s" + statuses.length, url: "https://mastodon.social/@q/s" + statuses.length });
    }]
  ]);
  try {
    const client = q.NETWORKS.mastodon({ MASTODON_URL: "https://mastodon.social", MASTODON_TOKEN: "t" });
    const quiz = { kind: "quiz", title: "Berlin or Vienna: which city portal scored higher?", answer: "02-a" };
    const asked = await client.post({ text: "Berlin or Vienna?", image: __filename, alt: "Card", lang: "en", key: "b/01-quiz", cap: quiz });
    assert.deepEqual(asked.uses, ["poll"]);
    assert.deepEqual(statuses[0].poll, { options: ["Berlin", "Vienna"], expires_in: 86400 });
    assert.equal(statuses[0].media_ids, undefined);
    assert.equal(uploads, 0);
    const told = await client.post({ text: "Berlin 86, Vienna 85.", image: __filename, alt: "Card", lang: "en", key: "b/02-a", cap: { kind: "compare" }, quizCap: quiz });
    assert.deepEqual(told.uses, ["image"]);
    assert.deepEqual(statuses.slice(1).map((s) => [s.spoiler_text, s.media_ids]), [[quiz.title, ["m1"]], [undefined, ["m1"]]]);
    assert.equal(uploads, 1);
  } finally {
    f.restore();
  }
});

test("the Telegram client sends a quiz poll, falls back to the card when it is refused, and never retries after a server error (#2706)", async () => {
  const sent = [];
  let pollStatus = 400;
  const f = stubFetch([
    ["/sendPoll", (u, o) => { sent.push(["sendPoll", JSON.parse(o.body)]); return ok({ ok: false, error_code: pollStatus, description: "refused" }, pollStatus); }],
    ["/sendPhoto", (u, o) => { sent.push(["sendPhoto", JSON.parse(o.body)]); return ok({ ok: true, result: { message_id: 9 } }); }]
  ]);
  try {
    const client = q.NETWORKS.telegram({ TELEGRAM_BOT_TOKEN: "t", TELEGRAM_CHANNEL: "@qalab_live" });
    const args = { text: "Berlin or Vienna?", url: "https://carlosandmunoz.com/a.jpg", lang: "en", cap: { kind: "quiz", title: "Berlin or Vienna: which scored higher?" }, answerCap: { title: "Berlin 86, Vienna 85." } };
    const r = await client.post(args);
    assert.deepEqual(r.uses, ["image"]);
    assert.deepEqual(sent.map((s) => s[0]), ["sendPoll", "sendPhoto"]);
    assert.deepEqual([sent[0][1].chat_id, sent[0][1].type, sent[0][1].correct_option_ids], ["@qalab_live", "quiz", [0]]);
    pollStatus = 429;
    await assert.rejects(client.post(args), /429/);
    assert.deepEqual(sent.map((s) => s[0]), ["sendPoll", "sendPhoto", "sendPoll"]);
  } finally {
    f.restore();
  }
});

// A release clip of size bytes, and a sendVideo that refuses the URL as Telegram did in run 42676357559.
function telegramClipRoutes(size, sent) {
  return [
    ["/releases/download/", () => ({ ok: true, status: 200, headers: { get: (h) => (h === "content-length" ? String(size) : null) }, body: null, arrayBuffer: async () => new ArrayBuffer(size) })],
    ["/sendVideo", (u, o) => {
      if (!(o.body instanceof FormData)) {
        sent.push(["sendVideo", JSON.parse(o.body)]);
        return ok({ ok: false, error_code: 400, description: "Bad Request: failed to get HTTP URL content" }, 400);
      }
      sent.push(["upload", o.body]);
      return ok({ ok: true, result: { message_id: 11 } });
    }],
    ["/sendPhoto", (u, o) => { sent.push(["sendPhoto", JSON.parse(o.body)]); return ok({ ok: true, result: { message_id: 12 } }); }]
  ];
}

test("the Telegram client uploads a clip it cannot fetch by URL, with the plan's caption, cover and reply (#3004)", async () => {
  const sent = [];
  const f = stubFetch(telegramClipRoutes(8, sent));
  const log = console.log;
  console.log = () => {};
  try {
    const client = q.NETWORKS.telegram({ TELEGRAM_BOT_TOKEN: "t", TELEGRAM_CHANNEL: "@qalab_live" });
    const args = { text: "Berlin 86, Vienna 85.\n\nMore", url: "https://carlosandmunoz.com/a.jpg", lang: "en", quote: "41", clip: clipOf("a", "en") };
    const r = await client.post(args);
    assert.deepEqual(r.uses, ["video", "reply", "spoiler"]);
    assert.deepEqual(sent.map((s) => s[0]), ["sendVideo", "upload"]);
    assert.equal(sent[0][1].video, args.clip.url);
    const form = sent[1][1];
    assert.equal(form.get("chat_id"), "@qalab_live");
    assert.equal(form.get("caption"), args.text);
    assert.equal(form.get("cover"), args.url);
    assert.equal(form.get("supports_streaming"), "true");
    assert.deepEqual(JSON.parse(form.get("reply_parameters")), { message_id: 41, allow_sending_without_reply: true });
    assert.deepEqual(JSON.parse(form.get("caption_entities")), [{ type: "spoiler", offset: 0, length: "Berlin 86, Vienna 85.".length }]);
    const video = form.get("video");
    assert.deepEqual([video.name, video.type, video.size], ["a.mp4", "video/mp4", 8]);
    assert.ok(f.calls.some((c) => c.url === args.clip.url && c.method === "GET"));
  } finally {
    console.log = log;
    f.restore();
  }
});

test("the Telegram client posts the card when the clip it cannot fetch is over the 50 MB upload limit (#3004)", async () => {
  const sent = [];
  const f = stubFetch(telegramClipRoutes(50 * 1024 * 1024 + 1, sent));
  const log = console.log;
  const lines = [];
  console.log = (line) => lines.push(line);
  try {
    const client = q.NETWORKS.telegram({ TELEGRAM_BOT_TOKEN: "t", TELEGRAM_CHANNEL: "@qalab_live" });
    const r = await client.post({ text: "Caption", url: "https://carlosandmunoz.com/a.jpg", lang: "en", clip: clipOf("a", "en") });
    assert.deepEqual(r.uses, ["image"]);
    assert.deepEqual(sent.map((s) => s[0]), ["sendVideo", "sendPhoto"]);
    assert.match(lines.join("\n"), /Telegram refused video - .*failed to get HTTP URL content; no clip under 50 MB to upload/);
  } finally {
    console.log = log;
    f.restore();
  }
});

test("the Instagram client falls back from a refused reel and carousel to the card and publishes once; stories stay one image (#2702)", async () => {
  const made = [];
  let published = 0;
  const f = stubFetch([
    ["/media_publish", () => { published += 1; return ok({ id: "ig1" }); }],
    ["/1/media", (u, o) => {
      const body = Object.fromEntries(new URLSearchParams(String(o.body)));
      made.push(body);
      return ["REELS", "CAROUSEL"].includes(body.media_type) ? ok({ error: { message: "refused" } }, 400) : ok({ id: "c" + made.length });
    }],
    ["fields=status_code", () => ok({ status_code: "FINISHED" })],
    ["fields=permalink", () => ok({ permalink: "https://www.instagram.com/p/ig1/" })]
  ]);
  try {
    const env = { INSTAGRAM_USER_ID: "1", FACEBOOK_PAGE_TOKEN: "t" };
    const r = await q.NETWORKS.instagram(env).post({ text: "Caption", url: "https://carlosandmunoz.com/a.jpg", alt: "Card", lang: "es", clip: clipOf("a", "es") });
    assert.deepEqual(r, { id: "ig1", url: "https://www.instagram.com/p/ig1/", uses: ["image"] });
    assert.deepEqual(made.map((b) => (b.media_type || "IMAGE") + (b.is_carousel_item ? " item" : "")), ["REELS", "IMAGE item", "VIDEO item", "CAROUSEL", "IMAGE"]);
    assert.equal(made[3].children, "c2,c3");
    assert.equal(made[4].alt_text, "Card");
    assert.equal(published, 1);
    await q.NETWORKS["instagram-story"](env).post({ text: "", url: "https://carlosandmunoz.com/s.jpg", alt: "", lang: "es", clip: clipOf("a", "es") });
    assert.deepEqual(made[5], { image_url: "https://carlosandmunoz.com/s.jpg", media_type: "STORIES", access_token: "t" });
  } finally {
    f.restore();
  }
});

const notAvailable = () => ok({ error: { message: "Media ID is not available", type: "OAuthException", code: 9007, error_subcode: 2207027 } }, 400);

test("Instagram publishes again a container it says is not available yet, once it is (#3003)", async () => {
  const answers = [notAvailable, () => ok({ id: "ig1" })];
  const f = stubFetch([["/media_publish", () => answers.shift()()]]);
  try {
    const r = await q.publish(q.graph("https://graph.facebook.com/v23.0", "t", "Instagram"), "1", "c1", 4, 0);
    assert.deepEqual(r, { id: "ig1" });
    assert.equal(f.calls.filter((c) => c.url.endsWith("/1/media_publish")).length, 2);
  } finally {
    f.restore();
  }
});

test("Instagram does not publish again after any other refusal, and stops asking after the last try (#3003)", async () => {
  let published = 0;
  const f = stubFetch([["/media_publish", () => { published += 1; return ok({ error: { message: "Invalid parameter", code: 100 } }, 400); }]]);
  try {
    await assert.rejects(q.publish(q.graph("https://graph.facebook.com/v23.0", "t", "Instagram"), "1", "c1", 4, 0), /Instagram media_publish 400: Invalid parameter/);
    assert.equal(published, 1);
  } finally {
    f.restore();
  }
  published = 0;
  const g = stubFetch([["/media_publish", () => { published += 1; return notAvailable(); }]]);
  try {
    await assert.rejects(q.publish(q.graph("https://graph.facebook.com/v23.0", "t", "Instagram"), "1", "c1", 4, 0), (e) => e.code === 9007 && e.subcode === 2207027);
    assert.equal(published, 4);
  } finally {
    g.restore();
  }
});

test("the launch set (one captions file per post) goes to every direct network but Mastodon, each post in its own language", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "launch-"));
  const dir = path.join(root, "media/social-posts/launch-x");
  ["en", "es"].forEach((l) => fs.mkdirSync(path.join(dir, l), { recursive: true }));
  fs.writeFileSync(path.join(dir, "en/a11y-captions.json"), JSON.stringify({ x: "Keyboard first.\n\nTry it", instagram: "IG" }));
  fs.writeFileSync(path.join(dir, "es/a11y-captions.json"), JSON.stringify({ x: "Primero el teclado.\n\nPruébalo", instagram: "IG es" }));
  fs.writeFileSync(path.join(dir, "calendar.csv"), "Date,Time,Channel,Post,Asset\n2026-11-05,09:00,x,en/a11y,en/a11y-landscape.jpg\n2026-11-05,10:00,x,es/a11y,es/a11y-landscape.jpg\n");
  fs.mkdirSync(path.join(root, "social/launch-x/es"), { recursive: true });
  fs.writeFileSync(path.join(root, "social/launch-x/es/a11y.html"), "");
  assert.deepEqual(q.allBatches(root), ["launch-x"]);
  assert.deepEqual(q.posts("launch-x", root, "mastodon"), []);
  const list = q.posts("launch-x", root, "telegram");
  assert.deepEqual(list.map((p) => [p.slug, q.ownFace(p), q.caption(p, "telegram", q.ownFace(p)).split("\n")[0]]), [["en/a11y", "en", "Keyboard first."], ["es/a11y", "es", "Primero el teclado."]]);
  assert.equal(q.posts("launch-x", root, "bluesky").length, 2);
  const reddit = q.redditPosts(Date.parse("2026-11-05T16:00:00Z"), 48 * HOUR, root);
  assert.deepEqual(reddit, [{ key: "launch-x/es/a11y", at: Date.parse("2026-11-05T15:00:00Z"), lang: "es", title: "Primero el teclado.", url: "https://carlosandmunoz.com/social/launch-x/es/a11y.html?utm_source=reddit&utm_medium=social&utm_campaign=launch-x" }], "only the post whose hub page is in the site");
});

test("a Reddit title is the caption's first line without links or hashtags, cut to 300", () => {
  assert.equal(q.redditTitle("\nexample.com: 77. #QA https://x.y/z\n\nmore"), "example.com: 77.");
  const long = q.redditTitle("word ".repeat(100));
  assert.ok([...long].length <= 300 && long.endsWith("…"));
});

test("a dry run never logs in", async () => {
  const client = { login: async () => { throw new Error("logged in"); } };
  const counts = await q.run("mastodon", client, [post("p1", NOW - 60e3)], ledger.empty(), { live: false, now: NOW, gate: gate([]) });
  assert.equal(counts.posted, 0);
});
