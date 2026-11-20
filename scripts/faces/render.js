#!/usr/bin/env node
// Review media for the faces gallery (#3826): page shots, one reel per direction (MP4, H.264), a still per direction.
//   node scripts/faces/render.js [--base http://127.0.0.1:8826] [--only crystal,line,badge] [--shots] [--no-reel] [--seconds 6]
// Serve the repo root first (python3 -m http.server 8826). Output: media/check-faces-2026-11/ (gitignored).
require('../playwright-sandbox');
const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const arg = (k, d) => {
	const i = process.argv.indexOf(k);
	return i > -1 ? process.argv[i + 1] : d;
};
const BASE = arg('--base', 'http://127.0.0.1:8826');
const PAGE = arg('--page', 'index');
const ONLY = arg('--only', PAGE === 'set' ? 'badges,crystal,cyber' : 'crystal,line,badge').split(',');
const SECONDS = Number(arg('--seconds', 6));
const FPS = 30;
const OUT = path.join(__dirname, '../../media/check-faces-2026-11');

(async () => {
	fs.mkdirSync(OUT, { recursive: true });
	const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
	const errors = [];

	if (process.argv.includes('--shots')) {
		const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
		page.on('pageerror', (e) => errors.push(e.message));
		page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
		await page.goto(`${BASE}/designs/faces/index.html?manual`, { waitUntil: 'networkidle' });
		await page.waitForFunction(() => window.__faces?.ready);
		await page.addStyleTag({ content: '.bar{position:static}' });
		await page.evaluate(() => window.__faces.renderAt(2.2));
		for (const id of ONLY) {
			const s = page.locator(`#${id}`);
			await s.scrollIntoViewIfNeeded();
			await page.evaluate(() => window.__faces.renderAt(2.2));
			await s.screenshot({ path: path.join(OUT, `gallery-${id}.png`) });
		}
		await page.close();
	}

	for (const id of process.argv.includes('--no-reel') ? [] : ONLY) {
		const page = await browser.newPage({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 1 });
		page.on('pageerror', (e) => errors.push(e.message));
		await page.goto(`${BASE}/designs/faces/${PAGE}.html?manual&reel=${id}`, { waitUntil: 'networkidle' });
		await page.waitForFunction(() => window.__faces?.ready);
		const size = await page.evaluate(() => window.__faces.size);
		if (size) await page.setViewportSize({ width: size[0], height: size[1] });
		await page.evaluate(() => document.fonts.ready);
		const dir = fs.mkdtempSync(path.join(require('os').tmpdir(), `faces-${id}-`));
		const n = SECONDS * FPS;
		for (let i = 0; i < n; i++) {
			await page.evaluate((t) => window.__faces.renderAt(t), i / FPS);
			await page.screenshot({ path: path.join(dir, `${String(i).padStart(4, '0')}.png`) });
			if (i === Math.round(2.2 * FPS)) fs.copyFileSync(path.join(dir, `${String(i).padStart(4, '0')}.png`), path.join(OUT, `${PAGE === 'set' ? 'set-' : 'reel-'}${id}.png`));
		}
		execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(dir, '%04d.png'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-movflags', '+faststart', path.join(OUT, `${PAGE === 'set' ? 'set-' : 'reel-'}${id}.mp4`)]);
		fs.rmSync(dir, { recursive: true, force: true });
		await page.close();
		console.log(`${PAGE === 'set' ? 'set-' : 'reel-'}${id}.mp4`);
	}
	await browser.close();
	if (errors.length) console.log('page errors:\n' + [...new Set(errors)].join('\n'));
})();
