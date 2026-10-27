#!/usr/bin/env node
/* Renders the QA-lab URL Review profile kit in the Fusion look: avatars, banners and covers for X, LinkedIn,
   YouTube, TikTok, Instagram, Reddit and Facebook, plus a contact sheet of the whole kit.

     node scripts/brand-kit/build.js [--batch brand-kit-2026-10]

   Writes media/<batch>/<network>/*, kit.json, index.html and contact-sheet.jpg. The Reddit banner and the Facebook
   cover come from scripts/reddit-studio and scripts/facebook-studio, which also check the profile copy, so they stay
   in media/reddit and media/facebook; the kit runs those builders and shows their files. Backdrops are live Fusion
   frames (designs/3d/fx.js), so the run needs WebGL2. Nothing is uploaded. */

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const sharp = require("sharp");
const fusion = require("../fusion/still");

const ROOT = fusion.ROOT;
const argv = process.argv.slice(2);
const batchAt = argv.indexOf("--batch");
const BATCH = batchAt >= 0 && argv[batchAt + 1] ? argv[batchAt + 1] : "brand-kit-2026-10";
const OUT = path.join(ROOT, "media", BATCH);

const THEMES = [
  { id: "reports", label: "Live Reports", icon: "reports", accent: "#7ef6fb" },
  { id: "tips", label: "Tips", icon: "tips", accent: "#e2c48a" },
  { id: "skits", label: "Skits", icon: "skits", accent: "#f39a8b" },
  { id: "runs", label: "Live runs", icon: "runs", accent: "#6fe3b1" },
  { id: "guide", label: "How it works", icon: "guide", accent: "#b9a8ff" }
];

// circle: the network crops the picture to a circle. fx: where the Fusion pyramid stands (see scripts/fusion/stage.js).
const KIT = [
  { network: "X", file: "x/avatar-400.jpg", w: 400, h: 400, kind: "avatar", circle: true, where: "Profile photo" },
  { network: "X", file: "x/header-1500x500.jpg", w: 1500, h: 500, kind: "header", fx: { subject: [0.95, 0], zoom: 1.5 }, where: "Header photo; the profile photo covers the lower left" },
  { network: "LinkedIn", file: "linkedin/logo-400.png", w: 400, h: 400, kind: "avatar", where: "Page logo" },
  { network: "LinkedIn", file: "linkedin/cover-1128x191@2x.jpg", w: 1128, h: 191, scale: 2, kind: "linkedin", where: "Page cover (Edit page > Header); the logo covers the lower left" },
  { network: "YouTube", file: "youtube/avatar-800.jpg", w: 800, h: 800, kind: "avatar", circle: true, where: "Channel picture" },
  { network: "YouTube", file: "youtube/banner-2560x1440.jpg", w: 2560, h: 1440, kind: "youtube", fx: { subject: [0.4, 0.02], zoom: 2.6 }, safe: [507, 508, 1546, 423], where: "Banner image; phones show only the outlined middle" },
  { network: "YouTube", file: "youtube/watermark-150.png", w: 150, h: 150, kind: "watermark", where: "Video watermark (Customization > Branding)" },
  { network: "TikTok", file: "tiktok/avatar-1080.jpg", w: 1080, h: 1080, kind: "avatar", circle: true, where: "Profile photo" },
  { network: "Instagram", file: "instagram/avatar-1080.jpg", w: 1080, h: 1080, kind: "avatar", circle: true, where: "Profile picture" },
  ...THEMES.map((theme) => ({ network: "Instagram", file: "instagram/highlight-" + theme.id + ".jpg", w: 1080, h: 1920, kind: "highlight", theme, fx: { subject: [0, 0.3], zoom: 2.4, t: 9.5 }, circle: "highlight", where: "Highlight cover: " + theme.label })),
  { network: "Reddit", file: "reddit/avatar-256.png", w: 256, h: 256, kind: "avatar", circle: true, where: "Avatar (u/qalaburlreview)" },
  { network: "Reddit", file: "media/reddit/profile-2026-10/banner.jpg", w: 1920, h: 384, studio: "reddit-studio", safe: [640, 0, 640, 384], where: "Banner; the copy stays in the middle third" },
  { network: "Facebook", file: "facebook/avatar-720.jpg", w: 720, h: 720, kind: "avatar", circle: true, where: "Profile picture" },
  { network: "Facebook", file: "media/facebook/page-2026-10/cover.jpg", w: 1640, h: 624, studio: "facebook-studio", safe: [265, 0, 1109, 624], where: "Cover photo; phones show only the outlined middle" }
];

const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
const own = (item) => !item.file.startsWith("media/");
const filePath = (item) => own(item) ? path.join(OUT, item.file) : path.join(ROOT, item.file);
const rel = (item) => path.relative(OUT, filePath(item));

async function save(png, item) {
  const file = filePath(item);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const out = file.endsWith(".png") ? await sharp(png).png({ compressionLevel: 9 }).toBuffer() : await sharp(png).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
  fs.writeFileSync(file, out);
  console.log(path.relative(ROOT, file).padEnd(52), (item.w * (item.scale || 1)) + "x" + (item.h * (item.scale || 1)), Math.round(out.length / 1024) + " KB");
}

