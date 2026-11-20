'use strict';
// #3965: the last unblocked ReDoS sites (engagement-sources, engagement, url-review-har, url-review-rerun-past).
// Old and new must give the same output on real inputs and on seeded random strings.
const test = require('node:test');
const assert = require('node:assert/strict');

let seed = 20261120;
const rnd = (n) => {
	seed = (seed * 1103515245 + 12345) & 0x7fffffff;
	return seed % n;
};
const ALPHABET = ['a', 'b', 'Z', '.', '/', ' ', '  ', '\t', '\n', '?', '#', '@', '—', '-', '1', 'é', '\u2028'];
const randomString = (max) => {
	let s = '';
	const len = rnd(max + 1);
	for (let i = 0; i < len; i += 1) s += ALPHABET[rnd(ALPHABET.length)];
	return s;
};
const sweep = (inputs, oldRe, newRe, out) => {
	for (let i = 0; i < 3000; i += 1) inputs.push(randomString(24));
	for (const s of inputs) {
		assert.equal(s.replace(newRe, out), s.replace(oldRe, out), JSON.stringify(s));
		assert.equal(newRe.test(s), oldRe.test(s), JSON.stringify(s));
	}
};

test('engagement-sources strips trailing slashes from the Mastodon base', () => {
	const OLD = /\/+$/;
	const NEW = /(?<!\/)\/+$/;
	sweep(['https://mastodon.social/', 'https://x.y//', '/', '//', 'a/b', ''], OLD, NEW, '');
});

test('engagement tidies em dashes into commas', () => {
	const OLD = /\s*—\s*/g;
	const NEW = /(?<!\s)\s+—\s*|—\s*/g;
	sweep(['a — b', 'a—b', 'a   —   b', '—', ' — ', 'x y —z', ''], OLD, NEW, ', ');
});

test('engagement drops the last partial word of a reply', () => {
	const OLD = /\s+\S*$/;
	const NEW = /(?<!\s)\s+\S*$/;
	sweep(['one two three', 'one  two  three  four', ' lead', 'trail ', 'a b  c', 'x'], OLD, NEW, '');
});

test('url-review-har strips the query string and fragment', () => {
	const OLD = /[?#].*$/;
	const NEW = /[?#](?<![?#][^\n\r\u2028\u2029?#]*[?#]).*$/;
	sweep(['https://a.test/x?y=1#z', 'https://a.test/x#y?z', 'https://a.test/?', 'https://a.test/x\n?y', 'plain'], OLD, NEW, '');
});

test('url-review-rerun-past accepts the same email addresses', () => {
	const OLD = /^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/;
	const NEW = /^[^\s@/]+@[^\s@/][^\s@/.]*\.[^\s@/]+$/;
	const emails = ['a@b.co', 'a@b.c.d', 'a@.b.c', 'a@..b', 'a@b', 'a@b.', 'a@@b.c', 'a@b/c.d', 'x y@b.co', 'a@b.c.d.e'];
	for (const s of emails) assert.equal(NEW.test(s), OLD.test(s), s);
	const inputs = [];
	for (let i = 0; i < 3000; i += 1) inputs.push(randomString(14));
	for (const s of inputs) assert.equal(NEW.test(s), OLD.test(s), JSON.stringify(s));
});

test('the rewritten patterns finish fast on attack strings', () => {
	const attacks = [' '.repeat(40000) + 'x', 'a'.repeat(40000) + ' ', '/'.repeat(40000) + 'x', '?'.repeat(40000) + 'x'];
	const patterns = [/(?<!\/)\/+$/, /(?<!\s)\s+—\s*|—\s*/g, /(?<!\s)\s+\S*$/, /[?#](?<![?#][^\n\r\u2028\u2029?#]*[?#]).*$/, /^[^\s@/]+@[^\s@/][^\s@/.]*\.[^\s@/]+$/];
	const started = Date.now();
	for (const p of patterns) for (const s of attacks) s.replace(p, '');
	assert.ok(Date.now() - started < 1500, `took ${Date.now() - started} ms`);
});
