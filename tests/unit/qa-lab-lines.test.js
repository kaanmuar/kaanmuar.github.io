const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const source = fs.readFileSync(path.resolve(__dirname, "../../js/qa-lab.js"), "utf8");

test("every LAB_LINE source link points at its case's id line in js/qa-lab.js", () => {
  const actual = {};
  source.split("\n").forEach((line, index) => {
    const match = line.match(/^\s+id: '([A-Z]+-\d+)'/);
    if (match) actual[match[1]] = index + 1;
  });
  const block = source.match(/const LAB_LINE = \{([\s\S]*?)\};/);
  assert.ok(block, "LAB_LINE missing");
  const mapped = [...block[1].matchAll(/'([A-Z]+-\d+)': (\d+)/g)];
  assert.ok(mapped.length > 0, "LAB_LINE is empty");
  const off = mapped.filter(([, id, line]) => actual[id] !== Number(line)).map(([, id, line]) => id + " is at " + actual[id] + ", not " + line);
  assert.deepEqual(off, []);
});
