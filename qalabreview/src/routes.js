/* Routes for qalabreview.com, the outreach domain (#1864, #1866). Every link lands on carlosandmunoz.com;
   checkout, accounts and product mail never live on the sending domain. */
import { AUDIENCES, ORIGIN, renderLanding } from "./landing.js";

export const SITE = "https://carlosandmunoz.com";
export const LANGS = ["en", "es", "pt", "de", "fr", "it"];

// Short paths printed on clips, one-pagers, slides and profiles. The value is the utm_campaign Jarvis groups by.
export const CHANNELS = {
  yt: "youtube", youtube: "youtube", tt: "tiktok", tiktok: "tiktok", li: "linkedin", linkedin: "linkedin",
  ig: "instagram", fb: "facebook", x: "x", qr: "qr", pdf: "one-pager", lecture: "lecture", webinar: "webinar",
  sig: "signature", card: "business-card"
};

// Network codes in a report reply's link (#2465): /<lang>/r/<code>/<host>/<post ref>. The value goes in utm_campaign.
export const SOCIAL = {
  bsky: "bluesky", mast: "mastodon", yt: "youtube", x: "x", li: "linkedin", fb: "facebook", ig: "instagram", th: "threads", tt: "tiktok"
};

const OFFER = /^hi-[a-z0-9]{8}$/;
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

// The booking page (#1971) stands in for Microsoft Bookings (#1424); CALL_URL overrides it. book.js reads host
// into the company field and sends utm_campaign as the booking's ref.
function booking(lang, host) {
  const q = new URLSearchParams({ utm_source: "qalabreview", utm_medium: "email", utm_campaign: "call" });
  if (host) q.set("utm_content", host);
  q.set("type", host ? "walkthrough" : "intro");
  q.set("lang", lang);
  if (host) q.set("host", host);
  return SITE + "/book.html?" + q.toString();
}

function sitemap() {
  const urls = LANGS.flatMap((l) => ["", ...AUDIENCES].map((a) => "<url><loc>" + ORIGIN + "/" + l + (a ? "/" + a : "") + "</loc></url>"));
  return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + urls.join("") + "</urlset>\n";
}

/* Returns { status, location } or { status, body, type, cache }. `findReport(bareHost)` resolves to a Live Report
   card ({ id }) or null. */
export async function route(url, { acceptLanguage = "", findReport = async () => null, callUrl = "" } = {}) {
  const decode = (p) => { try { return decodeURIComponent(p); } catch (error) { return p; } };
  const parts = url.pathname.split("/").filter(Boolean).map((p) => decode(p).toLowerCase());
  const pathLang = parts.length && LANGS.includes(parts[0]) ? parts.shift() : "";
  const lang = pathLang || langFrom(acceptLanguage);
  const [first = "", ...rest] = parts;

  if (first === "robots.txt") return { status: 200, type: "text/plain", body: "User-agent: *\nAllow: /\nSitemap: " + ORIGIN + "/sitemap.xml\n" };
  if (first === "sitemap.xml") return { status: 200, type: "application/xml", body: sitemap() };
  if (first === "favicon.ico") return { status: 302, location: SITE + "/assets/qa-review-favicon.ico" };
  if (first === "call" && rest.length <= 1 && (!rest.length || HOST.test(bare(rest[0])))) {
    return { status: 302, location: callUrl || booking(lang, rest.length ? bare(rest[0]) : "") };
  }

  // The landing (#1867): /<lang> and /<lang>/<audience>. Without a language in the path, the browser's picks one.
  if ((!first || AUDIENCES.includes(first)) && !rest.length) {
    if (!pathLang) return { status: 302, location: ORIGIN + "/" + lang + (first ? "/" + first : "") + url.search };
    const tags = { utm_campaign: first ? "landing-" + first : "landing", utm_medium: "web" };
    const link = (p, extra) => SITE + "/" + p + "?" + new URLSearchParams(Object.assign({ utm_source: "qalabreview" }, tags, extra)).toString();
    return { status: 200, type: "text/html", cache: "public, max-age=300", body: renderLanding(lang, first, { link, review: landing(lang, tags) }) };
  }
  if (CHANNELS[first] && !rest.length) return { status: 302, location: landing(lang, { utm_campaign: CHANNELS[first], utm_medium: first }) };

  // A peer group's comparison (#2363): /<lang>/peers/<group id>/<the reader's token>, both lowercase hex.
  if (first === "peers" && rest.length === 2 && rest.every((p) => /^[a-f0-9]{8,40}$/.test(p))) {
    return { status: 302, location: landing(lang, { utm_campaign: "outreach-peers", utm_medium: "email" }, { peers: rest[0], t: rest[1] }) };
  }

  // A reply under a social post that names a site we reviewed (#2465); the post ref tells Jarvis which reply it was.
  // The ref goes before the host, whose length varies, so the 120 characters a visit keeps hold it (#2471).
  // A profile campaign message (#2615) adds the site's domain offer code: /<lang>/r/<code>/<host>/<post ref>/<offer>.
  if (first === "r" && rest.length >= 2 && rest.length <= 4 && SOCIAL[rest[0]] && HOST.test(bare(rest[1])) && (rest.length === 2 || /^[a-z0-9]{4,12}$/.test(rest[2])) && (rest.length < 4 || OFFER.test(rest[3]))) {
    const site = bare(rest[1]);
    const tags = Object.assign({ utm_campaign: (rest[3] ? "social-profile-" : "social-reply-") + SOCIAL[rest[0]] }, rest[2] ? { utm_term: rest[2] } : {}, { utm_content: site, utm_medium: "social" });
    const card = await findReport(site).catch(() => null);
    return { status: 302, location: landing(lang, tags, Object.assign(card && card.id ? { live: card.id } : { url: site }, rest[3] ? { coupon: rest[3].toUpperCase() } : {})) };
  }

  const host = bare(first);
  if (HOST.test(host) && !rest.length) {
    const tags = { utm_campaign: "outreach", utm_content: host, utm_medium: "email" };
    const card = await findReport(host).catch(() => null);
    if (card && card.id) return { status: 302, location: landing(lang, tags, { live: card.id }) };
    return { status: 302, location: landing(lang, Object.assign(tags, { utm_campaign: "outreach-new" }), { url: host }) };
  }
  // Sequence F, the competitors of URL Review askers (#2158): the sample report, with their own site typed in.
  if (HOST.test(host) && rest.length === 1 && rest[0] === "sample") {
    return { status: 302, location: landing(lang, { utm_campaign: "outreach-rivals", utm_content: host, utm_medium: "email" }, { sample: "1", url: host }) };
  }
  return { status: 302, location: landing(lang, { utm_campaign: "unknown-path", utm_medium: "web" }) };
}
