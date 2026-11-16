#!/usr/bin/env node
/*
 * Usage: node scripts/record-media-clips.js [qa-lab-running|sdlc-studio-running|sdlc-studio-tour ...]
 *
 * Re-records the lab and studio clips in English with Playwright and writes
 * media/<name>.mp4 and media/<name>.jpg. With no names, records all three.
 * Needs ffmpeg on the PATH. Scratch webm files go to $TMPDIR/record-media-clips.
 * Prints the time of each action so the step list on media/<name>.html can follow the video.
 */
require('./playwright-sandbox');
const { chromium } = require('@playwright/test');
const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MEDIA = path.join(ROOT, 'media');
const SCRATCH = path.join(os.tmpdir(), 'record-media-clips');
const PORT = Number(process.env.CLIPS_PORT || 8791);
const BASE = `http://127.0.0.1:${PORT}`;
const SIZE = { width: 1280, height: 720 };
const BLOCKED = /translate\.google|translate\.googleapis|gstatic\.com\/_\/translate|googletagmanager|google-analytics|ipwho\.is/;

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function startServer() {
  const server = spawn('python3', [path.join('scripts', 'static-server.py'), String(PORT)], { cwd: ROOT, stdio: 'ignore' });
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(BASE + '/index.html');
      if (res.ok) return server;
    } catch (err) { /* not up yet */ }
    await pause(250);
  }
  server.kill();
  throw new Error('static server did not start on ' + BASE);
}

