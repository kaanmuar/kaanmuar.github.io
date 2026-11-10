"use strict";
/*
 * The trial DM card (#3137, design ticket under #3137): a 1200x675 PNG that rides on the cheerful DM a person gets
 * with their 2-day URL review pass (functions/chain-trials.js). Three looks, each in en, es, pt, de, fr and it:
 *
 *   confetti  the brand's dark ink with confetti and a gold "2 days" badge
 *   ticket    a cream admission ticket: the "2 days" stub, a dashed tear line, the pass on the right
 *   sunrise   a warm coral-to-gold sky with the "2 days" in a white sun
 *
 * Each says "You just unlocked 2 days of URL review" in the DM's language, greets the person by first name or
 * @handle, names their site's host when we know it, and shows the pass link. Alt text goes with it in the same
 * language. satori lays it out and @resvg/resvg-js paints it, with the fonts report-card.js uses (assets/fonts).
 */
const fs = require("fs");
const path = require("path");

const W = 1200;
const H = 675;
const ASSETS = path.join(__dirname, "assets");
const LOOKS = ["confetti", "ticket", "sunrise"];
const LANGS = ["en", "es", "pt", "de", "fr", "it"];

const COPY = {
  en: {
    head: "You just unlocked 2 days of URL review", hi: (n) => "Hi " + n + ", thanks for the great chat!", thanks: "Thanks for the great chat!", days: "days free", pass: "Your pass",
    try: (h) => "Try it on " + h, any: "SEO, accessibility, speed and security in one review", cta: "Claim your pass",
    alt: (f) => "QA-lab URL Review card: " + (f.first ? f.first + ", you" : "You") + " just unlocked 2 days of free URL review" + (f.host ? ", ready for " + f.host : "") + ". Pass link: " + f.display + "."
  },
  es: {
    head: "¡Acabas de desbloquear 2 días de URL review!", hi: (n) => "Hola, " + n + ", ¡gracias por la gran conversación!", thanks: "¡Gracias por la gran conversación!", days: "días gratis", pass: "Tu pase",
    try: (h) => "Pruébalo con " + h, any: "SEO, accesibilidad, velocidad y seguridad en una revisión", cta: "Activa tu pase",
    alt: (f) => "Tarjeta de QA-lab URL Review: " + (f.first ? f.first + ", acabas" : "Acabas") + " de desbloquear 2 días gratis de URL review" + (f.host ? ", listos para " + f.host : "") + ". Enlace del pase: " + f.display + "."
  },
  pt: {
    head: "Você acabou de liberar 2 dias de URL review!", hi: (n) => "Oi, " + n + ", obrigado pela ótima conversa!", thanks: "Obrigado pela ótima conversa!", days: "dias grátis", pass: "Seu passe",
    try: (h) => "Experimente com " + h, any: "SEO, acessibilidade, velocidade e segurança em uma revisão", cta: "Ative seu passe",
    alt: (f) => "Cartão do QA-lab URL Review: " + (f.first ? f.first + ", você" : "Você") + " acabou de liberar 2 dias grátis de URL review" + (f.host ? ", prontos para " + f.host : "") + ". Link do passe: " + f.display + "."
  },
  de: {
    head: "Sie haben 2 Tage URL Review freigeschaltet!", hi: (n) => "Hallo " + n + ", danke für den tollen Austausch!", thanks: "Danke für den tollen Austausch!", days: "Tage gratis", pass: "Ihr Pass",
    try: (h) => "Testen Sie " + h, any: "SEO, Barrierefreiheit, Tempo und Sicherheit in einer Prüfung", cta: "Pass einlösen",
    alt: (f) => "Karte von QA-lab URL Review: " + (f.first ? f.first + ", Sie" : "Sie") + " haben 2 Tage URL Review kostenlos freigeschaltet" + (f.host ? ", bereit für " + f.host : "") + ". Link zum Pass: " + f.display + "."
  },
  fr: {
    head: "Vous venez de débloquer 2 jours de URL review !", hi: (n) => "Bonjour " + n + ", merci pour ce super échange !", thanks: "Merci pour ce super échange !", days: "jours offerts", pass: "Votre pass",
    try: (h) => "Testez " + h, any: "SEO, accessibilité, vitesse et sécurité en un seul audit", cta: "Activer mon pass",
    alt: (f) => "Carte QA-lab URL Review : " + (f.first ? f.first + ", vous" : "Vous") + " venez de débloquer 2 jours de URL review offerts" + (f.host ? ", prêts pour " + f.host : "") + ". Lien du pass : " + f.display + "."
  },
  it: {
    head: "Hai appena sbloccato 2 giorni di URL review!", hi: (n) => "Ciao " + n + ", grazie per il bello scambio!", thanks: "Grazie per il bello scambio!", days: "giorni gratis", pass: "Il tuo pass",
    try: (h) => "Provalo su " + h, any: "SEO, accessibilità, velocità e sicurezza in una revisione", cta: "Attiva il pass",
    alt: (f) => "Scheda di QA-lab URL Review: " + (f.first ? f.first + ", hai" : "Hai") + " appena sbloccato 2 giorni gratis di URL review" + (f.host ? ", pronti per " + f.host : "") + ". Link del pass: " + f.display + "."
  }
};

