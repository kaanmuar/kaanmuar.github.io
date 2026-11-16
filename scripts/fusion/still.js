/* Renders Fusion frames (designs/3d/fx.js) to PNG for the share cards, the studio backdrops and the brand kit.

     const fusion = require("./scripts/fusion/still");
     const browser = await fusion.launch();
     const png = await fusion.still(browser, { w: 1200, h: 630, subject: [0.44, -0.02], zoom: 1.4, t: 6 });

   The engine is an ES module, which Chromium will not import from file://, so the repo is served to the page
   from a made-up origin through page.route. */

const fs = require("fs");
const path = require("path");
require("../playwright-sandbox");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "../..");
const ORIGIN = "http://fusion.local";
const TYPES = { ".js": "text/javascript", ".html": "text/html", ".svg": "image/svg+xml", ".css": "text/css", ".png": "image/png", ".jpg": "image/jpeg", ".json": "application/json" };
const FULL_MARK = "designs/3d/icon/qa-review-mark-fusion.svg";
const SMALL_MARK = "designs/3d/icon/qa-review-mark-fusion-small.svg";

// Without a GPU the fusion shader falls back to SwiftShader and a 2560x1440 frame takes minutes.
function launch() {
  const args = process.platform === "darwin" ? ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] : ["--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"];
  return chromium.launch({ args });
}

async function serve(page) {
  await page.route(ORIGIN + "/**", (route) => {
    const rel = decodeURIComponent(new URL(route.request().url()).pathname).replace(/^\/+/, "");
    if (!rel) return route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><html><body></body></html>" });
    const file = path.join(ROOT, rel);
    if (!file.startsWith(ROOT) || !fs.existsSync(file)) return route.fulfill({ status: 404, body: "" });
    route.fulfill({ status: 200, contentType: TYPES[path.extname(file)] || "application/octet-stream", body: fs.readFileSync(file) });
  });
  await page.goto(ORIGIN + "/");
}

let shared = null;
async function enginePage(browser) {
  if (shared && shared.browser === browser && !shared.page.isClosed()) return shared.page;
  const page = await browser.newPage();
  await serve(page);
  shared = { browser, page };
  return page;
}

// One frame as a PNG buffer. mode 1 is the banner look; mode 2 the dimmed section background.
async function still(browser, { w, h, mode = 1, subject = [0, 0], zoom = 1, t = 6 }) {
  const page = await enginePage(browser);
  const url = await page.evaluate(async ([w, h, mode, subject, zoom, t]) => {
    const { still } = await import("/designs/3d/fx.js");
    const c = still("fusion", w, h, { mode, subject, zoom }, t);
    const gl = c.getContext("webgl2");
    if (!gl) throw new Error("no WebGL2");
    const out = c.toDataURL("image/png");
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return out;
  }, [w, h, mode, subject, zoom, t]);
  return Buffer.from(url.split(",")[1], "base64");
}

function dataUri(buffer, type = "image/png") {
  return "data:" + type + ";base64," + buffer.toString("base64");
}

function markSvg(px, { square = false } = {}) {
  const svg = fs.readFileSync(path.join(ROOT, px < 48 ? SMALL_MARK : FULL_MARK), "utf8");
  // square: full bleed, without the rounded tile edge, for networks that crop avatars to a circle.
  return square ? svg.replace(/(<clipPath id="tile"><rect [^>]*?)rx="\d+"/, "$1rx=\"0\"").replace(/\s*<rect [^>]*fill="none"[^>]*\/>/, "") : svg;
}

function markUri(px, opts) {
  return "data:image/svg+xml;base64," + Buffer.from(markSvg(px, opts)).toString("base64");
}

module.exports = { ROOT, ORIGIN, FULL_MARK, SMALL_MARK, launch, serve, still, dataUri, markSvg, markUri };
