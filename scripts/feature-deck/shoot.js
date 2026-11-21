#!/usr/bin/env node
// Takes the real screenshots of the live pages for the feature deck (#3931).
//   node scripts/feature-deck/shoot.js [out-dir] [name,name,...]     default out-dir: /tmp/deck-shots/live
// One fresh browser per picture and a hard time limit, because some pages never go quiet.
// It only reads public pages of https://carlosandmunoz.com. No sign-in, no form is submitted.
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright-core');

const BASE = 'https://carlosandmunoz.com';
const out = process.argv[2] || '/tmp/deck-shots/live';
const only = process.argv[3] ? process.argv[3].split(',') : null;
fs.mkdirSync(out, { recursive: true });

const chips = { 'sample-browser': 'Browser and search', 'sample-fixes': 'Checks and fixes', 'sample-glance': 'At a glance', 'sample-exposure': 'Exposure', 'sample-evidence': 'Evidence', 'sample-cases': 'Cases to run' };
const shots = [
	{ n: 'home', u: '/qa-review.html', wait: 3500 },
	{ n: 'home-typing', u: '/qa-review.html', wait: 3000, act: async (p) => { await p.locator('#url').first().click({ timeout: 4000 }); await p.keyboard.type('shop-exam', { delay: 60 }); await p.waitForTimeout(1800); } },
	{ n: 'sample-top', u: '/qa-review.html?sample=1', wait: 4500 },
	...Object.entries(chips).map(([n, chip]) => ({ n, u: '/qa-review.html?sample=1', wait: 4500, act: async (p) => { await p.getByRole('link', { name: chip }).first().click({ timeout: 4000 }); await p.waitForTimeout(1500); } })),
	{ n: 'live-reports', u: '/qa-review.html', wait: 4500, sel: '#live-reports' },
	{ n: 'facts', u: '/qa-review.html', wait: 3500, sel: '#service-facts' },
	{ n: 'guide', u: '/qa-review-guide.html', wait: 4000 },
	{ n: 'vs', u: '/qa-review-vs.html', wait: 4000 },
	{ n: 'social', u: '/qa-review-social.html', wait: 5000 },
	{ n: 'lab', u: '/qa-lab.html', wait: 4000, closeTour: true },
	{ n: 'studio', u: '/simulador.html', wait: 4000, closeTour: true },
	{ n: 'cv', u: '/index.html', wait: 4500 },
	{ n: 'book', u: '/book.html', wait: 4000 },
	{ n: 'cyber', u: '/cyber-attacks.html', wait: 8000 },
	{ n: 'hub', u: '/qa.html', wait: 3500 },
	{ n: 'live', u: '/live.html', wait: 5000 },
	{ n: 'legal', u: '/qa-review-legal.html', wait: 3500 },
	{ n: 'faces-gallery', u: '/designs/faces/index.html', wait: 5000 },
	{ n: 'es', u: '/qa-review-es.html', wait: 3500 },
	{ n: 'cv-phone', u: '/index.html', wait: 4500, phone: true },
];

async function one(s) {
	const browser = await chromium.launch({ channel: 'chrome' });
	try {
		const ctx = await browser.newContext(s.phone ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, locale: 'en-US' } : { viewport: { width: 1440, height: 900 }, locale: 'en-US' });
		// first-visit tour cards would cover the page; mark them as seen
		await ctx.addInitScript(() => {
			for (const k of ['hasSeenTour', 'hasSeenLabTour', 'hasSeenStudioTour', 'hasSeenReviewTour']) localStorage.setItem(k, '1');
		});
		const p = await ctx.newPage();
		p.setDefaultTimeout(8000);
		await p.goto(BASE + s.u, { waitUntil: 'domcontentloaded', timeout: 30000 });
		await p.waitForTimeout(s.wait);
		try {
			const b = p.getByRole('button', { name: /Keep only what is required/i });
			if (await b.isVisible({ timeout: 1500 })) await b.click();
		} catch {}
		await p.addStyleTag({ content: '.cookie-note{display:none!important}' });
		if (s.closeTour) {
			await p.keyboard.press('Escape');
			await p.waitForTimeout(600);
		}
		if (s.sel) await p.evaluate((q) => document.querySelector(q)?.scrollIntoView(), s.sel);
		if (s.act) await s.act(p);
		await p.waitForTimeout(1200);
		await p.screenshot({ path: path.join(out, s.n + '.png'), timeout: 20000, animations: 'disabled' });
		console.log('ok', s.n);
	} finally {
		await browser.close().catch(() => {});
	}
}

(async () => {
	for (const s of shots) {
		if (only && !only.includes(s.n)) continue;
		if (!only && fs.existsSync(path.join(out, s.n + '.png'))) {
			console.log('have', s.n);
			continue;
		}
		let timer;
		const limit = new Promise((_, rej) => (timer = setTimeout(() => rej(new Error('time limit')), 75000)));
		try {
			await Promise.race([one(s), limit]);
		} catch (e) {
			console.log('FAIL', s.n, String(e.message).slice(0, 90));
		}
		clearTimeout(timer);
	}
	process.exit(0);
})();
