import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(dir, "review");
const html = path.join(dir, "share-card.html");
await mkdir(out, { recursive: true });

async function webmToMp4(webmPath, mp4Path) {
  await new Promise((resolve, reject) => {
    const ff = spawn(
      "ffmpeg",
      ["-y", "-i", webmPath, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-an", "-movflags", "+faststart", mp4Path],
      { stdio: "inherit" }
    );
    ff.on("exit", (code) => (code === 0 ? resolve() : reject(new Error("ffmpeg " + code))));
  });
}

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
await page.close();

const webmDir = path.join(out, "share-card-motion-raw");
await rm(webmDir, { recursive: true, force: true });
await mkdir(webmDir, { recursive: true });
const size = { width: 390, height: 720 };
const context = await browser.newContext({
  viewport: size,
  deviceScaleFactor: 2,
  recordVideo: { dir: webmDir, size }
});
const clipPage = await context.newPage();
await clipPage.goto("file://" + html, { waitUntil: "networkidle" });
await clipPage.evaluate(() => {
  const v = document.getElementById("card-victory");
  const d = document.getElementById("card-defeat");
  if (d) d.remove();
  if (v) v.scrollIntoView({ block: "start" });
});
await clipPage.waitForTimeout(3200);
await context.close();

const files = await readdir(webmDir);
const webm = files.find((f) => f.endsWith(".webm"));
if (webm) {
  const mp4 = path.join(out, "share-card-motion.mp4");
  await webmToMp4(path.join(webmDir, webm), mp4);
  console.log("wrote", mp4);
}

await browser.close();
console.log("wrote", out);