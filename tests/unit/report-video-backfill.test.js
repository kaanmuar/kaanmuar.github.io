const test = require("node:test");
const assert = require("node:assert");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { isReportPost, kindOf, clipFor, clipMatchesPost, actionFor, plan, summarize, MATRIX } = require("../../scripts/report-video-backfill");

test("kindOf and isReportPost", () => {
  assert.equal(kindOf("auto-2026-10-22", {}), "review");
  assert.equal(kindOf("tips-2026-10", { kind: "tip" }), "tip");
  assert.ok(isReportPost("runs-100", { title: "x" }));
  assert.ok(!isReportPost("tips-2026-10", { kind: "tip", title: "x" }));
});

test("clipFor reads voiced.json and builds a release URL", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "rvb-"));
  const batch = "runs-100";
  const slug = "01-wikipedia";
  fs.mkdirSync(path.join(root, "media/social-posts", batch, "feed"), { recursive: true });
  fs.writeFileSync(path.join(root, "media/social-posts", batch, "feed", slug + ".jpg"), "");
  fs.writeFileSync(path.join(root, "media/social-posts", batch, "voiced.json"), JSON.stringify({ [slug]: { lang: "en" } }));
  const clip = clipFor(batch, slug, root, "owner/repo");
  assert.equal(clip.lang, "en");
  assert.match(clip.url, /releases\/download\/runs-100\/01-wikipedia\.mp4$/);
});

test("actionFor maps channels and clip language", () => {
  const clip = { lang: "en", url: "https://x/a.mp4" };
  assert.equal(actionFor("x", clip, "en", true).action, "skip");
  assert.equal(actionFor("linkedin", clip, "en", true).action, "edit");
  assert.equal(actionFor("facebook", clip, "en", true).action, "new-post");
  assert.equal(actionFor("linkedin", null, "en", true).action, "skip-no-clip");
  assert.equal(actionFor("bluesky", { lang: "es", url: "u" }, "en", true).action, "skip-lang");
  assert.equal(actionFor("linkedin", clip, "en", false).action, "edit");
});

test("plan ties ledger sent rows to report captions", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "rvb-plan-"));
  const batch = "auto-2026-10-22";
  const slug = "02-acme";
  const postId = batch + "/" + slug;
  fs.mkdirSync(path.join(root, "media/social-posts", batch, "feed"), { recursive: true });
  fs.mkdirSync(path.join(root, "assets/social"), { recursive: true });
  fs.writeFileSync(path.join(root, "media/social-posts", batch, "feed", slug + ".jpg"), "");
  fs.writeFileSync(path.join(root, "media/social-posts", batch, "captions.json"), JSON.stringify({
    [slug]: { kind: "review", title: "Acme", lang: "en", textLang: "en", linkedin: "Acme", x: "Acme" }
  }));
  fs.writeFileSync(path.join(root, "media/social-posts", batch, "voiced.json"), JSON.stringify({ [slug]: { lang: "en" } }));
  fs.writeFileSync(path.join(root, "assets/social/buffer.json"), JSON.stringify({
    version: 1,
    posts: { [postId]: [{ channel: "linkedin", profile: "linkedin", id: "b1", at: "2026-10-01T12:00:00.000Z", result: "sent" }] }
  }));
  const rows = plan({ root, sentOnly: true });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].action, "edit");
  assert.equal(summarize(rows).byAction.edit, 1);
});

test("MATRIX documents every channel the ledgers use", () => {
  assert.ok(MATRIX.linkedin);
  assert.ok(MATRIX.bluesky);
  assert.ok(MATRIX.facebook);
});