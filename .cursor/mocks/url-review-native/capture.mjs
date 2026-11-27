import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(dir, "review");
const indexHtml = path.join(dir, "index.html");
const motionHtml = path.join(dir, "motion.html");
await mkdir(out, { recursive: true });

const browser = await chromium.launch({ channel: "chrome" });

const page = await browser.newPage({ viewport: { width: 1280, height: 2400 }, deviceScaleFactor: 2 });
await page.goto("file://" + indexHtml, { waitUntil: "networkidle" });
await page.waitForTimeout(800);
await page.screenshot({ path: path.join(out, "native-shells-deck-1280.png"), fullPage: true });

async function deviceShot(name, selector) {
  const el = page.locator(selector);
  await el.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await el.screenshot({ path: path.join(out, name) });
}

await deviceShot("native-ios-report-390.png", "#ios-report");
await deviceShot("native-android-report-390.png", "#and-report");
await page.close();

const webmDir = path.join(out, "motion-raw");
await rm(webmDir, { recursive: true, force: true });
await mkdir(webmDir, { recursive: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  recordVideo: { dir: webmDir, size: { width: 390, height: 844 } }
});
const motionPage = await context.newPage();
await motionPage.goto("file://" + motionHtml, { waitUntil: "networkidle" });
await motionPage.waitForTimeout(500);
await motionPage.screenshot({ path: path.join(out, "native-shell-tour-still.png") });
await motionPage.waitForTimeout(9500);
await context.close();

const files = await readdir(webmDir);
const webm = files.find((f) => f.endsWith(".webm"));
if (webm) {
  const mp4 = path.join(out, "native-shell-tour.mp4");
  await new Promise((resolve, reject) => {
    const ff = spawn("ffmpeg", [
      "-y", "-i", path.join(webmDir, webm),
      "-c:v", "libx264", "-pix_fmt", "yuv420p", "-an",
      "-movflags", "+faststart", mp4
    ], { stdio: "inherit" });
    ff.on("exit", (code) => (code === 0 ? resolve() : reject(new Error("ffmpeg " + code))));
  });
  console.log("wrote", mp4);
}

await browser.close();
console.log("wrote", out);