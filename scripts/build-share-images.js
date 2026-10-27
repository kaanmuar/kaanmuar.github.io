#!/usr/bin/env node
/* Render the share cards and app icons the pages point at.

     node scripts/build-share-images.js            # every card and icon
     node scripts/build-share-images.js social     # only the outputs whose path contains "social"
     node scripts/build-share-images.js qa-review  # the URL Review cards and logo

   Share cards are 1200x630 JPEGs under assets/share/; WhatsApp drops previews over
   about 300 KB, which PNG cards exceed. The URL Review cards sit on a Fusion frame
   (designs/3d/fx.js), so the run needs WebGL2. Icons are written next to the files that
   reference them: apple-touch-icon.png and favicon.ico at the root (browsers ask for
   both there), app icons and the URL Review logo under assets/. Fonts load from
   Google Fonts, so the run needs network access. */

const fs = require("fs");
const path = require("path");
const fusion = require("./fusion/still");

const ROOT = path.resolve(__dirname, "..");
const FONTS = "https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Inter:wght@400;600;700&family=Fira+Code:wght@500&family=Source+Serif+4:opsz,wght@8..60,600;8..60,700&display=block";

function dataUri(file) {
  const ext = path.extname(file).slice(1).replace("jpg", "jpeg").replace("svg", "svg+xml");
  return "data:image/" + ext + ";base64," + fs.readFileSync(path.join(ROOT, file)).toString("base64");
}

