const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function load() {
	const window = {};
	vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../js/qa-review-vs.js'), 'utf8'), {
		window,
		document: { getElementById: () => null },
		location: { search: '' },
		navigator: { language: 'en' },
		localStorage: { getItem: () => null },
		URLSearchParams,
	});
	return window.QAReviewVs;
}

test('every tool has a mark for every check, and every language has every label and tool text', () => {
	const vs = load();
	assert.deepEqual(Array.from(vs.LANGS), ['en', 'es', 'pt', 'de', 'fr', 'it']);
	vs.TOOLS.forEach((tool) => {
		assert.match(tool.marks, new RegExp('^[ypn]{' + vs.ROWS.length + '}$'), tool.id);
		if (tool.id !== 'us')
			assert.ok(tool.sources.length && tool.sources.every((url) => url.startsWith('https://')), tool.id);
	});
	vs.LANGS.forEach((lang) => {
		const book = vs.COPY[lang];
		[
			'title',
			'intro',
			'glance',
			'caption',
			'check',
			'details',
			'price',
			'sources',
			'ours',
			'note',
			'cta',
			'lang',
		].forEach((key) => assert.ok(book[key], lang + ' ' + key));
		vs.ROWS.forEach((row) => assert.ok(book.rows[row], lang + ' ' + row));
		['y', 'p', 'n'].forEach((code) => assert.ok(book.marks[code], lang + ' ' + code));
		vs.TOOLS.forEach((tool) =>
			['kind', 'summary', 'price'].forEach((key) =>
				assert.ok(book.tools[tool.id][key], lang + ' ' + tool.id + ' ' + key)
			)
		);
	});
});

test('our own row claims only what is live: the WordPress check waits on the stored feed', () => {
	const vs = load();
	const us = vs.TOOLS.find((tool) => tool.id === 'us');
	assert.equal(us.marks[vs.ROWS.indexOf('wordpress')], 'p');
	vs.LANGS.forEach((lang) => {
		const text = vs.COPY[lang].tools.us.summary + vs.COPY[lang].tools.us.price;
		assert.doesNotMatch(text, /PhishStats|URLhaus|Stripe/, lang);
		assert.match(text, /48/, lang);
	});
});

test('the language comes from the address, then the saved choice, then the browser, and falls back to English', () => {
	const window = {};
	const run = (search, saved, language) => {
		vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../js/qa-review-vs.js'), 'utf8'), {
			window,
			document: { getElementById: () => null },
			location: { search },
			navigator: { language },
			localStorage: { getItem: () => saved },
			URLSearchParams,
		});
		return window.QAReviewVs.pickLang();
	};
	assert.equal(run('?lang=de', 'fr', 'it-IT'), 'de');
	assert.equal(run('', 'fr', 'it-IT'), 'fr');
	assert.equal(run('', null, 'pt-BR'), 'pt');
	assert.equal(run('?lang=ja', 'zh', 'ja-JP'), 'en');
});

test('qa-review-vs.html carries the static English comparison, JSON-LD, analytics, and clean sitemap/robots (#2053)', () => {
	const root = path.join(__dirname, '../..');
	const builder = require('../../scripts/build-vs-html');
	const vsHtml = fs.readFileSync(path.join(root, 'qa-review-vs.html'), 'utf8');
	const vsJs = fs.readFileSync(path.join(root, 'js/qa-review-vs.js'), 'utf8');
	assert.equal(builder.build(vsHtml, vsJs), vsHtml, 'run node scripts/build-vs-html.js');
	assert.ok(vsHtml.includes('Sucuri SiteCheck'));
	assert.ok(vsHtml.includes('application/ld+json'));
	assert.ok(vsHtml.includes('js/site-analytics.js'));
	const sitemap = fs.readFileSync(path.join(root, 'sitemap.xml'), 'utf8');
	assert.ok(sitemap.includes('https://carlosandmunoz.com/qa-review-vs.html'));
	assert.ok(!sitemap.includes('qa-review-social'), 'social hubs belong only in sitemap-social.xml (#2053)');
	const live = fs.readFileSync(path.join(root, 'live.html'), 'utf8');
	assert.ok(live.includes('<link rel="canonical" href="https://carlosandmunoz.com/qa-review.html">'));
	assert.ok(live.includes('property="og:url" content="https://carlosandmunoz.com/qa-review.html"'));
	assert.ok(live.includes('name="twitter:site"'));
	for (const kit of [
		'media/brand-kit-2026-10/index.html',
		'media/faces-2026-11/en/index.html',
		'media/faces-2026-11/es/index.html',
	]) {
		assert.match(fs.readFileSync(path.join(root, kit), 'utf8'), /<meta name="robots" content="noindex, nofollow">/);
	}
});
