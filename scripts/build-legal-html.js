/**
 * Writes the default English disclaimers of qa-review-legal.html into its HTML, so readers that do not run
 * scripts see the text. The page's own script paints the same blocks on load and repaints on a country change.
 *
 *   node scripts/build-legal-html.js          rewrites qa-review-legal.html
 *   node scripts/build-legal-html.js --check  exits 1 when the HTML no longer matches the script
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const FILE = path.join(__dirname, "..", "qa-review-legal.html");
const NOTICES = ["local-notice", "origin-notice", "site-notice"];

function painted(html) {
  const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).find((code) => code.includes("function paint("));
  if (!script) throw new Error("The disclaimers script was not found.");
  const nodes = {};
  const node = (id) => nodes[id] || (nodes[id] = { id, innerHTML: "", value: "", appendChild() {}, addEventListener() {} });
  const context = {
    document: { getElementById: node, createElement: () => node("option-" + Object.keys(nodes).length), addEventListener() {} },
    location: { search: "", href: "https://carlosandmunoz.com/qa-review-legal.html" },
    history: { replaceState() {} },
    URL, URLSearchParams
  };
  context.window = context;
  vm.runInNewContext(script, context);
  return NOTICES.map((id) => [id, nodes[id].innerHTML]);
}

function build(html) {
  return painted(html).reduce((out, [id, inner]) => {
    const re = new RegExp('(<article class="sheet" id="' + id + '">)[\\s\\S]*?(</article>)');
    if (!re.test(out)) throw new Error("No article #" + id + " in the page.");
    return out.replace(re, (all, open, close) => open + inner + close);
  }, html);
}

if (require.main === module) {
  const html = fs.readFileSync(FILE, "utf8");
  const next = build(html);
  if (process.argv.includes("--check")) {
    if (next !== html) {
      console.error("qa-review-legal.html is out of date. Run node scripts/build-legal-html.js");
      process.exit(1);
    }
    console.log("qa-review-legal.html matches its script.");
  } else {
    fs.writeFileSync(FILE, next);
    console.log("qa-review-legal.html: " + NOTICES.length + " notices written.");
  }
}

module.exports = { build, painted };