function card({ eyebrow, title, em, sub, art, size = 84 }) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><link rel="stylesheet" href="${FONTS}"><style>
  * { box-sizing: border-box; margin: 0; }
  body { width: 1200px; height: 630px; overflow: hidden; font-family: Inter, sans-serif; color: #12181f;
    background: radial-gradient(900px 600px at 0% 0%, #2d7c83 0%, #3f8c92 30%, rgba(238,242,244,0) 62%), linear-gradient(90deg, #3a858b 0%, #c9d6d6 46%, #f2f1ec 62%, #e3eeea 100%); }
  .art { position: absolute; left: 64px; top: 52px; width: 268px; height: 526px; border-radius: 34px;
    background: linear-gradient(180deg, #3c7f86 0%, #0f6a72 40%, #0c8a92 100%); box-shadow: 0 30px 60px rgba(8,40,44,.35);
    display: grid; place-items: center; overflow: hidden; }
  .copy { position: absolute; left: 392px; right: 56px; top: 0; bottom: 0; display: flex; flex-direction: column; justify-content: center; }
  .eyebrow { font-size: 21px; letter-spacing: .06em; text-transform: uppercase; color: #0d6e76; margin-bottom: 26px; }
  h1 { font-family: "Source Serif 4", Georgia, serif; font-weight: 700; font-size: ${size}px; line-height: .98; letter-spacing: -.02em; color: #12181f; text-shadow: 0 6px 18px rgba(0,0,0,.12); }
  h1 em { display: block; font-style: normal; color: #0d7d85; }
  .sub { font-family: "Instrument Serif", Georgia, serif; font-style: italic; font-size: 38px; color: #1e2b33; margin-top: 34px; line-height: 1.15; }
  .domain { font-size: 20px; color: #0d6e76; margin-top: 44px; }
  </style></head><body><div class="art">${art}</div><div class="copy">
  <p class="eyebrow">${eyebrow}</p><h1>${title}<em>${em}</em></h1><p class="sub">${sub}</p><p class="domain">carlosandmunoz.com</p>
  </div></body></html>`;
}

// URL Review cards: a Fusion frame with the pyramid on the right, the copy on a dark fade on the left.
// lines: [text, emphasis]; the emphasis line is the cyan italic one.
const FUSION_OG = { w: 1200, h: 630, subject: [0.44, -0.02], zoom: 1.4 };
function fusionCard({ eyebrow, lines, sub, url, size = 70, t = 6 }) {
  return { t, html: (bg) => `<!DOCTYPE html><html><head><meta charset="utf-8"><link rel="stylesheet" href="${FONTS}"><style>
  * { box-sizing: border-box; margin: 0; }
  body { width: 1200px; height: 630px; overflow: hidden; position: relative; font-family: Inter, sans-serif; color: #f4fafb; background: #071116 url(${bg}) center / cover no-repeat; }
  .shade { position: absolute; inset: 0; background: linear-gradient(90deg, rgba(7,17,22,.92) 0%, rgba(7,17,22,.8) 34%, rgba(7,17,22,.35) 56%, rgba(7,17,22,0) 70%), linear-gradient(0deg, rgba(7,17,22,.55), rgba(7,17,22,0) 26%); }
  .brand { position: absolute; left: 72px; top: 54px; display: flex; align-items: center; gap: 18px; }
  .brand img { width: 64px; height: 64px; filter: drop-shadow(0 8px 22px rgba(77,179,187,.35)); }
  .brand b { display: block; font: 400 38px/1 "Instrument Serif", Georgia, serif; }
  .brand small { display: block; margin-top: 6px; font: 600 12.5px/1 Inter, sans-serif; letter-spacing: .2em; color: #9fb3b8; }
  .copy { position: absolute; left: 72px; width: 620px; top: 158px; bottom: 112px; display: flex; flex-direction: column; justify-content: center; }
  .eyebrow { font: 600 16px/1 Inter, sans-serif; letter-spacing: .16em; text-transform: uppercase; color: #e2c48a; margin-bottom: 22px; }
  h1 { font: 400 ${size}px/1 "Instrument Serif", Georgia, serif; letter-spacing: -.01em; text-shadow: 0 4px 24px rgba(7,17,22,.6); }
  h1 span { display: block; }
  h1 em { display: block; font-style: italic; color: #7ef6fb; }
  .sub { margin-top: 22px; font-size: 22px; line-height: 1.38; color: #cfe0e3; max-width: 540px; }
  .url { position: absolute; left: 72px; bottom: 56px; font: 500 20px/1 "Fira Code", monospace; color: #7ef6fb; }
  </style></head><body><div class="shade"></div>
  <div class="brand"><img src="${fusion.markUri(64)}" alt=""><div><b>QA-lab</b><small>URL REVIEW</small></div></div>
  <div class="copy"><p class="eyebrow">${eyebrow}</p><h1>${lines.map(([text, em]) => em ? `<em>${text}</em>` : `<span>${text}</span>`).join("")}</h1>${sub ? `<p class="sub">${sub}</p>` : ""}</div>
  <p class="url">${url}</p>
  </body></html>` };
}

const FRAMEWORKS = ["playwright.svg", "cypress.svg", "robot.svg", "selenium.svg", "webdriverio.svg", "k6.svg", "jest.svg", "appium.svg", "cucumber.svg", "jmeter.svg", "vitest.svg", "gatling.svg"];

const CARDS = {
  "assets/share/cv.jpg": card({
    eyebrow: "Interactive CV",
    title: "Carlos A. Muñoz",
    em: "QA Architect.",
    sub: "Contract, advisory, and a full QA path. Over 18 years.",
    art: `<div style="text-align:center"><img src="${dataUri("assets/profile.jpg")}" style="width:190px;height:190px;border-radius:50%;object-fit:cover;border:6px solid #f4efe4;box-shadow:0 14px 34px rgba(0,0,0,.3)"><p style="color:#e9fdff;font:700 15px Inter;letter-spacing:.14em;margin-top:26px">CSPM · ISTQB<br>CISA · CISSP</p></div>`
  }),
  "assets/share/qa-lab.jpg": card({
    eyebrow: "Free QA regression lab",
    title: "20 frameworks.",
    em: "One live CV.",
    sub: "Playwright, Cypress, Robot, Selenium, k6, and more, run in the browser.",
    art: '<div style="display:grid;grid-template-columns:repeat(3,64px);gap:20px">' + FRAMEWORKS.map((f) => `<div style="width:64px;height:64px;border-radius:16px;background:#f4efe4;display:grid;place-items:center;box-shadow:0 8px 18px rgba(0,0,0,.2)"><img src="${dataUri("assets/frameworks/" + f)}" style="width:40px;height:40px;object-fit:contain"></div>`).join("") + "</div>"
  }),
  "assets/share/sdlc-studio.jpg": card({
    eyebrow: "Free SDLC studio",
    title: "Four agents.",
    em: "One sprint.",
    sub: "Jira story, Gherkin and Xray cases, Playwright, Cypress, and Robot scripts.",
    art: '<div style="display:flex;flex-direction:column;gap:16px;width:200px">' + [["Ticket Steward", "#e2c48a"], ["Test Designer", "#7ef6fb"], ["Automation Engineer", "#6fd3a0"], ["Release Verifier", "#f4efe4"]].map(([name, tone], i) => `<div style="display:flex;align-items:center;gap:12px;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.25);border-radius:14px;padding:14px 12px;color:#e9fdff;font:600 15px Inter"><span style="width:30px;height:30px;border-radius:50%;background:${tone};color:#10363a;display:grid;place-items:center;font-weight:700">${i + 1}</span>${name}</div>`).join("") + "</div>"
  }),
  "assets/share/qa-review.jpg": fusionCard({
    eyebrow: "Privacy · Accessibility · Security",
    lines: [["Find the leaks,"], ["breaks and blocks", true], ["before customers"], ["or regulators do."]],
    url: "carlosandmunoz.com/qa-review",
    size: 66
  }),
  "assets/share/qa-review-guide.jpg": fusionCard({
    eyebrow: "Guided tour",
    lines: [["Here is how"], ["we listen.", true]],
    sub: "Six steps, six scores, and what a review never does.",
    url: "carlosandmunoz.com/qa-review-guide",
    size: 84,
    t: 9.5
  }),
  "assets/share/qa-review-pay.jpg": fusionCard({
    eyebrow: "Payment",
    lines: [["Pay through PayPal,"], ["see the amount first.", true]],
    sub: "The total shows before you confirm. Card numbers are entered on PayPal, never here.",
    url: "carlosandmunoz.com/qa-review-pay",
    size: 72,
    t: 13
  })
};

// The social hub's card, one per language.
const HUB = require("./social-hub/copy");
Object.keys(HUB.LANGS).forEach((lang) => {
  const { title, em, sub } = HUB.COPY[lang].card;
  CARDS["assets/share/qa-review-social" + (lang === "en" ? "" : "-" + lang) + ".jpg"] = fusionCard({
    eyebrow: "Social", lines: [[title], [em, true]], sub, url: "carlosandmunoz.com/qa-review-social",
    size: Math.max(title.length, em.length) > 18 ? 66 : 84, t: 3
  });
});

function icon(svgFile, size, maskable) {
  const svg = svgFile.startsWith("<") ? svgFile : fs.readFileSync(path.join(ROOT, svgFile), "utf8");
  const inner = maskable
    ? `<div style="width:${size}px;height:${size}px;background:#0d6e76;display:grid;place-items:center"><div style="width:${size * 0.72}px;height:${size * 0.72}px">${svg.replace(/rx="14"/, 'rx="0"')}</div></div>`
    : `<div style="width:${size}px;height:${size}px">${svg}</div>`;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><link rel="stylesheet" href="${FONTS}"><style>* { margin: 0; } body { width: ${size}px; height: ${size}px; background: transparent; } svg { width: 100%; height: 100%; display: block; }</style></head><body>${inner}</body></html>`;
}

const ICONS = [
  ["apple-touch-icon.png", "favicon.svg", 180, true],
  ["assets/app-icon-192.png", "favicon.svg", 192, false],
  ["assets/app-icon-512.png", "favicon.svg", 512, false],
  ["assets/app-icon-maskable-512.png", "favicon.svg", 512, true],
  ["assets/qa-review-logo.png", fusion.markSvg(512, { square: true }), 512, false]
];

function ico(pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  let offset = 6 + 16 * pngs.length;
  const entries = pngs.map(([size, data]) => {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size, 0);
    entry.writeUInt8(size, 1);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += data.length;
    return entry;
  });
  return Buffer.concat([header, ...entries, ...pngs.map(([, data]) => data)]);
}

async function main() {
  const only = process.argv[2];
  const browser = await fusion.launch();
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  const frames = {};
  const frame = async (t) => frames[t] || (frames[t] = fusion.dataUri(await fusion.still(browser, Object.assign({ t }, FUSION_OG))));
  async function shoot(html, width, height, out, transparent) {
    await page.setViewportSize({ width, height });
    await page.setContent(html, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    const jpeg = !!out && out.endsWith(".jpg");
    const buffer = await page.screenshot(Object.assign({ type: jpeg ? "jpeg" : "png", clip: { x: 0, y: 0, width, height } }, jpeg ? { quality: 86 } : { omitBackground: !!transparent }));
    if (out) {
      fs.mkdirSync(path.dirname(path.join(ROOT, out)), { recursive: true });
      fs.writeFileSync(path.join(ROOT, out), buffer);
      console.log("wrote", out, buffer.length, "bytes");
    }
    return buffer;
  }
  for (const [out, html] of Object.entries(CARDS)) if (!only || out.includes(only)) await shoot(typeof html === "string" ? html : html.html(await frame(html.t)), 1200, 630, out);
  for (const [out, svg, size, maskable] of ICONS) if (!only || out.includes(only)) await shoot(icon(svg, size, maskable), size, size, out, !maskable);
  if (only) return browser.close();
  const sizes = [16, 32, 48];
  const pngs = [];
  for (const size of sizes) pngs.push([size, await shoot(icon("favicon.svg", size, false), size, size, null, true)]);
  fs.writeFileSync(path.join(ROOT, "favicon.ico"), ico(pngs));
  console.log("wrote favicon.ico");
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
