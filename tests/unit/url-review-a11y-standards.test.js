const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const standards = require("../../functions/url-review-a11y-standards");
const axtree = require("../../functions/url-review-axtree");

test("every axtree rule has a standards row and at least one ACT or RGAA reference", () => {
  const cov = standards.coverage(axtree.ruleList());
  assert.deepEqual(cov.unmapped, []);
  assert.equal(cov.rules, axtree.ruleList().length);
  axtree.ruleList().forEach((id) => {
    assert.ok(standards.MAP[id], id + " has no row");
    const refs = standards.forRule(id);
    assert.ok(refs.rgaa.length > 0, id + " has no RGAA reference");
  });
  // No row for a rule that does not exist.
  Object.keys(standards.MAP).forEach((id) => assert.ok(axtree.RULES[id], id + " is not an axtree rule"));
});

test("coverage counts rules per system", () => {
  const cov = standards.coverage();
  assert.equal(cov.rules, 9);
  assert.equal(cov.rgaa, 9);
  assert.equal(cov.markuplint, 8);
  assert.equal(cov.act, 8);
  assert.equal(cov.emag, 8);
  assert.deepEqual(standards.coverage(["nope"]).unmapped, ["nope"]);
});

test("identifiers have the shape each catalogue uses", () => {
  Object.keys(standards.MAP).forEach((rule) => {
    const row = standards.forRule(rule);
    row.act.forEach((e) => assert.match(e.id, /^[0-9a-z]{6}$/));
    row.rgaa.forEach((e) => assert.match(e.id, /^(1[0-3]|[1-9])\.\d{1,2}$/));
    row.emag.forEach((e) => assert.match(e.id, /^[1-6]\.\d{1,2}$/));
    row.markuplint.forEach((e) => assert.match(e.id, /^[a-z]+(-[a-z0-9]+)*$/));
    allRefs(row).forEach((e) => assert.ok(["equivalent", "partial"].includes(e.match)));
  });
});

function allRefs(row) {
  return [].concat(row.act, row.rgaa, row.emag, row.markuplint);
}

test("forRule returns URLs and the exact ACT ids for the name rules", () => {
  const link = standards.forRule("ax-link-name");
  assert.deepEqual(link.act, [{ id: "c487ae", match: "equivalent", url: "https://act-rules.github.io/rules/c487ae" }]);
  assert.equal(link.rgaa[0].id, "6.2");
  assert.equal(standards.forRule("ax-document-title").act[0].id, "2779a5");
  assert.equal(standards.forRule("ax-button-name").act[0].id, "97a4e1");
  assert.equal(standards.forRule("ax-image-name").act[0].id, "23a2a8");
  assert.equal(standards.forRule("ax-field-name").act[0].id, "e086e5");
  assert.equal(standards.forRule("ax-link-generic").act[0].id, "5effbb");
});

test("an unknown or inherited id gets empty lists, not an error", () => {
  ["nope", "", "constructor", "__proto__", undefined, null].forEach((id) => {
    const refs = standards.forRule(id);
    standards.SYSTEMS.forEach((s) => assert.deepEqual(refs[s], []));
    assert.deepEqual(standards.tags(id), []);
    assert.deepEqual(standards.urls(id), []);
  });
});

test("forRule returns fresh objects, so a caller cannot edit the table", () => {
  const a = standards.forRule("ax-heading-skip");
  a.markuplint[0].id = "changed";
  a.markuplint.push({ id: "x" });
  assert.equal(standards.forRule("ax-heading-skip").markuplint[0].id, "no-skipped-heading-level");
  assert.equal(standards.forRule("ax-heading-skip").markuplint.length, 1);
});

test("forFinding maps an a11y-axtree-* key through the FINDING table", () => {
  const byKey = standards.forFinding("a11y-axtree-heading-h1", axtree.FINDING);
  assert.deepEqual(byKey, standards.forRule("ax-heading-h1"));
  assert.deepEqual(standards.forFinding("ax-link-name", axtree.FINDING), standards.forRule(""));
  assert.deepEqual(standards.forFinding("a11y-axtree-title"), standards.forRule(""));
  Object.keys(axtree.FINDING).forEach((rule) => {
    assert.deepEqual(standards.forFinding(axtree.FINDING[rule].key, axtree.FINDING), standards.forRule(rule));
  });
});

