"use strict";
/*
 * The mini report card (#2466, design #2473): a 1200x675 PNG per Live Report that rides on a report reply (#2465)
 * on Bluesky, Mastodon and X. It shows the site's name and host, its score from SHOW_SCORE up and otherwise the
 * weakest area (never a number under it), and the reply's short link, in the reply's language, in the post-studio
 * look (scripts/post-studio/frame.html). Alt text goes with it in the same language.
 *
 * satori lays it out as SVG and @resvg/resvg-js paints the PNG, with the brand fonts in assets/fonts (SIL OFL). Both
 * load on the first render, so the modules that require this one run where they are not installed.
 */
const fs = require("fs");
const path = require("path");
const E = require("./engagement");
const R = require("./engagement-reports");

const W = 1200;
const H = 675;
const PAD = 64;
const SHORT = "https://qalabreview.com/";
const ASSETS = path.join(__dirname, "assets");

const COPY = {
  en: {
    tag: "Free website review", score: "Overall score", look: "Worth a look", open: "Open report",
    alt: (f) => "QA-lab URL Review card: " + (f.shown ? f.name + " (" + f.host + ") scores " + f.score + "/100 in our free Live Report."
      : "our free Live Report on " + f.name + " (" + f.host + ") has findings worth a look in " + f.area + ".") + " Report link: " + f.display + "."
  },
  es: {
    tag: "Revisión web gratuita", score: "Puntuación general", look: "Vale la pena revisar", open: "Ver informe",
    alt: (f) => "Tarjeta de QA-lab URL Review: " + (f.shown ? f.name + " (" + f.host + ") obtiene " + f.score + "/100 en nuestro Live Report gratuito."
      : "nuestro Live Report gratuito de " + f.name + " (" + f.host + ") tiene hallazgos que vale la pena revisar en " + low(f.area) + ".") + " Enlace al informe: " + f.display + "."
  },
  pt: {
    tag: "Revisão de site gratuita", score: "Pontuação geral", look: "Vale a pena ver", open: "Ver relatório",
    alt: (f) => "Cartão do QA-lab URL Review: " + (f.shown ? f.name + " (" + f.host + ") tem " + f.score + "/100 no nosso Live Report gratuito."
      : "nosso Live Report gratuito de " + f.name + " (" + f.host + ") tem achados que valem a pena ver em " + low(f.area) + ".") + " Link do relatório: " + f.display + "."
  },
  de: {
    tag: "Kostenlose Website-Prüfung", score: "Gesamtwert", look: "Einen Blick wert", open: "Bericht öffnen",
    alt: (f) => "Karte von QA-lab URL Review: " + (f.shown ? f.name + " (" + f.host + ") erreicht " + f.score + "/100 in unserem kostenlosen Live Report."
      : "Unser kostenloser Live Report zu " + f.name + " (" + f.host + ") hat Befunde zu " + f.area + ", die einen Blick wert sind.") + " Link zum Bericht: " + f.display + "."
  },
  fr: {
    tag: "Audit de site gratuit", score: "Score global", look: "À examiner", open: "Voir le rapport",
    alt: (f) => "Carte QA-lab URL Review : " + (f.shown ? f.name + " (" + f.host + ") obtient " + f.score + "/100 dans notre Live Report gratuit."
      : "notre Live Report gratuit sur " + f.name + " (" + f.host + ") relève des points à examiner côté " + low(f.area) + ".") + " Lien du rapport : " + f.display + "."
  },
  it: {
    tag: "Revisione gratuita del sito", score: "Punteggio complessivo", look: "Da guardare", open: "Apri il report",
    alt: (f) => "Scheda di QA-lab URL Review: " + (f.shown ? f.name + " (" + f.host + ") ottiene " + f.score + "/100 nel nostro Live Report gratuito."
      : "il nostro Live Report gratuito su " + f.name + " (" + f.host + ") ha risultati da guardare su " + low(f.area) + ".") + " Link al report: " + f.display + "."
  }
};

// SEO, GEO and the like stay in capitals mid-sentence.
function low(s) { return /^[A-Z0-9]+$/.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1); }

