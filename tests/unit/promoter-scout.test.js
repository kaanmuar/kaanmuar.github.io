const test = require('node:test');
const assert = require('node:assert/strict');
const scout = require('../../scripts/promoter-scout');
const ops = require('../../functions/ops-schedule');

test('seeds load with unique hosts and known kinds', () => {
	const rows = scout.seedRows();
	assert.ok(rows.length >= 60);
	const hosts = new Set(rows.map((r) => r.host));
	assert.equal(hosts.size, rows.length);
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
	assert.equal(scout.isPromoter({ title: 'My bakery', description: 'bread', text: 'fresh loaves daily' }), false);
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
			},
		],
		3
	);
	assert.match(md, /# Promoter scout 2026-11-21/);
	assert.match(md, /land-book\.com/);
	assert.match(md, /Fresh from AI this run: 3/);
});

test('ops-schedule lists the weekly promoter scout job', () => {
	const job = ops.JOBS.find((j) => j.job === 'promoter-scout.yml');
	assert.ok(job);
	assert.match(job.what, /#4151/);
});