const clip = (v, n) => String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, n);

/** What a card says, from actions.dm (card { look, host, first, handle }, trial { url, code }, lang). */
function facts(dm) {
  const d = dm || {};
  const c = d.card || {};
  const want = String(d.lang || "").slice(0, 2);
  const lang = LANGS.includes(want) ? want : "en";
  const url = String((d.trial || {}).url || "https://carlosandmunoz.com/qa-review.html");
  return {
    lang, look: LOOKS.includes(c.look) ? c.look : LOOKS[0],
    first: clip(c.first, 24), host: clip(c.host, 60).replace(/^www\./, ""), code: clip((d.trial || {}).code, 24),
    display: url.replace(/^https?:\/\//, "").replace(/\/$/, "")
  };
}

const alt = (f) => COPY[f.lang].alt(f);

// --- Layout -----------------------------------------------------------------------------------------------------

const C = { ink: "#050c0f", cyan: "#4db3bb", hi: "#7ef6fb", gold: "#e2c48a", text: "#eef6f7", muted: "#a9bcc1", pink: "#ff8fb1", cream: "#fbf4e6", brown: "#2a211a", coral: "#ff7a59", teal: "#0d6e76" };
const h = (type, style, ...all) => {
  const children = all.filter((x) => x !== null);
  return { type, props: Object.assign({ style }, children.length ? { children: children.length === 1 ? children[0] : children } : {}) };
};
const caps = (size, color) => ({ fontSize: size, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color });
const img = (src, size) => ({ type: "img", props: { src, width: size, height: size, style: { width: size, height: size } } });

let markUri;
const mark = () => (markUri = markUri || "data:image/svg+xml;base64," + fs.readFileSync(path.join(ASSETS, "qa-review-mark-fusion.svg")).toString("base64"));

// Confetti pieces at fixed spots, so a card renders the same every time.
const BITS = [[70, 40, 18, 8, 20, "gold"], [210, 600, 14, 14, 0, "cyan"], [520, 30, 22, 8, -30, "pink"], [1010, 70, 16, 16, 0, "gold"], [1130, 300, 22, 8, 40, "cyan"],
  [940, 610, 20, 8, -15, "pink"], [640, 640, 12, 12, 0, "gold"], [40, 330, 12, 12, 0, "pink"], [820, 26, 12, 12, 0, "cyan"], [360, 650, 22, 8, 60, "gold"], [1150, 520, 12, 12, 0, "gold"]];
const confettiBits = (alpha) => BITS.map(([x, y, w, ht, r, col]) => h("div", { position: "absolute", left: x, top: y, width: w, height: ht, borderRadius: w === ht ? w : 3, backgroundColor: C[col], opacity: alpha, transform: "rotate(" + r + "deg)" }));

const brand = (color, sub) => h("div", { display: "flex", alignItems: "center" },
  img(mark(), 52),
  h("div", { display: "flex", flexDirection: "column", marginLeft: 16 },
    h("div", caps(22, color), "QA-lab URL Review"),
    h("div", { fontSize: 18, fontWeight: 500, color: sub, marginTop: 3 }, "carlosandmunoz.com")));

const headSize = (s, big) => (s.length <= 40 ? big : s.length <= 48 ? big - 8 : big - 14);
const greet = (t, f) => (f.first ? t.hi(f.first) : t.thanks);
const linkSize = (f, room) => Math.max(16, Math.min(26, Math.floor(room / (f.display.length * 0.6))));

function confetti(f, t) {
  return h("div", { width: W, height: H, display: "flex", position: "relative", backgroundColor: C.ink, fontFamily: "Inter", color: C.text,
    backgroundImage: "radial-gradient(55% 60% at 85% 10%, rgba(226, 196, 138, 0.28), rgba(226, 196, 138, 0) 70%), radial-gradient(50% 55% at 5% 95%, rgba(77, 179, 187, 0.30), rgba(77, 179, 187, 0) 70%)" },
  ...confettiBits(0.9),
  h("div", { display: "flex", flexDirection: "column", width: W, height: H, padding: 64, boxSizing: "border-box" },
    brand(C.text, C.muted),
    h("div", { display: "flex", flex: 1, alignItems: "center" },
      h("div", { display: "flex", flexDirection: "column", flex: 1, paddingRight: 36 },
        h("div", { fontSize: 26, fontWeight: 500, color: C.hi }, greet(t, f)),
        h("div", { display: "block", fontFamily: "Instrument Serif", fontSize: headSize(t.head, 76), lineHeight: 1.02, marginTop: 16, letterSpacing: "-0.01em" }, t.head),
        h("div", { fontSize: 22, color: C.muted, marginTop: 18 }, f.host ? t.try(f.host) : t.any)),
      h("div", { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", width: 280, height: 280, borderRadius: 140, backgroundImage: "linear-gradient(150deg, #f4dca8, " + C.gold + ")", boxShadow: "0 0 60px rgba(226, 196, 138, 0.45)", transform: "rotate(-8deg)" },
        h("div", { fontFamily: "Instrument Serif", fontSize: 150, lineHeight: 0.9, color: C.ink }, "2"),
        h("div", caps(24, C.ink), t.days))),
    h("div", { display: "flex", alignItems: "center", border: "1.5px solid rgba(126, 246, 251, 0.25)", borderRadius: 999, padding: "14px 14px 14px 28px", background: "rgba(10, 30, 36, 0.6)" },
      h("div", { display: "block", flex: 1, fontFamily: "Fira Code", fontSize: linkSize(f, 700), whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }, f.display),
      h("div", { display: "flex", fontWeight: 700, fontSize: 22, color: "#ffffff", padding: "12px 28px", borderRadius: 999, backgroundImage: "linear-gradient(135deg, #12a3ad, " + C.teal + ")", marginLeft: 16 }, t.cta))));
}

function ticket(f, t) {
  // The tear line's two bites, in the backdrop's colour.
  const notch = (top) => h("div", { position: "absolute", left: 362, top, width: 56, height: 56, borderRadius: 28, backgroundColor: "#1d3b40" });
  return h("div", { width: W, height: H, display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "#1d3b40", fontFamily: "Inter",
    backgroundImage: "radial-gradient(60% 60% at 50% 0%, rgba(126, 246, 251, 0.18), rgba(126, 246, 251, 0) 70%)" },
  h("div", { display: "flex", position: "relative", width: 1080, height: 560, borderRadius: 32, backgroundColor: C.cream, color: C.brown, boxShadow: "0 30px 60px rgba(0, 0, 0, 0.35)" },
    h("div", { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", width: 390, height: 560, borderRight: "4px dashed rgba(42, 33, 26, 0.25)", backgroundImage: "linear-gradient(170deg, " + C.gold + ", #f2d9a6)", borderRadius: "32px 0 0 32px" },
      h("div", caps(22, C.brown), t.pass),
      h("div", { fontFamily: "Instrument Serif", fontSize: 230, lineHeight: 0.85, marginTop: 10 }, "2"),
      h("div", caps(28, C.brown), t.days),
      f.code ? h("div", { fontFamily: "Fira Code", fontSize: 22, marginTop: 22, padding: "6px 16px", border: "2px solid rgba(42, 33, 26, 0.4)", borderRadius: 10 }, f.code) : null),
    h("div", { display: "flex", flexDirection: "column", flex: 1, padding: "48px 52px", boxSizing: "border-box" },
      brand(C.brown, "#7a6a5a"),
      h("div", { display: "flex", flexDirection: "column", flex: 1, justifyContent: "center" },
        h("div", { fontSize: 24, fontWeight: 500, color: C.teal }, greet(t, f)),
        h("div", { display: "block", fontFamily: "Instrument Serif", fontSize: headSize(t.head, 64), lineHeight: 1.04, marginTop: 14 }, t.head),
        h("div", { fontSize: 21, color: "#6b5d50", marginTop: 16 }, f.host ? t.try(f.host) : t.any)),
      h("div", { display: "flex", alignItems: "center" },
        h("div", { display: "block", flex: 1, fontFamily: "Fira Code", fontSize: linkSize(f, 400), color: C.brown, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }, f.display),
        h("div", { display: "flex", fontWeight: 700, fontSize: 21, color: "#ffffff", padding: "12px 26px", borderRadius: 999, backgroundColor: C.teal, marginLeft: 14 }, t.cta))),
    notch(-28), notch(532)));
}

function sunrise(f, t) {
  return h("div", { width: W, height: H, display: "flex", position: "relative", fontFamily: "Inter", color: "#ffffff",
    backgroundImage: "linear-gradient(180deg, #ff6f61 0%, #ff9a5a 55%, #ffd27a 100%)" },
  h("div", { position: "absolute", left: 760, top: 300, width: 520, height: 520, borderRadius: 260, backgroundColor: "rgba(255, 255, 255, 0.18)" }),
  h("div", { position: "absolute", left: 820, top: 360, width: 400, height: 400, borderRadius: 200, backgroundColor: "rgba(255, 255, 255, 0.22)" }),
  h("div", { position: "absolute", left: 870, top: 180, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", width: 280, height: 280, borderRadius: 140, backgroundColor: "#fffaf0", color: "#e2553f", boxShadow: "0 0 80px rgba(255, 250, 240, 0.8)" },
    h("div", { fontFamily: "Instrument Serif", fontSize: 150, lineHeight: 0.9 }, "2"),
    h("div", caps(24, "#e2553f"), t.days)),
  h("div", { display: "flex", flexDirection: "column", width: 820, height: H, padding: 64, boxSizing: "border-box" },
    brand("#ffffff", "rgba(255, 255, 255, 0.85)"),
    h("div", { display: "flex", flexDirection: "column", flex: 1, justifyContent: "center" },
      h("div", { fontSize: 26, fontWeight: 700, color: "#fff4d6" }, greet(t, f)),
      h("div", { display: "block", fontFamily: "Instrument Serif", fontSize: headSize(t.head, 78), lineHeight: 1.02, marginTop: 14, textShadow: "0 2px 18px rgba(160, 50, 20, 0.35)" }, t.head),
      h("div", { fontSize: 23, fontWeight: 500, color: "#fff4d6", marginTop: 18 }, f.host ? t.try(f.host) : t.any)),
    h("div", { display: "flex", alignItems: "center", borderRadius: 999, padding: "14px 14px 14px 28px", backgroundColor: "rgba(255, 255, 255, 0.92)", color: "#7a2c1c" },
      h("div", { display: "block", flex: 1, fontFamily: "Fira Code", fontSize: linkSize(f, 470), whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }, f.display),
      h("div", { display: "flex", fontWeight: 700, fontSize: 21, color: "#ffffff", padding: "12px 26px", borderRadius: 999, backgroundColor: "#e2553f", marginLeft: 14 }, t.cta))));
}

const TREES = { confetti, ticket, sunrise };

/** The card as a satori element tree. */
const tree = (f) => TREES[f.look](f, COPY[f.lang]);

// --- Rendering --------------------------------------------------------------------------------------------------

let fonts;
const loadFonts = () => (fonts = fonts || [
  ["Inter", "inter-500.ttf", 500], ["Inter", "inter-700.ttf", 700],
  ["Instrument Serif", "instrument-serif-400.ttf", 400], ["Fira Code", "fira-code-500.ttf", 500]
].map(([name, file, weight]) => ({ name, weight, style: "normal", data: fs.readFileSync(path.join(ASSETS, "fonts", file)) })));

/** The card for a DM (actions.dm): { png, type, alt, width, height, lang, look }. Throws when it cannot be drawn. */
async function render(dm) {
  const f = facts(dm);
  const satori = require("satori").default;
  const { Resvg } = require("@resvg/resvg-js");
  const svg = await satori(tree(f), { width: W, height: H, fonts: loadFonts() });
  const png = new Resvg(svg, { fitTo: { mode: "width", value: W }, font: { loadSystemFonts: false } }).render().asPng();
  return { png, type: "image/png", alt: alt(f), width: W, height: H, lang: f.lang, look: f.look };
}

module.exports = { W, H, LOOKS, LANGS, COPY, facts, alt, tree, render };
