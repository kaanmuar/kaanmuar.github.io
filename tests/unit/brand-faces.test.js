const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const { FACES, NETWORKS, LIMITS } = require("../../scripts/brand-kit/faces");

const ROOT = path.join(__dirname, "..", "..");

test("the two faces split the six languages without overlap", () => {
  const langs = Object.values(FACES).flatMap((f) => f.langs);
  assert.deepEqual([...langs].sort(), ["de", "en", "es", "fr", "it", "pt"]);
  assert.equal(FACES.en.email, "qalaburlreview@carlosandmunoz.com");
  assert.equal(FACES.es.email, "qaurlreview@carlosandmunoz.com");
});

test("every network has both faces; @qaurlreview exists only on Instagram and Threads", () => {
  assert.equal(NETWORKS.length, 11);
  for (const n of NETWORKS) {
    const metaOnly = n.id === "instagram" || n.id === "threads";
    assert.equal(n.exists.es, metaOnly, n.name + " @qaurlreview");
    assert.equal(n.exists.en, !metaOnly, n.name + " @qalaburlreview");
  }
});

test("every bio fits its network once the other face is named", () => {
  for (const face of Object.values(FACES)) {
    const other = FACES[face.other];
    for (const n of NETWORKS) {
      for (const [label, key] of n.fields) {
        if (!face.bios[key]) continue;
        const text = face.bios[key].replace("{other}", n.mention(other.handle));
        const max = Number((label.match(/\((\d+)\)/) || [])[1]) || LIMITS[key];
        assert.ok(text.length <= max, face.id + " " + n.name + " " + label + ": " + text.length + " > " + max);
      }
    }
  }
});

test("each face's rendered kit has every file it lists", () => {
  for (const face of Object.values(FACES)) {
    const kit = JSON.parse(fs.readFileSync(path.join(ROOT, "media", "faces-2026-11", face.id, "kit.json"), "utf8"));
    assert.equal(kit.face.accounts.length, NETWORKS.length);
    for (const file of kit.files) assert.ok(fs.existsSync(path.join(ROOT, file.file)), file.file);
  }
});
