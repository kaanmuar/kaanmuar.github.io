'use strict';
// #3965: url-review-heads-up blankTags must give what the original /<[^>]{0,120}>/g replace gave (' ' for each tag).
const test = require('node:test');
const assert = require('node:assert/strict');
const { blankTags } = require('../../functions/url-review-heads-up.js');

const OLD = /<[^>]{0,120}>/g;
const old = (s) => s.replace(OLD, ' ');

let seed = 120;
const rnd = (n) => {
	seed = (seed * 1103515245 + 12345) & 0x7fffffff;
	return seed % n;
};
const ALPHABET = ['<', '>', 'a', ' ', '\n', '/', 'x'];
const randomString = (max) => {
	let s = '';
	const len = rnd(max + 1);
	for (let i = 0; i < len; i += 1) s += ALPHABET[rnd(ALPHABET.length)];
	return s;
};

test('blankTags matches the bounded tag regex on real and boundary inputs', () => {
	const real = [
		'<p>Hello <b>there</b></p>', 'a <> b', 'a < b', '<<a>', 'x<', '<a<b>', '<p>open <b', 'no tags',
		'line1\n<br>\nline2', 'a<b\nc>d', '<',  '>', '',
	];
	for (const s of real) assert.equal(blankTags(s), old(s), JSON.stringify(s));
	// tags whose body is right at, just under and just over the 120-character limit, with and without a closer "<"
	for (let k = 116; k <= 124; k += 1) {
		const body = 'x'.repeat(k);
		for (const s of [`<${body}>`, `a<${body}>b`, `<${body}<q>`, `<${body}<${'y'.repeat(3)}>z`, `<${'<'.repeat(k)}>`]) {
			assert.equal(blankTags(s), old(s), `k=${k} ${s.slice(0, 20)}`);
		}
	}
	for (let i = 0; i < 4000; i += 1) {
		const s = randomString(40);
		assert.equal(blankTags(s), old(s), JSON.stringify(s));
	}
});

test('blankTags stays fast on attack strings', () => {
	const N = 40000;
	const attacks = ['<'.repeat(N), '<a'.repeat(N / 2), '<>'.repeat(N / 2), '<' + 'x'.repeat(N) + '>', 'a<'.repeat(N / 2) + '>'];
	const started = Date.now();
	for (const s of attacks) blankTags(s);
	assert.ok(Date.now() - started < 1500, `took ${Date.now() - started} ms`);
});
