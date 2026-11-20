/* Builds localized Open Graph and Twitter Card metadata for public ?live=<id> URL Review shares (#3764).
   Private ?report=<id> links intentionally stay untouched so non-public reports never leak site names or scores. */

export const SITE = "https://carlosandmunoz.com";
const LANGS = ["en", "es", "pt", "de", "fr", "it"];

const COPY = {
  en: {
    title: "{name}: {overall}/100 ({grade}) · QA-lab URL Review",
    desc: "{host} scored {overall}/100 (Grade {grade}) across {pages} analyzed pages: SEO {SEO}, GEO {GEO}, Analytics {Analytics}, Security {Security}, Accessibility {Accessibility}, Performance {Performance}.",
    alt: "{name} ({host}) scored {overall}/100 ({grade}) in QA-lab URL Review."
  },
  es: {
    title: "{name}: {overall}/100 ({grade}) · QA-lab URL Review",
    desc: "{host} obtuvo {overall}/100 (nota {grade}) en {pages} páginas analizadas: SEO {SEO}, GEO {GEO}, Analítica {Analytics}, Seguridad {Security}, Accesibilidad {Accessibility}, Rendimiento {Performance}.",
    alt: "{name} ({host}) obtuvo {overall}/100 ({grade}) en QA-lab URL Review."
  },
  pt: {
    title: "{name}: {overall}/100 ({grade}) · QA-lab URL Review",
    desc: "{host} obteve {overall}/100 (nota {grade}) em {pages} páginas analisadas: SEO {SEO}, GEO {GEO}, Analytics {Analytics}, Segurança {Security}, Acessibilidade {Accessibility}, Desempenho {Performance}.",
    alt: "{name} ({host}) obteve {overall}/100 ({grade}) no QA-lab URL Review."
  },
  de: {
    title: "{name}: {overall}/100 ({grade}) · QA-lab URL Review",
    desc: "{host} erreichte {overall}/100 (Note {grade}) auf {pages} analysierten Seiten: SEO {SEO}, GEO {GEO}, Analytics {Analytics}, Sicherheit {Security}, Barrierefreiheit {Accessibility}, Performance {Performance}.",
    alt: "{name} ({host}) erreichte {overall}/100 ({grade}) im QA-lab URL Review."
  },
  fr: {
    title: "{name} : {overall}/100 ({grade}) · QA-lab URL Review",
    desc: "{host} a obtenu {overall}/100 (note {grade}) sur {pages} pages analysées : SEO {SEO}, GEO {GEO}, Analytics {Analytics}, Sécurité {Security}, Accessibilité {Accessibility}, Performance {Performance}.",
    alt: "{name} ({host}) a obtenu {overall}/100 ({grade}) sur QA-lab URL Review."
  },
  it: {
    title: "{name}: {overall}/100 ({grade}) · QA-lab URL Review",
    desc: "{host} ha ottenuto {overall}/100 (voto {grade}) su {pages} pagine analizzate: SEO {SEO}, GEO {GEO}, Analytics {Analytics}, Sicurezza {Security}, Accessibilità {Accessibility}, Prestazioni {Performance}.",
    alt: "{name} ({host}) ha ottenuto {overall}/100 ({grade}) su QA-lab URL Review."
  }
};

export function langOf(url) {
  const m = String(url.pathname || "").match(/^\/qa-review-(es|pt|de|fr|it)\.html$/);
  if (m) return m[1];
  const asked = (url.searchParams.get("lang") || "").slice(0, 2).toLowerCase();
  return LANGS.includes(asked) ? asked : "en";
}

export function liveIdOf(url) {
  const raw = String(url.searchParams.get("live") || "").trim();
  return /^[a-z0-9][a-z0-9-]{0,63}$/i.test(raw) ? raw.toLowerCase() : "";
}

function fill(template, vars) {
  return template.replace(/\{(\w+)\}/g, (_, key) => (vars[key] == null ? "" : String(vars[key])));
}

function fallbackImage(lang) {
  return SITE + "/assets/share/qa-review-pitch" + (lang === "en" ? "" : "-" + lang) + ".jpg?v=20261110-3424";
}

function pickPostImage(posts, id, lang) {
  const list = Array.isArray(posts) ? posts : [];
  const matches = list.filter((p) => p && String(p.report || "").toLowerCase() === id && p.image);
  if (!matches.length) return "";
  const chosen = matches.find((p) => p.lang === lang) || matches.find((p) => p.lang === "en") || matches[0];
  const rel = String(chosen.image || "").replace(/^\/+/, "");
  return rel ? (/^https:\/\//i.test(rel) ? rel : SITE + "/" + rel) : "";
}

export function metaForLive(url, indexData, feedData) {
  const id = liveIdOf(url);
  if (!id || !indexData || !Array.isArray(indexData.reports)) return null;
  const report = indexData.reports.find((r) => r && String(r.id || "").toLowerCase() === id);
  if (!report) return null;
  const lang = langOf(url);
  const copy = COPY[lang] || COPY.en;
  const areas = report.areas || {};
  const vars = {
    name: report.name || report.host || id,
    host: report.host || report.name || id,
    overall: report.overall ?? 0,
    grade: report.grade || "–",
    pages: report.pages || 1,
    SEO: areas.SEO ?? "–",
    GEO: areas.GEO ?? "–",
    Analytics: areas.Analytics ?? "–",
    Security: areas.Security ?? "–",
    Accessibility: areas.Accessibility ?? "–",
    Performance: areas.Performance ?? "–"
  };
  const posts = feedData ? (Array.isArray(feedData.posts) ? feedData.posts : feedData) : [];
  const image = pickPostImage(posts, id, lang) || fallbackImage(lang);
  const page = url.pathname === "/live.html" ? "/qa-review" + (lang === "en" ? "" : "-" + lang) + ".html" : url.pathname;
  return {
    title: fill(copy.title, vars),
    description: fill(copy.desc, vars),
    url: SITE + page + "?live=" + encodeURIComponent(report.id),
    image,
    imageAlt: fill(copy.alt, vars)
  };
}
