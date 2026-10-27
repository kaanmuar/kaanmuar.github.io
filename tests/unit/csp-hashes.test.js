const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const csp = require("../../scripts/build-csp-hashes");

const ROOT = path.join(__dirname, "..", "..");
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");
const rootPages = fs.readdirSync(ROOT).filter((name) => name.endsWith(".html"));
const HANDLER = /\son[a-z]{3,}\s*=\s*\\?["'`]/gi;

test("hashes cover inline scripts only, skip data blocks and comments, and replace 'unsafe-inline'", () => {
  const page = [
    `<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-inline' 'sha256-old=' https://x.test; style-src 'self' 'unsafe-inline'">`,
    "<script>a()</script>",
    `<script type="module">b()</script>`,
    `<script src="c.js"></script>`,
    `<script type="application/ld+json">{"a":1}</script>`,
    "<!-- <script>commented()</script> -->",
    "<script>a()</script>"
  ].join("\n");
  const out = csp.apply(page);
  const scriptSrc = out.match(/script-src[^;]*/)[0];
  assert.equal(scriptSrc, `script-src 'self' https://x.test ${csp.hash("a()")} ${csp.hash("b()")}`);
  assert.match(out, /style-src 'self' 'unsafe-inline'/, "style-src is left alone");
  assert.equal(csp.apply(out), out);
  assert.equal(csp.hash("a()"), "'sha256-" + require("crypto").createHash("sha256").update("a()").digest("base64") + "'");
});

test("every page's script-src lists its inline scripts' hashes and no 'unsafe-inline'", () => {
  for (const page of rootPages.concat(["qa-review-social.html"])) {
    const html = read(page);
    const scriptSrc = (html.match(/Content-Security-Policy"\s+content="[^"]*?(script-src[^;"]*)/) || [])[1];
    assert.ok(scriptSrc, `${page} has a CSP with script-src`);
    assert.doesNotMatch(scriptSrc, /'unsafe-inline'/, page);
    assert.equal(csp.apply(html), html, `${page}: run node scripts/build-csp-hashes.js`);
  }
});

test("pages and the scripts that render HTML use no inline event handlers or javascript: URLs", () => {
  const js = [];
  (function walk(dir) {
    for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(rel);
      else if (/\.m?js$/.test(entry.name) && !/\.min\.js$/.test(entry.name)) js.push(rel);
    }
  })("js");
  for (const file of rootPages.concat(js, ["scripts/build-social-hub.js", "social/runs-3/77-fiba-pt.html"])) {
    const text = read(file);
    assert.deepEqual(text.match(HANDLER) || [], [], `${file} sets an inline event handler, which script-src refuses`);
    assert.doesNotMatch(text, /href\s*=\s*\\?["']javascript:/i, `${file} has a javascript: URL`);
  }
});

test("the Python twin in build-review-langs.py hashes like the Node builder", () => {
  const out = execFileSync("python3", ["-c", [
    "import sys, pathlib; sys.path.insert(0, 'scripts'); import csp_hashes",
    "stale = [p for p in sys.argv[1:] if csp_hashes.apply(pathlib.Path(p).read_text(encoding='utf-8')) != pathlib.Path(p).read_text(encoding='utf-8')]",
    "print(','.join(stale))"
  ].join("\n"), ...rootPages], { cwd: ROOT, encoding: "utf8" });
  assert.equal(out.trim(), "");
});
