#!/usr/bin/env node
// Checks the built feature deck (#3931). Run after a build: npm run check (or npm run deck, which builds first).
//   1. every file the HTML points to exists (pictures, clips, faces)
//   2. no words that do not belong in the URL Review deck, and no internal ticket numbers
//   3. every slide's content fits above the controls bar (opens each slide in Chrome; flagged slides are saved)
// Exits with code 1 when something is wrong, so it can gate a commit.
const fs = require('fs');
const path = require('path');

const dir = __dirname;
const pres = path.resolve(dir, '..', '..', 'presentation');
const html = fs.readFileSync(path.join(pres, 'index.html'), 'utf8');
const problems = [];

// 1. referenced files exist
const refs = new Set([...html.matchAll(/(?:src|href|poster)="([^"#?]+)"/g)].map((m) => m[1]));
for (const r of refs) {
	if (/^(https?:|mailto:|data:)/.test(r)) continue;
	if (!fs.existsSync(path.join(pres, r))) problems.push(`missing file: presentation/${r}`);
}

// 2. words and numbers that must not appear
const banned = [
	[/\bMac(book)?\b/i, 'the word Mac (use "a computer" or "a real browser")'],
	[/\bCV\b|\bresume\b|\bhiring\b/i, 'career material'],
	[/Regression Lab|Sprint Studio|Jarvis|cyber ?map|Lab Studio/i, 'a product outside URL Review'],
	[/\bsocial (post|posting|hub)\b/i, 'social posting'],
	[/#\d{3,4}\b/, 'an internal ticket number'],
	[/\bTODO\b|lorem ipsum/i, 'placeholder text'],
];
// the text a visitor sees: drop tags and the speaker-notes attributes are kept (they are read aloud too)
const visible = html.replace(/<style[\s\S]*?<\/style>/g, '').replace(/<script[\s\S]*?<\/script>/g, '');
for (const [re, why] of banned) {
	const m = visible.match(re);
	if (m) problems.push(`found "${m[0]}": ${why}`);
}

// 3. layout: content must end above the controls bar in every slide
const LIMIT = 672; // stage pixels; the stage is 720 tall and the controls bar sits in the bottom 48
const shotDir = path.join(dir, '.cache', 'check');
fs.mkdirSync(shotDir, { recursive: true });

async function layout() {
	const { chromium } = require('playwright-core');
	const browser = await chromium.launch({ channel: 'chrome' });
	const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
	const errors = [];
	page.on('pageerror', (e) => errors.push(String(e)));
	await page.goto('file://' + path.join(pres, 'index.html'));
	await page.waitForTimeout(600);
	const total = await page.evaluate(() => window.deck.total);
	for (let i = 0; i < total; i++) {
		await page.evaluate((n) => window.deck.go(n, true), i);
		// wait until this slide's entrance animations have finished (the looping sheen never ends, so it is skipped)
		await page.evaluate(() =>
			Promise.all(
				document
					.querySelector('.slide.active')
					.getAnimations({ subtree: true })
					.filter((a) => a.effect.getComputedTiming().endTime !== Infinity)
					.map((a) => a.finished.catch(() => {})),
			),
		);
		await page.waitForTimeout(200);
		const r = await page.evaluate(() => {
			const act = document.querySelector('.slide.active');
			const stage = document.querySelector('.stage').getBoundingClientRect();
			let bottom = 0;
			const clipped = [];
			act.querySelectorAll('.card').forEach((card) => {
				if (card.scrollHeight > card.clientHeight + 2) clipped.push(card.textContent.trim().slice(0, 40));
			});
			// the note bar (.eg) must not sit on top of a card or a table cell
			const overlaps = [];
			const note = act.querySelector('.eg');
			if (note) {
				const nb = note.getBoundingClientRect();
				act.querySelectorAll('.card, .tc, .th').forEach((el) => {
					if (el.closest('.eg')) return;
					const b = el.getBoundingClientRect();
					if (b.width && b.height && b.top < nb.bottom - 2 && b.bottom > nb.top + 2 && b.left < nb.right && b.right > nb.left)
						overlaps.push((el.textContent || '').trim().slice(0, 40));
				});
			}
			act.querySelectorAll('*').forEach((el) => {
				if (el.closest('.controls,.hud,.help,.sayit,.orbit')) return;
				const b = el.getBoundingClientRect();
				if (b.width && b.height) bottom = Math.max(bottom, b.bottom - stage.top);
			});
			return { title: act.getAttribute('aria-label'), bottom: Math.round(bottom), clipped, overlaps };
		});
		for (const c of r.clipped) problems.push(`slide ${i + 1} "${r.title.replace(/^\d+\.\s*/, '')}": text cut off in the card "${c}..."`);
		for (const o of r.overlaps) problems.push(`slide ${i + 1} "${r.title.replace(/^\d+\.\s*/, '')}": the note covers "${o}..."`);
		if (r.bottom > LIMIT) {
			problems.push(`slide ${i + 1} "${r.title.replace(/^\d+\.\s*/, '')}" runs to ${r.bottom}px (limit ${LIMIT})`);
			await page.screenshot({ path: path.join(shotDir, `slide-${String(i + 1).padStart(2, '0')}.png`) });
		}
	}
	for (const e of errors) problems.push('page error: ' + e);
	await browser.close();
	return total;
}

(async () => {
	let total = 0;
	try {
		total = await layout();
	} catch (e) {
		problems.push('could not open the deck in Chrome: ' + e.message);
	}
	const slides = (html.match(/<section class="slide/g) || []).length;
	if (problems.length) {
		console.log(`check: ${problems.length} problem(s) in ${slides} slides`);
		for (const p of problems) console.log('  - ' + p);
		if (fs.existsSync(shotDir) && fs.readdirSync(shotDir).length) console.log(`  screenshots of flagged slides: ${shotDir}`);
		process.exit(1);
	}
	console.log(`check: ok, ${slides} slides (${total} opened), ${refs.size} files referenced, nothing banned`);
})();
