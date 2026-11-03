"use strict";
/*
 * Report replies (#2465): posts that name a site we reviewed, or talk about its niche or the problems its report found
 * (#2468), get a reply inviting them to its report.
 *
 * Each scout run takes PER_RUN public Live Reports in turn (assets/live-reports/index.json, which never holds private,
 * unlisted or paid owner reports), searches the networks for posts naming the site's domain or name
 * (functions/engagement-sources.js search), and has Gemini check each post is really about that site and write the
 * invite in the post's language. The reply waits for Carlos in Jarvis like every engagement reply; answers to it come
 * back through the comment chains (#2421). A report run from the link is published to the Live Reports in turn and
 * so becomes a site the scout looks for.
 *
 *   link    qalabreview.com/<lang>/r/<network code>/<host>/<post ref> (qalabreview/src/routes.js): utm_campaign
 *           social-reply-<network>, utm_content <host>, utm_term <post ref>; TinyURL when it runs past LONG_LINK
 *   score   named from SHOW_SCORE up; under it the invite points at the weakest area and names no number
 *   format  "card" where the network takes an image in a reply (CARD_NETS), else "link"
 *   once    one reply per site per SITE_GAP across all networks, and none to a site whose owner had our mail in it;
 *           the other way round, owner notices and cold-email uploads skip a site answered in it (answeredHosts, #2470)
 *
 * Posts that do not name the site (#2468) are looked for in the site's language, at most LOOSE_PER_RUN searches a run:
 *   problem  the site's short brand from its host (dian for dian.gov.co) with a complaint about an area its report
 *            scored under WEAK ("slow" for Performance, "hard to use" for Accessibility)
 *   niche    a word for the site's kind (its sector, or government and university from .gov and .edu hosts) with a word
 *            for website, and the complaint when the report has a weak area
 * Every word group of the search must be in the post (looseOf), and Gemini must say the post fits (fits) with worth
 * of LOOSE_WORTH or more; a niche invite offers the site as one of its kind we reviewed, never as the post's subject.
 *
 * Each stored post carries campaign "report-reply" and report { host, id, name, score, shown, weakest, match, problem,
 * niche, query, format, link }; match is domain, name, problem or niche.
 */
const E = require("./engagement");

const DAY = 24 * 3600000;
const SITE_GAP = 30 * DAY;
const SHOW_SCORE = 80;
const PER_RUN = 4;
const MAX_AGE_HOURS = 7 * 24;
const LONG_LINK = 60;
const CAMPAIGN = "report-reply";
const ANSWERED = ["waiting", "approved", "posted"];
const SHORT = "https://qalabreview.com/";
const CODES = { bluesky: "bsky", mastodon: "mast", youtube: "yt", x: "x", linkedin: "li", facebook: "fb", instagram: "ig", threads: "th", tiktok: "tt" };
const CARD_NETS = ["bluesky", "mastodon", "x"];
// Names that say nothing on their own; those sites are searched by domain only.
const GENERIC = /^(home|inicio|accueil|startseite|welcome|bienvenid[oa]s?|index|news|noticias|blog|shop|store|tienda|loja|portal|site|web)$/i;

const WEAK = 70;
const LOOSE_PER_RUN = 4;
const LOOSE_WORTH = 0.75;
const LOOSE = ["problem", "niche"];
// Weak areas in the order people complain about them in public; the first one is searched.
const COMPLAINT_ORDER = ["Performance", "Accessibility", "SEO", "Security", "Analytics", "GEO"];
const SITE_LANG = Object.assign(
  Object.fromEntries("CO MX ES AR PE EC CL UY HN VE BO PY CR PA GT SV NI DO CU PR".split(" ").map((c) => [c, "es"])),
  { BR: "pt", PT: "pt", DE: "de", AT: "de", CH: "de", LI: "de", FR: "fr", MC: "fr", BE: "fr", LU: "fr", IT: "it", SM: "it" });
// Host parts that are not a brand: public suffixes and their usual second levels.
const SUFFIX = /^(com|net|org|info|biz|edu|gov|gob|gouv|govt|gub|gv|go|ac|co|or|ne|int|mil|nhs|sch|ltd|plc|[a-z]{2})$/;

