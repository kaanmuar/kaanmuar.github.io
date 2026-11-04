/* Official marks for the products a post names and the networks it goes out on, drawn white on the brand's own
   colour. The SVGs in designs/brand-logos are Simple Icons (CC0, simple-icons 16.36); LinkedIn asked Simple Icons
   to drop its mark, so linkedin.svg is from 10.4, the last release that shipped it. A brand's guidelines still
   apply: show the mark as it is, never recoloured inside, never stretched. */

const fs = require("fs");
const path = require("path");
const DIR = path.resolve(__dirname, "../../designs/brand-logos");

// Most specific first: a tip that names Google Search Console shows that mark, not Google's as well.
const BRANDS = [
  ["googlesearchconsole", "Google Search Console", "458CF5", /\bsearch console\b/i],
  ["googleanalytics", "Google Analytics", "E37400", /\b(google analytics|GA4)\b/i],
  ["googletagmanager", "Google Tag Manager", "246FDB", /\b(tag manager|GTM)\b/i],
  ["lighthouse", "Lighthouse", "F44B21", /\blighthouse\b/i],
  ["googlechrome", "Google Chrome", "4285F4", /\bchrome\b/i],
  ["google", "Google", "4285F4", /\b(google|googlebot)\b/i],
  ["cloudflare", "Cloudflare", "F38020", /\bcloudflare\b/i],
  ["github", "GitHub", "181717", /\bgithub\b/i],
  ["stripe", "Stripe", "635BFF", /\bstripe\b/i],
  ["wordpress", "WordPress", "21759B", /\bwordpress\b/i],
  ["shopify", "Shopify", "7AB55C", /\bshopify\b/i],
  ["firebase", "Firebase", "DD2C00", /\bfirebase\b/i],
  ["netlify", "Netlify", "00C7B7", /\bnetlify\b/i],
  ["vercel", "Vercel", "000000", /\bvercel\b/i],
  ["letsencrypt", "Let's Encrypt", "003A70", /\blet'?s encrypt\b/i],
  ["mdnwebdocs", "MDN Web Docs", "000000", /\bMDN\b/],
  ["html5", "HTML5", "E34F26", /\bHTML5?\b/],
  ["javascript", "JavaScript", "F7DF1E", /\bjavascript\b/i],
  ["css", "CSS", "663399", /\bCSS\b/]
].map(([slug, name, hex, re]) => ({ slug, name, hex, re }));

// Where the clips and posts go out, in the order the end card lists them; Threads, Bluesky and Mastodon through
// scripts/open-social-queue.js.
const NETWORKS = [["youtube", "YouTube", "FF0000"], ["tiktok", "TikTok", "000000"], ["instagram", "Instagram", "FF0069"],
  ["threads", "Threads", "000000"], ["linkedin", "LinkedIn", "0A66C2"], ["x", "X", "000000"], ["facebook", "Facebook", "0866FF"],
  ["bluesky", "Bluesky", "1185FE"], ["mastodon", "Mastodon", "6364FF"]];
const HANDLE = "@qalaburlreview";

const paths = {};
function mark(slug, name, hex) {
  if (!paths[slug]) paths[slug] = fs.readFileSync(path.join(DIR, slug + ".svg"), "utf8").match(/<path d="([^"]+)"/)[1];
  return { slug, name, hex: "#" + hex, d: paths[slug] };
}

// The English copy is read, so a translated clip shows the same marks. A code line naming a header is not a brand.
function brandsIn(tip, most = 3) {
  const v = tip.visual || {};
  const text = [].concat(tip.title || [], tip.body || "", tip.action || "", tip.say || "", tip.more || "", v.note || "", v.caption || "").join(" ");
  const found = [];
  for (const b of BRANDS) {
    if (found.length >= most || !b.re.test(text)) continue;
    if (b.slug === "google" && found.some((f) => f.slug.startsWith("google"))) continue;
    found.push(mark(b.slug, b.name, b.hex));
  }
  return found;
}

function networks() { return NETWORKS.map(([slug, name, hex]) => mark(slug, name, hex)); }

module.exports = { brandsIn, networks, HANDLE };
