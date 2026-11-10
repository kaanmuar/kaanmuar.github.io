#!/usr/bin/env node
/* Renders trial DM cards (#3137) for design review, without sending anything.
   node scripts/dm-card-preview.js [--looks confetti,ticket,sunrise] [--langs en,es] [--out media/dm-cards]
   Each card is written as <look>-<lang>.png next to <look>-<lang>.txt with its alt text. */

const fs = require("fs");
const path = require("path");
const Card = require("../functions/dm-card");
const Trials = require("../functions/outreach-trials");

const ROOT = path.resolve(__dirname, "..");
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf("--" + k); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const looks = opt("looks", Card.LOOKS.join(",")).split(",");
const langs = opt("langs", Card.LANGS.join(",")).split(",");
const out = path.resolve(ROOT, opt("out", "media/dm-cards"));

// A different person per language, with and without a known site, so both lines get looked at.
const PEOPLE = {
  en: { first: "Sarah", host: "sarahtests.dev" }, es: { first: "Lucía", host: "luciaseo.es" }, pt: { first: "João", host: "" },
  de: { first: "Jonas", host: "barrierefrei-digital.de" }, fr: { first: "", handle: "camille_a11y", host: "camille.fr" }, it: { first: "Giulia", host: "" }
};

(async () => {
  fs.mkdirSync(out, { recursive: true });
  for (const look of looks) {
    for (const lang of langs) {
      const p = PEOPLE[lang] || PEOPLE.en;
      const dm = { lang, card: Object.assign({ look }, p), trial: { code: "TRY-7K4P2Q", url: Trials.pageUrl(lang, { trial: "TRY-7K4P2Q" }) } };
      const card = await Card.render(dm);
      const file = path.join(out, look + "-" + lang);
      fs.writeFileSync(file + ".png", card.png);
      fs.writeFileSync(file + ".txt", card.alt + "\n");
      console.log(file + ".png  " + Math.round(card.png.length / 1024) + " KB  " + card.alt);
    }
  }
})().catch((error) => { console.error(error); process.exit(1); });
