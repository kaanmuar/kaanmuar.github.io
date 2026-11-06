const test = require("node:test");
const assert = require("node:assert/strict");
const c = require("../../scripts/open-social-compose");
const { pollOf } = require("../../scripts/threads-compose");
const compare = require("../../media/social-posts/compare-2026-11/captions.json");

const base = { text: "Berlin 86, Vienna 85.\n\nRead your own scores.\n\nhttps://carlosandmunoz.com/social/b/s.html", url: "https://carlosandmunoz.com/card.jpg", alt: "Card", lang: "es" };
const clip = { url: "https://github.com/o/r/releases/download/b/s.mp4", lang: "es" };
const uses = (plans) => plans.map((p) => p.uses.join("+"));
const quiz = compare["01-quiz-berlin-vienna"];
const answer = compare["02-berlin-vienna"];

test("a title is the caption's own only in its language, else its translation (#2701)", () => {
  assert.equal(c.titleIn(quiz, "en"), quiz.title);
  assert.equal(c.titleIn(quiz, "es"), quiz.i18n.es.title);
  assert.equal(c.titleIn({ title: "Only English" }, "es"), "");
  assert.equal(c.titleIn({ title: "Hola", textLang: "es" }, "es"), "Hola");
  assert.equal(c.titleIn(undefined, "es"), "");
});

test("every compare answer names its quiz's winner in English, Spanish and Portuguese; a tie or an unclear name names none", () => {
  const pairs = Object.values(compare).filter((cap) => cap.kind === "quiz" && cap.answer);
  assert.ok(pairs.length >= 5);
  for (const q of pairs) for (const lang of ["en", "es", "pt"]) {
    const poll = pollOf(c.titleIn(q, lang));
    const line = c.titleIn(compare[q.answer], lang);
    const won = c.winnerOf(poll, line);
    assert.ok(won >= 0, lang + " " + q.title + " / " + line);
    const m = /^(.+?)\s+(\d+)\s*,\s*(.+?)\s+(\d+)/u.exec(line);
    const top = Number(m[2]) > Number(m[4]) ? m[1] : m[3];
    assert.ok([poll.option_a, poll.option_b][won].toLowerCase().includes(top.toLowerCase()), lang + " " + line);
  }
  const poll = { option_a: "Berlin", option_b: "Vienna" };
  assert.equal(c.winnerOf(poll, "Berlin 85, Vienna 85. A tie."), -1);
  assert.equal(c.winnerOf(poll, "Vienna 90, Berlin 70."), 1);
  assert.equal(c.winnerOf({ option_a: "Metro de Medellín", option_b: "Metro de Bogotá" }, "Metro 85, Bogotá 79."), -1);
  assert.equal(c.winnerOf(poll, "No scores here."), -1);
});

test("Bluesky: the voiced clip as a video, the quiz quoted with the card or clip, the digest as a link card (#2704)", () => {
  assert.deepEqual(uses(c.bluesky(Object.assign({ clip, quote: "at://did/app.bsky.feed.post/q" }, base))), ["video+quote", "image+quote", "video", "image"]);
  assert.deepEqual(uses(c.bluesky(Object.assign({}, base, { clip: { url: clip.url, lang: "pt" } }))), ["image"]);
  assert.deepEqual(uses(c.bluesky(Object.assign({ cap: { kind: "news" }, hub: "https://carlosandmunoz.com/social/d/01.html" }, base))), ["card", "image"]);
  assert.deepEqual(uses(c.bluesky(Object.assign({ cap: { kind: "news" }, hub: "https://h", quote: "at://q" }, base))), ["image+quote", "card", "image"]);
});

test("Mastodon: a compare quiz is text with a 24-hour poll, the answer hides behind its quiz's question, the voiced clip is a video (#2705)", () => {
  const [poll, ...rest] = c.mastodon(Object.assign({}, base, { cap: quiz, clip }));
  assert.deepEqual(poll, { uses: ["poll"], status: { status: base.text, poll: { options: ["Berlín", "Viena"], expires_in: 86400 } } });
  assert.deepEqual(rest.map((p) => p.media), ["video", "image"]);
  const reveal = c.mastodon(Object.assign({}, base, { cap: answer, quizCap: quiz }));
  assert.deepEqual(uses(reveal), ["image+content-warning", "image"]);
  assert.equal(reveal[0].status.spoiler_text, quiz.i18n.es.title);
  assert.deepEqual(uses(c.mastodon(Object.assign({}, base, { cap: answer, quizCap: { title: "English only" } }))), ["image"]);
});