// Word lists per language, "|" between phrases; the first phrase is the one searched. Matched as whole words, any case, accents aside.
const WEB = { en: "website|site|web page|webpage|portal", es: "página|pagina web|sitio|sitio web|web|portal", pt: "site|página|portal", de: "Website|Webseite|Seite|Homepage|Portal", fr: "site|site web|portail", it: "sito|sito web|portale" };
const PROBLEMS = {
  Performance: { en: "slow|so slow|takes forever|won't load|not loading|keeps crashing|down again|timing out", es: "lenta|lento|no carga|se cae|se cayó|caída|se colgó|tarda", pt: "lento|lenta|não carrega|fora do ar|travando|caiu", de: "langsam|lädt nicht|ewig|abgestürzt", fr: "lent|lente|rame|ne charge pas|plante|en panne", it: "lento|lenta|non carica|bloccato" },
  Accessibility: { en: "hard to use|confusing|unusable|not accessible|inaccessible|screen reader|accessibility", es: "difícil de usar|confusa|confuso|inaccesible|accesibilidad|lector de pantalla", pt: "difícil de usar|confuso|confusa|inacessível|acessibilidade|leitor de tela", de: "umständlich|unübersichtlich|unbenutzbar|barrierefrei|Barrierefreiheit|Screenreader", fr: "difficile à utiliser|illisible|inaccessible|accessibilité|lecteur d'écran", it: "difficile da usare|confuso|inaccessibile|accessibilità|screen reader" },
  Security: { en: "hacked|not secure|insecure|phishing|data breach|certificate", es: "hackeado|hackearon|inseguro|phishing|filtración|certificado", pt: "hackeado|invadido|inseguro|phishing|vazamento|certificado", de: "gehackt|unsicher|Phishing|Datenleck|Zertifikat", fr: "piraté|pas sécurisé|phishing|fuite de données|certificat", it: "hackerato|non sicuro|phishing|data breach|certificato" },
  SEO: { en: "broken link|broken links|404|can't find|not on google", es: "enlace roto|link roto|enlaces rotos|404|no aparece en google", pt: "link quebrado|links quebrados|404|não aparece no google", de: "toter Link|tote Links|404|nicht bei Google", fr: "lien mort|lien cassé|liens morts|404|introuvable", it: "link rotto|link rotti|404|introvabile" },
  GEO: { en: "chatgpt|ai search|perplexity|ai overview", es: "chatgpt|búsqueda con ia|perplexity", pt: "chatgpt|busca com ia|perplexity", de: "ChatGPT|KI-Suche|Perplexity", fr: "chatgpt|recherche ia|perplexity", it: "chatgpt|ricerca ai|perplexity" },
  Analytics: { en: "cookie banner|cookies|tracking", es: "cookies|banner de cookies|rastreo", pt: "cookies|rastreamento", de: "Cookie-Banner|Cookies|Tracking", fr: "cookies|bandeau cookies|pistage", it: "cookie|banner dei cookie|tracciamento" }
};
const NICHES = {
  government: { en: "government|council|ministry|public services", es: "gobierno|alcaldía|ministerio|gobernación|trámites|entidad pública", pt: "governo|prefeitura|ministério|órgão público", de: "Behörde|Behörden|Amt|Ministerium|Verwaltung", fr: "gouvernement|mairie|ministère|administration|préfecture", it: "comune|governo|ministero|pubblica amministrazione" },
  health: { en: "hospital|clinic|health", es: "hospital|clínica|salud|EPS", pt: "hospital|clínica|saúde|SUS", de: "Krankenhaus|Klinik|Gesundheit", fr: "hôpital|clinique|santé", it: "ospedale|clinica|sanità" },
  media: { en: "news|newspaper|media", es: "periódico|noticias|medio", pt: "jornal|notícias", de: "Zeitung|Nachrichten", fr: "journal|presse|actualités", it: "giornale|notizie|testata" },
  transit: { en: "transit|metro|bus|train|railway", es: "transporte|metro|bus|tren", pt: "transporte|metrô|ônibus|trem", de: "Bahn|ÖPNV|Verkehrsbetriebe|Fahrplan", fr: "transport|métro|bus|train", it: "trasporti|metro|treni|autobus" },
  opensource: { en: "open source|opensource|foss", es: "código abierto|software libre", pt: "código aberto|software livre", de: "Open Source|freie Software", fr: "open source|logiciel libre", it: "open source|software libero" },
  banking: { en: "bank|banking", es: "banco|bancos|banca", pt: "banco|bancos", de: "Bank|Banken|Sparkasse", fr: "banque|banques", it: "banca|banche" },
  international: { en: "united nations|ngo|international organization", es: "ONU|Naciones Unidas|organismo internacional", pt: "ONU|Nações Unidas", de: "UNO|Vereinte Nationen", fr: "ONU|Nations unies", it: "ONU|Nazioni Unite" },
  science: { en: "science|research|space", es: "ciencia|investigación|espacial", pt: "ciência|pesquisa", de: "Wissenschaft|Forschung|Raumfahrt", fr: "science|recherche|spatial", it: "scienza|ricerca|spaziale" },
  knowledge: { en: "wiki|encyclopedia", es: "enciclopedia|wiki", pt: "enciclopédia|wiki", de: "Lexikon|Wiki|Enzyklopädie", fr: "encyclopédie|wiki", it: "enciclopedia|wiki" },
  devdocs: { en: "docs|documentation|api docs", es: "documentación", pt: "documentação", de: "Dokumentation|Doku", fr: "documentation", it: "documentazione" },
  standards: { en: "standards|spec", es: "estándares|normas", pt: "padrões|normas", de: "Standards|Normen", fr: "normes|standards", it: "standard|norme" },
  humanitarian: { en: "humanitarian|charity|relief", es: "humanitaria|ayuda humanitaria|ONG", pt: "humanitária|ajuda humanitária|ONG", de: "humanitär|Hilfsorganisation", fr: "humanitaire|ONG", it: "umanitaria|ONG" },
  rights: { en: "human rights|civil liberties", es: "derechos humanos", pt: "direitos humanos", de: "Menschenrechte", fr: "droits humains|droits de l'homme", it: "diritti umani" },
  highered: { en: "university|college|campus", es: "universidad|universidades", pt: "universidade|faculdade", de: "Uni|Universität|Hochschule", fr: "université|fac", it: "università|ateneo" },
  infrastructure: { en: "infrastructure|dns|cdn|hosting", es: "infraestructura|hosting", pt: "infraestrutura|hospedagem", de: "Infrastruktur|Hosting", fr: "infrastructure|hébergement", it: "infrastruttura|hosting" },
  culture: { en: "museum|library|gallery", es: "museo|biblioteca", pt: "museu|biblioteca", de: "Museum|Bibliothek", fr: "musée|bibliothèque", it: "museo|biblioteca" },
  travel: { en: "travel|hotel|booking", es: "viajes|hotel|reservas", pt: "viagem|hotel|reservas", de: "Reise|Hotel|Buchung", fr: "voyage|hôtel|réservation", it: "viaggi|hotel|prenotazione" },
  retail: { en: "online shop|shop|store|ecommerce", es: "tienda|tienda online|comercio electrónico", pt: "loja|loja online|e-commerce", de: "Onlineshop|Shop", fr: "boutique|e-commerce", it: "negozio|ecommerce" },
  education: { en: "school|education|e-learning", es: "colegio|escuela|educación", pt: "escola|educação", de: "Schule|Bildung", fr: "école|éducation", it: "scuola|istruzione" },
  airline: { en: "airline|flight|airport", es: "aerolínea|vuelo|aeropuerto", pt: "companhia aérea|voo|aeroporto", de: "Fluggesellschaft|Airline|Flug|Flughafen", fr: "compagnie aérienne|vol|aéroport", it: "compagnia aerea|volo|aeroporto" },
  telecom: { en: "carrier|telecom|broadband|mobile operator", es: "operador|telefonía|operadora", pt: "operadora|telefonia", de: "Mobilfunk|Provider|Netzbetreiber", fr: "opérateur|forfait|box internet", it: "operatore|telefonia" },
  insurance: { en: "insurance|insurer", es: "seguros|seguro|aseguradora", pt: "seguro|seguradora", de: "Versicherung", fr: "assurance|assureur", it: "assicurazione" },
  energy: { en: "energy|utility|electricity", es: "energía|luz|electricidad", pt: "energia|luz", de: "Strom|Energie|Stadtwerke", fr: "électricité|énergie", it: "energia|luce|bolletta" },
  apps: { en: "app", es: "app|aplicación", pt: "app|aplicativo", de: "App", fr: "appli|application", it: "app" },
  fintech: { en: "fintech|payments|neobank", es: "fintech|pagos|billetera", pt: "fintech|pagamentos|carteira digital", de: "Fintech|Zahlungen", fr: "fintech|paiement", it: "fintech|pagamenti" },
  sports: { en: "football|club|league|sports", es: "fútbol|club|liga|deportes", pt: "futebol|clube|esporte", de: "Fußball|Verein|Sport", fr: "football|club|sport", it: "calcio|squadra|sport" },
  environment: { en: "environment|climate|conservation", es: "medio ambiente|ambiental|clima", pt: "meio ambiente|ambiental|clima", de: "Umwelt|Klima|Naturschutz", fr: "environnement|climat", it: "ambiente|clima" }
};

