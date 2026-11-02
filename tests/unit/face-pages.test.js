const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const { FACES, NETWORKS, SITE, accounts } = require("../../scripts/brand-kit/faces");
const pages = require("../../scripts/build-face-pages");
const hub = require("../../scripts/build-social-hub");

const ROOT = path.join(__dirname, "..", "..");
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");
const faces = Object.values(FACES);
const existing = faces.flatMap(accounts).map((a) => a.url);
const missing = faces.flatMap((face) => NETWORKS.filter((n) => !n.exists[face.id]).map((n) => n.profile(face.handle)));
const hrefs = (html) => [...html.matchAll(/href="(https:\/\/[^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, "&"));

test("each face page is what scripts/build-face-pages.js writes from faces.js", () => {
  for (const [file, html] of Object.entries(pages.outputs())) assert.equal(read(file), html, file + ": run node scripts/build-face-pages.js");
});

test("a face page links the face's accounts, its email, the other face and the review in each of its languages", () => {
  for (const face of faces) {
    const html = read(face.site);
    const links = hrefs(html);
    for (const a of accounts(face)) assert.ok(links.includes(a.url), face.site + " links " + a.url);
    for (const url of missing) assert.ok(!links.includes(url), face.site + " links " + url + ", which faces.js does not mark as existing");
    assert.match(html, new RegExp("href=\"mailto:" + face.email + "\""));
    assert.match(html, new RegExp("href=\"" + FACES[face.other].site + "\""));
    for (const lang of face.langs) assert.match(html, new RegExp("href=\"qa-review" + (lang === "en" ? "" : "-" + lang) + "\\.html\" hreflang=\"" + lang + "\""));
    assert.match(html, new RegExp("<html lang=\"" + face.lang + "\">"));
    assert.match(html, new RegExp("<link rel=\"canonical\" href=\"" + SITE + face.site + "\">"));
  }
});

test("a face page carries rel=\"me\" to its Mastodon profile only once the account exists", () => {
  const mastodon = NETWORKS.find((n) => n.id === "mastodon");
  for (const face of faces) {
    const html = read(face.site);
    const url = mastodon.profile(face.handle);
    const head = html.includes("<link rel=\"me\" href=\"" + url + "\">");
    const anchor = html.includes("href=\"" + url + "\" rel=\"me noopener\"");
    assert.equal(head, mastodon.exists[face.id], face.site + " <link rel=me>");
    assert.equal(anchor, mastodon.exists[face.id], face.site + " Mastodon anchor");
  }
  assert.ok(mastodon.exists.en, "@qalaburlreview has a Mastodon account");
});

test("the guide footer, the review facts, llms.txt and the hub list every account of both faces and no other", () => {
  const sources = {
    "qa-review-guide.html footer": read("qa-review-guide.html").split("<footer>")[1].split("</footer>")[0],
    "qa-review.html Elsewhere": read("qa-review.html").split("<dt>Elsewhere</dt>")[1].split("</dl>")[0],
    "qa-review.html sameAs": read("qa-review.html").split("\"sameAs\": [")[1].split("]")[0].replace(/"(https:[^"]+)"/g, "href=\"$1\""),
    "llms.txt Elsewhere": read("llms.txt").split("## Elsewhere")[1].split("\n## ")[0].replace(/\]\((https:[^)]+)\)/g, "] href=\"$1\""),
    "social hub Follow row": hub.page("es", [], "2026-11-02").split("<nav class=\"hub-follow\"")[1].split("</nav>")[0]
  };
  for (const [name, html] of Object.entries(sources)) {
    const links = hrefs(html).filter((url) => !url.startsWith(SITE));
    assert.deepEqual([...new Set(links)].sort(), [...existing].sort(), name);
    if (!name.endsWith("sameAs")) for (const face of faces) assert.ok(html.includes(face.site), name + " links " + face.site);
  }
});

test("profile links in the kits point at the face pages", () => {
  for (const face of faces) {
    const kit = JSON.parse(read("media/faces-2026-11/" + face.id + "/kit.json"));
    const sites = kit.face.accounts.flatMap((a) => a.fields).filter((f) => f.label === "Website").map((f) => f.value);
    assert.ok(sites.length > 0, face.id + " has Website fields");
    for (const site of sites) assert.ok(site.startsWith(SITE + face.site + "?utm_source="), face.id + ": " + site);
    assert.ok(read("media/faces-2026-11/" + face.id + "/checklist.md").includes(SITE + face.site + "?utm_source="), face.id + " checklist");
  }
});

test("the sitemap lists both face pages as language alternates", () => {
  const xml = read("sitemap.xml");
  for (const face of faces) {
    assert.match(xml, new RegExp("<loc>" + SITE + face.site + "</loc>"));
    assert.match(xml, new RegExp("hreflang=\"" + face.lang + "\" href=\"" + SITE + face.site + "\""));
  }
});
