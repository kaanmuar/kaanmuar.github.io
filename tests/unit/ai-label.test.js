const test = require("node:test");
const assert = require("node:assert/strict");
const { aiLabel, isSynthetic, LABELED } = require("../../scripts/ai-label");
const { inputsFor } = require("../../scripts/buffer-queue");

// #3824: a clip with a synthetic voice carries the network's AI-generated label, where Buffer's API takes one.

test("a synthetic clip is labelled on TikTok, YouTube, Instagram and X, and nowhere else", () => {
	["tiktok", "youtube", "instagram", "twitter"].forEach((s) => assert.deepEqual(aiLabel(s, { video: true }), { isAiGenerated: true }, s));
	assert.equal(aiLabel("facebook", { video: true }), null, "Facebook has no field in Buffer's API");
	assert.equal(aiLabel("linkedin", { video: true }), null, "LinkedIn has no field in Buffer's API");
	assert.deepEqual([...LABELED].sort(), ["instagram", "tiktok", "twitter", "youtube"]);
});

test("a still image is not labelled: the synthetic voice is in the video", () => {
	assert.equal(aiLabel("tiktok", { video: false }), null);
	assert.equal(aiLabel("instagram", {}), null);
});

test("a clip the operator voiced himself is not labelled; a clip with no record is", () => {
	assert.equal(isSynthetic({ speaker: "owner" }), false);
	assert.equal(isSynthetic({ voice: "carlos" }), false);
	assert.equal(isSynthetic({ voice: "en-w" }), true);
	assert.equal(isSynthetic(null), true);
	assert.equal(aiLabel("youtube", { video: true, record: { speaker: "owner" } }), null);
	assert.deepEqual(aiLabel("youtube", { video: true, record: { speaker: "ai" } }), { isAiGenerated: true });
});

const cap = {
	linkedin: "In.",
	x: "On X.",
	instagram: "Ig.",
	facebook: "Fb.",
	tiktok: "Tt.",
	youtube: "Yt.",
	youtubeTitle: "T",
	title: "Story",
	alt: "a",
	kind: "news",
};
const posts = (service, extra = {}) =>
	inputsFor({ id: "c", service }, "demo-slug", Object.assign({}, cap, extra), "https://site/media", "https://clips", {}, "b-no-batch");

test("the TikTok clip post carries isAiGenerated, under tiktok", () => {
	const [post] = posts("tiktok");
	assert.deepEqual(post.input.metadata, { tiktok: { isAiGenerated: true } });
});

test("the YouTube clip post keeps its title and category and adds isAiGenerated", () => {
	const [post] = posts("youtube");
	assert.equal(post.input.metadata.youtube.title, "T");
	assert.equal(post.input.metadata.youtube.isAiGenerated, true);
});

test("an Instagram post with a still image is not labelled", () => {
	const [feed] = posts("instagram");
	assert.equal(feed.input.metadata.instagram.isAiGenerated, undefined);
	assert.equal(feed.input.metadata.instagram.type, "post");
});

test("an Instagram reel with the synthetic clip is labelled and keeps its type", () => {
	const [feed] = posts("instagram", { clipLang: "en" });
	assert.equal(feed.input.metadata.instagram.type, "reel");
	assert.equal(feed.input.metadata.instagram.isAiGenerated, true);
});

test("Facebook and LinkedIn posts never carry the label", () => {
	const [fb] = posts("facebook");
	assert.equal(fb.input.metadata && fb.input.metadata.isAiGenerated, undefined);
	const [li] = posts("linkedin");
	assert.equal(li.input.metadata && li.input.metadata.isAiGenerated, undefined);
});