let areaCopy;
const areas = (lang) => {
  areaCopy = areaCopy || require("./url-review-owner-mail").COPY;
  return (areaCopy[lang] || areaCopy.en).health || {};
};

/** What a card says, from an engagement_posts document with report (engagement-reports.js doc) and its reply. */
function facts(doc) {
  const rep = doc.report || {};
  const reply = (doc.actions || {}).reply || {};
  const want = String(reply.lang || doc.lang || "").slice(0, 2);
  const lang = E.LANGS.includes(want) ? want : "en";
  const host = R.bare(rep.host);
  const a = areas(lang);
  const shown = rep.shown === true && Number(rep.score) >= R.SHOW_SCORE;
  // A TinyURL link is kept in the text; the card names the report on qalabreview.com, which needs no post ref.
  const display = String(rep.link || "").startsWith(SHORT) ? rep.link.slice("https://".length)
    : "qalabreview.com/" + lang + "/r/" + (R.CODES[doc.network] || "x") + "/" + host;
  return {
    lang, host, display, shown,
    name: String(rep.name || "").replace(/\s+/g, " ").trim() || host,
    score: shown ? Math.round(Number(rep.score)) : null,
    area: rep.weakest ? (a.areas || {})[rep.weakest] || rep.weakest : "",
    about: rep.weakest ? (a.about || {})[rep.weakest] || "" : ""
  };
}

const alt = (f) => COPY[f.lang].alt(f);

// --- Layout -----------------------------------------------------------------------------------------------------

const C = { ink: "#050c0f", cyan: "#4db3bb", hi: "#7ef6fb", gold: "#e2c48a", text: "#eef6f7", muted: "#a9bcc1", ok: "#6fe3b1", line: "rgba(126, 246, 251, 0.22)" };
const h = (type, style, ...children) => ({ type, props: Object.assign({ style }, children.length ? { children: children.length === 1 ? children[0] : children } : {}) });
const glass = { background: "linear-gradient(160deg, rgba(255, 255, 255, 0.09), rgba(255, 255, 255, 0.02))", border: "1.5px solid rgba(126, 246, 251, 0.2)", borderRadius: 28 };
const caps = (size, color) => ({ fontSize: size, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color });

let markUri;
const mark = () => (markUri = markUri || "data:image/svg+xml;base64," + fs.readFileSync(path.join(ASSETS, "qa-review-mark-fusion.svg")).toString("base64"));
const LOCK = "data:image/svg+xml;base64," + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="' + C.ok + '" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="10" rx="2.5"/><path d="M8 11V7.5a4 4 0 0 1 8 0V11"/></svg>').toString("base64");

