"use strict";
/* Company contacts (#3139): what a company publishes about itself on its own site, for the trial offer.

   Read from the homepage and up to CONTACT_PAGES contact, about or legal-notice pages on the same host: addresses on
   the site's own domain (mailto links and visible text; never free-mail, personal inboxes like privacy@ or jobs@, or
   addresses on other domains), phones from tel: links and schema.org, profile links and schema.org sameAs (one per
   network, engagement-profiles.js profilesOf), the page language, the country and the organisation's name.

   Nothing is guessed: no address patterns, no people search, no third-party directories. Role inboxes (info@,
   ventas@, reservas@) come first; a named address the site publishes is kept after them as "named". */
const P = require("./engagement-profiles");

const CONTACT_PAGES = 3;
const MAX_EMAILS = 4;
const MAX_PHONES = 2;
const UA = "Mozilla/5.0 (compatible; QA-lab-outreach/1.0; +https://carlosandmunoz.com)";

const SKIP_INBOX = /^((support|soporte|suporte|helpdesk|mesadeayuda|newsletter|noreply|no-reply|donotreply)[a-z0-9._-]*|help|ayuda|news|privacy|privacidad|datenschutz|rgpd|gdpr|dpo|abuse|postmaster|webmaster|hostmaster|jobs|careers|empleo|trabajo|rrhh|hr|bewerbung|unsubscribe|bounce[s]?|mailer-daemon)@/i;
const FREE_MAIL = /@(gmail|googlemail|hotmail|outlook|live|msn|yahoo|ymail|icloud|me|mac|aol|proton(mail)?|pm|gmx|web|mail|yandex|zoho|uol|bol|terra|libero|virgilio|orange|free|laposte|sfr|t-online|qq|163)\.[a-z.]+$/i;
const ROLE = /^(info|hello|hola|ola|ciao|bonjour|hallo|contact[a-z]*|contacto|contato|contatti|kontakt|sales|ventas|vendas|vendite|ventes|verkauf|comercial|commerciale|office|oficina|admin|administracion|reservas|reservations?|reservaciones|booking[s]?|reserva|prenotazioni|buchung|eventos|events?|eventi|grupos|groups|marketing|partners?|business|negocios|team|equipo|studio|shop|tienda|loja|store|pedidos|orders?|enquiries|inquiries|consultas|atencion|atendimento|clientes|customer[a-z]*|service[s]?|servicio|direccion|gerencia|ceo|founders?)$/i;
const CONTACT_LINK = /contact|contacto|contato|contatti|kontakt|nosotros|about|chi-siamo|qui-sommes|ueber-uns|uber-uns|equipo|team|quienes|sobre|impressum|aviso-legal|mentions-legales|legal-notice|imprint|note-legali/i;
const SITE_LANGS = ["en", "es", "pt", "de", "fr", "it"];
const TLD_CC = { co: "co", mx: "mx", pe: "pe", ar: "ar", cl: "cl", ec: "ec", ve: "ve", uy: "uy", py: "py", bo: "bo", cr: "cr", pa: "pa", do: "do", gt: "gt", hn: "hn", sv: "sv", ni: "ni", pr: "pr",
  br: "br", pt: "pt", es: "es", de: "de", at: "at", ch: "ch", fr: "fr", be: "be", it: "it", uk: "gb", ie: "ie", ca: "ca", au: "au", us: "us" };
const COUNTRY_NAMES = { colombia: "co", mexico: "mx", méxico: "mx", peru: "pe", perú: "pe", argentina: "ar", chile: "cl", ecuador: "ec", venezuela: "ve", uruguay: "uy", paraguay: "py", bolivia: "bo",
  "costa rica": "cr", panama: "pa", panamá: "pa", brazil: "br", brasil: "br", portugal: "pt", spain: "es", españa: "es", germany: "de", deutschland: "de", austria: "at", österreich: "at",
  switzerland: "ch", schweiz: "ch", suisse: "ch", france: "fr", belgium: "be", belgique: "be", italy: "it", italia: "it", "united kingdom": "gb", uk: "gb", ireland: "ie", canada: "ca", australia: "au",
  "united states": "us", usa: "us" };

