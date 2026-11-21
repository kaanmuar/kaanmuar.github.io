const test = require("node:test");
const assert = require("node:assert/strict");
const focus = require("../../functions/url-review-focus-order");
const { english, EN } = require("../../functions/url-review-findings-en");

function run(html) {
  const rows = [];
  const report = focus.analyze(html);
  focus.findings(report, (...args) => rows.push(args));
  return { report, rows, keys: rows.map((row) => row[3]) };
}

const filler = Array.from({ length: 10 }, (_, i) => `<p>Paragraph ${i}</p>`).join("");
const page = (body) => `<!doctype html><html lang="en"><head><title>x</title><script>var a = "<button tabindex=5>";</script></head><body>${filler}${body}</body></html>`;

const CLEAN = page(`<nav><a href="/">Home</a><a href="/pricing">Pricing</a></nav><main><button>Buy</button><input type="text" aria-label="Search"><div tabindex="0" role="button">Menu</div></main>`);

test("a clean page raises nothing and passes", () => {
  const { report, rows } = run(CLEAN);
  assert.equal(report.stops, 5);
  assert.equal(rows.length, 1);
  assert.equal(rows[0][1], "pass");
  assert.equal(rows[0][3], "a11y-focus");
});

test("tiny or script-only pages are not judged", () => {
  assert.equal(run("<html><body><a href='/'>x</a></body></html>").rows.length, 0);
  assert.equal(focus.findings(null, () => assert.fail()), null);
});

test("positive tabindex: lists the values and how many stops move", () => {
  const { report, rows } = run(page(`<a href="/a">A</a><a href="/b" tabindex="3">B</a><a href="/c">C</a><a href="/d" tabindex="1">D</a><a href="/e" tabindex="3">E</a><button>F</button>`));
  assert.equal(report.positive.count, 3);
  assert.deepEqual(report.positive.values, [1, 3]);
  // Tab order D, B, E, A, C, F against page order A, B, C, D, E, F: four stops sit elsewhere.
  assert.equal(report.positive.moved, 4);
  const order = rows.find((row) => row[3] === "a11y-focus-order");
  assert.equal(order[1], "risk");
  assert.equal(order[2], "medium");
  assert.deepEqual(order[5].vars.values.items, ["1", "3"]);
  assert.equal(order[5].vars.moved, 4);
});

test("positive tabindex on the first stop alone moves nothing and stays low", () => {
  const { report, rows } = run(page(`<a href="/a" tabindex="1">A</a><a href="/b">B</a><a href="/c">C</a>`));
  assert.equal(report.positive.count, 1);
  assert.equal(report.positive.moved, 0);
  assert.equal(rows.find((row) => row[3] === "a11y-focus-order")[2], "low");
});

test("tabindex values inside script text or on hidden elements do not count", () => {
  const { report } = run(page(`<a href="/a">A</a><div hidden><a href="/h" tabindex="9">H</a></div><div style="display:none"><a href="/g" tabindex="8">G</a></div><div inert><a href="/i" tabindex="7">I</a></div><a href="/b">B</a><a href="/c">C</a>`));
  assert.equal(report.positive.count, 0);
  assert.equal(report.stops, 3);
});

test("a control with tabindex -1 and no other way in is flagged; duplicates, roving widgets and aria-hidden are not", () => {
  const { report, rows } = run(
    page(
      `<button tabindex="-1">Save</button>` +
        `<a href="/card" tabindex="-1"><img src="c.png" alt="Card"></a><a href="/card">Card</a>` +
        `<div role="tablist"><button role="tab" tabindex="-1">Two</button></div>` +
        `<ul role="menu"><li><a href="/m" tabindex="-1">Item</a></li></ul>` +
        `<a href="/x" tabindex="-1" aria-hidden="true">x</a>` +
        `<button tabindex="-1" disabled>Off</button>` +
        `<input type="radio" tabindex="-1">` +
        `<a href="/ok">Ok</a><a href="/ok2">Ok2</a>`
    )
  );
  assert.equal(report.skipped.count, 1);
  assert.deepEqual(report.skipped.samples, ["button"]);
  const row = rows.find((item) => item[3] === "a11y-focus-skipped");
  assert.equal(row[2], "medium");
});

