const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const axtree = require("../../functions/url-review-axtree");
const insights = require("../../functions/url-review-insights");
const { english, EN } = require("../../functions/url-review-findings-en");

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

function collect(input, ctx) {
  const rows = [];
  const report = axtree.findings(input, (...args) => rows.push(args), ctx);
  return { report, rows };
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

test("findings maps each failed rule to an Accessibility finding with English copy", () => {
  const { report, rows } = collect(fixture());
  assert.equal(report.total, 13);
  const keys = rows.map((row) => row[3]);
  assert.deepEqual(keys.sort(), [
    "a11y-axtree-button-name",
    "a11y-axtree-field-name",
    "a11y-axtree-heading-skip",
    "a11y-axtree-image-name",
    "a11y-axtree-landmark-main",
    "a11y-axtree-link-generic",
    "a11y-axtree-link-name",
  ]);
  rows.forEach((row) => {
    assert.equal(row[0], "Accessibility");
    assert.ok(["fail", "risk"].includes(row[1]));
    assert.equal(row[2], "low");
    assert.ok(english(row[4]).length > 5);
    assert.ok(english(row[6]).length > 5);
  });
  const skip = rows.find((row) => row[3] === "a11y-axtree-heading-skip");
  assert.match(english(skip[5]), /heading named “Sizes”/);
  const generic = rows.find((row) => row[3] === "a11y-axtree-link-generic");
  assert.match(english(generic[5]), /Read more/);
  const unnamed = rows.find((row) => row[3] === "a11y-axtree-link-name");
  assert.deepEqual(unnamed.slice(0, 3), ["Accessibility", "fail", "low"]);
});

test("findings takes a reduce() report, a raw nodes array or a { tree } wrapper and stays silent otherwise", () => {
  const report = axtree.reduce(fixture());
  const viaReport = collect(report).rows.length;
  assert.ok(viaReport > 0);
  assert.equal(collect(fixture().nodes).rows.length, viaReport);
  assert.equal(collect({ tree: fixture().nodes }).rows.length, viaReport);
  assert.equal(collect({ report }).rows.length, viaReport);
  [null, undefined, "tree", 7, {}, { nodes: [] }, []].forEach((input) => assert.equal(collect(input).rows.length, 0));
});

test("a clean tree gives one pass finding", () => {
  const nodes = [
    node(1, "RootWebArea", "Home", { childIds: ["2", "3", "4"] }),
    node(2, "main", "", { parentId: "1", childIds: ["3", "4"] }),
    node(3, "heading", "Home", { properties: level(1), parentId: "2" }),
    node(4, "link", "Contact us", { parentId: "2" }),
  ];
  const { rows } = collect(nodes);
  assert.equal(rows.length, 1);
  assert.deepEqual([rows[0][1], rows[0][3]], ["pass", "a11y-axtree"]);
  assert.match(english(rows[0][5]), /^Read 4 nodes/);
});

test("findings skips a gap that the HTML pass or axe already reported", () => {
  const ctx = {
    findings: [
      { key: "a11y-linktext", verdict: "risk" },
      { key: "ax-link-name", verdict: "fail" },
      { key: "a11y-alt", verdict: "pass" },
      { key: "ax-button-name", verdict: "pass" },
    ],
  };
  const keys = collect(fixture(), ctx).rows.map((row) => row[3]);
  assert.ok(!keys.includes("a11y-axtree-link-generic"));
  assert.ok(!keys.includes("a11y-axtree-link-name"));
  // a pass finding does not count as reported
  assert.ok(keys.includes("a11y-axtree-image-name"));
  assert.ok(keys.includes("a11y-axtree-button-name"));
});

test("every mapped rule has English title, evidence and fix, and a rule in the reducer", () => {
  Object.keys(axtree.FINDING).forEach((ruleId) => {
    assert.ok(axtree.RULES[ruleId], ruleId);
    const key = axtree.FINDING[ruleId].key;
    ["title", "evidence", "fix"].forEach((part) => assert.ok(EN[key + "." + part], key + "." + part));
  });
  assert.deepEqual(Object.keys(axtree.FINDING).sort(), axtree.ruleList().slice().sort());
});

test("insights.analyze attaches tree findings from extras.axtree or input.axtree", () => {
  const home = { url: "https://example.com/", status: 200, inspect: {}, body: "<html></html>" };
  const viaExtras = insights.analyze({ pages: [home], extras: { axtree: fixture() } });
  const viaInput = insights.analyze({ pages: [home], axtree: axtree.reduce(fixture()) });
  [viaExtras, viaInput].forEach((analysis) => {
    const keys = analysis.findings.map((f) => f.key).filter((key) => key.startsWith("a11y-axtree"));
    assert.ok(keys.includes("a11y-axtree-button-name"), keys.join());
    assert.equal(analysis.axtree.total, 13);
  });
  const none = insights.analyze({ pages: [home] });
  assert.equal(none.axtree, null);
  assert.equal(none.findings.filter((f) => f.key.startsWith("a11y-axtree")).length, 0);
});

test("every a11y-axtree key is translated in all five other languages", () => {
  const keys = Object.keys(EN).filter((key) => key.startsWith("a11y-axtree"));
  assert.ok(keys.length >= 30);
  ["es", "pt", "de", "fr", "it"].forEach((lang) => {
    const source = fs.readFileSync(path.join(__dirname, "../../js/qa-review-findings-copy." + lang + ".js"), "utf8");
    keys.forEach((key) => assert.ok(source.includes('"' + key + '":'), lang + " " + key));
  });
});
