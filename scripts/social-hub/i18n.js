/* Social captions in six languages, sentence by sentence, through a phrasebook per language
   (scripts/social-hub/phrases/<lang>.json, { "<English template>": "<translation>" }).

   Hosts, URLs, hashtags, handles, code and numbers are lifted out of each sentence as numbered placeholders
   (⟦1⟧, ⟦2⟧ …), so one template covers every post that says the same thing about a different site, and they
   come back untouched in whatever order the translation puts them. A value may also be
   { text, machine: true }: filled by Google's translator in CI (translate-captions.js --machine), to be
   rewritten by an agent. */
const fs = require("fs");
const path = require("path");

const LANGS = ["es", "pt", "de", "fr", "it"];
const FIELDS = ["title", "alt", "linkedin", "x", "instagram", "facebook"];
const DIR = path.join(__dirname, "phrases");
const TOKEN = new RegExp([
  "`[^`]*`",
  "<[^>\\n]+>",
  "[\\w-]+=\"[^\"\\n]*\"",
  "https?:\\/\\/\\S+",
  "\\b(?:[a-z0-9-]+\\.)+[a-z]{2,6}\\b(?:\\/[^\\s)]*)?",
  "#\\w+",
  "@\\w+",
  "\\b\\d+(?:[.,:]\\d+)*%?"
].join("|"), "gi");
const SENTENCE = /((?<=[.!?…:])\s+(?=[A-Z¿¡"“⟦\d]))/;
const WORDS = /[A-Za-z]{2,}/;

function template(sentence) {
  const vals = [];
  const tpl = sentence.replace(TOKEN, (match) => {
    vals.push(match);
    return "⟦" + vals.length + "⟧";
  });
  return { tpl, vals };
}

// The translatable pieces of a caption, with what sits between them kept verbatim.
function pieces(text) {
  const out = [];
  String(text || "").split("\n").forEach((line, i) => {
    if (i) out.push({ raw: "\n" });
    line.split(SENTENCE).forEach((part, j) => {
      if (j % 2) { out.push({ raw: part }); return; }
      const { tpl, vals } = template(part);
      const lead = tpl.match(/^\s*/)[0];
      const trail = tpl.match(/\s*$/)[0];
      const core = tpl.trim();
      if (!WORDS.test(core.replace(/⟦\d+⟧/g, ""))) { out.push({ raw: part }); return; }
      if (lead) out.push({ raw: lead });
      out.push({ tpl: core, vals });
      if (trail) out.push({ raw: trail });
    });
  });
  return out;
}

function templates(text) {
  return pieces(text).filter((piece) => piece.tpl).map((piece) => piece.tpl);
}

function entry(book, tpl) {
  const value = book[tpl];
  return typeof value === "string" ? value : value && value.text;
}

// The caption in the book's language, or null when a sentence is missing or lost a placeholder.
function translate(text, book) {
  let out = "";
  for (const piece of pieces(text)) {
    if (!piece.tpl) { out += piece.raw; continue; }
    const done = entry(book, piece.tpl);
    if (!done) return null;
    const used = new Set();
    const filled = done.replace(/⟦(\d+)⟧/g, (match, n) => {
      used.add(Number(n));
      return piece.vals[Number(n) - 1] ?? match;
    });
    if (used.size !== piece.vals.length || /⟦\d+⟧/.test(filled)) return null;
    out += filled;
  }
  return out;
}

function readBook(lang, dir = DIR) {
  const file = path.join(dir, lang + ".json");
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
}

function writeBook(lang, book, dir = DIR) {
  const sorted = Object.fromEntries(Object.entries(book).sort(([a], [b]) => a.localeCompare(b)));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, lang + ".json"), JSON.stringify(sorted, null, 1) + "\n");
}

// { es: { title, alt, linkedin, ... }, ... } for every language whose book covers every field.
function captionsFor(caption, books) {
  const out = {};
  for (const lang of LANGS) {
    const fields = {};
    let complete = true;
    for (const field of FIELDS) {
      if (!caption[field]) continue;
      const done = translate(caption[field], books[lang] || {});
      if (done == null) { complete = false; break; }
      fields[field] = done;
    }
    if (complete) out[lang] = fields;
  }
  return out;
}

module.exports = { LANGS, FIELDS, DIR, pieces, templates, translate, readBook, writeBook, captionsFor };
