/* One Analytics Engine data point per short-link click (#3281), read by Jarvis (functions/jarvis-geo-clicks.js) to place
   clicks on the Map by the visitor's country. No IP, user agent, colo or ASN is kept.

   blobs    [kind, country, utm_campaign, prospect host (utm_content), language, agent]
            kind     outreach, social, channel, call, landing or unknown
            country  request.cf.country ("XX" unknown, "T1" Tor)
            agent    "bot" for crawlers, link previewers, mail scanners, scripts and HEAD requests, else ""
   doubles  [1]
   indexes  [country] */
import { LANGS, langFrom } from "./routes.js";

export const DATASET = "qalabreview_clicks";

// Crawlers, chat and social link previews, mail link scanners and HTTP libraries. Browsers that a mail gateway drives
// look like people and are counted as clicks.
const BOT = /bot\b|bot\/|crawl|spider|slurp|preview|facebookexternalhit|embedly|quora link|whatsapp|telegram|slack|discord|skype|vkshare|pinterest|google-safety|proofpoint|mimecast|barracuda|headless|lighthouse|curl\/|wget\/|python-|go-http|node-fetch|axios|okhttp|java\/|libwww|httpclient|scanner|^$/i;

export function isBot(method, userAgent) {
  return method === "HEAD" || BOT.test(String(userAgent || "").trim());
}

function kindOf(first, campaign) {
  if (first === "call") return "call";
  if (/^outreach/.test(campaign)) return "outreach";
  if (/^social-/.test(campaign)) return "social";
  if (/^landing/.test(campaign)) return "landing";
  if (campaign === "unknown-path") return "unknown";
  return campaign ? "channel" : "unknown";
}

/* The click a route() answer stands for, or null when it is not one: robots.txt, the sitemap, the favicon and the
   landing's language redirect (the page it sends to is counted). */
export function clickOf(url, out, { acceptLanguage = "" } = {}) {
  const parts = url.pathname.split("/").filter(Boolean).map((p) => p.toLowerCase());
  const pathLang = parts.length && LANGS.includes(parts[0]) ? parts.shift() : "";
  const first = parts[0] || "";
  if (["robots.txt", "sitemap.xml", "favicon.ico"].includes(first)) return null;
  let tags = new URLSearchParams();
  if (out.location) {
    try { tags = new URL(out.location).searchParams; } catch (error) { tags = new URLSearchParams(); }
    if (!tags.get("utm_campaign") && first !== "call") return null;
  } else if (out.status === 200 && out.type === "text/html") {
    tags = new URLSearchParams({ utm_campaign: first ? "landing-" + first : "landing" });
  } else return null;
  const campaign = String(tags.get("utm_campaign") || (first === "call" ? "call" : "")).slice(0, 60);
  return {
    kind: kindOf(first, campaign),
    campaign,
    host: String(tags.get("utm_content") || "").slice(0, 120),
    lang: pathLang || langFrom(acceptLanguage)
  };
}

/** The data point for writeDataPoint. */
export function pointOf(click, country, bot) {
  const cc = /^[A-Z0-9]{2}$/.test(String(country || "")) ? String(country) : "XX";
  return { blobs: [click.kind, cc, click.campaign, click.host, click.lang, bot ? "bot" : ""], doubles: [1], indexes: [cc] };
}