test("tags and ids are flat, deduplicated and prefixed by catalogue", () => {
  assert.deepEqual(standards.tags("ax-document-title"), ["act:2779a5", "rgaa4.1:8.5", "emag3.1:3.3", "markuplint:require-element"]);
  assert.deepEqual(standards.ids("ax-landmark-main"), {
    act: ["b40fd1", "cf77f2"],
    rgaa: ["9.2", "12.6"],
    emag: ["1.5"],
    markuplint: ["no-duplicate-visible-main"],
  });
  Object.keys(standards.MAP).forEach((rule) => {
    const t = standards.tags(rule);
    assert.equal(new Set(t).size, t.length);
  });
});

test("urls lists each catalogue page once", () => {
  const u = standards.urls("ax-field-name");
  assert.equal(new Set(u).size, u.length);
  const hostPath = (href) => {
    const p = new URL(href);
    return p.hostname + p.pathname;
  };
  const hosts = u.map(hostPath);
  assert.ok(hosts.includes("act-rules.github.io/rules/e086e5"));
  assert.ok(hosts.includes("markuplint.dev/docs/rules/require-accessible-name"));
  assert.ok(hosts.includes("markuplint.dev/docs/rules/label-has-control"));
});

test("sarif rules carry the standards next to the unchanged WCAG tags", () => {
  const log = axtree.sarif({ url: "https://example.com/", total: 1, ignored: 0, counts: {}, issues: [] });
  const rules = log.runs[0].tool.driver.rules;
  const rule = rules.find((r) => r.id === "ax-link-name");
  assert.deepEqual(rule.properties.tags, ["wcag244", "wcag412"]);
  assert.deepEqual(rule.properties.standards.act, ["c487ae"]);
  assert.ok(rule.properties.standardTags.includes("rgaa4.1:6.2"));
  rules.forEach((r) => assert.ok(r.properties.standardTags.length > 0, r.id));
});

test("earl tests list reference pages, for failed and passed assertions alike", () => {
  const report = {
    url: "https://example.com/",
    total: 2,
    ignored: 0,
    counts: { "ax-link-name": 1 },
    issues: [{ rule: "ax-link-name", role: "link", name: "", nodeId: "4", backendNodeId: 104, detail: "" }],
  };
  const graph = axtree.earl(report, { date: "2026-11-21T00:00:00.000Z" })["@graph"];
  const failed = graph.find((a) => a["earl:test"]["@id"] === "urn:url-review:ax-link-name");
  const refs = failed["earl:test"]["dct:references"].map((r) => r["@id"]);
  assert.ok(refs.some((id) => new URL(id).hostname === "act-rules.github.io" && new URL(id).pathname === "/rules/c487ae"));
  const passed = graph.find((a) => a["earl:test"]["@id"] === "urn:url-review:ax-button-name");
  assert.ok(
    passed["earl:test"]["dct:references"].some((r) => {
      const p = new URL(r["@id"]);
      return p.hostname === "act-rules.github.io" && p.pathname === "/rules/97a4e1";
    })
  );
  graph.forEach((a) => assert.ok(Array.isArray(a["earl:test"]["dct:references"])));
});

test("the module is data only: no scanner is required and no package is added", () => {
  const src = fs.readFileSync(path.join(__dirname, "../../functions/url-review-a11y-standards.js"), "utf8");
  const requires = [...src.matchAll(/require\(['"]([^'"]+)['"]\)/g)].map((m) => m[1]);
  assert.deepEqual(requires, []);
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, "../../package.json"), "utf8"));
  const all = Object.keys(Object.assign({}, pkg.dependencies, pkg.devDependencies));
  ["qualweb", "@qualweb/core", "markuplint", "emag-audit", "assistant-rgaa"].forEach((name) => assert.ok(!all.includes(name), name));
});