test("Telegram: a compare quiz is a quiz poll carrying the card and caption, the answer replies under a spoiler, the voiced clip is a video (#2706)", () => {
  const [poll, photo] = c.telegram(Object.assign({}, base, { cap: quiz, answerCap: answer }));
  assert.equal(poll.method, "sendPoll");
  assert.deepEqual(poll.uses, ["quiz", "image"]);
  assert.deepEqual(poll.body.options, [{ text: "Berlín" }, { text: "Viena" }]);
  assert.deepEqual(poll.body.correct_option_ids, [0]);
  assert.equal(poll.body.question, quiz.i18n.es.title);
  assert.equal(poll.body.description, base.text);
  assert.deepEqual(poll.body.media, { type: "photo", media: base.url });
  assert.equal(poll.body.explanation, answer.i18n.es.title);
  assert.deepEqual(photo, { uses: ["image"], method: "sendPhoto", body: { photo: base.url, caption: base.text } });
  const regular = c.telegram(Object.assign({}, base, { cap: quiz, answerCap: { i18n: { es: { title: "Berlín 85, Viena 85." } } } }))[0];
  assert.deepEqual(regular.uses, ["poll", "image"]);
  assert.equal(regular.body.type, undefined);
  const reply = c.telegram(Object.assign({}, base, { cap: answer, quote: "41", clip }));
  assert.deepEqual(uses(reply), ["video+reply+spoiler", "image+reply+spoiler", "image"]);
  assert.deepEqual(reply[0].body.reply_parameters, { message_id: 41, allow_sending_without_reply: true });
  assert.deepEqual(reply[0].body.caption_entities, [{ type: "spoiler", offset: 0, length: "Berlin 86, Vienna 85.".length }]);
  assert.equal(reply[0].body.cover, base.url);
  assert.deepEqual(uses(c.telegram(base)), ["image"]);
});

test("Instagram: the voiced clip is a reel shared to the feed with the card as cover, then a card and clip carousel (#2702)", () => {
  const [reel, carousel, image] = c.instagram(Object.assign({ clip }, base));
  assert.deepEqual(reel.params, { media_type: "REELS", video_url: clip.url, caption: base.text, share_to_feed: "true", cover_url: base.url });
  assert.deepEqual(carousel.items.map((i) => i.media_type || "IMAGE"), ["IMAGE", "VIDEO"]);
  assert.ok(carousel.items.every((i) => i.is_carousel_item === "true"));
  assert.equal(carousel.params.media_type, "CAROUSEL");
  assert.deepEqual(image.params, { caption: base.text, image_url: base.url, alt_text: "Card" });
  assert.deepEqual(uses(c.instagram(Object.assign({}, base, { clip: { url: clip.url, lang: "en" } }))), ["image"]);
});

test("a clip's aspect ratio is read from its first track header with a size, in either header version", () => {
  const tkhd = (version, width, height) => {
    const body = Buffer.alloc(4 + (version === 1 ? 32 : 20) + 16 + 36 + 8);
    body[0] = version;
    body.writeUInt32BE(width * 65536, body.length - 8);
    body.writeUInt32BE(height * 65536, body.length - 4);
    return Buffer.concat([Buffer.from([0, 0, 0, 8 + body.length]), Buffer.from("tkhd"), body]);
  };
  assert.deepEqual(c.aspectOf(Buffer.concat([Buffer.from("....moov"), tkhd(0, 1080, 1920), tkhd(0, 0, 0)])), { width: 1080, height: 1920 });
  assert.deepEqual(c.aspectOf(Buffer.concat([tkhd(0, 0, 0), tkhd(1, 1280, 720)])), { width: 1280, height: 720 });
  assert.equal(c.aspectOf(Buffer.from("no boxes")), null);
});
