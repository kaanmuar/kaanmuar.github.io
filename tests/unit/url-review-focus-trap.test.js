const test = require("node:test");
const assert = require("node:assert/strict");
const trap = require("../../functions/url-review-focus-trap");
const focus = require("../../functions/url-review-focus-order");
const { english, EN } = require("../../functions/url-review-findings-en");

test("orderTabStops puts positive tabindex first, ascending, then document order", () => {
  const stops = [
    { id: "a", tabIndex: null, docIndex: 0 },
    { id: "b", tabIndex: 3, docIndex: 1 },
    { id: "c", tabIndex: 0, docIndex: 2 },
    { id: "d", tabIndex: 1, docIndex: 3 },
    { id: "e", tabIndex: 3, docIndex: 4 },
  ];
  assert.deepEqual(
    trap.orderTabStops(stops).map((s) => s.id),
    ["d", "b", "e", "a", "c"]
  );
});

test("countMoved tallies positions that differ from document order", () => {
  const doc = ["a", "b", "c", "d"];
  const tab = ["d", "b", "a", "c"];
  assert.equal(trap.countMoved(doc, tab), 3);
  assert.equal(trap.countMoved(doc, doc), 0);
});

test("nextTrapIndex cycles Tab and Shift+Tab inside a trap", () => {
  assert.equal(trap.nextTrapIndex(3, 0, false), 1);
  assert.equal(trap.nextTrapIndex(3, 2, false), 0);
  assert.equal(trap.nextTrapIndex(3, 0, true), 2);
  assert.equal(trap.nextTrapIndex(3, 1, true), 0);
  assert.equal(trap.nextTrapIndex(0, 0, false), -1);
});

test("inspectFocusTrap flags empty, leaky and no-dismiss", () => {
  assert.deepEqual(trap.inspectFocusTrap({ inside: [], outside: [1], hasDismiss: false }).issues, ["empty"]);
  const leaky = trap.inspectFocusTrap({ inside: [1], outside: [2, 3], hasDismiss: true });
  assert.equal(leaky.leaky, true);
  assert.deepEqual(leaky.issues, ["leaky"]);
  const noDismiss = trap.inspectFocusTrap({ inside: [1], outside: [], hasDismiss: false });
  assert.deepEqual(noDismiss.issues, ["no-dismiss"]);
  const ok = trap.inspectFocusTrap({ inside: [1, 2], outside: [], hasDismiss: true });
  assert.deepEqual(ok.issues, []);
  assert.equal(ok.canCycle, true);
});

const filler = Array.from({ length: 10 }, (_, i) => `<p>Paragraph ${i}</p>`).join("");
const page = (body) =>
  `<!doctype html><html lang="en"><head><title>x</title></head><body>${filler}${body}</body></html>`;

function run(html) {
  const rows = [];
  const report = focus.analyze(html);
  focus.findings(report, (...args) => rows.push(args));
  return { report, rows, keys: rows.map((row) => row[3]) };
}

test("leaky aria-modal with page chrome behind it raises a11y-focus-trap", () => {
  const { report, rows } = run(
    page(
      `<nav><a href="/">Home</a><a href="/pricing">Pricing</a><a href="/about">About</a></nav>` +
        `<div role="dialog" aria-modal="true" aria-label="Subscribe">` +
        `<button>Close</button><input aria-label="Email"><button>Join</button>` +
        `</div>` +
        `<main><a href="/ok">Ok</a><a href="/ok2">Ok2</a></main>`
    )
  );
  assert.ok(report.trap.leaky >= 1);
  assert.ok(report.trap.outside >= 2);
  const row = rows.find((item) => item[3] === "a11y-focus-trap");
  assert.equal(row[1], "risk");
  assert.equal(row[2], "low");
  assert.equal(row[5].vars.outside, report.trap.outside);
  assert.equal(english(EN["a11y-focus-trap.title"]), EN["a11y-focus-trap.title"]);
});

test("inert on the page behind the dialog is not leaky", () => {
  const { report, keys } = run(
    page(
      `<div inert><nav><a href="/">Home</a><a href="/p">P</a><a href="/a">A</a></nav></div>` +
        `<div role="dialog" aria-modal="true" aria-label="Box">` +
        `<button>Close</button><input aria-label="Name">` +
        `</div>`
    )
  );
  assert.equal(report.trap.leaky, 0);
  assert.ok(!keys.includes("a11y-focus-trap"));
});
