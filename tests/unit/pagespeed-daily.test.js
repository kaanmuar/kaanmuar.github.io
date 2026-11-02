const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const pagesLib = require("../../scripts/pagespeed/pages");
const psi = require("../../scripts/pagespeed/psi");
const fixes = require("../../scripts/pagespeed/fixes");
const routine = require("../../scripts/pagespeed/routine");
const ai = require("../../scripts/pagespeed/ai");

const URL0 = "https://carlosandmunoz.com/";

test("every sitemap page once, mapped to its file in the repo", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ps-"));
  fs.writeFileSync(path.join(root, "index.html"), "<html></html>");
  fs.mkdirSync(path.join(root, "social"));
  fs.writeFileSync(path.join(root, "social", "index.html"), "<html></html>");
  fs.writeFileSync(path.join(root, "sitemap.xml"), `<urlset><url><loc>${URL0}</loc></url><url><loc>${URL0}qa-lab.html</loc></url><url><loc>${URL0}qa-lab.html</loc></url></urlset>`);
  fs.writeFileSync(path.join(root, "sitemap-social.xml"), `<urlset><url><loc>${URL0}social/</loc></url></urlset>`);
  const list = pagesLib.pages(root);
  assert.deepEqual(list.map((p) => [p.url, p.file, p.sitemap]), [
    [URL0, "index.html", "sitemap.xml"], [URL0 + "qa-lab.html", null, "sitemap.xml"], [URL0 + "social/", "social/index.html", "sitemap-social.xml"]
  ]);
  assert.equal(pagesLib.fileFor(URL0 + "a/b.html"), "a/b.html");
});

test("a PageSpeed answer keeps the score, the metrics and only the audits that fail", () => {
  const lhr = {
    lighthouseVersion: "13.6.0",
    categories: { performance: { score: 0.63 } },
    audits: {
      "largest-contentful-paint": { numericValue: 4123.4, score: 0.2 }, "first-contentful-paint": { numericValue: 1500, score: 0.8 },
      "total-blocking-time": { numericValue: 210, score: 0.7 }, "cumulative-layout-shift": { numericValue: 0.01, score: 1 }, "speed-index": { numericValue: 3000, score: 0.6 },
      "render-blocking-insight": { score: 0, title: "Render-blocking requests", details: { items: [{ url: URL0 + "js/app.js", wastedMs: 300 }] } },
      "image-delivery-insight": { score: 1, title: "Images", details: { items: [] } }
    }
  };
  const s = psi.summarize(lhr);
  assert.equal(s.score, 63);
  assert.equal(s.lcp, 4123);
  assert.deepEqual(Object.keys(s.audits), ["render-blocking-insight"]);
  assert.equal(s.audits["render-blocking-insight"].items[0].url, URL0 + "js/app.js");
});

test("the LCP image loads eagerly with high priority", () => {
  const html = '<body><img src="/assets/hero.jpg" loading="lazy" width="10" height="10"></body>';
  const ctx = { url: URL0, psi: { mobile: { lcpEl: { node: { snippet: '<img src="/assets/hero.jpg" loading="lazy" width="10" height="10"' } } } } };
  const r = fixes.lcp(html, ctx);
  assert.match(r.html, /<img src="\/assets\/hero.jpg" width="10" height="10" fetchpriority="high">/);
  assert.equal(r.fixes.length, 2);
});

test("only images that start below 1.5 screens on phone and desktop are lazy-loaded", () => {
  const html = '<img src="/top.png" width="1" height="1"><img src="/low.png" width="1" height="1"><img src="/nosize.png"><iframe src="/v.html"></iframe>';
  const places = {
    vh: { mobile: 800, desktop: 900 },
    mobile: [{ tag: "img", src: "/top.png", top: 100, shown: true }, { tag: "img", src: "/low.png", top: 3000, shown: true }, { tag: "iframe", src: "/v.html", top: 5000, shown: true }],
    desktop: [{ tag: "img", src: "/top.png", top: 100, shown: true }, { tag: "img", src: "/low.png", top: 2000, shown: true }, { tag: "iframe", src: "/v.html", top: 1000, shown: true }]
  };
  const r = fixes.lazy(html, { url: URL0, psi: {}, places });
  assert.match(r.html, /<img src="\/low.png" width="1" height="1" loading="lazy" decoding="async">/);
  assert.match(r.html, /<img src="\/top.png" width="1" height="1">/);
  assert.match(r.html, /<iframe src="\/v.html">/, "on desktop the frame is within 1.5 screens");
  assert.equal(fixes.lazy(html, { url: URL0, psi: {} }).fixes.length, 0, "without positions nothing is lazy-loaded");
});

