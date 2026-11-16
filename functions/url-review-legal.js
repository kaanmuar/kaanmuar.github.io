// Links to the accessibility statement, the imprint and the privacy notice, matched by their words
// or their address in English, Spanish, Portuguese, German, French and Italian.
const LEGAL = {
  // The bare word, or a statement or declaration of it. A forum or article about accessibility is not the statement.
  accessibility: {
    text: /^(web )?(accessibility|accesibilidad|acessibilidade|barrierefreiheit|accessibilit[ée]|accessibilit[àa])$|(statement|declaraci[oó]n|declara[cç][ãa]o|erkl[äa]rung|d[ée]claration|dichiarazione)\b.{0,30}(accessib|accesib|acessib|barrierefrei)|(accessib|barrierefrei)\S*\s+(statement|erkl[äa]rung)|accessibilit[ée]\s*:\s*(non|partiellement|totalement)\s+conforme/i,
    href: /\/[a-z-]*(accessib|accesib|acessib|barrierefrei)[a-z-]*(\.[a-z]+)?\/?$/i,
    away: /\/(forums?|blog|news|tags?|categor(y|ies)|topics?|support|help|kb|articles?|docs?|products?|collections?)\//i
  },
  imprint: {
    text: /\bimprint\b|impressum|legal notice|site notice|aviso legal|nota legal|informa[çc][ãa]o legal|mentions l[ée]gales|note legali|informazioni legali/i,
    href: /imprint|impressum|legal-notice|aviso-legal|nota-legal|informacao-legal|mentions-legales|note-legali/i
  },
  privacy: {
    text: /privacy|privacidad|privacidade|datenschutz|confidentialit[ée]|donn[ée]es personnelles|riservatezza/i,
    href: /privacy|privacidad|privacidade|datenschutz|confidentialite|donnees-personnelles|riservatezza/i
  }
};
const KINDS = Object.keys(LEGAL);
// A loose first pass for the rendered page, so only likely anchors are sent back to legalLinks().
const ANY = /accessib|accesib|acessib|barrierefrei|imprint|impressum|legal|nota|informa|mentions|note|privacy|privacidad|privacidade|datenschutz|confidentialit|donn|riservatezza/i;
// Accessibility overlay vendors link their own site from a widget; that is not the site's statement.
const OVERLAY = /(^|\.)(accessibe\.com|userway\.org|audioeye\.com|equalweb\.com|userway\.com|accessiblyapp\.com|eye-able\.com)$/i;

// anchors: [{ href, text, label }] as written on the page, label being aria-label and title.
// Returns the first link of each kind, or null.
function legalLinks(anchors, pageUrl) {
  const found = { accessibility: null, imprint: null, privacy: null };
  const tidy = (value) => String(value || "").replace(/\s+/g, " ").trim().slice(0, 80);
  const usable = [];
  (anchors || []).forEach((anchor) => {
    const raw = String((anchor && anchor.href) || "").trim();
    if (!raw || raw.charAt(0) === "#") return;
    let url;
    try { url = new URL(raw, pageUrl); } catch (error) { return; }
    if (!/^https?:$/.test(url.protocol)) return;
    let path = url.pathname;
    try { path = decodeURIComponent(path); } catch (error) { /* keep the raw path */ }
    usable.push({ href: url.href.slice(0, 300), text: tidy(anchor.text), label: tidy(anchor.label), path: path.toLowerCase(), host: url.hostname });
  });
  KINDS.forEach((kind) => {
    const rule = LEGAL[kind];
    const fits = (link) => !(kind === "accessibility" && OVERLAY.test(link.host)) && !(rule.away && rule.away.test(link.path));
    // aria-label and title name the link only when it shows no words of its own.
    const hit = usable.find((link) => fits(link) && rule.text.test(link.text || link.label)) ||
      usable.find((link) => fits(link) && rule.href.test(link.path));
    if (hit) found[kind] = { href: hit.href, text: hit.text || hit.label };
  });
  return found;
}

// Sites written in German, or on a .de or .at domain, owe an imprint (§ 5 DDG, § 5 ECG).
function germanSpeaking(lang, textLang, pageUrl) {
  let host = "";
  try { host = new URL(pageUrl).hostname; } catch (error) { host = ""; }
  return /^de\b/i.test(String(lang || "")) || textLang === "de" || /\.(de|at)$/i.test(host);
}

module.exports = { legalLinks, germanSpeaking, LEGAL_ANY: ANY.source };