function sheet(items) {
  const groups = [...new Set(items.map((i) => i.network))];
  const tile = (i) => {
    const width = i.w / i.h > 1.6 ? (i.w / i.h > 4 ? 1100 : 820) : Math.round((i.h > i.w ? 360 : 240) * i.w / i.h);
    const safe = i.safe ? '<i class="safe" style="left:' + (i.safe[0] / i.w * 100) + "%;top:" + (i.safe[1] / i.h * 100) + "%;width:" + (i.safe[2] / i.w * 100) + "%;height:" + (i.safe[3] / i.h * 100) + '%"></i>' : "";
    const ring = i.circle === "highlight" ? '<i class="ring hl"></i>' : i.circle ? '<i class="ring"></i>' : "";
    return '<figure style="width:' + width + 'px"><div class="pic"><img src="' + esc(rel(i)) + '" style="width:' + width + 'px" alt="">' + safe + ring + "</div><figcaption><b>" + esc(i.where) + "</b><span>" + (i.w * (i.scale || 1)) + "×" + (i.h * (i.scale || 1)) + " · " + esc(rel(i)) + "</span></figcaption></figure>";
  };
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>QA-lab URL Review profile kit</title>
<link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Inter:wght@400;600&family=Fira+Code:wght@400&display=block" rel="stylesheet">
<style>
  body { margin: 0; padding: 56px 64px 72px; width: 1800px; box-sizing: border-box; background: #071116; color: #f4fafb; font: 15px/1.4 Inter, sans-serif; }
  h1 { margin: 0; font: 400 56px/1 "Instrument Serif", serif; } h1 em { color: #7ef6fb; }
  .lede { margin: 10px 0 0; color: #9fb3b8; }
  h2 { margin: 44px 0 16px; font: 600 14px/1 Inter, sans-serif; letter-spacing: .18em; text-transform: uppercase; color: #e2c48a; }
  .row { display: flex; flex-wrap: wrap; gap: 24px; align-items: flex-start; }
  figure { margin: 0; }
  .pic { position: relative; display: inline-block; line-height: 0; border-radius: 10px; overflow: hidden; box-shadow: 0 0 0 1px rgba(126,246,251,.18); background: repeating-conic-gradient(#0d1b20 0 25%, #12242a 0 50%) 0 0 / 16px 16px; }
  .safe { position: absolute; outline: 2px dashed rgba(226,196,138,.9); outline-offset: -2px; }
  .ring { position: absolute; inset: 0; border-radius: 50%; box-shadow: 0 0 0 2px rgba(226,196,138,.9), 0 0 0 999px rgba(7,17,22,.55); }
  .ring.hl { inset: auto; left: 0; right: 0; top: 50%; aspect-ratio: 1; transform: translateY(-50%); }
  figcaption { margin-top: 10px; overflow-wrap: anywhere; } figcaption b { display: block; font-weight: 600; } figcaption span { font: 13px "Fira Code", monospace; color: #9fb3b8; }
</style></head><body>
<h1>QA-lab URL Review · <em>profile kit</em></h1>
<p class="lede">Fusion look, ${esc(BATCH)}. Rings show the circle crop; dashed boxes the area every screen shows. Built by scripts/brand-kit/build.js; nothing is uploaded.</p>
${groups.map((g) => "<h2>" + esc(g) + '</h2><div class="row">' + items.filter((i) => i.network === g).map(tile).join("") + "</div>").join("\n")}
</body></html>`;
}

async function main() {
  for (const studio of new Set(KIT.filter((i) => i.studio).map((i) => i.studio))) execFileSync(process.execPath, [path.join(ROOT, "scripts", studio, "build.js")], { stdio: "inherit" });

  fs.mkdirSync(OUT, { recursive: true });
  const browser = await fusion.launch();
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  await page.goto("file://" + path.join(__dirname, "frame.html"));
  const mark = { square: fusion.markUri(512, { square: true }), tile: fusion.markUri(512) };
  for (const item of KIT.filter(own)) {
    if (item.kind === "linkedin") {
      const li = await browser.newPage({ deviceScaleFactor: item.scale });
      await li.setViewportSize({ width: item.w, height: item.h });
      await li.goto("file://" + path.join(ROOT, "scripts/linkedin-studio/frame.html"));
      await li.evaluate(() => window.render({ kind: "cover", variant: "promise", data: {} }));
      await save(await li.locator("#c").screenshot({ scale: "device" }), item);
      await li.close();
      continue;
    }
    const bg = item.fx ? fusion.dataUri(await fusion.still(browser, Object.assign({ w: item.w, h: item.h, t: 6 }, item.fx))) : null;
    await page.setViewportSize({ width: item.w, height: item.h });
    await page.evaluate((spec) => window.paint(spec), { kind: item.kind, w: item.w, h: item.h, bg, theme: item.theme, mark: item.kind === "watermark" ? mark.tile : mark.square });
    await save(await page.locator("#c").screenshot({ omitBackground: item.kind === "watermark" }), item);
  }

  const manifest = KIT.map((i) => ({ network: i.network, where: i.where, file: path.relative(ROOT, filePath(i)), size: [i.w * (i.scale || 1), i.h * (i.scale || 1)] }));
  fs.writeFileSync(path.join(OUT, "kit.json"), JSON.stringify({ batch: BATCH, look: "Fusion (designs/3d)", files: manifest }, null, 2) + "\n");
  fs.writeFileSync(path.join(OUT, "index.html"), sheet(KIT));
  await page.setViewportSize({ width: 1800, height: 1000 });
  await page.goto("file://" + path.join(OUT, "index.html"));
  await page.evaluate(() => Promise.all([document.fonts.ready].concat(Array.from(document.images).map((img) => img.decode().catch(() => null)))));
  await sharp(await page.screenshot({ fullPage: true })).jpeg({ quality: 82, mozjpeg: true }).toFile(path.join(OUT, "contact-sheet.jpg"));
  console.log("wrote", path.relative(ROOT, path.join(OUT, "contact-sheet.jpg")));
  await browser.close();
}

main().catch((error) => { console.error(error); process.exit(1); });
