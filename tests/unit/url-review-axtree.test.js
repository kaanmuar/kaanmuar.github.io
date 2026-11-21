const test = require("node:test");
const assert = require("node:assert/strict");
const axtree = require("../../functions/url-review-axtree");

// A hand-built Accessibility.getFullAXTree response (shape from the CDP reference).
function node(nodeId, role, name, extra) {
  return Object.assign({ nodeId: String(nodeId), ignored: false, role: { type: "role", value: role }, name: { type: "computedString", value: name }, childIds: [], backendDOMNodeId: 100 + Number(nodeId) }, extra);
}
function level(n) {
  return [{ name: "level", value: { type: "integer", value: n } }];
}

function fixture() {
  const nodes = [
    node(1, "RootWebArea", "Shop", { childIds: ["2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13"] }),
    node(2, "heading", "Shop", { properties: level(1), parentId: "1" }),
    node(3, "heading", "Sizes", { properties: level(4), parentId: "1" }),
    node(4, "link", "", { parentId: "1" }),
    node(5, "link", "Read more »", { parentId: "1" }),
    node(6, "link", "Pricing guide", { parentId: "1" }),
    node(7, "button", "", { parentId: "1" }),
    node(8, "img", "", { parentId: "1" }),
    node(9, "img", "", { ignored: true, parentId: "1" }),
    node(10, "textbox", "", { parentId: "1" }),
    node(11, "checkbox", "Subscribe", { parentId: "1" }),
    node(12, "button", "", { ignored: true, parentId: "1" }),
    node(13, "generic", "", { parentId: "1" }),
  ];
  return { nodes };
}

test("reduce finds each kind of problem and skips ignored nodes", () => {
  const report = axtree.reduce(fixture(), { url: "https://example.com/" });
  assert.equal(report.total, 13);
  assert.equal(report.ignored, 2);
  assert.deepEqual(report.counts, {
    "ax-heading-skip": 1,
    "ax-link-name": 1,
    "ax-link-generic": 1,
    "ax-button-name": 1,
    "ax-image-name": 1,
    "ax-field-name": 1,
    "ax-landmark-main": 1,
  });
  const skip = report.issues.find((issue) => issue.rule === "ax-heading-skip");
  assert.equal(skip.detail, "h1 then h4");
  assert.equal(skip.backendNodeId, 103);
  assert.equal(report.roles.link, 3);
});

test("a clean page with one main, one h1 and a title reports nothing", () => {
  const nodes = [
    node(1, "RootWebArea", "Home", { childIds: ["2", "3", "4"] }),
    node(2, "main", "", { parentId: "1", childIds: ["3", "4"] }),
    node(3, "heading", "Home", { properties: level(1), parentId: "2" }),
    node(4, "link", "Contact us", { parentId: "2" }),
  ];
  const report = axtree.reduce(nodes);
  assert.deepEqual(report.counts, {});
  assert.deepEqual(report.issues, []);
});

test("document title, missing and repeated landmarks and h1s are flagged", () => {
  const nodes = [
    node(1, "RootWebArea", "", { childIds: ["2", "3", "4", "5"] }),
    node(2, "main", "", { parentId: "1" }),
    node(3, "main", "", { parentId: "1" }),
    node(4, "heading", "A", { properties: level(1), parentId: "1" }),
    node(5, "heading", "B", { properties: level(1), parentId: "1" }),
  ];
  const report = axtree.reduce(nodes);
  assert.equal(report.counts["ax-document-title"], 1);
  assert.equal(report.counts["ax-landmark-main"], 1);
  assert.equal(report.counts["ax-heading-h1"], 1);
});

test("a cyclic, orphaned or malformed tree does not loop or throw", () => {
  const nodes = [
    node(1, "RootWebArea", "T", { childIds: ["2"] }),
    node(2, "link", "", { parentId: "1", childIds: ["1", "2", "99"] }),
    null,
    { nodeId: "7" },
  ];
  const report = axtree.reduce(nodes);
  assert.equal(report.counts["ax-link-name"], 1);
  assert.deepEqual(axtree.reduce(null).issues, []);
  assert.deepEqual(axtree.reduce({}).issues, []);
});

test("one rule lists at most MAX_PER_RULE problems but counts them all", () => {
  const kids = [];
  const nodes = [node(1, "RootWebArea", "T", { childIds: [] })];
  for (let i = 0; i < axtree.MAX_PER_RULE + 20; i++) {
    kids.push(String(i + 2));
    nodes.push(node(i + 2, "link", "", { parentId: "1" }));
  }
  nodes[0].childIds = kids;
  const report = axtree.reduce(nodes);
  assert.equal(report.counts["ax-link-name"], axtree.MAX_PER_RULE + 20);
  assert.equal(report.issues.filter((issue) => issue.rule === "ax-link-name").length, axtree.MAX_PER_RULE);
});

test("earl exports a failed assertion per problem and a passed one per clean rule", () => {
  const report = axtree.reduce(fixture(), { url: "https://example.com/" });
  const doc = axtree.earl(report, { date: "2026-11-20T00:00:00.000Z" });
  assert.match(doc["@context"].earl, /w3\.org\/ns\/earl#/);
  const graph = doc["@graph"];
  const failed = graph.filter((a) => a["earl:result"]["earl:outcome"]["@id"] === "earl:failed");
  const passed = graph.filter((a) => a["earl:result"]["earl:outcome"]["@id"] === "earl:passed");
  assert.equal(failed.length, report.issues.length);
  assert.equal(passed.length, axtree.ruleList().length - Object.keys(report.counts).length);
  const link = failed.find((a) => a["earl:test"]["@id"] === "urn:url-review:ax-link-name");
  assert.equal(link["earl:subject"]["dct:source"], "https://example.com/");
  assert.equal(link["earl:result"]["earl:pointer"]["ptr:expression"], "cdp:backendDOMNodeId=104");
  assert.deepEqual(JSON.parse(JSON.stringify(doc)), doc);
});

test("sarif exports 2.1.0 with every rule and one result per problem", () => {
  const report = axtree.reduce(fixture(), { url: "https://example.com/" });
  const log = axtree.sarif(report);
  assert.equal(log.version, "2.1.0");
  const run = log.runs[0];
  const ids = run.tool.driver.rules.map((rule) => rule.id);
  assert.deepEqual(ids, axtree.ruleList());
  assert.equal(run.results.length, report.issues.length);
  run.results.forEach((result) => {
    assert.equal(ids[result.ruleIndex], result.ruleId);
    assert.ok(["error", "warning", "note"].includes(result.level));
    assert.equal(result.locations[0].physicalLocation.artifactLocation.uri, "https://example.com/");
  });
  const rule = run.tool.driver.rules.find((r) => r.id === "ax-link-name");
  assert.deepEqual(rule.properties.tags, ["wcag244", "wcag412"]);
  assert.match(rule.helpUri, /^https:\/\/www\.w3\.org\/TR\/WCAG22\/#/);
});
