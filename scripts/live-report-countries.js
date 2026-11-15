#!/usr/bin/env node
/* Country of origin for every Live Report that has none (#2980).

     node scripts/live-report-countries.js                   # dry run: gather, score, print the counts
     node scripts/live-report-countries.js --apply --queue   # write the sure ones, queue the rest for Carlos
     node scripts/live-report-countries.js --hosts a.com,b.ie --refresh
     node scripts/live-report-countries.js --recent 2 --apply --no-gemini --decisions   # the daily job: cards read in the last 2 days, and Carlos's answers

   Cards with an empty country in assets/live-reports/index.json are read per host. The address says the most
   (ccTLD, .com.br, .gov.co; never a bare .io .co .ai .me .tv ...); then the homepage and one contact or legal page:
   schema.org addressCountry, Maps links, tax and company numbers, phone country codes, distinctive currencies,
   html lang / og:locale / hreflang regions, a country name in the footer address; then the CrUX country list the
   sweep took the host from (assets/sweep). Hosts still unsure get the registrant country from RDAP, the hosting
   country (a weak tie-breaker, CDNs ignored), and with --places N the Google Business Profile that links to the site.
   Gemini decides what is left, from that evidence; a multinational gets scope "worldwide" instead of a country.
   Social profiles are listed as evidence only: LinkedIn, Facebook, Instagram and X show no location without a login.

   A decision with confidence AUTO or more goes into data/live-report-countries.json, { hosts: { host: { country,
   scope, confidence, by, evidence } } }, and onto the published cards (country, flag, region, place tags). The
   builders read that file too (build-live-reports.js build(), auto-live-reports.js), so a rebuild keeps it. The rest
   goes to Firestore jarvis_settings/live_report_countries { items, decisions, skipped } for Carlos (the Jarvis Map tab,
   #3009); a host he decided there (decisions) is written to the file with by "carlos" and never changed by a later run,
   and a host he skipped is not queued again. --decisions reads them through reviewUrl with PUBLISH_KEY instead of
   gcloud, as the daily job does. Curated cards that leave the
   country empty on purpose (a distributed project) are recorded as worldwide.

   Fetched facts are cached in previews/live-report-countries/ (gitignored), so a re-run only scores; --refresh fetches
   again. GEMINI_API_KEY and PLACES_KEY come from the environment, or from Secret Manager through the signed-in gcloud
   account. */

const fs = require("fs");
const path = require("path");
const dns = require("dns").promises;
const { execSync } = require("child_process");
const live = require("./build-live-reports");
const { registrable } = require("../functions/url-review-suffix");
const local = require("../functions/url-review-local");

const ROOT = path.resolve(__dirname, "..");
const INDEX = path.join(ROOT, "assets/live-reports/index.json");
const SWEEP = path.join(ROOT, "assets/sweep");
const CACHE = path.join(ROOT, "previews/live-report-countries");
const PROJECT = process.env.GCLOUD_PROJECT || "carlosm-interactive-cv";
const QUEUE_DOC = "jarvis_settings/live_report_countries";
const DECISIONS_URL = process.env.DECISIONS_URL || "https://us-central1-carlosm-interactive-cv.cloudfunctions.net/reviewUrl/country-decisions";
const AUTO = 0.85;
const CONCURRENCY = 6;
const TIMEOUT_MS = 15000;
const MAX_HTML = 1500000;
const UA = "Mozilla/5.0 (compatible; CarlosMunozReview/1.0; +https://carlosandmunoz.com/qa-review.html)";
const GEMINI_API = "https://generativelanguage.googleapis.com/v1beta/models/";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-flash-latest";
const GEMINI_BATCH = 8;

const REGIONS = live.REGIONS;
// ccTLDs sold and used as generic names: alone they say nothing about the country.
const GENERIC_CC = new Set("io ai me tv fm ly gg co cc ws to sh ac la vc gl im so am tk ml ga cf gq nu su st pw cx bz gd ms dj ag fo md is je ps sx tc vg cd".split(" "));
const TLD_ALIAS = { uk: "GB", el: "GR" };
const GEO_TLDS = { cat: "ES", eus: "ES", gal: "ES", barcelona: "ES", madrid: "ES", bzh: "FR", paris: "FR", corsica: "FR", alsace: "FR", berlin: "DE", hamburg: "DE", bayern: "DE", koeln: "DE", nrw: "DE", wien: "AT", tirol: "AT", swiss: "CH", zuerich: "CH", scot: "GB", wales: "GB", cymru: "GB", london: "GB", nyc: "US", quebec: "CA", tokyo: "JP", amsterdam: "NL", frl: "NL", brussels: "BE", vlaanderen: "BE", gent: "BE", istanbul: "TR", moscow: "RU", rio: "BR", bogota: "CO", melbourne: "AU", sydney: "AU", capetown: "ZA", joburg: "ZA", durban: "ZA", nagoya: "JP", osaka: "JP", okinawa: "JP", yokohama: "JP", kyoto: "JP", saarland: "DE", ruhr: "DE", vegas: "US", miami: "US", boston: "US" };
// .edu names from before 2001 are also held by universities outside the US.
const US_TLDS = { gov: 0.97, mil: 0.97, edu: 0.7 };
// Country subdomains of a generic site (co.computrabajo.com); codes that are also language subdomains are left out.
const SUB_COUNTRY = new Set("co mx cl pe ec ve uy py bo cr pa do gt hn ni pr br us au nz za in ie ch at be jp kr sg ph my ng ke gh eg ma tn ae sa qa".split(" "));
const OFFICIAL_SLD = /^(gov|gob|gouv|govt|gv|go|mil|edu|ac|sch|muni|police|nic|admin)$/;
const PLAIN_SLD = /^(com|org|net|co|or|ne|ltd|plc|biz|info|nom|gen|web|firm|med|art|int|press|store|tm|in)$/;

const CALLING = { 1: "US", 7: "RU", 20: "EG", 27: "ZA", 30: "GR", 31: "NL", 32: "BE", 33: "FR", 34: "ES", 36: "HU", 39: "IT", 40: "RO", 41: "CH", 43: "AT", 44: "GB", 45: "DK", 46: "SE", 47: "NO", 48: "PL", 49: "DE",
  51: "PE", 52: "MX", 53: "CU", 54: "AR", 55: "BR", 56: "CL", 57: "CO", 58: "VE", 60: "MY", 61: "AU", 62: "ID", 63: "PH", 64: "NZ", 65: "SG", 66: "TH", 81: "JP", 82: "KR", 84: "VN", 86: "CN", 90: "TR",
  91: "IN", 92: "PK", 93: "AF", 94: "LK", 95: "MM", 98: "IR", 211: "SS", 212: "MA", 213: "DZ", 216: "TN", 218: "LY", 220: "GM", 221: "SN", 222: "MR", 223: "ML", 224: "GN", 225: "CI", 226: "BF", 227: "NE",
  228: "TG", 229: "BJ", 230: "MU", 231: "LR", 232: "SL", 233: "GH", 234: "NG", 235: "TD", 236: "CF", 237: "CM", 238: "CV", 239: "ST", 240: "GQ", 241: "GA", 242: "CG", 243: "CD", 244: "AO", 245: "GW",
  248: "SC", 249: "SD", 250: "RW", 251: "ET", 252: "SO", 253: "DJ", 254: "KE", 255: "TZ", 256: "UG", 257: "BI", 258: "MZ", 260: "ZM", 261: "MG", 262: "RE", 263: "ZW", 264: "NA", 265: "MW", 266: "LS",
  267: "BW", 268: "SZ", 269: "KM", 290: "SH", 291: "ER", 297: "AW", 298: "FO", 299: "GL", 350: "GI", 351: "PT", 352: "LU", 353: "IE", 354: "IS", 355: "AL", 356: "MT", 357: "CY", 358: "FI", 359: "BG",
  370: "LT", 371: "LV", 372: "EE", 373: "MD", 374: "AM", 375: "BY", 376: "AD", 377: "MC", 378: "SM", 380: "UA", 381: "RS", 382: "ME", 383: "XK", 385: "HR", 386: "SI", 387: "BA", 389: "MK", 420: "CZ",
  421: "SK", 423: "LI", 500: "FK", 501: "BZ", 502: "GT", 503: "SV", 504: "HN", 505: "NI", 506: "CR", 507: "PA", 508: "PM", 509: "HT", 590: "GP", 591: "BO", 592: "GY", 593: "EC", 594: "GF", 595: "PY",
  596: "MQ", 597: "SR", 598: "UY", 599: "CW", 670: "TL", 673: "BN", 674: "NR", 675: "PG", 676: "TO", 677: "SB", 678: "VU", 679: "FJ", 680: "PW", 685: "WS", 686: "KI", 687: "NC", 688: "TV", 689: "PF",
  691: "FM", 692: "MH", 850: "KP", 852: "HK", 853: "MO", 855: "KH", 856: "LA", 880: "BD", 886: "TW", 960: "MV", 961: "LB", 962: "JO", 963: "SY", 964: "IQ", 965: "KW", 966: "SA", 967: "YE", 968: "OM",
  970: "PS", 971: "AE", 972: "IL", 973: "BH", 974: "QA", 975: "BT", 976: "MN", 977: "NP", 992: "TJ", 993: "TM", 994: "AZ", 995: "GE", 996: "KG", 998: "UZ" };
