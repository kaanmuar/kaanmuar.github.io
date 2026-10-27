const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { brandsIn, networks } = require("../../scripts/tips-studio/brands");
const { iconCandidates, bench } = require("../../scripts/tips-studio/site-assets");

test("a tip shows the most specific mark it names, never Google twice", () => {
  const marks = brandsIn({ title: ["Submit your sitemap", "*in Search Console.*"], body: "Google finds new pages faster.", action: "" });
  assert.deepStrictEqual(marks.map((m) => m.slug), ["googlesearchconsole"]);
  assert.match(marks[0].d, /^M/);
  assert.deepStrictEqual(brandsIn({ title: ["Security headers"], body: "Set nosniff.", action: "" }), []);
});

test("every network on the end card has its mark in designs/brand-logos", () => {
  const nets = networks();
  assert.deepStrictEqual(nets.map((n) => n.slug), ["youtube", "tiktok", "instagram", "linkedin", "x", "facebook", "bluesky", "mastodon"]);
  nets.forEach((n) => assert.ok(fs.existsSync(path.join(__dirname, "../../designs/brand-logos", n.slug + ".svg")), n.slug));
});

test("the site's sharpest icon is tried first, then the conventional paths", () => {
  const html = '<link rel="icon" href="/favicon-32.png" sizes="32x32"><link rel="apple-touch-icon" href="/touch.png" sizes="180x180">' +
    '<link rel="icon" type="image/svg+xml" href="/icon.svg"><link rel="mask-icon" href="/mask.svg"><link rel="icon" href="data:,">';
  assert.deepStrictEqual(iconCandidates(html, "https://www.example.com/en/").map((c) => c.url), [
    "https://www.example.com/icon.svg", "https://www.example.com/touch.png", "https://www.example.com/favicon-32.png",
    "https://www.example.com/apple-touch-icon.png", "https://www.example.com/favicon.ico"
  ]);
});

test("the benchmark places a score among the other published Live Reports", () => {
  const b = bench("example-not-published.test", 101);
  assert.ok(b.n >= 30);
  assert.strictEqual(b.pct, 100);
  assert.strictEqual(b.bins.length, 10);
  assert.strictEqual(b.bins.reduce((s, n) => s + n, 0), b.n);
  assert.strictEqual(bench("x.test", undefined), null);
});
