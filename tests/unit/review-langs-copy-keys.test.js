const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..", "..");

const TABLE = `const COPY = {
    en: {
      fieldError: { email: "Enter an email.", name: "Enter a name." },
      email: "Email",
      tour: { terms: ["The disclaimers", "Check each box."] },
      lines: [["One", "Two"], ["Three"]],
      group: { "Site builder": "Site builder" },
      areas: {},
      count: 3,
    },
    es: {
      fieldError: { email: "Escribe un correo.", name: "Escribe un nombre." },
      email: "Correo",
    }
};
`;

function copyStrings(code) {
  const out = execFileSync("python3", ["-c", [
    "import importlib.util, json, sys",
    "sys.path.insert(0, 'scripts')",
    "spec = importlib.util.spec_from_file_location('b', 'scripts/build-review-langs.py')",
    "b = importlib.util.module_from_spec(spec); spec.loader.exec_module(b)",
    "print(json.dumps(b.copy_strings(sys.stdin.read(), sys.argv[1])))"
  ].join("\n"), code], { cwd: ROOT, input: TABLE, encoding: "utf8" });
  return JSON.parse(out);
}

test("a key inside a group does not shadow or knock out the top-level key of the same name", () => {
  const en = copyStrings("en");
  assert.equal(en.email, "Email");
  assert.equal(en["fieldError.email"], "Enter an email.");
  assert.equal(copyStrings("es").email, "Correo");
});

test("strings in arrays and under quoted keys are keyed by their full path", () => {
  assert.deepEqual(copyStrings("en"), {
    "fieldError.email": "Enter an email.",
    "fieldError.name": "Enter a name.",
    email: "Email",
    "tour.terms.0": "The disclaimers",
    "tour.terms.1": "Check each box.",
    "lines.0.0": "One",
    "lines.0.1": "Two",
    "lines.1.0": "Three",
    "group.Site builder": "Site builder"
  });
});
