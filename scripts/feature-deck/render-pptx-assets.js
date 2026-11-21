#!/usr/bin/env node
// Makes the pictures the PowerPoint needs (#3931): face PNGs, the mark, a background, and one GIF per animated scene.
// The GIFs are recorded from presentation/index.html (build it first), one loop each, so the PowerPoint shows the
// same motion as the web deck. Output goes to scripts/feature-deck/.cache (not committed).
//   node scripts/feature-deck/render-pptx-assets.js
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const sharp = require('sharp');
const { chromium } = require('playwright-core');
const { slides } = require('./slides.js');
const { SCENE_LOOP } = require('./scenes.js');

const root = path.resolve(__dirname, '..', '..');
const pres = path.join(root, 'presentation');
const cache = path.join(__dirname, '.cache');
for (const d of ['faces', 'gif', 'frames']) fs.mkdirSync(path.join(cache, d), { recursive: true });

async function stills() {
	for (const f of fs.readdirSync(path.join(pres, 'faces'))) {
		await sharp(path.join(pres, 'faces', f), { density: 384 }).resize(256, 256).png().toFile(path.join(cache, 'faces', f.replace('.svg', '.png')));
	}
	await sharp(path.join(pres, 'img/mark.svg'), { density: 384 }).resize(384, 384).png().toFile(path.join(cache, 'mark.png'));
	const bg = `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080"><defs><radialGradient id="a" cx="14%" cy="8%" r="62%"><stop offset="0" stop-color="#14414a"/><stop offset="1" stop-color="#071116" stop-opacity="0"/></radialGradient><radialGradient id="b" cx="92%" cy="95%" r="50%"><stop offset="0" stop-color="#17302f"/><stop offset="1" stop-color="#071116" stop-opacity="0"/></radialGradient></defs><rect width="1920" height="1080" fill="#071116"/><rect width="1920" height="1080" fill="url(#a)"/><rect width="1920" height="1080" fill="url(#b)"/></svg>`;
	await sharp(Buffer.from(bg)).png().toFile(path.join(cache, 'bg.png'));
}

async function gifs() {
	const browser = await chromium.launch({ channel: 'chrome' });
	const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
	await page.goto('file://' + path.join(pres, 'index.html') + '#1');
	await page.addStyleTag({ content: '.bg,.hud,.controls,.help,.progress,.sayit{display:none!important}body,html{background:#071116!important}.slide{animation:none!important}' });
	const jobs = [];
	slides.forEach((s, i) => {
		if (s.layout === 'scene') jobs.push({ n: i + 1, name: s.scene, sel: '.scenebox', mode: 'loop' });
		if (s.layout === 'scores') jobs.push({ n: i + 1, name: 'scores', sel: '.gauges', mode: 'fill' });
	});
	for (const j of jobs) {
		await page.evaluate((n) => window.deck.go(n - 1, true), j.n);
		await page.waitForTimeout(700);
		const el = page.locator(`.slide.active ${j.sel}`);
		const fps = j.mode === 'loop' ? 12 : 15;
		const dur = j.mode === 'loop' ? SCENE_LOOP : 3.2;
		const frames = Math.round(dur * fps);
		const dir = path.join(cache, 'frames', j.name);
		fs.rmSync(dir, { recursive: true, force: true });
		fs.mkdirSync(dir, { recursive: true });
		for (let f = 0; f < frames; f++) {
			const t = (f / fps) * 1000;
			await page.evaluate(
				({ t, sel, mode }) => {
					const root = document.querySelector('.slide.active ' + sel);
					for (const a of document.getAnimations()) {
						a.pause();
						const inf = a.effect.getComputedTiming().iterations === Infinity;
						const inside = a.effect.target && root.contains(a.effect.target);
						// fill mode: only the rings and their counters move; labels and panels stay fully shown from frame 0
						const ring = a.effect.target && a.effect.target.closest && a.effect.target.closest('.ring');
						const moving = mode === 'fill' ? inside && ring : inside;
						a.currentTime = inf || moving ? t : 1e5;
					}
				},
				{ t, sel: j.sel, mode: j.mode }
			);
			await el.screenshot({ path: path.join(dir, String(f).padStart(3, '0') + '.png') });
		}
		if (j.mode === 'fill') {
			// hold the finished gauges for a moment before the loop restarts
			const last = path.join(dir, String(frames - 1).padStart(3, '0') + '.png');
			for (let k = 0; k < Math.round(1.6 * fps); k++) fs.copyFileSync(last, path.join(dir, String(frames + k).padStart(3, '0') + '.png'));
		}
		const w = j.mode === 'loop' ? 640 : 960;
		const out = path.join(cache, 'gif', j.name + '.gif');
		execFileSync('ffmpeg', ['-v', 'error', '-y', '-framerate', String(fps), '-i', path.join(dir, '%03d.png'), '-vf', `scale=${w}:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=112:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4`, '-loop', '0', out]);
		const meta = await el.boundingBox();
		fs.writeFileSync(path.join(cache, 'gif', j.name + '.json'), JSON.stringify({ w: meta.width, h: meta.height }));
		console.log('gif', j.name, (fs.statSync(out).size / 1024).toFixed(0) + ' KB');
	}
	await browser.close();
}

(async () => {
	await stills();
	await gifs();
})();