test("a link alone with tabindex -1 is flagged low", () => {
  const { rows } = run(page(`<a href="/only" tabindex="-1">Only</a><a href="/a">A</a><a href="/b">B</a>`));
  assert.equal(rows.find((row) => row[3] === "a11y-focus-skipped")[2], "low");
});

test("mouse-only controls: click handlers and widget roles without a way in", () => {
  const { report, rows } = run(
    page(
      `<div class="buy" onclick="go()">Buy</div>` +
        `<span role="button">Menu</span>` +
        `<a role="button">No href</a>` +
        `<div onclick="x()" tabindex="0">reachable</div>` +
        `<div onclick="track()"><a href="/in">inner link</a></div>` +
        `<a href="/p"><span onclick="t()">inside link</span></a>` +
        `<div class="modal-backdrop" onclick="close()"></div>` +
        `<div role="button" aria-disabled="true">off</div>` +
        `<div role="tablist"><div role="tab">Tab</div></div>` +
        `<button>real</button>`
    )
  );
  assert.equal(report.mouseOnly.count, 3);
  assert.deepEqual(report.mouseOnly.samples, ["div.buy", "span[role=button]", "a[role=button]"]);
  assert.equal(rows.find((row) => row[3] === "a11y-focus-mouse-only")[2], "medium");
});

test("autofocus: one is fine, several are flagged, hidden and inert ones do not count", () => {
  assert.ok(!run(page(`<input autofocus><a href="/a">a</a><a href="/b">b</a>`)).keys.includes("a11y-focus-autofocus"));
  const { report, keys } = run(page(`<input autofocus><input autofocus=""><textarea autofocus></textarea><input type="hidden" autofocus><div hidden><input autofocus></div>`));
  assert.equal(report.autofocus.count, 3);
  assert.ok(keys.includes("a11y-focus-autofocus"));
});

test("aria-modal dialogs: nothing focusable is a trap, no close control is a low note", () => {
  const trap = run(page(`<div role="dialog" aria-modal="true"><p>Cookie notice. Reload to dismiss.</p></div><a href="/a">a</a><a href="/b">b</a>`));
  assert.deepEqual({ count: trap.report.modal.count, trapped: trap.report.modal.trapped }, { count: 1, trapped: 1 });
  const row = trap.rows.find((item) => item[3] === "a11y-focus-modal");
  assert.equal(row[2], "medium");
  assert.equal(row[5].id, "a11y-focus-modal.evidence");

  const open = run(page(`<div role="dialog" aria-modal="true"><input type="text" aria-label="Email"><a href="/terms">Terms</a></div>`));
  assert.equal(open.report.modal.noClose, 1);
  const note = open.rows.find((item) => item[3] === "a11y-focus-modal");
  assert.equal(note[2], "low");
  assert.equal(note[5].id, "a11y-focus-modal.evidence.noclose");
});

test("aria-modal dialogs with a close control, in any of the six languages or by class, are fine", () => {
  const bodies = [
    `<button aria-label="Close dialog">×</button>`,
    `<button>Cerrar</button>`,
    `<button>Fechar</button>`,
    `<button>Schließen</button>`,
    `<button>Fermer</button>`,
    `<button>Chiudi</button>`,
    `<button class="modal-close"><svg></svg></button>`,
    `<button data-bs-dismiss="modal"><i></i></button>`,
    `<form method="dialog"><button>Go</button></form>`,
    `<button>×</button>`,
  ];
  bodies.forEach((body) => {
    const { report } = run(page(`<div role="alertdialog" aria-modal="true"><h2>Title</h2>${body}</div>`));
    assert.equal(report.modal.trapped + report.modal.noClose, 0, body);
  });
});

test("a dialog's own hidden parts and a closed template do not count as focusable", () => {
  const { report } = run(page(`<div aria-modal="true"><button hidden>Close</button><div style="display:none"><a href="/x">x</a></div></div><template><div aria-modal="true"></div></template>`));
  assert.equal(report.modal.count, 1);
  assert.equal(report.modal.trapped, 1);
});

