import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(dir, "review");
const html = path.join(dir, "web-collapsed-teaser.html");
await mkdir(out, { recursive: true });

const browser = await chromium.launch({ channel: "chrome" });

async function shot(name, width, height, before) {
  const page = await browser.newPage({
    viewport: { width, height },
    deviceScaleFactor: 2
  });
  await page.goto("file://" + html, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  if (before) await before(page);
  await page.locator("#viewport-root").screenshot({
    path: path.join(out, name)
  });
  await page.close();
}

await shot("web-collapsed-teaser-desktop-1280.png", 1280, 900);
await shot("web-collapsed-teaser-phone-390.png", 390, 844);

await shot("web-collapsed-teaser-phone-checkout-390.png", 390, 844, async (page) => {
  await page.locator(".sec-row").first().click();
  await page.waitForTimeout(400);
});

await browser.close();
console.log("wrote", out);