async function englishContext(browser, dir, { studioPace = 1, skipStudioTour = true, seed = 904 } = {}) {
  const context = await browser.newContext({
    viewport: SIZE,
    deviceScaleFactor: 1,
    locale: 'en-US',
    colorScheme: 'light',
    recordVideo: { dir, size: SIZE }
  });
  await context.route(BLOCKED, (route) => route.abort());
  await context.route(/127\.0\.0\.1:8770\//, (route) => route.abort());
  await context.addInitScript(({ studioPace, skipStudioTour, seed }) => {
    if (window === window.top) {
      // Same random picks on every take, so the step list on the clip page stays true.
      let s = seed >>> 0;
      Math.random = () => {
        s = (s + 0x6D2B79F5) >>> 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }
    try {
      // Once per tab: the lab's own checks change theme and language inside its frame.
      if (window !== window.top || sessionStorage.getItem('clips-ready')) return;
      sessionStorage.setItem('clips-ready', '1');
      document.cookie = 'googtrans=;path=/;max-age=0';
      localStorage.setItem('cv-preferred-lang', 'en');
      localStorage.setItem('theme', 'light');
      localStorage.setItem('site-analytics', 'necessary');
      localStorage.setItem('qa-review-analytics', 'necessary');
      localStorage.setItem('qa-lab-pace', '1');
      localStorage.setItem('lab-guide-seen', JSON.stringify(['1', '2', '3', '4', '5']));
      localStorage.setItem('qa-studio-pace', String(studioPace));
      localStorage.removeItem('site-translate');
      sessionStorage.setItem('hasSeenTour', 'true');
      sessionStorage.setItem('hasSeenLabTour', 'true');
      sessionStorage.setItem('qa-lab-fw-asked', '1');
      if (skipStudioTour) sessionStorage.setItem('hasSeenStudioTour', 'true');
      else {
        sessionStorage.removeItem('hasSeenStudioTour');
        localStorage.removeItem('hasSeenStudioTour');
      }
    } catch (err) { /* storage blocked */ }
  }, { studioPace, skipStudioTour, seed });
  return context;
}

function clock(t0) {
  const marks = [];
  const mark = (label) => {
    const s = (Date.now() - t0()) / 1000;
    marks.push([s, label]);
    console.log(`  ${s.toFixed(1).padStart(6)} s  ${label}`);
  };
  return { marks, mark };
}

async function assertEnglish(page) {
  const state = await page.evaluate(() => ({
    lang: document.documentElement.lang,
    translated: /translated/.test(document.documentElement.className) || !!document.querySelector('.goog-te-banner-frame, iframe.skiptranslate'),
    consent: (() => { const bar = document.getElementById('site-consent'); return !!bar && !bar.hidden; })()
  }));
  if (state.translated) throw new Error('Google Translate ran on ' + page.url());
  if (state.lang && !/^en/i.test(state.lang)) throw new Error('page language is ' + state.lang);
  if (state.consent) await page.locator('#site-consent .sc-keep').click();
}

async function qaLabRunning(page, mark) {
  await page.goto(BASE + '/qa-lab.html?lang=en');
  await page.locator('#run-all').waitFor({ state: 'visible' });
  await page.waitForFunction(() => document.querySelectorAll('#case-list .case-row, #case-list [data-id]').length > 0);
  await assertEnglish(page);
  const watch = page.locator('[data-view="watch"]');
  if ((await watch.getAttribute('aria-pressed')) !== 'true') await watch.click();
  mark('start: lab idle in Watch mode');
  await pause(2000);
  await page.locator('#run-all').click();
  mark('Run full catalog clicked');
  await page.locator('#runner-drawer.open').waitFor({ state: 'visible' });
  mark('Native runners panel open');
  const end = Date.now() + 53000;
  let last = '';
  while (Date.now() < end) {
    const now = await page.evaluate(() => {
      const pass = document.getElementById('kpi-pass');
      const fail = document.getElementById('kpi-fail');
      const head = document.getElementById('case-detail');
      return `${(head && head.textContent || '').trim().slice(0, 40)} | pass ${pass && pass.textContent} fail ${fail && fail.textContent}`;
    });
    if (now !== last) { mark(now); last = now; }
    await pause(1000);
  }
  const results = await page.evaluate(() => [...document.querySelectorAll('#run-log > div')]
    .map((row) => row.textContent.trim()).filter((text) => /^(PASS|FAIL) /.test(text)).map((text) => text.slice(0, 90)));
  results.forEach((line) => console.log('         ' + line));
  return { poster: 0.55 };
}

async function clickWhenReady(page, locator, mark, label, hold = 1200) {
  await locator.waitFor({ state: 'visible', timeout: 120000 });
  await page.waitForFunction((el) => el && !el.disabled, await locator.elementHandle(), { timeout: 120000 });
  await pause(hold);
  await locator.click();
  mark(label);
}

async function sdlcStudioRunning(page, mark) {
  await page.goto(BASE + '/simulador.html?lang=en');
  await page.locator('#runBtn').waitFor({ state: 'visible' });
  await assertEnglish(page);
  mark('start: studio board idle');
  await pause(1500);
  await page.locator('#runBtn').click();
  mark('Run 4-agent sprint clicked');
  await clickWhenReady(page, page.locator('button[data-board="jira"]'), mark, 'Use Jira');

  const handoff = page.locator('#handoffBtn');
  const accept = page.locator('#modal button.btn-accept', { hasText: 'Accept rewrite' });
  while (true) {
    const which = await page.waitForFunction(() => {
      if (document.getElementById('handoffBtn')) return 'handoff';
      const button = [...document.querySelectorAll('#modal button.btn-accept')].find((b) => /Accept rewrite/.test(b.textContent) && !b.disabled);
      return button ? 'accept' : false;
    }, null, { timeout: 180000, polling: 200 }).then((handle) => handle.jsonValue());
    if (which === 'handoff') break;
    await page.waitForFunction(() => /waiting for you: Accept rewrite/.test((document.getElementById('ticketConsole') || {}).textContent || ''), null, { timeout: 60000 });
    const key = await page.evaluate(() => { const m = (document.getElementById('modal').textContent || '').match(/\b[A-Z]+-\d+\b/); return m ? m[0] : ''; });
    await pause(1000);
    await accept.click();
    mark('Accept rewrite ' + key);
    await page.waitForFunction(() => !document.getElementById('overlay').classList.contains('show'), null, { timeout: 30000 });
  }
  await clickWhenReady(page, handoff, mark, 'Start Test Designer');
  await clickWhenReady(page, page.locator('button[data-tc-platform="xray"]'), mark, 'Use Xray');
  await page.waitForFunction(() => { const b = document.getElementById('approveTests'); return b && !b.disabled; }, null, { timeout: 240000 });
  await pause(1200);
  await page.locator('#approveTests').click();
  mark('Save the sprint set');
  await clickWhenReady(page, page.locator('#handoffBtn'), mark, 'Start Automation Engineer');
  await page.locator('#fwGo').waitFor({ state: 'visible' });
  await pause(800);
  for (const fw of ['Cypress', 'Robot']) {
    await page.locator(`[data-fw="${fw}"]`).uncheck();
    await pause(400);
  }
  await pause(600);
  await page.locator('#fwGo').click();
  mark('Run selected frameworks (Playwright)');
  await page.locator('#handoffBtn').waitFor({ state: 'visible', timeout: 240000 });
  mark('Automation Engineer finished');
  await pause(1500);
  if (await page.locator('#runner-drawer.open').count()) {
    await page.locator('#runner-close').click();
    mark('Runners panel closed');
  }
  await clickWhenReady(page, page.locator('#handoffBtn'), mark, 'Start Release Verifier', 1000);
  await page.waitForFunction(() => /waiting for you to tick every control/.test(document.body.innerText), null, { timeout: 120000 });
  await pause(800);
  const boxes = page.locator('#view label.check input[type="checkbox"]');
  for (let i = 0; i < await boxes.count(); i++) {
    await boxes.nth(i).check();
    await pause(450);
  }
  await pause(600);
  await page.locator('#view button', { hasText: 'Sign off increment' }).click();
  mark('Sign off increment');
  await page.waitForFunction(() => /Sprint 24 complete/.test(document.body.innerText), null, { timeout: 60000 });
  mark('Sprint 24 complete');
  await pause(4000);
  return { poster: 0.6 };
}

async function sdlcStudioTour(page, mark) {
  await page.goto(BASE + '/simulador.html?lang=en');
  await page.locator('#tour-start-btn').waitFor({ state: 'visible' });
  await assertEnglish(page);
  mark('start: studio idle');
  await pause(1000);
  await page.locator('#tour-start-btn').click();
  const next = page.locator('#site-tour-next');
  for (let step = 1; step <= 9; step++) {
    const shown = Date.now();
    const title = await page.locator('#site-tour-tooltip').innerText().then((t) => t.split('\n').find(Boolean) || '');
    mark(`tour step ${step}: ${title.trim()}`);
    await page.waitForFunction(() => { const b = document.getElementById('site-tour-next'); return b && !b.disabled; }, null, { timeout: 15000 });
    await pause(Math.max(0, 3000 - (Date.now() - shown)));
    await next.click();
  }
  mark('tour finished');
  await pause(1500);
  return { poster: 0.2 };
}

const CLIPS = {
  'qa-lab-running': { run: qaLabRunning, seed: 7 },
  'sdlc-studio-running': { run: sdlcStudioRunning, studioPace: Number(process.env.STUDIO_PACE || 0.5) },
  'sdlc-studio-tour': { run: sdlcStudioTour, skipStudioTour: true }
};

function probe(file) {
  return Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).toString().trim());
}