const clip = (v, n) => String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, n);
const bare = (h) => String(h || "").trim().toLowerCase().replace(/^https?:\/\//, "").split("/")[0].replace(/^www\./, "");
const lang2 = (v) => String(v || "").toLowerCase().slice(0, 2);
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Lower case, accents and punctuation out, spaces round, so phrases match as whole words. */
const norm = (s) => " " + String(s || "").toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim() + " ";
const words = (list, lang) => String((list || {})[lang] || (list || {}).en || "").split("|").filter(Boolean);
const has = (hay, phrases) => phrases.some((w) => hay.includes(norm(w)));

/** The brand in a host: the last part before the public suffix (dian for dian.gov.co), or "" for gov.uk. */
function shortOf(host) {
  const parts = host.split(".");
  while (parts.length > 1 && SUFFIX.test(parts[parts.length - 1])) parts.pop();
  const s = parts.length ? parts[parts.length - 1].replace(/-/g, " ") : "";
  return s.replace(/\s/g, "").length >= 4 && !SUFFIX.test(s) && !GENERIC.test(s) ? s : "";
}

/** The site's kind: its sector, else government or university when the host says so. */
function nicheOf(sector, host) {
  if (NICHES[sector]) return sector;
  const parts = host.split(".");
  if (parts.some((p) => /^(gov|gob|gouv|govt|gub)$/.test(p))) return "government";
  if (parts.slice(-3).some((p) => /^(edu|ac)$/.test(p))) return "highered";
  return "";
}

/**
 * The Live Reports index as sites to look for: { id, host, name, score, grade, sector, country, weakest, weak, lang,
 * niche, short, read }. weak holds the areas under WEAK in COMPLAINT_ORDER; lang is English for worldwide sites.
 */
function targets(index) {
  const seen = new Set();
  return ((index || {}).reports || []).filter((r) => r && r.id && r.host && Number.isFinite(Number(r.overall))).map((r) => {
    const areas = Object.entries(r.areas || {}).filter(([, v]) => Number.isFinite(Number(v))).sort((a, b) => a[1] - b[1]);
    const host = bare(r.host);
    const country = clip(r.country, 4).toUpperCase();
    return {
      id: clip(r.id, 80), host, name: clip(r.name, 80), score: Math.round(Number(r.overall)), grade: clip(r.grade, 3), sector: clip(r.sector, 40), country,
      weakest: areas.length ? areas[0][0] : "", weak: COMPLAINT_ORDER.filter((k) => areas.some(([a, v]) => a === k && v < WEAK)),
      lang: /^worldwide$/i.test(r.scope || "") ? "en" : SITE_LANG[country] || "en", niche: nicheOf(clip(r.sector, 40), host), short: shortOf(host), read: clip(r.read, 10)
    };
  }).filter((t) => t.host.includes(".") && !seen.has(t.host) && seen.add(t.host));
}

/** A name worth searching on its own: long enough, not generic, and not just the domain again. */
const nameOk = (t) => t.name.length >= 4 && !GENERIC.test(t.name) && bare(t.name) !== t.host;

/** This slot's sites, skipping those answered or emailed in the gap (skip holds hosts). */
function pick(list, slot, skip, n) {
  const open = list.filter((t) => !(skip && skip.has(t.host)));
  if (!open.length) return [];
  const k = Math.min(n || PER_RUN, open.length);
  return Array.from({ length: k }, (_, i) => open[(slot * k + i) % open.length]);
}

/** What to search for a site: its domain, and its name when that says something. */
const queries = (t) => [t.host].concat(nameOk(t) ? [t.name] : []);

/** How a post names a site: "domain", "name" or "". */
function matchOf(post, t) {
  const hay = [post.title, post.text, post.url, (post.tags || []).join(" ")].join("\n").toLowerCase();
  if (hay.includes(t.host)) return "domain";
  if (nameOk(t) && new RegExp("(^|[^\\p{L}\\p{N}])" + escape(t.name.toLowerCase()) + "($|[^\\p{L}\\p{N}])", "u").test(hay)) return "name";
  return "";
}

/** The site a post names, of the sites searched this run, as { target, match } or null. */
function siteOf(post, list) {
  const q = String(post.query || "").toLowerCase();
  const first = list.filter((t) => q && (q === t.host || q === t.name.toLowerCase())).concat(list);
  for (const t of first) { const m = matchOf(post, t); if (m) return { target: t, match: m }; }
  return null;
}

/**
 * Searches for posts that do not name the sites (#2468), as { q, target, match, problem, need }: need holds the word
 * groups a post must all have. A short brand that is the name again is left out, since the name search finds those.
 * Problem searches come first, then niche ones, one per query text, LOOSE_PER_RUN at most.
 */
function looseQueries(list) {
  const problems = [];
  const niches = [];
  (list || []).forEach((t) => {
    const area = t.weak[0] || "";
    const complaint = area ? words(PROBLEMS[area], t.lang) : [];
    if (t.short && complaint.length && norm(t.short) !== norm(t.name)) {
      problems.push({ q: t.short + " " + complaint[0], target: t, match: "problem", problem: area, need: [[t.short], complaint] });
    }
    if (t.niche) {
      const kind = words(NICHES[t.niche], t.lang);
      const web = words(WEB, t.lang);
      niches.push({ q: [kind[0], web[0]].concat(complaint.slice(0, 1)).join(" "), target: t, match: "niche", problem: area, need: [kind, web].concat(complaint.length ? [complaint] : []) });
    }
  });
  const seen = new Set();
  return problems.concat(niches).filter((l) => !seen.has(l.q) && seen.add(l.q)).slice(0, LOOSE_PER_RUN);
}

/** The site a post fits by a loose search, the one that found it first, as { target, match, problem } or null. */
function looseOf(post, loose) {
  const hay = norm([post.title, post.text, (post.tags || []).join(" ")].join("\n"));
  const q = String(post.query || "");
  const first = (loose || []).filter((l) => l.q === q).concat(loose || []);
  for (const l of first) if (l.need.every((group) => has(hay, group))) return { target: l.target, match: l.match, problem: l.problem };
  return null;
}

const shown = (t) => t.score >= SHOW_SCORE;

/** The report's link for a reply: the post's language, the network's code, and a ref from the post's key. */
function linkFor(t, network, lang, key) {
  const ref = String(key || "").split("_").pop().slice(0, 6);
  return SHORT + (E.LANGS.includes(lang) ? lang : "en") + "/r/" + CODES[network] + "/" + t.host + (ref.length >= 4 ? "/" + ref : "");
}

/** The Gemini prompt: is each post about the site, and the invite to its report, with {link} where the link goes. */
function prompt(items) {
  const list = items.map((p) => ({
    id: p.key, network: (E.NETWORKS[p.network] || {}).name || p.network, lang: lang2(p.lang) || "?", author: clip((p.author || {}).name || (p.author || {}).handle, 60),
    title: clip(p.title, 160), text: clip(p.text, 900),
    match: p.match || "domain",
    site: { name: p.target.name || p.target.host, domain: p.target.host, short: p.target.short, sector: p.target.sector, niche: p.target.niche, country: p.target.country, score: shown(p.target) ? p.target.score : null, weakest: p.target.weakest, problem: p.problem || "" },
    maxReply: ((E.NETWORKS[p.network] || {}).limit || 300) - 32
  }));
  return [
    "You help Carlos & Munoz (carlosandmunoz.com) invite people to a free website report we already ran: QA-lab URL Review checks a site's SEO, GEO (AI search), accessibility, performance, analytics and security.",
    "Each post below is tied to a website we reviewed (site) by match: \"domain\" or \"name\" when the post names it; \"problem\" when it calls the site by its short name (site.short) and complains about something in the area its report scored low (site.problem); \"niche\" when it talks about websites of the site's kind (site.niche, in site.country or anywhere) without naming it.",
    "For each post, return one JSON object in a JSON array, same order, with exactly these keys:",
    '{"id": same id, "aboutSite": true only when the post is really about this website or the organisation behind it, not something else with the same name, "fits": for match "problem" and "niche" only (false otherwise), see the strict check below, "about": what the post is about in at most 20 English words, "lang": the post\'s language as an ISO 639-1 code, "sentiment": "positive" | "neutral" | "negative" | "angry", "political": true when it is about politics, elections, wars or culture-war topics, "argument": true when the thread is a fight or a pile-on, "worth": 0 to 1, how welcome a short note about the site\'s report would be under this post, "why": at most 15 English words, "reply": the invite, or "" when the post is political, angry, an argument or about a tragedy, when worth is under 0.6, for match "domain" or "name" when aboutSite is false, and for match "problem" or "niche" when fits is false or worth is under 0.75}',
    "Strict check for match \"problem\" and \"niche\"; when in doubt, fits is false. Problem: fits only when the post is about this very website or app (aboutSite true) and the complaint is about using it in a way site.problem covers (Performance: slow, down, not loading; Accessibility: hard to use, confusing, screen readers; Security: hacked, unsafe, certificate; SEO: broken links, cannot find pages; GEO: AI search; Analytics: cookies, tracking). Niche: fits only when the post is about websites or online services of the site's kind and someone who builds, runs, studies or relies on such sites would welcome an example review. Never fits: news about the organisation or the field that is not about a website, a personal account, order, payment, delivery or customer-service issue, a joke, a job post, an ad, a giveaway, or a post by the organisation itself.",
    "Reply rules: write in the post's language (en, es, pt, de, fr or it; otherwise reply \"\"). Speak as a helpful practitioner, first person plural, warm and specific, in one or two short sentences. Open on what the post says, then say we ran a free review of the site and invite them to look at it. When site.score is a number you may name it as score/100; when it is null never name a score, grade or number, never call the site bad, slow, broken or unsafe, and say instead that the report has a few findings worth a look on site.weakest. For match \"problem\", acknowledge what they ran into without confirming, diagnosing or blaming, and say the free review of the site has findings on site.problem. For match \"niche\", never suggest the author mentioned or uses the site: offer it by name as one site of that kind we reviewed, as an example of what such a review finds. End with {link} exactly once, where the link goes. " + REGISTER,
    "Never: any link or address other than {link} (naming the site is fine), hashtags, more than one emoji, em dashes, flattery like \"Great post!\", made-up numbers, pressure or sales talk, or anything about the author's person. Stay under maxReply characters, {link} not counted.",
    "Posts:",
    JSON.stringify(list)
  ].join("\n");
}

const REGISTER = "Address people as tú in Spanish, você in Portuguese, tu in Italian, Sie in German and vous in French.";

/** Gemini's answer by id. A reply keeps one {link} (added at the end when missing) and is dropped when it names a score we do not show. */
function parse(text, items) {
  let rows;
  try { rows = JSON.parse(String(text || "").replace(/^```(?:json)?|```$/gm, "").trim()); } catch (error) { return {}; }
  if (!Array.isArray(rows)) return {};
  const byKey = Object.fromEntries((items || []).map((p) => [p.key, p]));
  const out = {};
  rows.forEach((r) => {
    const p = r && byKey[r.id];
    if (!p) return;
    let reply = String(r.reply || "").replace(/\bhttps?:\/\/\S+|\bwww\.\S+/gi, "").replace(/(^|\s)#[\p{L}\p{N}_]+/gu, "$1").replace(/\s*—\s*/g, ", ").replace(/\s{2,}/g, " ").trim();
    let once = false;
    reply = reply.replace(/\{link\}/g, () => (once ? "" : (once = true, "{link}"))).replace(/\s{2,}/g, " ").trim();
    if (reply && !once) reply += " {link}";
    if (!shown(p.target) && (new RegExp("\\b" + p.target.score + "\\b").test(reply) || /\b\d{1,3}\s*\/\s*100\b/.test(reply))) reply = "";
    out[r.id] = {
      aboutSite: r.aboutSite === true, fits: LOOSE.includes(p.match) && r.fits === true, about: clip(r.about, 200), lang: lang2(r.lang) || lang2(p.lang),
      sentiment: ["positive", "neutral", "negative", "angry"].includes(r.sentiment) ? r.sentiment : "neutral",
      political: r.political === true, argument: r.argument === true, worth: Math.min(1, Math.max(0, Number(r.worth) || 0)), why: clip(r.why, 160),
      reply: reply.replace("{link}", "").trim().length >= 12 ? reply : ""
    };
  });
  return out;
}

/** The reply with its link in, cut before the link to the network's limit. */
function fill(reply, link, network) {
  const limit = (E.NETWORKS[network] || {}).limit || 300;
  let [before, after = ""] = reply.split("{link}");
  const room = limit - link.length - after.length;
  if (before.length > room) before = before.slice(0, Math.max(0, room - 2)).replace(/\s+\S*$/, "") + "… ";
  return (before + link + after).replace(/\s{2,}/g, " ").trim();
}

/**
 * What to do with a post that names a site. ctx: { recent: hosts answered in the gap, contacted: Map host => why,
 * replied: E.threadKey of conversations we answered, links: post key => the link to use }. Same shape as E.decide,
 * with the reply only: waiting for Carlos, capped (shared with the scout's daily reply cap), paused or replied.
 */
function decide(post, ai, target, conf, used, now, ctx) {
  const net = E.NETWORKS[post.network] || {};
  const no = (skip) => ({ verdict: "skip", skip, actions: {} });
  if (!net.acts || !CODES[post.network] || (net.only && !net.only.includes("reply"))) return { verdict: "trend", skip: "", actions: {} };
  const g = E.guard(post, Object.assign({}, conf, { maxAgeHours: Math.max(conf.maxAgeHours, MAX_AGE_HOURS) }), now);
  if (g) return no(g);
  if (ctx.recent.has(target.host)) return no("site_recent");
  if (ctx.contacted.has(target.host)) return no("contacted");
  if (!ai) return no("unread");
  const loose = LOOSE.includes(post.match);
  if (!ai.aboutSite && post.match !== "niche") return no("not_site");
  if (loose && !ai.fits) return no("not_fit");
  const flag = ai.political ? "political" : ai.argument ? "argument" : ai.sentiment === "angry" ? "angry" : "";
  if (flag) return no(flag);
  const lang = ai.lang || lang2(post.lang);
  if (!E.LANGS.includes(lang)) return no("lang");
  if (!ai.reply || ai.worth < (loose ? Math.max(conf.worth, LOOSE_WORTH) : conf.worth)) return { verdict: "watch", skip: "", actions: {} };
  if (ctx.replied.has(E.threadKey(post))) return { verdict: "watch", skip: "", actions: { reply: { status: "replied", error: "We already replied in this conversation." } } };
  if (conf.paused) return { verdict: "watch", skip: "", actions: { reply: { status: "paused" } } };
  const n = ((used[post.network] || {}).reply) || 0;
  const own = (net.caps || {}).reply;
  if (n >= Math.min(conf.caps.reply, own === undefined ? Infinity : own)) return { verdict: "watch", skip: "", actions: { reply: { status: "capped" } } };
  used[post.network] = Object.assign({}, used[post.network], { reply: n + 1 });
  ctx.recent.add(target.host);
  const link = (ctx.links && ctx.links[post.key]) || linkFor(target, post.network, lang, post.key);
  return {
    verdict: "engage", skip: "",
    actions: { reply: { status: "waiting", kind: CAMPAIGN, draft: fill(ai.reply, link, post.network), lang, expiresAt: new Date(now + E.REPLY_TTL).toISOString() } }
  };
}

/** The engagement_posts document for a post that names a site. */
function doc(post, ai, target, match, decision, link, now) {
  const a = ai || {};
  const base = E.postDoc(Object.assign({}, post, { topic: "Reports", topics: ["Reports"] }), { about: a.about, lang: a.lang, sentiment: a.sentiment, worth: a.worth, why: a.why }, decision, now);
  return Object.assign(base, {
    campaign: CAMPAIGN,
    report: {
      host: target.host, id: target.id, name: target.name, score: target.score, shown: shown(target), weakest: target.weakest, match,
      problem: LOOSE.includes(match) ? post.problem || "" : "", niche: match === "niche" ? target.niche : "",
      query: clip(post.query, 80), format: CARD_NETS.includes(post.network) ? "card" : "link", link: link || ""
    }
  });
}

/**
 * Hosts answered with a report reply in the gap, as host => when (the latest of seen, approved and posted), checked
 * 30 at a time. statuses defaults to ANSWERED. Owner notices and cold-email uploads wait out the gap for these (#2470).
 */
async function answeredHosts(db, hosts, now, statuses) {
  const since = new Date(now - SITE_GAP).toISOString();
  const want = statuses || ANSWERED;
  const list = [...new Set((hosts || []).map(bare).filter((h) => h.includes(".")))];
  const out = new Map();
  for (let i = 0; i < list.length; i += 30) {
    const snap = await db.collection("engagement_posts").where("report.host", "in", list.slice(i, i + 30)).limit(300).get();
    snap.docs.map((d) => d.data()).forEach((d) => {
      const r = (d.actions || {}).reply || {};
      const at = [d.seenAt, r.decidedAt, r.postedAt].map((v) => String(v || "")).sort().pop();
      if (d.campaign !== CAMPAIGN || !want.includes(r.status) || at < since) return;
      if (!(out.get(d.report.host) >= at)) out.set(d.report.host, at);
    });
  }
  return out;
}

/** Counters a report pass adds to engagement_daily/<day> under report, besides the scout's own per-network ones; by counts posts per match. */
function rollup(searched, docs) {
  const out = { searched, matched: 0, drafted: 0, skip: {}, net: {}, by: {} };
  (docs || []).forEach((d) => {
    out.matched += 1;
    out.net[d.network] = (out.net[d.network] || 0) + 1;
    const m = (d.report || {}).match;
    if (m) out.by[m] = (out.by[m] || 0) + 1;
    if (d.skip) out.skip[d.skip] = (out.skip[d.skip] || 0) + 1;
    if (((d.actions || {}).reply || {}).status === "waiting") out.drafted += 1;
  });
  return out;
}

const PARENT = 2465;
const cell = (v) => String(v == null ? "" : v).replace(/\|/g, "/").replace(/\s+/g, " ").trim();
const usd = (n) => (Number(n) || 0).toFixed(2) + " USD";

/**
 * The weekly results ticket (#2471): what the report replies did in the week. r is the weekly engagement report
 * (functions/jarvis-engagement.js buildReport, r.invites), social the link results (functions/jarvis-outreach.js
 * socialResults). Null when the week had no report reply and no click on one.
 */
function resultsIssue(r, social) {
  const iv = r.invites || {};
  const s = social || { visits: 0, reviews: 0, paid: 0, usd: 0, networks: [], posts: [] };
  if (!iv.matched && !iv.drafted && !iv.posted && !s.visits && !s.reviews && !s.paid) return null;
  const approved = (iv.approved || 0) + (iv.edited || 0);
  const name = (k) => (E.NETWORKS[k] || {}).name || k;
  const matched = Object.fromEntries((iv.networks || []).map((x) => [x.label, x.value]));
  const nets = Array.from(new Set(Object.keys(matched).concat(s.networks.map((n) => n.network))));
  const byNet = Object.fromEntries(s.networks.map((n) => [n.network, n]));
  const lines = [
    "**Kind:** Results",
    "**Area:** engagement",
    "Parent: #" + PARENT,
    "",
    "Report replies (#" + PARENT + ") from " + r.from + " to " + r.to + " (Bogotá): posts naming a site we reviewed, answered with a link to its report. Opened by engagementWeeklyReport; Jarvis > Engagement and Outreach show the same numbers live.",
    "",
    "## Funnel",
    "| Step | Count |",
    "| --- | --- |",
    "| Sites looked for | " + (iv.searched || 0) + " |",
    "| Posts naming a reviewed site | " + (iv.matched || 0) + " |",
    "| Invites drafted | " + (iv.drafted || 0) + " |",
    "| Approved | " + approved + " (" + (iv.edited || 0) + " edited, " + (iv.dismissed || 0) + " dismissed) |",
    "| Posted | " + (iv.posted || 0) + " |",
    "| Clicks on the report link | " + s.visits + " |",
    "| Free runs from those clicks | " + s.reviews + " |",
    "| Paid unlocks | " + s.paid + " (" + usd(s.usd) + ") |",
    "",
    "## Per network",
    "| Network | Posts found | Clicks | Runs | Paid | Revenue |",
    "| --- | --- | --- | --- | --- | --- |",
    ...nets.map((k) => { const n = byNet[k] || { visits: 0, reviews: 0, paid: 0, usd: 0 }; return "| " + name(k) + " | " + (matched[k] || 0) + " | " + n.visits + " | " + n.reviews + " | " + n.paid + " | " + usd(n.usd) + " |"; })
  ];
  if (s.posts.length) {
    lines.push("", "## Per post", "| Post | Site | Clicks | Runs | Paid | Revenue | Our reply |", "| --- | --- | --- | --- | --- | --- | --- |",
      ...s.posts.slice(0, 25).map((p) => "| " + (p.url ? "[" + cell(p.name + ": " + (p.title || p.author || p.ref).slice(0, 70)) + "](" + p.url + ")" : cell(p.name + " " + p.ref)) + " | " + cell(p.host) + " | " + p.visits + " | " + p.reviews + " | " + p.paid + " | " + usd(p.usd) + " | " + (p.replyUrl ? "[" + cell(p.status || "posted") + "](" + p.replyUrl + ")" : cell(p.status || "—")) + " |"));
  }
  if ((iv.skips || []).length) lines.push("", "Left alone: " + iv.skips.map((x) => x.label.replace(/_/g, " ") + " " + x.value).join(", ") + ".");
  lines.push("", "Close this ticket once read; anything to change goes in its own ticket under #" + PARENT + ".");
  return {
    title: "Results: report replies " + r.from + " to " + r.to + " · " + (iv.posted || 0) + " posted, " + s.visits + " clicks, " + s.reviews + " runs, " + s.paid + " paid",
    body: lines.join("\n"),
    labels: ["area:engagement"],
    parent: PARENT
  };
}

module.exports = {
  CAMPAIGN, ANSWERED, CODES, CARD_NETS, SHOW_SCORE, SITE_GAP, PER_RUN, LONG_LINK, MAX_AGE_HOURS, WEAK, LOOSE, LOOSE_PER_RUN, LOOSE_WORTH, PARENT,
  targets, pick, queries, matchOf, siteOf, looseQueries, looseOf, shortOf, nicheOf, shown, linkFor, prompt, parse, fill, decide, doc, rollup, bare, answeredHosts, resultsIssue
};