const CA_AREAS = new Set("204 226 236 249 250 263 289 306 343 354 365 367 368 382 387 403 416 418 428 431 437 438 450 468 474 506 514 519 548 579 581 584 587 604 613 639 647 672 683 705 709 742 753 778 780 782 807 819 825 867 873 879 902 905".split(" "));
const NANP_ISLANDS = { 242: "BS", 246: "BB", 264: "AI", 268: "AG", 284: "VG", 340: "VI", 345: "KY", 441: "BM", 473: "GD", 649: "TC", 658: "JM", 876: "JM", 664: "MS", 670: "MP", 671: "GU", 684: "AS", 721: "SX", 758: "LC", 767: "DM", 784: "VC", 787: "PR", 939: "PR", 809: "DO", 829: "DO", 849: "DO", 868: "TT", 869: "KN" };
const TOLL_FREE = new Set(["800", "833", "844", "855", "866", "877", "888"]);

// Single-country currencies; USD and EUR say too little.
const CURRENCIES = { COP: "CO", MXN: "MX", ARS: "AR", CLP: "CL", PEN: "PE", BRL: "BR", UYU: "UY", PYG: "PY", BOB: "BO", GTQ: "GT", HNL: "HN", NIO: "NI", CRC: "CR", DOP: "DO", VES: "VE", GBP: "GB", CHF: "CH",
  SEK: "SE", NOK: "NO", DKK: "DK", PLN: "PL", CZK: "CZ", HUF: "HU", RON: "RO", BGN: "BG", TRY: "TR", RUB: "RU", UAH: "UA", INR: "IN", JPY: "JP", CNY: "CN", KRW: "KR", AUD: "AU", NZD: "NZ", CAD: "CA",
  ZAR: "ZA", ILS: "IL", AED: "AE", SAR: "SA", SGD: "SG", MYR: "MY", IDR: "ID", PHP: "PH", THB: "TH", VND: "VN", ISK: "IS", KZT: "KZ", EGP: "EG", NGN: "NG", KES: "KE", QAR: "QA", KWD: "KW", HKD: "HK", TWD: "TW" };
const SYMBOLS = [[/R\$\s?\d/, "BR", "R$"], [/£\s?\d/, "GB", "£"], [/₹\s?\d/, "IN", "₹"], [/\d\s?zł\b/, "PL", "zł"], [/\d\s?Kč\b/, "CZ", "Kč"], [/₺\s?\d|\d\s?₺/, "TR", "₺"], [/₩\s?\d/, "KR", "₩"],
  [/₦\s?\d/, "NG", "₦"], [/₱\s?\d/, "PH", "₱"], [/₪\s?\d|\d\s?₪/, "IL", "₪"], [/₴\s?\d|\d\s?₴/, "UA", "₴"], [/₽\s?\d|\d\s?₽/, "RU", "₽"], [/\bS\/\s?\d/, "PE", "S/"], [/\bCOP\s?\$?\s?\d|\d\s?COP\b/, "CO", "COP"],
  [/\bMXN\s?\$?\s?\d|\d\s?MXN\b/, "MX", "MXN"], [/\bCLP\s?\$?\s?\d|\d\s?CLP\b/, "CL", "CLP"], [/\bARS\s?\$?\s?\d|\d\s?ARS\b/, "AR", "ARS"], [/\bCHF\s?\d|\d\s?CHF\b/, "CH", "CHF"], [/\bA\$\s?\d/, "AU", "A$"],
  [/\bC\$\s?\d/, "CA", "C$"], [/\bkr\.?\s?\d|\d\s?kr\b/, "", "kr"]];