test("inert on the page, on the main content or around a modal is flagged", () => {
  const wide = run(page(`<main inert><a href="/a">a</a></main>`));
  assert.equal(wide.report.inert.wide, 1);
  assert.equal(wide.rows.find((row) => row[3] === "a11y-focus-inert")[5].id, "a11y-focus-inert.evidence.wide");

  const most = run(page(`<div inert><a href="/a">a</a><a href="/b">b</a><button>c</button></div>`));
  assert.equal(most.report.inert.wide, 1);

  const dialog = run(page(`<a href="/a">a</a><a href="/b">b</a><div id="app" inert><div role="dialog" aria-modal="true"><button>Close</button></div></div><a href="/c">c</a><a href="/d">d</a><a href="/e">e</a><a href="/f">f</a>`));
  assert.equal(dialog.report.inert.dialog, 1);

  const focusInert = run(page(`<a href="/a">a</a><a href="/b">b</a><a href="/c">c</a><a href="/d">d</a><section inert><input autofocus></section>`));
  assert.equal(focusInert.report.inert.autofocus, 1);
  assert.equal(focusInert.rows.find((row) => row[3] === "a11y-focus-inert")[2], "low");
});

test("inert behind an open modal, the usual pattern, is fine", () => {
  const { report, keys } = run(page(`<div inert><a href="/a">a</a><a href="/b">b</a></div><div role="dialog" aria-modal="true"><button>Close</button></div><a href="/c">c</a><a href="/d">d</a>`));
  assert.equal(report.inert.count, 0);
  assert.ok(!keys.includes("a11y-focus-inert"));
});

test("focusable controls hidden from assistive technology: the control itself, or the whole page", () => {
  const own = run(page(`<a href="/a" aria-hidden="true">icon</a><a href="/b" aria-hidden="true" tabindex="-1">ok</a><svg aria-hidden="true"></svg><span tabindex="0" aria-hidden="true" data-focus-guard="true"></span><a href="/c">c</a><a href="/d">d</a>`));
  assert.equal(own.report.hidden.count, 1);
  assert.equal(own.rows.find((row) => row[3] === "a11y-focus-hidden")[2], "low");

  const wide = run(page(`<main aria-hidden="true"><a href="/a">a</a></main><a href="/c">c</a><a href="/d">d</a>`));
  assert.equal(wide.report.hidden.count, 1);
  assert.equal(wide.report.hidden.root, true);
  assert.equal(wide.rows.find((row) => row[3] === "a11y-focus-hidden")[2], "medium");

  // A hidden drawer is judged only by the browser (CSS decides), so a container's aria-hidden is left alone.
  assert.equal(run(page(`<div class="drawer" aria-hidden="true"><a href="/a">a</a></div><a href="/c">c</a><a href="/d">d</a>`)).report.hidden.count, 0);
});

test("tab stops with no name: links, buttons, custom buttons, image inputs", () => {
  const { report, rows } = run(
    page(
      `<a href="/a"></a>` +
        `<a href="/b"><i class="icon"></i></a>` +
        `<button>&nbsp;</button>` +
        `<div role="button" tabindex="0"></div>` +
        `<input type="image" src="go.png">` +
        `<a href="/named">Text</a>` +
        `<a href="/img"><img src="a.png" alt="Home"></a>` +
        `<a href="/svg"><svg><title>Cart</title></svg></a>` +
        `<a href="/label" aria-label="Pricing"></a>` +
        `<button aria-labelledby="lbl"></button><span id="lbl">Save</span>` +
        `<button title="Close"></button>` +
        `<input type="submit">` +
        `<a href="/empty-alt"><img src="b.png" alt=""></a>` +
        `<a href="/hidden" aria-hidden="true" tabindex="-1"></a>` +
        `<a name="anchor"></a>`
    )
  );
  // empty: /a, /b, button, role=button div, image input, /empty-alt
  assert.equal(report.noname.count, 6);
  assert.equal(rows.find((row) => row[3] === "a11y-focus-noname")[2], "medium");
  assert.ok(report.noname.samples.includes("div[role=button]"));
});

test("an unterminated or hostile page stays bounded and does not throw", () => {
  const hostile = "<div ".repeat(50000) + "<a href=\"x\" tabindex=1".repeat(2000) + "<!-- never closed";
  const started = Date.now();
  const report = focus.analyze(hostile);
  assert.ok(Date.now() - started < 2000);
  assert.ok(report.elements <= 20000);
  const deep = "<div>".repeat(5000) + '<button tabindex="1">x</button>' + "</div>".repeat(5000);
  assert.doesNotThrow(() => focus.analyze(deep));
  assert.doesNotThrow(() => focus.analyze(null));
});