test("a render-blocking script is deferred only when nothing after it needs it first", () => {
  const ctx = (blocking) => ({ url: URL0, readLocal: (p) => (p === "js/w.js" ? "document.write('x')" : "ok()"), psi: { mobile: { audits: { "render-blocking-insight": { items: blocking.map((u) => ({ url: URL0 + u })) } } } } });
  const last = '<head><script src="/js/a.js"></script></head><body></body>';
  assert.match(fixes.defer(last, ctx(["js/a.js"])).html, /<script src="\/js\/a.js" defer>/);
  const inlineAfter = '<head><script src="/js/a.js"></script><script>a()</script></head>';
  assert.equal(fixes.defer(inlineAfter, ctx(["js/a.js"])).fixes.length, 0);
  const writes = '<head><script src="/js/w.js"></script></head>';
  assert.equal(fixes.defer(writes, ctx(["js/w.js"])).fixes.length, 0);
  const thirdParty = '<head><script src="https://cdn.example.com/x.js"></script></head>';
  assert.equal(fixes.defer(thirdParty, { url: URL0, psi: { mobile: { audits: { "render-blocking-insight": { items: [{ url: "https://cdn.example.com/x.js" }] } } } } }).fixes.length, 0);
});

test("Google Fonts swap and preconnect; a new head line takes the indentation of the line above", () => {
  const html = '<html>\n  <head>\n    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter">\n  </head>\n</html>';
  const r = fixes.fonts(html, { url: URL0, psi: {} });
  assert.match(r.html, /family=Inter&amp;display=swap/);
  assert.match(r.html, /\n    <link rel="preconnect" href="https:\/\/fonts.gstatic.com" crossorigin>\n  <\/head>/);
});

test("only same-origin images PageSpeed would compress are re-encoded", () => {
  const ctx = { url: URL0, psi: { mobile: { audits: { "image-delivery-insight": { items: [
    { url: URL0 + "assets/a.png", reasons: ["Increasing the image compression factor could improve this image's download size."] },
    { url: URL0 + "assets/b.jpg", reasons: ["This image file is larger than it needs to be for its displayed dimensions."] },
    { url: "https://other.example/c.jpg", reasons: ["Increasing the image compression factor"] }
  ] } } } } };
  assert.deepEqual(fixes.imagesToCompress(ctx), ["assets/a.png"]);
});

test("a branch merges on its own only when nothing fell and something rose", () => {
  assert.equal(routine.verdict([{ file: "index.html", mobile: { before: 80, after: 86 }, desktop: { before: 95, after: 94 } }]).up, true);
  const fell = routine.verdict([{ file: "index.html", mobile: { before: 80, after: 90 }, desktop: { before: 95, after: 92 } }]);
  assert.equal(fell.up, false);
  assert.match(fell.reason, /Score fell on index.html \(desktop 95 → 92\)/);
  assert.equal(routine.verdict([{ file: "a.html", mobile: { before: 80, after: 81 } }]).up, false);
  assert.equal(routine.verdict([{ file: "a.html", mobile: { before: null, after: 81 } }]).up, false);
});

test("a run row counts the pages and keeps what each branch did", () => {
  const check = { at: "2026-11-01T06:00:00Z", pages: [
    { url: URL0, file: "index.html", mobile: { score: 85 }, desktop: { score: 91 } },
    { url: URL0 + "x.html", file: "x.html", mobile: { ok: false, error: "timed out" }, desktop: { ok: false, error: "timed out" } }
  ] };
  const row = routine.runRow({ check, safe: { branch: "pagespeed/safe-2026-11-01", fixes: [{ page: "index.html" }], verdict: { up: true } } });
  assert.deepEqual([row.status, row.pages, row.scored, row.failed, row.below, row.avg.mobile], ["ok", 2, 1, 1, 1, 85]);
  assert.equal(row.safe.branch, "pagespeed/safe-2026-11-01");
  const runs = routine.record([{ run: { id: 1 } }, { run: { id: 2 } }], Object.assign({}, row, { run: { id: 1 } }));
  assert.deepEqual(runs.map((r) => r.run.id), [1, 2]);
  assert.equal(routine.latest(check).pages[1].mobile.error, "timed out");
});

test("Gemini's edits apply only where the text occurs exactly once in a file it was shown", () => {
  const texts = { "a.html": "<p>x</p><p>x</p><b>y</b>" };
  const r = ai.apply(texts, [
    { file: "a.html", find: "<b>y</b>", replace: "<b>z</b>", why: "ok" },
    { file: "a.html", find: "<p>x</p>", replace: "", why: "twice" },
    { file: "b.html", find: "q", replace: "r", why: "not shown" }
  ]);
  assert.equal(r.texts["a.html"], "<p>x</p><p>x</p><b>z</b>");
  assert.equal(r.applied.length, 1);
  assert.deepEqual(r.skipped.map((s) => s.reason), ["the text occurs 2 times", "not a file it was shown"]);
  assert.deepEqual(ai.parse('```json\n{"edits":[]}\n```'), { edits: [] });
});

test("the daily workflow runs at 06:00 UTC and the merge workflow checks CI before it pushes", () => {
  const daily = fs.readFileSync(path.join(__dirname, "../../.github/workflows/pagespeed-daily.yml"), "utf8");
  const merge = fs.readFileSync(path.join(__dirname, "../../.github/workflows/pagespeed-merge.yml"), "utf8");
  assert.match(daily, /cron: '0 6 \* \* \*'/);
  assert.match(daily, /pagespeed-pr/);
  assert.match(merge, /for need in "Lint Code" url-review-unit playwright/);
  assert.match(merge, /pagespeed-merged/);
  const schedule = require("../../functions/ops-schedule");
  assert.ok((schedule.JOBS || []).some((j) => j.job === "pagespeed-daily.yml" && j.cron === "0 6 * * *"));
});
