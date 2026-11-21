#!/usr/bin/env node
/* Record a draft of the review arena fed with real review log lines.
   node scripts/review-arena-record.js <lab|console> <run|detour|stop> <out.mp4> [port]
   Needs: python3 scripts/static-server.py <port> running, ffmpeg on PATH. */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');

const [skin, scenario, out, portArg] = process.argv.slice(2);
const port = Number(portArg || 8123);
const TERMS = fs.readFileSync(path.join(__dirname, '../js/qa-review.js'), 'utf8').match(/TERMS_VERSION = "([^"]+)"/)[1];

const FRONT = [
  [700, 'Checking the fields.'],
  [900, 'Checking that the address is public https.'],
  [900, 'Opening the first page.'],
  [1000, 'The server sent its certificate and the chain was verified.'],
  [800, 'First page answered with 200 in 0.4 s.'],
  [900, 'Checking robots.txt.'],
  [1000, 'robots.txt was checked.'],
  [900, 'In the background: crawl, security, mail, DNS and web risk reads.'],
  [1100, '12 same-host links were listed. This review opens at most 5 HTML pages and 2 links deep.']
];
const BROWSER = [
  [900, 'Opening the start page in a headless browser.']
];
const MIDDLE = [
  [900, "Google's Safe Browsing lists do not flag example.com."],
  [700, 'Spam blocklists: not listed on 24 lists.'],
  [700, 'Lookalike domains: 3 checked, none registered.'],
  [700, 'WordPress was not detected.'],
  [700, 'DNS for example.com has SPF, DKIM and DMARC.'],
  [800, 'Hacked-site checks: no exposed files.'],
  [700, 'Not on any phishing or malware list (URLHAUS, PHISHSTATS).'],
  [900, '3 pages checked with axe-core.'],
  [800, "The cookie banner's reject button works."],
  [900, 'The browser pass finished.'],
  [900, 'Asking PageSpeed Insights for the speed lab data.'],
  [1100, 'PageSpeed Insights answered.'],
  [900, 'Proposed 4 watch cases.'],
  [900, 'Scoring the checks.'],
  [1000, 'Scored 42 checks.'],
  [900, 'Signed the report.'],
  [800, 'Saving the report.'],
  [1000, 'Report saved.']
];
const DETOUR = [
  [1200, 'Waiting for the headless browser (20s).'],
  [1800, 'Attempt 2 of the browser pass started.'],
  [1600, 'The lookalike domain check did not finish in time.'],
  [1800, 'PageSpeed Insights did not answer.']
];

const plan = {
  run: { script: FRONT.concat(BROWSER, MIDDLE), end: 'ready' },
  detour: {
    script: FRONT.concat(BROWSER, DETOUR.slice(0, 3), MIDDLE.slice(0, 9), [[900, 'The browser pass finished.']], [[900, 'Asking PageSpeed Insights for the speed lab data.']], DETOUR.slice(3), MIDDLE.slice(12)),
    end: 'ready'
  },
  stop: { script: FRONT.concat(BROWSER, [[1200, 'Stop requested.'], [1200, 'Stopped. The report keeps what was read so far.']]), end: 'stopped' }
}[scenario];

(async () => {
  const dir = fs.mkdtempSync('/tmp/arena-rec-');
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, recordVideo: { dir, size: { width: 1280, height: 720 } } });
  await ctx.addInitScript(({ version, skin }) => {
    try {
      sessionStorage.setItem('qa-review-terms', version);
      localStorage.setItem('hasSeenReviewTour', 'true');
      localStorage.setItem('qa-review-analytics', 'necessary');
      sessionStorage.setItem('qa-review-arena-skin', skin);
    } catch (e) { /* optional */ }
  }, { version: TERMS, skin });
  const page = await ctx.newPage();
  await page.route(/\/news\?/, (r) => r.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"items":[]}' }));
  await page.route(/ipwho\.is/, (r) => r.fulfill({ contentType: 'application/json', body: '{"success":false}' }));
  await page.goto(`http://127.0.0.1:${port}/qa-review.html`);
  await page.evaluate(() => ReviewProgress.start({ host: 'example.com', pages: 5 }));
  await page.waitForSelector('.ra-canvas');
  await page.waitForFunction(() => window.ReviewArena.snapshot().ready, null, { timeout: 15000 });
  await page.evaluate(() => document.body.appendChild(document.querySelector('.ra')));
  await page.addStyleTag({ content: '.ra{position:fixed!important;left:0;top:0;width:1280px!important;margin:0!important;z-index:2147483647;border:0!important;border-radius:0!important}' });
  await page.waitForTimeout(400);
  const box = await page.locator('.ra-canvas').boundingBox();
  await page.waitForTimeout(1500);
  const t0 = Date.now();
  for (const [wait, text] of plan.script) {
    await page.waitForTimeout(wait);
    await page.evaluate((t) => ReviewProgress.line(t), text);
  }
  await page.waitForTimeout(1200);
  await page.evaluate((s) => ReviewProgress.finish(s), plan.end);
  await page.waitForTimeout(4200);
  const video = page.video();
  await ctx.close();
  await browser.close();
  const raw = await video.path();
  const crop = `crop=${Math.round(box.width)}:${Math.round(box.height)}:${Math.round(box.x)}:${Math.round(box.y)},scale=1280:720`;
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', raw, '-vf', crop + ',fps=30', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-movflags', '+faststart', out]);
  console.log(out, ((Date.now() - t0) / 1000).toFixed(1) + 's', box);
})();
