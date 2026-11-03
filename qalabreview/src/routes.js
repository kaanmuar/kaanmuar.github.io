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

// Network codes in a report reply's link (#2465): /<lang>/r/<code>/<host>/<post ref>. The value goes in utm_campaign.
export const SOCIAL = {
  bsky: "bluesky", mast: "mastodon", yt: "youtube", x: "x", li: "linkedin", fb: "facebook", ig: "instagram", th: "threads", tt: "tiktok"
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

  // A peer group's comparison (#2363): /<lang>/peers/<group id>/<the reader's token>, both lowercase hex.
  if (first === "peers" && rest.length === 2 && rest.every((p) => /^[a-f0-9]{8,40}$/.test(p))) {
    return { status: 302, location: landing(lang, { utm_campaign: "outreach-peers", utm_medium: "email" }, { peers: rest[0], t: rest[1] }) };
  }

  // A reply under a social post that names a site we reviewed (#2465); the post ref tells Jarvis which reply it was.
  // The ref goes before the host, whose length varies, so the 120 characters a visit keeps hold it (#2471).
  if (first === "r" && (rest.length === 2 || rest.length === 3) && SOCIAL[rest[0]] && HOST.test(bare(rest[1])) && (rest.length === 2 || /^[a-z0-9]{4,12}$/.test(rest[2]))) {
    const site = bare(rest[1]);
    const tags = Object.assign({ utm_campaign: "social-reply-" + SOCIAL[rest[0]] }, rest[2] ? { utm_term: rest[2] } : {}, { utm_content: site, utm_medium: "social" });
    const card = await findReport(site).catch(() => null);
    return { status: 302, location: landing(lang, tags, card && card.id ? { live: card.id } : { url: site }) };
  }

  const host = bare(first);
  if (HOST.test(host) && !rest.length) {
    const tags = { utm_campaign: "outreach", utm_content: host, utm_medium: "email" };
    const card = await findReport(host).catch(() => null);
    if (card && card.id) return { status: 302, location: landing(lang, tags, { live: card.id }) };
    return { status: 302, location: landing(lang, Object.assign(tags, { utm_campaign: "outreach-new" }), { url: host }) };
  }
  return { status: 302, location: landing(lang, { utm_campaign: "unknown-path", utm_medium: "web" }) };
}
