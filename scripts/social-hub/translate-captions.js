#!/usr/bin/env node
/* Writes each post's captions in Spanish, Portuguese, German, French and Italian into its batch's captions.json
   (c.i18n = { es: { title, alt, linkedin, x, instagram, facebook }, ... }) from the phrasebooks in
   scripts/social-hub/phrases (see i18n.js). Posts already written in their own language (c.textLang: the launch
   set and promos) are left alone.

     node scripts/social-hub/translate-captions.js [batch ...]           apply the phrasebooks (all batches by default)
     node scripts/social-hub/translate-captions.js --export todo.json    list the English sentences a book still lacks
     node scripts/social-hub/translate-captions.js --machine [batch ...] fill gaps with Google's translator first (CI) */
const fs = require("fs");
const path = require("path");
const i18n = require("./i18n");

const ROOT = path.join(__dirname, "..", "..");
const POSTS = path.join(ROOT, "media", "social-posts");
const GTX = "https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&dt=t&tl=";

function batches(names) {
  const all = fs.readdirSync(POSTS).filter((name) => fs.existsSync(path.join(POSTS, name, "captions.json"))).sort();
  return names.length ? all.filter((name) => names.includes(name)) : all;
}

function readCaptions(batch) {
  const file = path.join(POSTS, batch, "captions.json");
  const text = fs.readFileSync(file, "utf8");
  return { file, data: JSON.parse(text), newline: text.endsWith("\n") };
}

function sources(names) {
  const out = [];
  for (const batch of batches(names)) {
    for (const caption of Object.values(readCaptions(batch).data)) {
      if (caption.textLang) continue;
      i18n.FIELDS.forEach((field) => { if (caption[field]) out.push(caption[field]); });
    }
  }
  return out;
}

function missing(texts, books, langs = i18n.LANGS) {
  const count = new Map();
  texts.forEach((text) => i18n.templates(text).forEach((tpl) => {
    if (langs.some((lang) => !(tpl in books[lang]))) count.set(tpl, (count.get(tpl) || 0) + 1);
  }));
  return [...count.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([tpl]) => tpl);
}

async function gtx(text, lang) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const res = await fetch(GTX + lang, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "Mozilla/5.0" }, body: "q=" + encodeURIComponent(text) });
    if (res.ok) return (await res.json())[0].map((part) => part[0] || "").join("");
    await new Promise((resolve) => setTimeout(resolve, 20000 * (attempt + 1)));
  }
  throw new Error("Google's translator kept refusing (" + lang + ")");
}

async function machine(texts, books) {
  let added = 0;
  for (const lang of i18n.LANGS) {
    for (const tpl of missing(texts, books, [lang])) {
      const text = (await gtx(tpl, lang)).replace(/⟦\s*(\d+)\s*⟧/g, "⟦$1⟧");
      books[lang][tpl] = { text, machine: true };
      added += 1;
      await new Promise((resolve) => setTimeout(resolve, 1200));
    }
    i18n.writeBook(lang, books[lang]);
  }
  return added;
}

function apply(names, books) {
  let posts = 0;
  let complete = 0;
  for (const batch of batches(names)) {
    const { file, data, newline } = readCaptions(batch);
    for (const caption of Object.values(data)) {
      if (caption.textLang) continue;
      const langs = i18n.captionsFor(caption, books);
      posts += 1;
      if (Object.keys(langs).length === i18n.LANGS.length) complete += 1;
      if (Object.keys(langs).length) caption.i18n = langs;
      else delete caption.i18n;
    }
    fs.writeFileSync(file, JSON.stringify(data, null, 2) + (newline ? "\n" : ""));
  }
  return { posts, complete };
}

async function main() {
  const args = process.argv.slice(2);
  const books = Object.fromEntries(i18n.LANGS.map((lang) => [lang, i18n.readBook(lang)]));
  const exportAt = args.indexOf("--export");
  if (exportAt >= 0) {
    const out = args[exportAt + 1];
    const names = args.filter((arg, i) => !arg.startsWith("--") && i !== exportAt + 1);
    const todo = missing(sources(names), books);
    fs.writeFileSync(out, JSON.stringify(todo, null, 1) + "\n");
    console.log(todo.length + " sentences missing from at least one phrasebook -> " + out);
    return;
  }
  const names = args.filter((arg) => !arg.startsWith("--"));
  if (args.includes("--machine")) console.log("Google's translator: " + (await machine(sources(names), books)) + " sentences");
  const { posts, complete } = apply(names, books);
  console.log("Captions: " + complete + " of " + posts + " posts in all six languages");
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = { missing, apply, batches };
