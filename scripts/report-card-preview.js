#!/usr/bin/env node
/* Renders mini report cards (#2466) for design review, without posting anything.
   node scripts/report-card-preview.js [--hosts www.gov.uk,idpc.gov.co] [--langs en,es] [--net bluesky] [--out media/report-cards]
   Each card is written as <host>-<lang>.png next to <host>-<lang>.txt with its alt text. */

const fs = require("fs");
const path = require("path");
const Card = require("../functions/report-card");
const R = require("../functions/engagement-reports");

const ROOT = path.resolve(__dirname, "..");
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf("--" + k); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };

const index = JSON.parse(fs.readFileSync(path.join(ROOT, "assets/live-reports/index.json"), "utf8"));
const list = R.targets(index);
const want = opt("hosts", "").split(",").map(R.bare).filter(Boolean);
// By default: the best score, one just under the line, and the longest name.
const sites = want.length ? want.map((h) => list.find((t) => t.host === h)).filter(Boolean)
  : [list.slice().sort((a, b) => b.score - a.score)[0], list.find((t) => t.score < R.SHOW_SCORE && t.score >= 70), list.slice().sort((a, b) => b.name.length - a.name.length)[0]];
const langs = opt("langs", "en,es,pt,de,fr,it").split(",");
const net = opt("net", "bluesky");
const out = path.resolve(ROOT, opt("out", "media/report-cards"));

(async () => {
  fs.mkdirSync(out, { recursive: true });
  for (const t of sites) {
    for (const lang of langs) {
      const link = R.linkFor(t, net, lang, "bluesky_" + "a1b2c3d4e5f6a1b2c3d4");
      const doc = { network: net, campaign: R.CAMPAIGN, lang, actions: { reply: { lang } },
        report: { host: t.host, id: t.id, name: t.name, score: t.score, shown: R.shown(t), weakest: t.weakest, format: "card", link } };
      const card = await Card.render(doc);
      const file = path.join(out, t.host + "-" + lang);
      fs.writeFileSync(file + ".png", card.png);
      fs.writeFileSync(file + ".txt", card.alt + "\n");
      console.log(file + ".png  " + Math.round(card.png.length / 1024) + " KB  " + card.alt);
    }
  }
})().catch((error) => { console.error(error); process.exit(1); });
