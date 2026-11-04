const test = require("node:test");
const assert = require("node:assert/strict");
const share = require("../../functions/jarvis-share");

test("share to post accepts only inbox paths and the media the workflow renders (#1420)", () => {
  assert.equal(share.inboxPath("social-inbox/abc_1.jpg"), "social-inbox/abc_1.jpg");
  assert.equal(share.inboxPath("social-inbox/../attachments/x.pdf"), null);
  assert.equal(share.inboxPath("attachments/x.jpg"), null);
  assert.equal(share.inboxPath("social-inbox/a/b.jpg"), null);
  assert.equal(share.mediaKind("image/jpeg"), "image");
  assert.equal(share.mediaKind("video/quicktime"), "video");
  assert.equal(share.mediaKind("image/gif"), null);
});

test("a Gemini draft becomes a captions entry: limits, #Shorts, Spanish only for English, caption fallbacks (#1420)", () => {
  const text = "```json\n" + JSON.stringify({
    lang: "en", kind: "news", title: "Chrome now flags expired certificates louder", alt: "A browser warning",
    linkedin: "L", x: "x".repeat(400), facebook: "F", instagram: "I", tiktok: "T", youtube: "Y", youtubeTitle: "Expired certificates #shorts",
    es: { title: "Chrome avisa más fuerte", alt: "Un aviso", linkedin: "L es", x: "X es" }
  }) + "\n```";
  const video = share.cleanDraft(text, "caption", true);
  assert.equal(video.kind, "news");
  assert.ok(video.x.length <= share.LIMITS.x);
  assert.ok(video.x.endsWith("…"));
  assert.equal(video.youtubeTitle, "Expired certificates #Shorts");
  assert.equal(video.i18n.es.title, "Chrome avisa más fuerte");
  assert.equal(video.i18n.es.facebook, undefined);
  assert.equal(video.textLang, undefined);

  const image = share.cleanDraft("not json", "Nuevo informe listo. Mira los resultados.", false);
  assert.equal(image.kind, "tip");
  assert.equal(image.title, "Nuevo informe listo.");
  assert.equal(image.linkedin, "Nuevo informe listo. Mira los resultados.");
  assert.equal(image.tiktok, undefined);
  assert.equal(image.youtubeTitle, undefined);

  const spanish = share.cleanDraft({ lang: "es", title: "Hola", es: { title: "x" } }, "Hola", false);
  assert.equal(spanish.textLang, "es");
  assert.equal(spanish.i18n, undefined);
});

test("the inbox calendar puts every channel in one Bogotá slot, clip channels only for video (#1420)", () => {
  const now = Date.parse("2026-10-26T04:10:00Z");
  const image = share.calendar("01-a", false, now, 30).trim().split("\n");
  assert.equal(image[0], "Date,Time,Channel,Post,Asset");
  assert.deepEqual(image.slice(1), ["linkedin", "x", "facebook"].map((ch) => `2026-10-25,23:40,${ch},01-a,feed/01-a.jpg`));
  const video = share.calendar("01-a", true, now, 30).trim().split("\n");
  assert.equal(video.length, 6);
  assert.equal(video[5], "2026-10-25,23:40,youtube,01-a,clip/01-a.mp4");
  assert.equal(share.batchName("AbC-123xyz9", now), "inbox-2026-10-25-abc123xy");
});