test("every finding renders in English and carries its key, fix and no raw markup in samples", () => {
  const body = page(
    `<a href="/a" tabindex="2">A</a><a href="/b" tabindex="1">B</a><button tabindex="-1">S</button>` +
      `<div class="buy" onclick="x()">Buy</div><input autofocus><input autofocus>` +
      `<div role="dialog" aria-modal="true"><p>x</p></div><a href="/h" aria-hidden="true">h</a><a href="/n"></a>` +
      `<div id="w" inert><div aria-modal="true"><button>Close</button></div></div>`
  );
  const { keys, rows } = run(body);
  ["a11y-focus-order", "a11y-focus-skipped", "a11y-focus-mouse-only", "a11y-focus-autofocus", "a11y-focus-modal", "a11y-focus-inert", "a11y-focus-hidden", "a11y-focus-noname"].forEach((key) => assert.ok(keys.includes(key), key));
  rows.forEach((row) => {
    const [area, verdict, severity, key, title, evidence, fix, extra] = row;
    assert.equal(area, "Accessibility");
    assert.equal(verdict, "risk");
    assert.ok(["low", "medium"].includes(severity));
    assert.ok(!/[<>]/.test(english(title) + english(evidence).replace(/<[a-z]+>/g, "")), key);
    assert.ok(english(fix).length > 20, key);
    assert.equal(title.id, key + ".title");
    assert.equal(fix.id, key + ".fix");
    assert.equal(typeof extra.count, "number");
  });
});

test("every key the module can say has English copy and a version in the five other languages", () => {
  const source = require("node:fs").readFileSync(require("node:path").join(__dirname, "../../js/qa-review-findings-copy.js"), "utf8");
  const ids = Object.keys(EN).filter((id) => id.startsWith("a11y-focus"));
  assert.equal(ids.length, 29);
  ids.forEach((id) => {
    assert.equal(source.split(`"${id}":`).length - 1, 5, id + " should be in es, pt, de, fr and it");
    const slots = (text) => (text.match(/\{\w+\}/g) || []).sort().join(",");
    const pattern = new RegExp(`"${id.replace(/[.]/g, "\\.")}": "((?:[^"\\\\]|\\\\.)*)"`, "g");
    for (const match of source.matchAll(pattern)) assert.equal(slots(JSON.parse(`"${match[1]}"`)), slots(EN[id]), id);
  });
});

test("insights.analyze adds the findings from the start page's inspect and skips the tree twin of a nameless link", () => {
  const insights = require("../../functions/url-review-insights");
  const axtree = require("../../functions/url-review-axtree");
  const html = page(`<a href="/a" tabindex="2">A</a><a href="/b" tabindex="1">B</a><a href="/n"></a><a href="/c">C</a>`);
  const home = { url: "https://example.com/", status: 200, inspect: { focusOrder: focus.analyze(html) }, body: html };
  const nodes = [
    { nodeId: "1", ignored: false, role: { value: "RootWebArea" }, name: { value: "x" }, childIds: ["2"] },
    { nodeId: "2", ignored: false, role: { value: "link" }, name: { value: "" }, childIds: [], parentId: "1", backendDOMNodeId: 5 },
  ];
  const analysis = insights.analyze({ pages: [home], extras: { axtree: { nodes } } });
  const keys = analysis.findings.map((f) => f.key);
  assert.ok(keys.includes("a11y-focus-order"), keys.join());
  assert.ok(keys.includes("a11y-focus-noname"));
  assert.ok(!keys.includes("a11y-axtree-link-name"), "the tree twin is skipped");
  assert.ok(axtree.FINDING["ax-link-name"].overlap.includes("a11y-focus-noname"));
  const quiet = insights.analyze({ pages: [{ url: "https://example.com/", status: 200, inspect: {}, body: "<html></html>" }] });
  assert.equal(quiet.findings.filter((f) => f.key.startsWith("a11y-focus")).length, 0);
});
