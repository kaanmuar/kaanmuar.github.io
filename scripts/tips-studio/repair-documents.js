#!/usr/bin/env node
/* Rebuild LinkedIn document/{slug}.pdf from existing carousel/{slug}-NN.jpg stills (#4243).
   node scripts/tips-studio/repair-documents.js [batch...]
   Defaults to every media/social-posts batch that has a carousel folder. */

const fs = require('fs');
const path = require('path');
require('../playwright-sandbox');
const { chromium } = require('playwright');
const { pdfFrom } = require('../studio-pdf');

const ROOT = path.resolve(__dirname, '../..');
const POSTS = path.join(ROOT, 'media/social-posts');

function batches() {
	const named = process.argv.slice(2).filter((a) => !a.startsWith('-'));
	if (named.length) return named.map((b) => path.join(POSTS, b));
	return fs
		.readdirSync(POSTS, { withFileTypes: true })
		.filter((d) => d.isDirectory())
		.map((d) => path.join(POSTS, d.name))
		.filter((dir) => fs.existsSync(path.join(dir, 'carousel')));
}

function slugs(carouselDir) {
	const by = new Map();
	for (const name of fs.readdirSync(carouselDir)) {
		// Take the last -NN before the extension so host-10-01.jpg stays slug host-10.
		const m = name.match(/^(.+)-(\d{2})\.(jpe?g)$/i);
		if (!m) continue;
		const list = by.get(m[1]) || [];
		list.push({ n: Number(m[2]), file: path.join(carouselDir, name) });
		by.set(m[1], list);
	}
	return [...by.entries()].map(([slug, slides]) => ({
		slug,
		slides: slides.sort((a, b) => a.n - b.n).map((s) => s.file),
	}));
}

async function main() {
	const dirs = batches();
	if (!dirs.length) {
		console.error('No carousel batches under media/social-posts');
		process.exit(1);
	}
	const browser = await chromium.launch({ channel: 'chrome' });
	let ok = 0;
	let skip = 0;
	let fail = 0;
	try {
		for (const dir of dirs) {
			const carousel = path.join(dir, 'carousel');
			const document = path.join(dir, 'document');
			fs.mkdirSync(document, { recursive: true });
			for (const { slug, slides } of slugs(carousel)) {
				if (!slides.length) {
					skip += 1;
					continue;
				}
				const out = path.join(document, slug + '.pdf');
				try {
					await pdfFrom(browser, slides, out);
					ok += 1;
					console.log(path.relative(ROOT, out), slides.length + 'p', fs.statSync(out).size + 'b');
				} catch (err) {
					fail += 1;
					console.error('FAIL', path.relative(ROOT, out) + ':', err.message || err);
				}
			}
		}
	} finally {
		await browser.close();
	}
	console.log('repaired', ok, 'skipped', skip, 'failed', fail);
	if (fail) process.exit(1);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
