/* Routes for qalabreview.com, the outreach domain (#1864, #1866). Every link lands on carlosandmunoz.com;
   checkout, accounts and product mail never live on the sending domain. */

export const SITE = "https://carlosandmunoz.com";
export const LANGS = ["en", "es", "pt", "de", "fr", "it"];
export const DEFAULT_CALL = "mailto:carlos@qalabreview.com?subject=" + encodeURIComponent("A call about my URL Review");

// Short paths printed on clips, one-pagers, slides and profiles. The value is the utm_campaign Jarvis groups by.
export const CHANNELS = {
  yt: "youtube", youtube: "youtube", tt: "tiktok", tiktok: "tiktok", li: "linkedin", linkedin: "linkedin",
  ig: "instagram", fb: "facebook", x: "x", qr: "qr", pdf: "one-pager", lecture: "lecture", webinar: "webinar",
  sig: "signature", card: "business-card"
};

const HOST = /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

export function page(lang) {
  return lang === "en" ? "qa-review.html" : "qa-review-" + lang + ".html";
}

export function bare(host) {
  return String(host || "").trim().toLowerCase().replace(/^https?:\/\//, "").split("/")[0].replace(/^www\./, "");
}

export function langFrom(acceptLanguage) {
  for (const part of String(acceptLanguage || "").split(",")) {
    const code = part.trim().slice(0, 2).toLowerCase();
    if (LANGS.includes(code)) return code;
  }
  return "en";
}

// The tags go first: the review page keeps only the first 120 characters of the query when it notes a visit.
function landing(lang, tags, extra) {
  const q = new URLSearchParams(Object.assign({ utm_source: "qalabreview" }, tags, extra));
  return SITE + "/" + page(lang) + "?" + q.toString();
}

/* Returns { status, location } or { status, body, type }. `findReport(bareHost)` resolves to a Live Report
   card ({ id }) or null. */
export async function route(url, { acceptLanguage = "", findReport = async () => null, callUrl = "" } = {}) {
  const decode = (p) => { try { return decodeURIComponent(p); } catch (error) { return p; } };
  const parts = url.pathname.split("/").filter(Boolean).map((p) => decode(p).toLowerCase());
  let lang = "";
  if (parts.length && LANGS.includes(parts[0])) lang = parts.shift();
  lang = lang || langFrom(acceptLanguage);
  const [first = "", ...rest] = parts;

  if (first === "robots.txt") return { status: 200, type: "text/plain", body: "User-agent: *\nAllow: /\n" };
  if (first === "call") return { status: 302, location: callUrl || DEFAULT_CALL };
  if (!first) return { status: 302, location: landing(lang, { utm_campaign: "home", utm_medium: "web" }) };
  if (CHANNELS[first] && !rest.length) return { status: 302, location: landing(lang, { utm_campaign: CHANNELS[first], utm_medium: first }) };

  const host = bare(first);
  if (HOST.test(host) && !rest.length) {
    const tags = { utm_campaign: "outreach", utm_content: host, utm_medium: "email" };
    const card = await findReport(host).catch(() => null);
    if (card && card.id) return { status: 302, location: landing(lang, tags, { live: card.id }) };
    return { status: 302, location: landing(lang, Object.assign(tags, { utm_campaign: "outreach-new" }), { url: host }) };
  }
  return { status: 302, location: landing(lang, { utm_campaign: "unknown-path", utm_medium: "web" }) };
}