// [pattern, country, weight, label]: company, tax and VAT numbers a site prints in its footer or legal page.
const TAX_IDS = [
  [/\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/, "BR", 0.85, "CNPJ"],
  [/\bNIT\.?\s*:?\s*(?:No\.?\s*)?\d{3}\.?\d{3}\.?\d{3}\s*-\s*\d\b/i, "CO", 0.8, "NIT"],
  [/\bCUIT\b/i, "AR", 0.75, "CUIT"],
  [/\bRFC\s*:?\s*[A-ZÑ&]{3,4}-?\d{6}-?[A-Z0-9]{3}\b/, "MX", 0.8, "RFC"],
  [/\bR\.?U\.?T\.?\s*:?\s*\d{1,2}\.\d{3}\.\d{3}-[\dkK]\b/, "CL", 0.7, "RUT"],
  [/\bRUC\s*:?\s*(?:10|15|17|20)\d{9}\b/, "PE", 0.75, "RUC (Peru)"],
  [/\bRUC\s*:?\s*\d{10}001\b/, "EC", 0.75, "RUC (Ecuador)"],
  [/\b(?:CIF|NIF)\s*:?\s*[A-HJ-NP-SUVW]-?\d{7}[0-9A-J]\b/, "ES", 0.75, "CIF/NIF"],
  [/\b(?:NIPC|Contribuinte)\s*(?:n\.?º|nº)?\s*:?\s*(?:PT\s?)?[1-9]\d{8}\b/i, "PT", 0.7, "NIPC"],
  [/\b(?:SIRET|SIREN)\b|\bRCS\s+[A-Z][a-zé]+/, "FR", 0.75, "SIRET/RCS"],
  [/\bP(?:artita)?\.?\s?IVA\b/i, "IT", 0.75, "Partita IVA"],
  [/\bUSt-?Id(?:Nr)?\.?\s*:?\s*DE\s?\d{9}\b/i, "DE", 0.85, "USt-IdNr"],
  [/\b(?:Amtsgericht|Registergericht)\b[^.]{0,40}\bHR[AB]\s?\d+/, "DE", 0.8, "Handelsregister"],
  [/\bFN\s?\d{4,6}\s?[a-z]\b/, "AT", 0.6, "Firmenbuch"],
  [/\bCHE-?\d{3}\.\d{3}\.\d{3}\b/, "CH", 0.85, "UID CHE"],
  [/\b(?:KvK|Kamer van Koophandel)\b/i, "NL", 0.7, "KvK"],
  [/\b(?:KBO|BCE)\b|\bondernemingsnummer\b|\bnum[ée]ro d['’]entreprise\b/i, "BE", 0.65, "KBO/BCE"],
  [/\bRegistered in (?:England|Scotland|Wales|Northern Ireland)\b|\bCompanies House\b/i, "GB", 0.8, "registered in the UK"],
  [/\bRegistered in (?:the Republic of )?Ireland\b|\bCRO\s*(?:No\.?|number)?\s*:?\s*\d{5,6}\b/i, "IE", 0.8, "registered in Ireland"],
  [/\bABN\s*:?\s*\d{2}\s?\d{3}\s?\d{3}\s?\d{3}\b/, "AU", 0.85, "ABN"],
  [/\bNZBN\b/, "NZ", 0.85, "NZBN"],
  [/\bGSTIN?\s*:?\s*\d{2}[A-Z]{5}\d{4}[A-Z]\d[Z][A-Z\d]\b/, "IN", 0.85, "GSTIN"],
  [/\bCVR\s*(?:-?nr\.?)?\s*:?\s*\d{8}\b/i, "DK", 0.75, "CVR"],
  [/\b(?:Org\.?\s?nr|Organisationsnummer)\s*:?\s*5\d{5}-?\d{4}\b/i, "SE", 0.7, "Org.nr (Sweden)"],
  [/\bReg(?:istration)?\.? No\.?\s*:?\s*\d{4}\/\d{6}\/\d{2}\b/, "ZA", 0.8, "CIPC number"],
  [/\b(?:VAT|BTW|TVA|IVA|MwSt|USt|MOMS|NIP|DIČ|ALV|ΑΦΜ)[^A-Za-z0-9]{0,24}(AT|BE|BG|CY|CZ|DE|DK|EE|EL|ES|FI|FR|HR|HU|IE|IT|LT|LU|LV|MT|NL|PL|PT|RO|SE|SI|SK|GB|CHE)[\s-]?(?:U?\d[0-9A-Z]{7,11})\b/, "*", 0.8, "VAT number"]
];

// Languages spoken in one country, and the countries a shared language corroborates.
const LANG_ONE = { pl: "PL", cs: "CZ", sk: "SK", sl: "SI", hr: "HR", sr: "RS", bs: "BA", mk: "MK", sq: "AL", bg: "BG", hu: "HU", el: "GR", tr: "TR", uk: "UA", be: "BY", lt: "LT", lv: "LV", et: "EE",
  fi: "FI", da: "DK", no: "NO", nb: "NO", nn: "NO", is: "IS", fo: "FO", mt: "MT", he: "IL", iw: "IL", ja: "JP", ko: "KR", th: "TH", vi: "VN", id: "ID", ms: "MY", ka: "GE", hy: "AM", az: "AZ", kk: "KZ",
  uz: "UZ", mn: "MN", km: "KH", lo: "LA", my: "MM", si: "LK", ne: "NP", bn: "BD", ur: "PK", fa: "IR", ps: "AF", am: "ET", lb: "LU", ga: "IE", eu: "ES", ca: "ES", gl: "ES", ro: "RO", sv: "SE" };
const LANG_MANY = {
  es: "ES MX CO AR CL PE EC VE UY PY BO CR PA DO GT HN SV NI PR CU GQ", pt: "BR PT AO MZ CV GW ST TL", fr: "FR BE CH CA LU MC SN CI CM ML BF NE TG BJ GA CG CD MG HT RE GP MQ NC PF MA DZ TN",
  de: "DE AT CH LU LI BE", it: "IT CH SM VA", nl: "NL BE SR CW AW", en: "US GB IE CA AU NZ ZA IN SG NG KE GH MT PH JM TT PK MY HK BB BS BZ GY UG ZW ZM BW NA RW TZ",
  ar: "SA AE EG MA DZ TN JO LB IQ KW QA BH OM YE SY LY SD PS", ru: "RU BY KZ KG", zh: "CN TW HK SG MO", ro: "RO MD", sv: "SE FI", el: "GR CY", tr: "TR CY", sw: "KE TZ UG", ca: "ES AD"
};
// CMS defaults that many sites never change, so they weigh little.
const DEFAULT_LOCALES = { "en-US": 0.15, "es-ES": 0.2, "en-GB": 0.3, "fr-FR": 0.3, "de-DE": 0.3, "it-IT": 0.3, "nl-NL": 0.35 };

const CDN_ORG = /cloudflare|akamai|fastly|amazon|aws|google|microsoft|azure|incapsula|imperva|sucuri|stackpath|edgecast|edgio|limelight|cdn77|bunny|vercel|netlify|automattic|wp ?engine|shopify|squarespace|wix|github|kinsta|pantheon|acquia|section\.io|myra|gcore|g-core|ovh|hetzner|digitalocean|linode|akamai|leaseweb|hostinger/i;
const PROXY_ORG = /withheld for privacy|privacy service|domains by proxy|contact privacy|whoisguard|privacyguardian|super privacy|perfect privacy|privacy protect|domain protection|whois privacy|proxy|private by design|identity protect|data protected|redacted for privacy service|dnstination|markmonitor|csc corporate|safenames|com laude|brandsight|gandi/i;
const CONTACT_LINK = /impressum|imprint|aviso[-_ ]legal|legal[-_ ]notice|mentions[-_ ]l[ée]gales|note[-_ ]legali|colof[oó]n|contact|contacto|contato|kontakt|contatti|about|acerca|quienes[-_ ]somos|sobre[-_ ]nos|qui[-_ ]sommes|chi[-_ ]siamo|uber[-_ ]uns|über[-_ ]uns|legal/i;
const LINK_ORDER = [/impressum|imprint/i, /aviso|legal|mentions|note[-_ ]legali|colof/i, /contact|kontakt|contat/i, /./];

const NAME_SKIP = new Set(["georgia", "jordan", "chad", "jersey", "turkey", "guinea", "dominica", "niger", "reunion", "congo", "mali", "togo"]);
const NAME_ALIASES = { usa: "US", "u.s.a.": "US", "united states of america": "US", "estados unidos de america": "US", uk: "GB", "u.k.": "GB", england: "GB", scotland: "GB", wales: "GB", "great britain": "GB",
  "northern ireland": "GB", "republic of ireland": "IE", holland: "NL", "czech republic": "CZ", "hong kong": "HK", macau: "MO", macao: "MO", "ivory coast": "CI", turkiye: "TR", "bosnia and herzegovina": "BA",
  "trinidad and tobago": "TT", "south korea": "KR", "republic of korea": "KR", "the netherlands": "NL", "uae": "AE", "united arab emirates": "AE", "puerto rico": "PR", "mexico city": "MX", "ciudad de mexico": "MX",
  "republica dominicana": "DO" };

const bare = (host) => String(host || "").toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
const fold = (text) => String(text || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const cut = (text, max) => String(text == null ? "" : text).replace(/\s+/g, " ").trim().slice(0, max);
const round = (n) => Math.round(n * 100) / 100;

let nameIndex = null;
function names() {
  if (nameIndex) return nameIndex;
  const map = new Map();
  for (const lang of ["en", "es", "pt", "fr", "de", "it", "nl"]) {
    const dn = new Intl.DisplayNames([lang], { type: "region" });
    for (const code of Object.keys(REGIONS)) {
      const name = fold(dn.of(code));
      if (name && name.length > 3 && !NAME_SKIP.has(name) && !/[&-]/.test(name) && !map.has(name)) map.set(name, code);
    }
  }
  Object.entries(NAME_ALIASES).forEach(([name, code]) => map.set(name, code));
  const list = [...map.keys()].sort((a, b) => b.length - a.length).map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  nameIndex = { map, re: new RegExp("(?<![a-z])(?<!new |south |nova |nueva |nuevo |west |british )(" + list.join("|") + ")(?![a-z])", "g") };
  return nameIndex;
}

// A country name the text gives as part of an address: after a comma or dash, or near a postcode.
function countryNames(text, anywhere) {
  const { map, re } = names();
  const folded = fold(text);
  const out = [];
  let m;
  re.lastIndex = 0;
  while ((m = re.exec(folded))) {
    const before = folded.slice(Math.max(0, m.index - 30), m.index);
    if (anywhere || /[,\-–|·•(]\s*$/.test(before) || /\d{4,}(?:\s+[^\d\s,.]{2,20}){0,2}[\s,]*$/.test(before)) out.push(map.get(m[1]));
  }
  return out;
}

function nameToCode(value) {
  const text = String(value || "").trim();
  if (/^[A-Za-z]{2}$/.test(text)) {
    const code = TLD_ALIAS[text.toLowerCase()] || text.toUpperCase();
    return REGIONS[code] ? code : "";
  }
  if (/^[A-Za-z]{3}$/.test(text) && /^(usa|gbr|deu|esp|fra|ita|col|mex|bra|arg|chl|per|can|aus|irl|bel|nld|prt|che|aut)$/i.test(text)) {
    return { usa: "US", gbr: "GB", deu: "DE", esp: "ES", fra: "FR", ita: "IT", col: "CO", mex: "MX", bra: "BR", arg: "AR", chl: "CL", per: "PE", can: "CA", aus: "AU", irl: "IE", bel: "BE", nld: "NL", prt: "PT", che: "CH", aut: "AT" }[text.toLowerCase()];
  }
  const { map } = names();
  return map.get(fold(text)) || NAME_ALIASES[fold(text)] || "";
}

// The country a phone number in international form belongs to, and whether it is a toll-free number.
function phoneCountry(raw) {
  const text = String(raw || "").trim();
  if (!/^\+|^00[1-9]/.test(text.replace(/^tel:/i, "").trim())) return null;
  const digits = text.replace(/^tel:/i, "").trim().replace(/^00/, "").replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) return null;
  if (digits[0] === "1") {
    const area = digits.slice(1, 4);
    if (TOLL_FREE.has(area)) return { country: "US", tollFree: true };
    return { country: NANP_ISLANDS[area] || (CA_AREAS.has(area) ? "CA" : "US") };
  }
  if (digits[0] === "7") return { country: /^7[67]/.test(digits) ? "KZ" : "RU" };
  for (const len of [3, 2]) if (CALLING[digits.slice(0, len)]) return { country: CALLING[digits.slice(0, len)] };
  return null;
}

// What the address alone says.
function tldSignals(host) {
  const labels = bare(host).split(".");
  const tld = labels[labels.length - 1];
  const sld = labels.length >= 3 ? labels[labels.length - 2] : "";
  const out = [];
  if (US_TLDS[tld]) return [{ kind: "tld", country: "US", w: US_TLDS[tld], label: "." + tld + " is a US-only ending" }];
  if (GEO_TLDS[tld]) return [{ kind: "tld", country: GEO_TLDS[tld], w: 0.75, label: "." + tld + " is a city or region ending" }];
  const code = TLD_ALIAS[tld] || tld.toUpperCase();
  const sub = labels.length >= 3 ? labels[0] : "";
  if (SUB_COUNTRY.has(sub) && !REGIONS[code]) out.push({ kind: "subdomain", country: sub.toUpperCase(), w: 0.55, label: sub + "." + labels.slice(1).join(".") + " is the " + sub.toUpperCase() + " version of the site" });
  if (tld.length !== 2 || !REGIONS[code]) return out;
  if (sld && OFFICIAL_SLD.test(sld)) out.push({ kind: "tld", country: code, w: 0.97, label: "." + sld + "." + tld + " is an official " + code + " ending" });
  else if (sld && PLAIN_SLD.test(sld)) out.push({ kind: "tld", country: code, w: 0.92, label: "." + sld + "." + tld + " is a " + code + " second-level ending" });
  else if (GENERIC_CC.has(tld)) out.push({ kind: "tld", country: code, w: 0.1, label: "." + tld + " is often used as a generic ending" });
  else out.push({ kind: "tld", country: code, w: 0.8, label: "." + tld + " is the " + code + " country ending" });
  return out;
}

// The country the address names for sure, or "": the daily job places new cards with it.
function tldCountry(host) {
  const hit = tldSignals(host).find((s) => s.w >= 0.8);
  return hit ? hit.country : "";
}

function attr(tag, name) {
  const m = tag.match(new RegExp("\\s" + name + "\\s*=\\s*(?:\"([^\"]*)\"|'([^']*)'|([^\\s>]+))", "i"));
  return m ? (m[1] || m[2] || m[3] || "").trim() : "";
}

function textOf(html) {
  return String(html || "")
    .replace(/<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>|<noscript\b[\s\S]*?<\/noscript>|<svg\b[\s\S]*?<\/svg>/gi, " ")
    .replace(/<br\s*\/?>|<\/(p|div|li|td|h\d|address|span)>/gi, ", ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ").replace(/&amp;/g, "&").replace(/&#x27;|&#39;|&rsquo;/g, "'").replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (all, n) => { try { return String.fromCodePoint(Number(n)); } catch (error) { return " "; } })
    .replace(/\s+/g, " ").trim();
}

function walk(node, visit) {
  if (Array.isArray(node)) node.forEach((n) => walk(n, visit));
  else if (node && typeof node === "object") { visit(node); Object.values(node).forEach((v) => walk(v, visit)); }
}

// The facts one page gives, before any weighing; cached as is.
function pageFacts(html, url, full) {
  const src = String(html || "");
  const head = (src.match(/<html\b[^>]*>/i) || [""])[0];
  const metas = src.match(/<meta\b[^>]*>/gi) || [];
  const meta = (key) => { const tag = metas.find((t) => new RegExp("(?:property|name)\\s*=\\s*[\"']?" + key + "[\"'\\s>]", "i").test(t)); return tag ? attr(tag, "content") : ""; };
  const links = src.match(/<link\b[^>]*>/gi) || [];
  const anchors = [...src.matchAll(/<a\b([^>]*)>([\s\S]{0,300}?)<\/a>/gi)].map((m) => ({ href: attr(m[1], "href"), text: textOf(m[2]).slice(0, 60) }));
  const facts = {
    url,
    title: cut(textOf((src.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || ["", ""])[1]), 120),
    siteName: cut(meta("og:site_name"), 80),
    description: cut(meta("description") || meta("og:description"), 200),
    lang: attr(head, "lang").replace("_", "-"),
    ogLocale: meta("og:locale").replace("_", "-"),
    hreflang: [...new Set(links.filter((t) => /hreflang/i.test(t) && /alternate/i.test(t)).map((t) => attr(t, "hreflang")).filter(Boolean))].slice(0, 80),
    addressCountries: [], phones: [], currencies: [], taxIds: [], textCountries: [], mapsCountries: [], socials: [], links: [], imprint: false
  };
  for (const m of src.matchAll(/<script\b[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    let data;
    try { data = JSON.parse(m[1].trim()); } catch (error) { continue; }
    walk(data, (node) => {
      const c = node.addressCountry;
      const code = nameToCode(c && typeof c === "object" ? c.name || c["@id"] || "" : c);
      if (code) facts.addressCountries.push(code);
      if (typeof node.telephone === "string") facts.phones.push(node.telephone);
      if (typeof node.priceCurrency === "string" && CURRENCIES[node.priceCurrency.toUpperCase()]) facts.currencies.push(node.priceCurrency.toUpperCase());
    });
  }
  anchors.forEach((a) => { if (/^tel:/i.test(a.href)) facts.phones.push(decodeURIComponent(a.href.slice(4)).replace(/%20/g, " ")); });
  const footerHtml = (src.match(/<footer\b[\s\S]*<\/footer>/i) || [""])[0];
  const text = textOf(src);
  const zone = full ? text : footerHtml ? textOf(footerHtml) : text.slice(-4000);
  for (const m of zone.matchAll(/(?:^|[^\w+])(\+\s?\(?\d{1,3}\)?[\s.-]?\(?\d{1,4}\)?[\s.-]?\d{2,4}[\s.-]?\d{2,4}(?:[\s.-]?\d{1,4})?)/g)) facts.phones.push(m[1]);
  facts.phones = [...new Set(facts.phones.map((p) => cut(p, 30)))].slice(0, 12);
  for (const [re, country, w, label] of TAX_IDS) {
    const m = zone.match(re);
    if (!m) continue;
    const code = country === "*" ? nameToCode(m[1] === "CHE" ? "CH" : m[1]) : country;
    if (code) facts.taxIds.push({ country: code, w, label });
  }
  facts.textCountries = countryNames(zone).slice(0, 12);
  for (const [re, country, label] of SYMBOLS) if (country && re.test(text)) facts.currencies.push(label);
  facts.currencies = [...new Set(facts.currencies)];
  const urls = [...src.matchAll(/(?:src|href)\s*=\s*["']([^"']*(?:google\.[a-z.]+\/maps|maps\.google\.|goo\.gl\/maps|maps\.app\.goo\.gl)[^"']*)["']/gi)].map((m) => m[1]);
  urls.forEach((u) => { let d = u; try { d = decodeURIComponent(u.replace(/\+/g, " ")); } catch (error) { /* keep raw */ } facts.mapsCountries.push(...countryNames(d.replace(/!\d[a-z]/g, ", "), true)); });
  facts.mapsCountries = [...new Set(facts.mapsCountries)];
  facts.socials = [...new Set(anchors.map((a) => a.href).filter((h) => /^https?:\/\/(?:[a-z]+\.)?(?:linkedin\.com\/company|facebook\.com|instagram\.com|twitter\.com|x\.com)\/[^/?#]+/i.test(h)).map((h) => h.split(/[?#]/)[0]))].slice(0, 6);
  facts.imprint = anchors.some((a) => /impressum/i.test(a.href + " " + a.text));
  let origin = "";
  try { origin = new URL(url).hostname; } catch (error) { origin = ""; }
  const seen = new Set();
  anchors.forEach((a) => {
    if (!CONTACT_LINK.test(a.href + " " + a.text) || /^(mailto|tel|javascript):|^#/i.test(a.href)) return;
    let abs;
    try { abs = new URL(a.href, url); } catch (error) { return; }
    if (!/^https?:$/.test(abs.protocol) || registrable(abs.hostname) !== registrable(origin)) return;
    const key = abs.origin + abs.pathname;
    if (key === url || seen.has(key)) return;
    seen.add(key);
    facts.links.push(key);
  });
  facts.links.sort((a, b) => LINK_ORDER.findIndex((re) => re.test(a)) - LINK_ORDER.findIndex((re) => re.test(b)));
  facts.links = facts.links.slice(0, 3);
  return facts;
}

function localeRegion(tag) {
  const m = String(tag || "").match(/^([a-z]{2,3})[-_]([a-z]{2})$/i);
  return m ? { lang: m[1].toLowerCase(), region: m[2].toUpperCase(), tag: m[1].toLowerCase() + "-" + m[2].toUpperCase() } : null;
}

// Weighed signals from one page's facts. `where` names the page in the evidence.
function pageSignals(facts, where) {
  const out = [];
  if (!facts) return out;
  const add = (kind, country, w, label) => { if (REGIONS[country]) out.push({ kind, country, w, label: label + (where ? " (" + where + ")" : "") }); };
  const addr = [...new Set(facts.addressCountries || [])];
  addr.forEach((c) => add("address", c, addr.length > 2 ? 0.3 : 0.85, "schema.org addressCountry " + c));
  (facts.mapsCountries || []).forEach((c) => add("maps", c, 0.5, "Google Maps link in " + c));
  (facts.taxIds || []).forEach((t) => add("taxid", t.country, t.w, t.label + " printed"));
  const phones = new Map();
  (facts.phones || []).forEach((p) => { const hit = phoneCountry(p); if (hit && !phones.has(hit.country)) phones.set(hit.country, { p, tollFree: hit.tollFree }); });
  phones.forEach((v, c) => add("phone", c, phones.size > 2 ? 0.25 : v.tollFree ? 0.3 : 0.55, "phone " + cut(v.p, 20)));
  const locales = [facts.lang, facts.ogLocale].map(localeRegion).filter(Boolean);
  locales.forEach((l) => add("locale", l.region, DEFAULT_LOCALES[l.tag] || 0.4, "locale " + l.tag));
  const regions = [...new Set((facts.hreflang || []).map(localeRegion).filter(Boolean).map((l) => l.region))].filter((r) => REGIONS[r]);
  if (regions.length === 1) add("locale", regions[0], 0.35, "hreflang only for " + regions[0]);
  else if (regions.length <= 3) regions.forEach((r) => add("locale", r, 0.15, "hreflang " + r));
  (facts.currencies || []).forEach((c) => add("currency", CURRENCIES[c] || (SYMBOLS.find((s) => s[2] === c) || [])[1], 0.3, "prices in " + c));
  const names = new Map();
  (facts.textCountries || []).forEach((c) => names.set(c, (names.get(c) || 0) + 1));
  names.forEach((n, c) => add("text", c, names.size > 3 ? 0.15 : 0.45, "address names " + c));
  const base = String(facts.lang || "").toLowerCase().split("-")[0];
  if (LANG_ONE[base]) add("language", LANG_ONE[base], 0.35, "written in " + base);
  if (facts.imprint) add("text", "DE", 0.15, "has an Impressum");
  return out;
}

// The country a homepage sent this visitor to (/co/, /es-co/, co.brand.com): the site picks a version by
// where the visitor is, so what that page says is about the visitor, not the site.
function geoRedirect(host, home) {
  if (!home || !home.finalUrl) return "";
  let url;
  try { url = new URL(home.finalUrl); } catch (error) { return ""; }
  const parts = (url.pathname.split("/")[1] || "").toLowerCase().split(/[-_]/);
  const isLang = (p) => !!(LANG_ONE[p] || LANG_MANY[p]);
  if (parts.every((p) => /^[a-z]{2}$/.test(p))) {
    const [a, b] = parts.map((p) => p.toUpperCase());
    if (parts.length === 1 && !isLang(parts[0]) && REGIONS[a]) return a;
    if (parts.length === 2 && isLang(parts[0]) && REGIONS[b]) return b;
    if (parts.length === 2 && isLang(parts[1]) && REGIONS[a]) return a;
  }
  const from = bare(host);
  const to = bare(url.hostname);
  if (to !== from && registrable(to) === registrable(from)) {
    const sub = to.slice(0, to.length - from.length).replace(/\.$/, "");
    if (SUB_COUNTRY.has(sub)) return sub.toUpperCase();
  }
  return "";
}

// Every weighed signal for a host from its cached facts.
function signalsOf(host, facts) {
  const f = facts || {};
  const out = tldSignals(host);
  const markets = f.markets || [];
  markets.forEach((c) => { if (REGIONS[c]) out.push({ kind: "market", country: c, w: markets.length > 1 ? 0.2 : 0.4, label: "in the CrUX top sites of " + c + " only" + (markets.length > 1 ? " (and " + (markets.length - 1) + " more)" : "") }); });
  if (!geoRedirect(host, f.home)) out.push(...pageSignals(f.home, ""), ...pageSignals(f.extra, "legal/contact page"));
  // A registrant with no name in LT is Hostinger's placeholder, not the owner.
  const rdapOk = f.rdap && f.rdap.country && REGIONS[f.rdap.country] && !PROXY_ORG.test(f.rdap.org || "") && !(f.rdap.country === "LT" && !f.rdap.org);
  if (rdapOk) out.push({ kind: "rdap", country: f.rdap.country, w: 0.45, label: "RDAP registrant in " + f.rdap.country });
  if (f.ip && f.ip.country && REGIONS[f.ip.country] && !CDN_ORG.test(f.ip.org || "")) out.push({ kind: "hosting", country: f.ip.country, w: 0.1, label: "hosted in " + f.ip.country + " (" + cut(f.ip.org, 30) + ")" });
  if (f.places && f.places.country && REGIONS[f.places.country]) out.push({ kind: "places", country: f.places.country, w: 0.5, label: "Google Business Profile linking the site (" + f.places.placeId + ")" });
  return out;
}

// Support per country (independent kinds combine, a kind counts once), the leader, and how sure it is.
function score(host, facts) {
  const signals = signalsOf(host, facts);
  const best = {};
  signals.forEach((s) => { const key = s.country + "|" + s.kind; if (!best[key] || best[key].w < s.w) best[key] = s; });
  const support = {};
  Object.values(best).forEach((s) => { support[s.country] = 1 - (1 - (support[s.country] || 0)) * (1 - s.w); });
  const base = String(((facts || {}).home || {}).lang || "").toLowerCase().split("-")[0];
  const shared = (LANG_MANY[base] || "").split(" ");
  Object.keys(support).forEach((c) => {
    if (shared.includes(c) && LANG_ONE[base] !== c && support[c] >= 0.3) {
      support[c] = 1 - (1 - support[c]) * 0.75;
      signals.push({ kind: "language", country: c, w: 0.25, label: "written in " + base + ", spoken in " + c });
    }
  });
  const ranked = Object.entries(support).sort((a, b) => b[1] - a[1]);
  const [top, second] = [ranked[0] || ["", 0], ranked[1] || ["", 0]];
  const f = facts || {};
  const regions = new Set([].concat(((f.home || {}).hreflang || [])).map(localeRegion).filter(Boolean).map((l) => l.region));
  const phoneCountries = new Set([].concat((f.home || {}).phones || [], (f.extra || {}).phones || []).map(phoneCountry).filter(Boolean).map((p) => p.country));
  const addressCountries = new Set([].concat((f.home || {}).addressCountries || [], (f.extra || {}).addressCountries || []));
  const redirected = geoRedirect(host, f.home);
  if (redirected) signals.push({ kind: "redirect", country: "", w: 0, label: "the homepage sends a visitor from Colombia to its " + redirected + " version" });
  const worldwide = !!redirected || regions.size >= 4 || phoneCountries.size >= 3 || addressCountries.size >= 3;
  let confidence = top[1] * (1 - 0.6 * Math.max(0, second[1] - 0.15));
  if (worldwide) confidence *= 0.7;
  return {
    country: top[0], confidence: round(confidence), second: second[0], secondSupport: round(second[1]), support: Object.fromEntries(ranked.map(([c, v]) => [c, round(v)])),
    worldwide, signals: signals.sort((a, b) => b.w - a.w)
  };
}

// The final call for a host from its score and, when asked, Gemini's answer.
function decide(s, g) {
  const evidence = (country) => s.signals.filter((x) => !country || x.country === country).slice(0, 5).map((x) => x.label);
  if (!g || !g.scope || g.scope === "unknown" || (g.scope === "country" && !REGIONS[g.country])) {
    return { country: s.country, scope: s.country ? "country" : "unknown", confidence: s.country ? s.confidence : 0, decidedBy: "signals", evidence: evidence(s.country) };
  }
  const gc = Math.max(0, Math.min(1, Number(g.confidence) || 0));
  const note = "Gemini: " + cut(g.reason, 120);
  if (g.scope === "worldwide") {
    return { country: "", scope: "worldwide", confidence: round(gc * (s.worldwide ? 1 : 0.9)), decidedBy: "gemini", evidence: [note].concat(evidence()).slice(0, 5) };
  }
  const support = s.support[g.country] || 0;
  const confidence = g.country === s.country ? 1 - (1 - s.confidence) * (1 - 0.6 * gc) : gc * (0.6 + 0.4 * support);
  return { country: g.country, scope: "country", confidence: round(confidence), decidedBy: "gemini", evidence: [note].concat(evidence(g.country)).slice(0, 5) };
}

// ---- Network: fetching facts, RDAP, hosting, Places, Gemini ----

async function getText(url) {
  const res = await fetch(url, { headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5", "accept-language": "en;q=0.8,*;q=0.5" }, redirect: "follow", signal: AbortSignal.timeout(TIMEOUT_MS) });
  const type = res.headers.get("content-type") || "";
  if (!/html|xml|text\/plain/i.test(type) && type) return { status: res.status, url: res.url, html: "" };
  const reader = res.body && res.body.getReader ? res.body.getReader() : null;
  if (!reader) return { status: res.status, url: res.url, html: await res.text() };
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.length;
    if (size > MAX_HTML) { reader.cancel().catch(() => {}); break; }
  }
  return { status: res.status, url: res.url, html: Buffer.concat(chunks.map((c) => Buffer.from(c))).toString("utf8") };
}

async function pageOf(url, full) {
  try {
    const res = await getText(url);
    if (!res.html) return { url, status: res.status, error: "no html" };
    return Object.assign(pageFacts(res.html, res.url || url, full), { status: res.status, finalUrl: res.url });
  } catch (error) {
    return { url, error: cut(error.cause ? error.cause.code || error.cause.message : error.message, 80) };
  }
}

async function gatherPages(host) {
  let home = await pageOf("https://" + host + "/", false);
  if (home.error && !/^www\./.test(host)) {
    const alt = await pageOf("https://www." + host + "/", false);
    if (!alt.error) home = alt;
  }
  let extra = null;
  for (const link of (home.links || []).slice(0, 2)) {
    extra = await pageOf(link, true);
    if (!extra.error && (extra.addressCountries.length || extra.taxIds.length || extra.phones.length || extra.textCountries.length)) break;
  }
  return { home, extra };
}

let rdapMap = null;
async function rdapJson(url) {
  const res = await fetch(url, { headers: { accept: "application/rdap+json, application/json", "user-agent": UA }, redirect: "follow", signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error("status " + res.status);
  return res.json();
}

function registrantOf(data) {
  let found = null;
  walk(data.entities || [], (node) => {
    if (found || !Array.isArray(node.roles) || !node.roles.includes("registrant") || !Array.isArray(node.vcardArray)) return;
    const card = node.vcardArray[1] || [];
    const org = card.filter((r) => r[0] === "org" || r[0] === "fn").map((r) => String(r[3] || "")).join(" ");
    const adr = card.find((r) => r[0] === "adr");
    if (!adr) return;
    const value = Array.isArray(adr[3]) ? adr[3] : [];
    const country = nameToCode((adr[1] || {}).cc || value[6] || "");
    if (country) found = { country, org: cut(org, 60) };
  });
  return found;
}

async function rdapOf(host) {
  const domain = registrable(host);
  const tld = domain.split(".").pop();
  if (!rdapMap) {
    rdapMap = rdapJson("https://data.iana.org/rdap/dns.json").then((boot) => {
      const map = {};
      (boot.services || []).forEach(([tlds, urls]) => tlds.forEach((t) => { map[t] = urls.find((u) => /^https:/.test(u)) || urls[0]; }));
      return map;
    });
  }
  const base = (await rdapMap)[tld];
  if (!base) return { error: "no RDAP for ." + tld };
  try {
    const data = await rdapJson(base.replace(/\/?$/, "/") + "domain/" + domain);
    let hit = registrantOf(data);
    if (!hit) {
      const related = (data.links || []).find((l) => l.rel === "related" && /rdap/i.test(l.type || l.href || ""));
      if (related) hit = registrantOf(await rdapJson(related.href).catch(() => ({})));
    }
    if (!hit) return { error: "no registrant country" };
    if (PROXY_ORG.test(hit.org)) return { error: "privacy service " + hit.org };
    return hit;
  } catch (error) {
    return { error: cut(error.message, 60) };
  }
}

async function ipOf(hosts) {
  const ips = {};
  await pool(hosts, CONCURRENCY, async (host) => { try { ips[host] = (await dns.resolve4(host))[0]; } catch (error) { ips[host] = ""; } });
  const out = {};
  const list = [...new Set(Object.values(ips).filter(Boolean))];
  const byIp = {};
  for (let i = 0; i < list.length; i += 100) {
    try {
      const res = await fetch("http://ip-api.com/batch?fields=query,countryCode,org,as", { method: "POST", body: JSON.stringify(list.slice(i, i + 100)), signal: AbortSignal.timeout(TIMEOUT_MS) });
      (await res.json()).forEach((r) => { byIp[r.query] = { country: r.countryCode || "", org: cut((r.org || "") + " " + (r.as || ""), 80) }; });
    } catch (error) { console.warn("ip-api:", error.message); }
    await new Promise((r) => setTimeout(r, 4500));
  }
  hosts.forEach((host) => { out[host] = ips[host] ? Object.assign({ ip: ips[host] }, byIp[ips[host]] || {}) : { error: "no A record" }; });
  return out;
}

async function placesOf(host, facts, key) {
  const home = facts.home || {};
  const name = home.siteName || String(home.title || "").split(/\s[|–—-]\s/)[0] || host;
  try {
    const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": "places.id,places.websiteUri,places.addressComponents" },
      body: JSON.stringify({ textQuery: cut(name + " " + host, 120), pageSize: 5 }),
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
    if (!res.ok) return { error: "status " + res.status };
    const places = ((await res.json()).places || []);
    const match = local.pick(places, host, []);
    if (!match) return { error: "no profile links the site" };
    const part = (match.place.addressComponents || []).find((c) => (c.types || []).includes("country"));
    return { placeId: match.place.id, country: part ? String(part.shortText || "").toUpperCase() : "" };
  } catch (error) {
    return { error: cut(error.message, 60) };
  }
}

function geminiPrompt(rows) {
  return [
    "For each website below, decide its country of origin: where the organization behind the site is based (head office or legal seat), or the one country the site is built for.",
    "Use scope \"worldwide\" only for a multinational brand, platform or international organization whose site serves many countries with no single national focus.",
    "A national version of a global brand (amazon.de, ikea.es) belongs to that country. Use scope \"unknown\" when the evidence and what you know are not enough.",
    "Weigh the evidence: a ccTLD, a registered address, a tax number or a local phone number outweigh a language, a currency or the hosting place.",
    "Answer only a JSON array: [{\"host\":\"...\",\"scope\":\"country|worldwide|unknown\",\"country\":\"ISO 3166-1 alpha-2 or empty\",\"confidence\":0.0-1.0,\"reason\":\"at most 15 words\"}].",
    "",
    JSON.stringify(rows)
  ].join("\n");
}

async function askGemini(rows, key) {
  const res = await fetch(GEMINI_API + GEMINI_MODEL + ":generateContent", {
    method: "POST",
    headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: geminiPrompt(rows) }] }], generationConfig: { temperature: 0.1, maxOutputTokens: 8000, responseMimeType: "application/json" } }),
    signal: AbortSignal.timeout(120000)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error("Gemini " + res.status + ": " + cut((data.error || {}).message || "no answer", 160));
  const text = ((((data.candidates || [])[0] || {}).content || {}).parts || []).map((p) => p.text || "").join("");
  let list;
  try { list = JSON.parse(text.replace(/^```(?:json)?|```$/g, "").trim()); } catch (error) {
    // One answer with a stray quote should not lose the batch: keep every object that parses.
    list = (text.match(/\{[^{}]*\}/g) || []).map((one) => { try { return JSON.parse(one); } catch (e) { return null; } }).filter(Boolean);
    if (!list.length) throw new Error(error.message + ": " + cut(text, 240));
  }
  return (Array.isArray(list) ? list : []).map((r) => ({ host: bare(r.host), scope: String(r.scope || "unknown"), country: String(r.country || "").toUpperCase(), confidence: Number(r.confidence) || 0, reason: cut(r.reason, 140) }));
}

function geminiRow(host, facts, s) {
  const home = facts.home || {};
  return { host, title: home.title || "", site: home.siteName || "", about: cut(home.description, 160), lang: home.lang || "", socials: (home.socials || []).slice(0, 3),
    evidence: s.signals.slice(0, 8).map((x) => x.label + " [" + x.w + "]"), fetched: home.error ? "homepage failed: " + home.error : "ok" };
}

async function pool(list, size, fn) {
  let at = 0;
  await Promise.all(Array.from({ length: Math.min(size, list.length) }, async () => {
    while (at < list.length) { const i = at++; await fn(list[i], i); }
  }));
}

function secret(name) {
  if (process.env[name]) return process.env[name];
  try { return execSync("gcloud secrets versions access latest --secret=" + name + " --project " + PROJECT, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch (error) { return ""; }
}

// ---- Firestore queue (REST with the gcloud token) ----

function toValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toValue) } };
  if (typeof v === "number") return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "object") return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toValue(x)])) } };
  return { stringValue: String(v) };
}

function fromValue(v) {
  if (!v) return null;
  if ("mapValue" in v) return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, fromValue(x)]));
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(fromValue);
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("nullValue" in v) return null;
  return v.stringValue !== undefined ? v.stringValue : v.timestampValue;
}

async function firestore(method, fields, mask) {
  const token = execSync("gcloud auth print-access-token", { encoding: "utf8" }).trim();
  const url = "https://firestore.googleapis.com/v1/projects/" + PROJECT + "/databases/(default)/documents/" + QUEUE_DOC + (mask ? "?" + mask.map((m) => "updateMask.fieldPaths=" + m).join("&") : "");
  const res = await fetch(url, { method, headers: { authorization: "Bearer " + token, "x-goog-user-project": PROJECT, "content-type": "application/json" }, body: fields ? JSON.stringify({ fields }) : undefined });
  if (res.status === 404 && method === "GET") return {};
  if (!res.ok) throw new Error("Firestore " + res.status + ": " + cut(await res.text(), 200));
  const doc = await res.json();
  return Object.fromEntries(Object.entries(doc.fields || {}).map(([k, v]) => [k, fromValue(v)]));
}

// Carlos's answers from the Jarvis Map tab (#3009): from Firestore with --queue (gcloud), else with --decisions
// through reviewUrl/country-decisions and PUBLISH_KEY, as the daily job runs it.
async function choices(opts) {
  let doc = null;
  if (opts.queue) doc = await firestore("GET").catch((error) => { console.warn(error.message); return null; });
  else if (opts.decisions && !process.env.PUBLISH_KEY) console.warn("No PUBLISH_KEY: Carlos's country decisions were not read.");
  else if (opts.decisions) {
    doc = await fetch(DECISIONS_URL, { headers: { "x-publish-key": process.env.PUBLISH_KEY }, signal: AbortSignal.timeout(TIMEOUT_MS) })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("Country decisions: status " + res.status))))
      .catch((error) => { console.warn(error.message); return null; });
  }
  const decisions = (doc && doc.decisions) || {};
  if (Object.keys(decisions).length) console.log(Object.keys(decisions).length + " countries chosen by Carlos");
  return { decisions, skipped: (doc && doc.skipped) || {} };
}

