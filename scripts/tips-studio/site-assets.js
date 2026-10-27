/* What a real-run post shows of the site it reviews: the site's own icon, its home page on a phone for the hook's
   mini clip, and where its score lands among every published Live Report. Each is read once per host into
   previews/site-assets (git-ignored); a site that cannot be read simply goes without, and the clip still renders. */

const fs = require("fs");
const path = require("path");
const { iconData } = require("../../functions/url-review-core");
const live = require("../build-live-reports");

const ROOT = path.resolve(__dirname, "../..");
const CACHE = path.join(ROOT, "previews/site-assets");
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const bare = (host) => String(host || "").toLowerCase().replace(/^www\./, "");
const cacheFile = (host, ext) => path.join(CACHE, bare(host).replace(/[^a-z0-9.-]+/g, "-") + ext);

const attr = (tag, name) => ((tag.match(new RegExp("\\s" + name + "\\s*=\\s*(\"[^\"]*\"|'[^']*'|[^\\s>]+)", "i")) || [])[1] || "").replace(/^["']|["']$/g, "");

// The sharpest square icon the home page names: an SVG, then the largest apple-touch-icon or sized PNG, then
// whatever icon it lists, then the two conventional paths.
function iconCandidates(html, base) {
  const out = [];
  for (const tag of html.match(/<link\b[^>]*>/gi) || []) {
    const rel = attr(tag, "rel").toLowerCase();
    const href = attr(tag, "href");
    if (!href || !/(^|\s)(icon|shortcut icon|apple-touch-icon|apple-touch-icon-precomposed|mask-icon)(\s|$)/.test(rel) || /^data:/i.test(href)) continue;
    if (rel === "mask-icon") continue;
    const size = Math.max(0, ...attr(tag, "sizes").split(/\s+/).map((s) => parseInt(s, 10) || 0));
    const svg = /\.svg(\?|$)/i.test(href) || /svg/i.test(attr(tag, "type"));
    const score = svg ? 1000 : rel.startsWith("apple-touch-icon") ? 500 + (size || 180) : size ? size * 2 : 50;
    try { out.push({ url: new URL(href, base).toString(), score }); } catch (e) { /* not a URL */ }
  }
  out.push({ url: new URL("/apple-touch-icon.png", base).toString(), score: 40 }, { url: new URL("/favicon.ico", base).toString(), score: 10 });
  return out.sort((a, b) => b.score - a.score).filter((c, i, all) => all.findIndex((o) => o.url === c.url) === i);
}

async function homePage(host) {
  const res = await fetch("https://" + host + "/", { headers: { "user-agent": UA, accept: "text/html" }, redirect: "follow", signal: AbortSignal.timeout(12000) });
  const html = (await res.text()).slice(0, 400000);
  return { html, base: res.url || "https://" + host + "/" };
}

async function siteLogo(host) {
  if (!host) return "";
  const file = cacheFile(host, ".logo.txt");
  if (fs.existsSync(file)) return fs.readFileSync(file, "utf8");
  let src = "";
  try {
    const { html, base } = await homePage(host);
    for (const c of iconCandidates(html, base).slice(0, 6)) { src = await iconData(c.url); if (src) break; }
  } catch (error) {
    src = await iconData("https://" + host + "/favicon.ico").catch(() => "");
  }
  fs.mkdirSync(CACHE, { recursive: true });
  fs.writeFileSync(file, src);
  return src;
}

// The home page as a phone shows it, long enough to scroll through in the hook. Consent banners stay: that is
// what a visitor sees first.
async function siteShot(browser, host) {
  if (!host) return "";
  const file = cacheFile(host, ".shot.jpg");
  const miss = cacheFile(host, ".shot.miss");
  if (fs.existsSync(file)) return file;
  if (fs.existsSync(miss)) return "";
  fs.mkdirSync(CACHE, { recursive: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1.25, isMobile: true, hasTouch: true, userAgent: UA.replace("Macintosh; Intel Mac OS X 10_15_7", "iPhone; CPU iPhone OS 18_0 like Mac OS X").replace("Safari/537.36", "Mobile Safari/537.36") });
  try {
    const page = await context.newPage();
    await page.goto("https://" + host + "/", { waitUntil: "load", timeout: 25000 });
    await page.waitForTimeout(1500);
    const height = Math.min(2600, await page.evaluate(() => document.documentElement.scrollHeight));
    await page.screenshot({ path: file, type: "jpeg", quality: 78, clip: { x: 0, y: 0, width: 390, height: Math.max(844, height) }, fullPage: true });
    return file;
  } catch (error) {
    fs.writeFileSync(miss, String(error.message || error).slice(0, 300));
    return "";
  } finally {
    await context.close();
  }
}

// Every published Live Report's overall score in ten bands, and the share of other sites this one beats.
let cards = null;
function bench(host, overall) {
  if (typeof overall !== "number") return null;
  cards = cards || live.existingItems().map((x) => x.card).filter((c) => typeof c.overall === "number");
  const others = cards.filter((c) => bare(c.host) !== bare(host));
  if (others.length < 30) return null;
  const bins = Array.from({ length: 10 }, (_, i) => others.filter((c) => Math.min(9, Math.floor(c.overall / 10)) === i).length);
  return { n: others.length, pct: Math.round(100 * others.filter((c) => c.overall < overall).length / others.length), bins, overall };
}

module.exports = { siteLogo, siteShot, bench, bare, iconCandidates };