const bare = (host) => String(host || "").toLowerCase().replace(/^https?:\/\//, "").replace(/[/:].*$/, "").replace(/^www\./, "");
const decode = (s) => String(s || "").replace(/&#64;|&#x40;|%40/gi, "@").replace(/&amp;/g, "&").replace(/&#46;|&#x2e;/gi, ".");

/** True when the address sits on the site's domain (or one sits under the other). */
function sameSite(email, host) {
  const d = String(email).split("@")[1] || "";
  const h = bare(host);
  return !!d && !!h && (d === h || d.endsWith("." + h) || h.endsWith("." + d));
}

/** A published address worth keeping as { email, kind: "role"|"named" }, or null. */
function emailOf(raw, host) {
  const email = decode(raw).trim().toLowerCase().replace(/^mailto:/, "").split("?")[0].replace(/[.,;:]+$/, "");
  if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(email)) return null;
  if (/\.(png|jpe?g|gif|webp|svg|css|js)$/.test(email) || SKIP_INBOX.test(email) || FREE_MAIL.test(email) || !sameSite(email, host)) return null;
  return { email, kind: ROLE.test(email.split("@")[0]) ? "role" : "named" };
}

/** Every JSON-LD object in a page, @graph members included. */
function jsonLd(html) {
  const out = [];
  const re = /<script[^>]+type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  const walk = (x) => {
    if (Array.isArray(x)) return x.forEach(walk);
    if (!x || typeof x !== "object") return;
    out.push(x);
    if (x["@graph"]) walk(x["@graph"]);
  };
  while ((m = re.exec(html))) { try { walk(JSON.parse(m[1].trim())); } catch (error) { /* not JSON */ } }
  return out;
}

const ORG_TYPE = /Organization|Corporation|LocalBusiness|Store|Hotel|Restaurant|Dentist|Clinic|MedicalBusiness|LegalService|Attorney|RealEstateAgent|FinancialService|BankOrCreditUnion|InsuranceAgency|TravelAgency|LodgingBusiness|AutoDealer|AutoRental|EducationalOrganization|NGO|SportsActivityLocation|HealthAndBeautyBusiness|FoodEstablishment|EventVenue|Airline|ProfessionalService|OnlineBusiness/;

/** The schema.org organisation facts of a page: { name, emails, phones, sameAs, country }. */
function orgFacts(html) {
  const out = { name: "", emails: [], phones: [], sameAs: [], country: "" };
  jsonLd(html).filter((x) => ORG_TYPE.test([].concat(x["@type"] || []).join(" "))).forEach((x) => {
    if (!out.name && typeof x.name === "string") out.name = x.name.trim().slice(0, 120);
    [].concat(x.email || []).forEach((e) => typeof e === "string" && out.emails.push(e));
    [].concat(x.telephone || []).forEach((p) => typeof p === "string" && out.phones.push(p));
    [].concat(x.sameAs || []).forEach((s) => typeof s === "string" && out.sameAs.push(s));
    [].concat(x.contactPoint || []).forEach((c) => {
      if (c && typeof c.email === "string") out.emails.push(c.email);
      if (c && typeof c.telephone === "string") out.phones.push(c.telephone);
    });
    const a = [].concat(x.address || [])[0];
    const c = a && (typeof a.addressCountry === "string" ? a.addressCountry : a.addressCountry && a.addressCountry.name);
    if (!out.country && c) out.country = countryOf(c);
  });
  return out;
}

/** A two-letter country from an ISO code or a country name, or "". */
function countryOf(value) {
  const v = String(value || "").trim().toLowerCase();
  if (/^[a-z]{2}$/.test(v)) return v === "uk" ? "gb" : v;
  return COUNTRY_NAMES[v] || "";
}

/** A phone as + and digits, or "" when it is too short or too long to be one. */
function phoneOf(raw) {
  const s = decode(raw).replace(/^tel:/i, "").replace(/%20/g, " ").trim();
  const digits = s.replace(/[^\d]/g, "");
  if (digits.length < 7 || digits.length > 15) return "";
  return (s.startsWith("+") || s.startsWith("00") ? "+" + digits.replace(/^00/, "") : digits);
}

/** Same-host contact, about and legal-notice links of a page, at most CONTACT_PAGES. */
function contactLinks(html, base) {
  let home;
  try { home = new URL(base); } catch (error) { return []; }
  const out = [];
  const re = /<a\b[^>]*?\bhref\s*=\s*(?:"([^"#]+)"|'([^'#]+)')/gi;
  let m;
  while ((m = re.exec(String(html || ""))) && out.length < CONTACT_PAGES) {
    let u;
    try { u = new URL(decode(m[1] || m[2]), home); } catch (error) { continue; }
    if (!/^https?:$/.test(u.protocol) || bare(u.host) !== bare(home.host) || !CONTACT_LINK.test(u.pathname)) continue;
    u.hash = "";
    if (u.href !== home.href && !out.includes(u.href)) out.push(u.href);
  }
  return out;
}

/** The two-letter language a page declares, if it is a site language. */
function langOf(html) {
  const l = ((String(html || "").match(/<html[^>]*\blang\s*=\s*["']?([a-zA-Z]{2})/i) || [])[1] || "").toLowerCase();
  return SITE_LANGS.includes(l) ? l : "";
}

/** A ccTLD's country, or "" for .com and the like. */
const tldCountry = (host) => TLD_CC[bare(host).split(".").pop()] || "";

/**
 * Contacts from a company's own pages (homepage first): { name, emails [{ email, kind, url }], phones, socials
 * [{ network, handle, url }], lang, country, pages }. hint: { cc, lang } from the prospect row, used when the site
 * says nothing.
 */
function contactsOf(pages, host, hint) {
  const h = hint || {};
  const emails = new Map();
  const phones = [];
  const socialHtml = [];
  let name = "";
  let country = "";
  let lang = "";
  (pages || []).filter((p) => p && p.html).forEach((p) => {
    const html = String(p.html).slice(0, 800000);
    const org = orgFacts(html);
    const add = (raw) => { const e = emailOf(raw, host); if (e && !emails.has(e.email)) emails.set(e.email, Object.assign(e, { url: p.url })); };
    for (const m of html.matchAll(/href\s*=\s*["']mailto:([^"'?]+)/gi)) add(m[1]);
    org.emails.forEach(add);
    const text = decode(html.replace(/<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>/gi, " ")).replace(/\s?\[at\]\s?|\s?\(at\)\s?/gi, "@").replace(/\s?\[dot\]\s?|\s?\(dot\)\s?/gi, ".");
    for (const m of text.matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g)) add(m[0]);
    [...[...html.matchAll(/href\s*=\s*["']tel:([^"']+)/gi)].map((m) => m[1]), ...org.phones].map(phoneOf).forEach((x) => { if (x && !phones.includes(x)) phones.push(x); });
    socialHtml.push(html, org.sameAs.length ? '"sameAs": ' + JSON.stringify(org.sameAs) : "");
    if (!name) name = org.name || ((html.match(/<meta[^>]+property\s*=\s*["']og:site_name["'][^>]+content\s*=\s*["']([^"']+)/i) || [])[1] || "").trim().slice(0, 120);
    if (!country) country = org.country;
    if (!lang) lang = langOf(html);
  });
  const base = (pages && pages[0] && pages[0].url) || "https://" + bare(host) + "/";
  const list = [...emails.values()].sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "role" ? -1 : 1)).slice(0, MAX_EMAILS);
  return {
    name,
    emails: list,
    phones: phones.slice(0, MAX_PHONES),
    socials: P.profilesOf(socialHtml.join("\n"), base),
    lang: lang || (SITE_LANGS.includes(h.lang) ? h.lang : "en"),
    country: country || tldCountry(host) || String(h.cc || "").toLowerCase(),
    pages: (pages || []).filter((p) => p && p.html).map((p) => p.url)
  };
}

/** A page's final URL and HTML, or null when it is not an HTML page that answered. */
async function page(fetchFn, url) {
  try {
    const res = await fetchFn(url, { headers: { "user-agent": UA, accept: "text/html" }, redirect: "follow", signal: AbortSignal.timeout(8000) });
    if (!res.ok || !/html/.test((res.headers && res.headers.get && res.headers.get("content-type")) || "")) return null;
    return { url: res.url || url, html: (await res.text()).slice(0, 800000) };
  } catch (error) { return null; }
}

/** Reads the homepage and its contact pages and returns contactsOf them, or null when the site does not answer. */
async function discover(fetchFn, host, hint) {
  const h = bare(host);
  const home = await page(fetchFn, "https://" + host.replace(/^https?:\/\//, "").replace(/\/.*$/, "") + "/") || await page(fetchFn, "https://www." + h + "/");
  if (!home) return null;
  const more = [];
  for (const u of contactLinks(home.html, home.url)) {
    const p = await page(fetchFn, u);
    if (p) more.push(p);
  }
  return contactsOf([home].concat(more), h, hint);
}

module.exports = { CONTACT_PAGES, MAX_EMAILS, emailOf, sameSite, orgFacts, jsonLd, countryOf, phoneOf, contactLinks, langOf, tldCountry, contactsOf, discover };
