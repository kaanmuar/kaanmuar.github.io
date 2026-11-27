import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(dir, "review");
const html = path.join(dir, "share-card.html");
await mkdir(out, { recursive: true });

const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({
  viewport: { width: 900, height: 1200 },
  deviceScaleFactor: 2
});
await page.goto("file://" + html, { waitUntil: "networkidle" });
await page.waitForTimeout(800);

await page.screenshot({ path: path.join(out, "share-card-both.png"), fullPage: true });

const victory = page.locator("#card-victory");
const defeat = page.locator("#card-defeat");
await victory.screenshot({ path: path.join(out, "share-card-victory.png") });
await defeat.screenshot({ path: path.join(out, "share-card-defeat.png") });

await browser.close();
console.log("wrote", out);