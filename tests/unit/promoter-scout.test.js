const test = require('node:test');
const assert = require('node:assert/strict');
const scout = require('../../scripts/promoter-scout');
const ops = require('../../functions/ops-schedule');

test('seeds load with unique hosts and known kinds', () => {
	const rows = scout.seedRows();
	assert.ok(rows.length >= 95);
	const hosts = new Set(rows.map((r) => r.host));
	assert.equal(hosts.size, rows.length);
	const kinds = new Set(rows.map((r) => r.kind));
	assert.ok(kinds.has('podcast'));
	assert.ok(kinds.has('accelerator'));
	for (const r of rows) {
		assert.match(r.host, /^[a-z0-9.-]+\.[a-z]{2,}$/);
		assert.ok(r.kind);
		assert.ok(r.lang);
	}
});

test('bare strips protocol, www and path', () => {
	assert.equal(scout.bare('https://www.ProductHunt.com/posts/new'), 'producthunt.com');
	assert.equal(scout.bare('AWARDS.example.co.uk/submit'), 'awards.example.co.uk');
});

test('clip unescapes one entity layer; &amp;lt; does not become <', () => {
	assert.equal(scout.clip('Land &amp; Book', 40), 'Land & Book');
	assert.equal(scout.clip('a &amp;lt; b', 40), 'a &lt; b');
	assert.equal(scout.clip('say &quot;hi&quot;', 40), 'say "hi"');
});

test('pickLinks finds submit and contact on the same host', () => {
	const html =
		'<a href="/about">About</a><a href="https://other.com/submit">x</a><a href="/submit-your-tool">Submit</a><a href="/contact-us">Contact</a><a href="/font.ttf">font</a>';
	const { submit, contact } = scout.pickLinks(html, 'https://tools.example/', 'tools.example');
	assert.match(submit, /submit-your-tool/);
	assert.match(contact, /contact-us/);
	assert.equal(scout.preferSubmit('https://tools.example/submit', 'https://tools.example/font.ttf'), 'https://tools.example/submit');
});

test('emailsIn keeps site-domain mail and drops free-mail and support', () => {
	const html = 'mail support@tools.example hello@tools.example me@gmail.com press@tools.example';
	assert.deepEqual(scout.emailsIn(html, 'tools.example').sort(), ['hello@tools.example', 'press@tools.example']);
});

test('isPromoter matches directory/gallery language', () => {
	assert.equal(scout.isPromoter({ title: 'SaaS directory', description: '', text: 'submit your tool' }), true);
	assert.equal(scout.isPromoter({ title: 'Startup podcast', description: 'interview founders', text: 'pitch us' }), true);
	assert.equal(scout.isPromoter({ title: 'Tech accelerator', description: 'demo day', text: 'portfolio companies' }), true);
	assert.equal(scout.isPromoter({ title: 'My bakery', description: 'bread', text: 'fresh loaves daily' }), false);
});

test('defaultDiscoverLangs keeps core six and rotates tail langs by week', () => {
	const pack = { langs: ['en', 'es', 'pt', 'de', 'fr', 'it', 'nl', 'pl', 'ja', 'ko', 'zh', 'ar'] };
	const a = scout.defaultDiscoverLangs(pack, '2026-01-07');
	const b = scout.defaultDiscoverLangs(pack, '2026-01-21');
	assert.deepEqual(a.slice(0, 6), ['en', 'es', 'pt', 'de', 'fr', 'it']);
	assert.equal(a.length, 8);
	assert.equal(b.length, 8);
	assert.notDeepEqual(a.slice(6), b.slice(6));
});

test('report lists kinds and reachable counts', () => {
	const md = scout.report(
		'2026-11-21',
		[
			{
				host: 'land-book.com',
				name: 'Land-book',
				kind: 'gallery',
				lang: 'en',
				submit_url: 'https://land-book.com/submit',
				contact_url: '',
				email: '',
				status: 'reachable',
				source: 'seed',
			},
			{
				host: 'newtool.media',
				name: 'New Tool Media',
				kind: 'podcast',
				lang: 'de',
				submit_url: '',
				contact_url: '',
				email: '',
				status: 'reachable',
				source: 'ai:podcast:de',
				notes: 'features SaaS tools',
			},
		],
		3,
		{ scoutLangs: ['en', 'de', 'nl', 'pl'] }
	);
	assert.match(md, /# Promoter scout 2026-11-21/);
	assert.match(md, /land-book\.com/);
	assert.match(md, /Fresh from AI this run: 3/);
	assert.match(md, /## By language/);
	assert.match(md, /## New from AI this run/);
	assert.match(md, /newtool\.media/);
	assert.match(md, /AI discovery langs this run: en, de, nl, pl/);
	assert.match(md, /## gallery — website design inspiration/);
});

test('kindLabel maps kind ids to human labels', () => {
	assert.match(scout.kindLabel('podcast'), /podcast/i);
	assert.equal(scout.kindLabel('unknown-kind'), 'unknown-kind');
});

test('ops-schedule lists the weekly promoter scout job', () => {
	const job = ops.JOBS.find((j) => j.job === 'promoter-scout.yml');
	assert.ok(job);
	assert.match(job.what, /#4151/);
});