// ---- Main ----

function args() {
  const out = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i].replace(/^--/, "");
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) out[key] = true;
    else { out[key] = next; i += 1; }
  }
  return out;
}

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch (error) { return fallback; }
}

function marketsByHost() {
  const out = {};
  for (const name of fs.readdirSync(SWEEP)) {
    if (name === "index.json" || !name.endsWith(".json")) continue;
    const list = readJson(path.join(SWEEP, name), {});
    (list.hosts || []).forEach((h) => { const key = bare(h); (out[key] = out[key] || []).push(String(list.cc || name.slice(0, 2)).toUpperCase()); });
  }
  return out;
}

async function main() {
  const opts = args();
  const index = readJson(INDEX, { reports: [] });
  const file = readJson(live.COUNTRIES_FILE, { hosts: {} });
  file.hosts = file.hosts || {};
  const today = new Date().toISOString().slice(0, 10);
  fs.mkdirSync(path.join(CACHE, "facts"), { recursive: true });

  const { decisions, skipped } = await choices(opts);
  Object.entries(decisions).forEach(([host, d]) => {
    if (!d || !(d.scope === "worldwide" || REGIONS[d.country])) { console.warn("Skipped Carlos's decision for " + host + ": " + JSON.stringify(d)); return; }
    file.hosts[bare(host)] = { country: d.scope === "worldwide" ? "" : d.country, scope: d.scope === "worldwide" ? "worldwide" : "country", confidence: 1, by: "carlos", evidence: ["Confirmed by Carlos in Jarvis"], at: String(d.at || today).slice(0, 10) };
  });

  const missing = (index.reports || []).filter((c) => !c.country);
  const reportsOf = {};
  missing.forEach((c) => { reportsOf[bare(c.host)] = (reportsOf[bare(c.host)] || 0) + 1; });
  missing.filter((c) => c.series !== "auto").forEach((c) => {
    const host = bare(c.host);
    if (!file.hosts[host]) file.hosts[host] = { country: "", scope: "worldwide", confidence: 1, by: "curated", evidence: ["Hand-checked card with no single country (" + c.name + ")"], at: today };
  });
  const since = opts.recent ? new Date(Date.now() - Number(opts.recent) * 864e5).toISOString().slice(0, 10) : "";
  let hosts = [...new Set(missing.filter((c) => c.series === "auto" && (!since || c.read >= since)).map((c) => bare(c.host)))];
  if (opts.hosts) hosts = String(opts.hosts).split(",").map(bare);
  else hosts = hosts.filter((h) => !file.hosts[h] || (opts.redo && file.hosts[h].by !== "carlos"));
  if (opts.limit) hosts = hosts.slice(0, Number(opts.limit));
  console.log(missing.length + " reports without a country, " + hosts.length + " hosts to place");

  const markets = marketsByHost();
  const factsOf = {};
  const cachePath = (h) => path.join(CACHE, "facts", h + ".json");
  let fetched = 0;
  await pool(hosts, CONCURRENCY, async (host) => {
    let facts = opts.refresh ? null : readJson(cachePath(host), null);
    if (!facts || !facts.home) {
      facts = Object.assign({ host, at: new Date().toISOString() }, await gatherPages(host));
      fetched += 1;
      if (fetched % 50 === 0) console.log("fetched " + fetched);
    }
    facts.markets = markets[host] || [];
    factsOf[host] = facts;
    fs.writeFileSync(cachePath(host), JSON.stringify(facts));
  });
  const save = (host) => fs.writeFileSync(cachePath(host), JSON.stringify(factsOf[host]));
  const unsure = () => hosts.filter((h) => score(h, factsOf[h]).confidence < AUTO);

  if (!opts["no-rdap"]) {
    const list = unsure().filter((h) => !factsOf[h].rdap);
    console.log("RDAP for " + list.length);
    await pool(list, 3, async (h) => { factsOf[h].rdap = await rdapOf(h); save(h); });
  }
  if (!opts["no-ip"]) {
    const list = unsure().filter((h) => !factsOf[h].ip);
    console.log("hosting for " + list.length);
    if (list.length) { const ips = await ipOf(list); list.forEach((h) => { factsOf[h].ip = ips[h]; save(h); }); }
  }
  if (opts.places) {
    const key = secret("PLACES_KEY");
    const list = unsure().filter((h) => !factsOf[h].places && !(factsOf[h].home || {}).error).slice(0, Number(opts.places) || 0);
    console.log("Places for " + list.length + (key ? "" : " skipped: no PLACES_KEY"));
    if (key) await pool(list, 3, async (h) => { factsOf[h].places = await placesOf(h, factsOf[h], key); save(h); });
  }

  const scores = Object.fromEntries(hosts.map((h) => [h, score(h, factsOf[h])]));
  const geminiFile = path.join(CACHE, "gemini.json");
  const geminiCache = readJson(geminiFile, {});
  const ask = hosts.filter((h) => scores[h].confidence < AUTO || scores[h].worldwide);
  const key = opts["no-gemini"] ? "" : secret("GEMINI_API_KEY");
  if (!opts["no-gemini"] && !key) console.warn("No GEMINI_API_KEY: unsure hosts stay in the queue without a Gemini call.");
  if (key) {
    const todo = ask.filter((h) => opts["refresh-gemini"] || !geminiCache[h]);
    console.log("Gemini for " + todo.length);
    const batches = [];
    for (let i = 0; i < todo.length; i += GEMINI_BATCH) batches.push(todo.slice(i, i + GEMINI_BATCH));
    await pool(batches, 3, async (batch) => {
      try {
        const answers = await askGemini(batch.map((h) => geminiRow(h, factsOf[h], scores[h])), key);
        answers.forEach((a) => { if (batch.includes(a.host)) geminiCache[a.host] = a; });
      } catch (error) { console.warn("Gemini batch failed:", error.message); }
      fs.writeFileSync(geminiFile, JSON.stringify(geminiCache, null, 1));
    });
  }

  const results = hosts.map((h) => Object.assign({ host: h, reports: reportsOf[h] || 0 }, decide(scores[h], ask.includes(h) ? geminiCache[h] : null)));
  fs.writeFileSync(path.join(CACHE, "results.json"), JSON.stringify(results, null, 1));
  const sure = results.filter((r) => r.confidence >= AUTO && r.scope !== "unknown");
  const queue = results.filter((r) => !sure.includes(r)).sort((a, b) => b.reports - a.reports || b.confidence - a.confidence);
  const tally = { auto: sure.filter((r) => r.scope === "country").length, worldwide: sure.filter((r) => r.scope === "worldwide").length, queued: queue.filter((r) => r.country || r.scope === "worldwide").length, unresolved: queue.filter((r) => !r.country && r.scope !== "worldwide").length };
  console.log("hosts: " + JSON.stringify(tally));

  if (opts.apply) {
    sure.forEach((r) => {
      if ((file.hosts[r.host] || {}).by === "carlos") return;
      file.hosts[r.host] = { country: r.country, scope: r.scope, confidence: r.confidence, by: r.decidedBy, evidence: r.evidence.slice(0, 4), at: today };
    });
    const sorted = Object.fromEntries(Object.keys(file.hosts).sort().map((h) => [h, file.hosts[h]]));
    fs.mkdirSync(path.dirname(live.COUNTRIES_FILE), { recursive: true });
    fs.writeFileSync(live.COUNTRIES_FILE, JSON.stringify({ about: "Live Report countries found by scripts/live-report-countries.js (#2980). scope country | worldwide; by signals | gemini | carlos | curated.", hosts: sorted }, null, 1) + "\n");
    const items = live.existingItems();
    let placed = 0;
    items.forEach((item) => {
      const hit = file.hosts[bare(item.card.host)];
      if (!item.card.country && hit && hit.scope === "country" && REGIONS[hit.country]) { live.setCountry(item, hit.country); placed += 1; }
    });
    if (placed) live.writeAll(items);
    console.log("placed " + placed + " reports; " + items.filter((x) => !x.card.country).length + " still without a country");
  }

  if (opts.queue) {
    const items = queue.filter((r) => !skipped[r.host] && (file.hosts[r.host] || {}).by !== "carlos").slice(0, 1500).map((r) => ({
      host: r.host, country: r.country || "", scope: r.scope, confidence: r.confidence, by: r.decidedBy, reports: r.reports, evidence: r.evidence.slice(0, 4).map((e) => cut(e, 140))
    }));
    await firestore("PATCH", { items: toValue(items), updatedAt: { timestampValue: new Date().toISOString() }, counts: toValue(tally), threshold: toValue(AUTO) }, ["items", "updatedAt", "counts", "threshold"]);
    console.log("queued " + items.length + " in " + QUEUE_DOC);
  }
}

if (require.main === module) main().catch((error) => { console.error(error); process.exit(1); });

module.exports = { AUTO, GENERIC_CC, tldSignals, tldCountry, phoneCountry, nameToCode, countryNames, pageFacts, pageSignals, signalsOf, score, decide, geminiPrompt, toValue, fromValue };