/** The card as a satori element tree. */
function tree(f) {
  const t = COPY[f.lang];
  const nameSize = f.name.length <= 16 ? 96 : f.name.length <= 28 ? 76 : 60;
  // Fira Code is 0.6em a character; about 720px sit between the lock and the longest button.
  const linkSize = Math.max(17, Math.min(30, Math.floor(720 / (f.display.length * 0.6))));
  const panel = f.shown
    ? [
      h("div", caps(20, C.muted), t.score),
      h("div", { display: "flex", alignItems: "flex-end", marginTop: 8 },
        h("div", { fontFamily: "Instrument Serif", fontSize: 168, lineHeight: 0.9, letterSpacing: "-0.03em", backgroundImage: "linear-gradient(180deg, #ffffff, " + C.hi + ")", backgroundClip: "text", color: "transparent" }, String(f.score)),
        h("div", { fontFamily: "Fira Code", fontSize: 30, color: C.gold, marginLeft: 10, marginBottom: 18 }, "/100"))
    ]
    : [
      h("div", caps(20, C.gold), t.look),
      h("div", { fontFamily: "Instrument Serif", fontSize: f.area.length <= 11 ? 70 : 52, lineHeight: 1, marginTop: 14, color: C.text }, f.area || "—"),
      f.about ? h("div", { fontSize: 21, lineHeight: 1.35, color: C.muted, marginTop: 14 }, f.about) : null
    ].filter(Boolean);

  return h("div", {
    width: W, height: H, boxSizing: "border-box", display: "flex", flexDirection: "column", padding: PAD, fontFamily: "Inter", color: C.text,
    backgroundColor: C.ink,
    backgroundImage: "radial-gradient(60% 55% at 88% 6%, rgba(77, 179, 187, 0.30), rgba(77, 179, 187, 0) 70%), radial-gradient(55% 50% at 0% 100%, rgba(226, 196, 138, 0.18), rgba(226, 196, 138, 0) 70%)"
  },
    h("div", { display: "flex", alignItems: "center", justifyContent: "space-between" },
      h("div", { display: "flex", alignItems: "center" },
        { type: "img", props: { src: mark(), width: 60, height: 60, style: { width: 60, height: 60 } } },
        h("div", { display: "flex", flexDirection: "column", marginLeft: 18 },
          h("div", caps(24, C.text), "QA-lab URL Review"),
          h("div", { fontSize: 19, fontWeight: 500, color: C.muted, marginTop: 4 }, t.tag))),
      h("div", { display: "flex", alignItems: "center", border: "1.5px solid " + C.line, background: "rgba(10, 30, 36, 0.55)", borderRadius: 999, padding: "10px 22px" },
        h("div", { width: 12, height: 12, borderRadius: 6, backgroundColor: C.gold, boxShadow: "0 0 14px " + C.gold, marginRight: 12 }),
        h("div", caps(19, C.hi), "Live Report"))),

    h("div", { display: "flex", flex: 1, alignItems: "center", marginTop: 24, marginBottom: 24 },
      h("div", { display: "flex", flexDirection: "column", flex: 1, paddingRight: 40 },
        h("div", { display: "block", fontFamily: "Instrument Serif", fontSize: nameSize, lineHeight: 1, letterSpacing: "-0.02em", lineClamp: 2 }, f.name),
        h("div", { fontFamily: "Fira Code", fontSize: 26, color: C.hi, marginTop: 20 }, f.host)),
      h("div", Object.assign({ display: "flex", flexDirection: "column", width: 400, boxSizing: "border-box", padding: "32px 36px" }, glass), ...panel)),

    h("div", Object.assign({ display: "flex", alignItems: "center", padding: "18px 18px 18px 26px" }, glass, { borderRadius: 999 }),
      { type: "img", props: { src: LOCK, width: 28, height: 28, style: { width: 28, height: 28 } } },
      h("div", { display: "block", flex: 1, fontFamily: "Fira Code", fontSize: linkSize, color: C.text, marginLeft: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }, f.display),
      h("div", { display: "flex", fontWeight: 700, fontSize: 22, color: "#ffffff", padding: "12px 26px", borderRadius: 999, backgroundImage: "linear-gradient(135deg, #12a3ad, #0d6e76)", marginLeft: 16 }, t.open))
  );
}

// --- Rendering --------------------------------------------------------------------------------------------------

let fonts;
const loadFonts = () => (fonts = fonts || [
  ["Inter", "inter-500.ttf", 500], ["Inter", "inter-700.ttf", 700],
  ["Instrument Serif", "instrument-serif-400.ttf", 400], ["Fira Code", "fira-code-500.ttf", 500]
].map(([name, file, weight]) => ({ name, weight, style: "normal", data: fs.readFileSync(path.join(ASSETS, "fonts", file)) })));

/** The card for a report reply: { png, type, alt, width, height, lang }. Throws when it cannot be drawn. */
async function render(doc) {
  const f = facts(doc);
  const satori = require("satori").default;
  const { Resvg } = require("@resvg/resvg-js");
  const svg = await satori(tree(f), { width: W, height: H, fonts: loadFonts() });
  const png = new Resvg(svg, { fitTo: { mode: "width", value: W }, font: { loadSystemFonts: false } }).render().asPng();
  return { png, type: "image/png", alt: alt(f), width: W, height: H, lang: f.lang };
}

/** Whether a stored post gets a card with its reply. */
const wants = (doc) => !!doc && doc.campaign === R.CAMPAIGN && (doc.report || {}).format === "card" && R.CARD_NETS.includes(doc.network);

module.exports = { W, H, COPY, facts, alt, tree, render, wants };