function encode(webm, name, startAt, posterAt) {
  const mp4 = path.join(MEDIA, name + '.mp4');
  const jpg = path.join(MEDIA, name + '.jpg');
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', startAt.toFixed(2), '-i', webm,
    '-vf', `scale=${SIZE.width}:${SIZE.height}`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '26', '-preset', 'slow',
    '-movflags', '+faststart', '-an', mp4], { stdio: 'inherit' });
  const duration = probe(mp4);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', (duration * posterAt).toFixed(2), '-i', mp4,
    '-frames:v', '1', '-vf', `scale=${SIZE.width}:${SIZE.height}`, '-q:v', '3', jpg], { stdio: 'inherit' });
  return { mp4, jpg, duration };
}

async function record(browser, name) {
  const clip = CLIPS[name];
  const dir = path.join(SCRATCH, name);
  fs.rmSync(dir, { recursive: true, force: true });
  const context = await englishContext(browser, dir, {
    studioPace: clip.studioPace || 1,
    skipStudioTour: clip.skipStudioTour !== false,
    seed: Number(process.env.CLIPS_SEED || clip.seed || 904)
  });
  const page = await context.newPage();
  const opened = Date.now();
  let startedAt = null;
  const { marks, mark } = clock(() => startedAt || opened);
  console.log(`\n${name}`);
  const markFirst = (label) => {
    if (startedAt === null) startedAt = Date.now();
    mark(label);
  };
  const result = await clip.run(page, markFirst);
  const video = page.video();
  await context.close();
  const webm = await video.path();
  const startAt = Math.max(0, (startedAt - opened) / 1000 - 0.3);
  const out = encode(webm, name, startAt, result.poster);
  const mb = (fs.statSync(out.mp4).size / 1048576).toFixed(1);
  console.log(`  -> ${path.relative(ROOT, out.mp4)} ${out.duration.toFixed(1)} s, ${mb} MB (trimmed ${startAt.toFixed(1)} s)`);
  return { name, marks, duration: out.duration, mb };
}

async function main() {
  const names = process.argv.slice(2);
  const pick = names.length ? names : Object.keys(CLIPS);
  const unknown = pick.filter((name) => !CLIPS[name]);
  if (unknown.length) {
    console.error(`Unknown clip: ${unknown.join(', ')}. Choose from ${Object.keys(CLIPS).join(', ')}.`);
    process.exit(2);
  }
  const server = await startServer();
  const browser = await chromium.launch();
  try {
    for (const name of pick) await record(browser, name);
  } finally {
    await browser.close();
    server.kill();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
