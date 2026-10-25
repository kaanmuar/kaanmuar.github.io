/* Día de Muertos: an ofrenda for the dead links in October's Live Reports, on Nov 1 and Nov 2. Every number and
   path comes from assets/live-reports (263 reports, all read in October 2026); no site is named.
     node scripts/tips-studio/build.js --source dia-de-muertos --batch series-dia-de-muertos-2026-11
   Each post sits in the series lane (5) of scripts/social-calendar.js on its day. Nov 2's times are that lane's
   slots; Nov 1's lane is held by a queued promo, so its times keep 15 minutes or more from the posts already
   queued on each network. Instagram is left out of the calendar (#1037). */

const { SITE, plainTitle, xPost } = require("./tips");
const { BRAND, tagLine } = require("../social-tags");

const CAMPAIGN = "series-dia-de-muertos-2026-11";
const KIND = "series";
const REPORTS = SITE + "/qa-review.html";

const CATS = {
  SEO: { label: "Día de Muertos · SEO", color: "#ffb02e", theme: "muertos" }
};

const WINDOWS = {
  linkedin: ["07:30", "11:00"], x: ["08:00", "21:00"], facebook: ["12:00", "19:00"],
  tiktok: ["17:00", "22:00"], youtube: ["16:00", "21:00"]
};

const TIPS = [
  {
    id: "ofrenda", cat: "SEO", date: "2026-11-01",
    times: { linkedin: "10:10", x: "16:56", facebook: "16:48", tiktok: "20:16", youtube: "19:38" },
    counter: "Día de Muertos 1/2", actionLabel: "Check it today", footRight: "Live Reports · October 2026",
    title: ["An ofrenda for", "*the links that died.*"],
    body: "In October, our Live Reports followed the internal links of 263 public sites. Most answered. On 30 sites, at least one led to a page that is gone.",
    visual: { type: "check", items: [
      ["178 sites", "Every link we opened answered", "pass"],
      ["30 sites", "Linked to a page that is gone", "fail"],
      ["18 of those 30", "The dead link was on the home page", "fail"],
      ["404", "The usual answer: Not Found", "risk"]
    ] },
    xLine: "Open every link on your home page today. Fix each one that answers 404.",
    action: "Open every link on your home page. Fix or remove each one that answers 404, or redirect it with a 301 to the closest live page.",
    alt: "Día de Muertos card: An ofrenda for the links that died. October's Live Reports followed the internal links of 263 public sites: on 178 every link answered, on 30 at least one led to a page that is gone, and on 18 of those the dead link was on the home page. The usual answer was 404 Not Found.",
    tags: ["DiaDeMuertos", "BrokenLinks", "SEO"]
  },
  {
    id: "epitaphs", cat: "SEO", date: "2026-11-02",
    times: { linkedin: "10:26", x: "19:53", facebook: "18:34", tiktok: "21:23", youtube: "20:15" },
    counter: "Día de Muertos 2/2", actionLabel: "Check it today", footRight: "Live Reports · October 2026",
    title: ["Epitaphs for", "*October's dead links.*"],
    body: "Two sites linked to an error page that was itself missing. A template printed its placeholder where a link belonged. Three sites linked PDFs that were gone.",
    visual: { type: "code", lines: [
      "GET /error.php?code=2064   404",
      "GET /[field_link]          404",
      "GET /…/resolucion_565….pdf 404",
      "GET /…?idioma=EN           404",
      "GET /web/guest/login       500"
    ], note: "Real paths from October's Live Reports" },
    xLine: "Request your error page and every PDF you link to. Each one should open.",
    action: "Open the PDFs and language links on your home page, request your error page, and search your templates for unfilled placeholders.",
    alt: "Día de Muertos card: Epitaphs for October's dead links. Real paths from October's Live Reports and their answers: an error page link, 404; an unfilled template placeholder, 404; a PDF, 404; a language switch, 404; a login page, 500.",
    tags: ["DiaDeMuertos", "BrokenLinks", "SEO"]
  }
];

const UI = {
  en: { guided: "Live Reports", end: "Keep your links alive.", endNote: "Every Live Report from October is public." },
  es: { guided: "Live Reports", end: "Mantén vivos tus enlaces.", endNote: "Todos los Live Reports de octubre son públicos." },
  pt: { guided: "Live Reports", end: "Mantenha seus links vivos.", endNote: "Todos os Live Reports de outubro são públicos." },
  de: { guided: "Live Reports", end: "Halten Sie Ihre Links lebendig.", endNote: "Alle Live Reports aus dem Oktober sind öffentlich." },
  fr: { guided: "Live Reports", end: "Gardez vos liens en vie.", endNote: "Tous les Live Reports d'octobre sont publics." },
  it: { guided: "Live Reports", end: "Mantieni vivi i tuoi link.", endNote: "Tutti i Live Reports di ottobre sono pubblici." }
};

function hostFor() { return "carlosandmunoz.com/qa-review.html"; }

function link(platform, tip) {
  const q = new URLSearchParams({ utm_source: platform, utm_medium: "social", utm_campaign: CAMPAIGN, utm_content: tip.id });
  return REPORTS + "?" + q.toString() + "#live-reports";
}

function captions(tip, index, total) {
  const head = "🕯️ " + plainTitle(tip);
  const counter = "Día de Muertos " + (index + 1) + "/" + total;
  const check = tip.actionLabel + ": " + tip.action;
  const more = "All of October's Live Reports: ";
  return {
    linkedin: [head, "", tip.body, "", check, "", more + link("linkedin", tip), "", tagLine(tip, "linkedin")].join("\n"),
    x: xPost(head + "\n\n" + tip.xLine, link("x", tip), tagLine(tip, "x")),
    instagram: [head, "", tip.body, "", check, "", tagLine(tip, "instagram")].join("\n"),
    facebook: [head, "", tip.body, "", check, "", link("facebook", tip), "", tagLine(tip, "facebook")].join("\n"),
    tiktok: plainTitle(tip) + " " + tip.action + " " + tagLine(tip, "tiktok"),
    youtubeTitle: (plainTitle(tip) + " #Shorts").slice(0, 100),
    youtube: [tip.body, "", check, "", "Live Reports: " + link("youtube", tip), "", counter + " · QA-lab URL Review", "", tagLine(tip, "youtube")].join("\n")
  };
}

module.exports = { SITE, GUIDE: REPORTS, BRAND, CATS, KIND, TIPS, UI, WINDOWS, captions, link, plainTitle, xPost, hostFor };
