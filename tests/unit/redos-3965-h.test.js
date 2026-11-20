'use strict';
// #3965: beforeLastLineDelim (functions/line-cut.js) must give what the original `/X.*$/` replace gave, for each
// delimiter the jarvis call sites use: "/", "/:", ">", "?".
const test = require('node:test');
const assert = require('node:assert/strict');
const { beforeLastLineDelim } = require('../../functions/line-cut.js');

let seed = 3965;
const rnd = (n) => {
	seed = (seed * 1103515245 + 12345) & 0x7fffffff;
	return seed % n;
};
const ALPHABET = ['a', 'b', '/', ':', '>', '?', '.', ' ', '\n', '\r', '\u2028', '\u2029', 'h', 'x'];
const randomString = (max) => {
	let s = '';
	const len = rnd(max + 1);
	for (let i = 0; i < len; i += 1) s += ALPHABET[rnd(ALPHABET.length)];
	return s;
};

const CASES = [
	[/\/.*$/, '/'],
	[/[/:].*$/, '/:'],
	[/>.*$/, '>'],
	[/\?.*$/, '?'],
];

test('beforeLastLineDelim matches the original trailing-cut regex for each delimiter', () => {
	const real = [
		'https://a.test/x/y', 'a.test:8080/x', 'Name <me@x.test>', 'x?y=1&z', 'a\nb/c', 'a/b\nc', '/',
		'', 'no delimiter here', 'a\r\nb:c\u2028d>e', 'trail>', 'x\u2029y?z\nw',
	];
	for (const [oldRe, delims] of CASES) {
		for (const s of real) assert.equal(beforeLastLineDelim(s, delims), s.replace(oldRe, ''), JSON.stringify(s));
		for (let i = 0; i < 3000; i += 1) {
			const s = randomString(18);
			assert.equal(beforeLastLineDelim(s, delims), s.replace(oldRe, ''), JSON.stringify(s));
		}
	}
});

test('beforeLastLineDelim is linear on long attack strings', () => {
	const attacks = ['/'.repeat(40000) + '\n' + 'x'.repeat(40000), 'a\n'.repeat(20000) + '/', '>'.repeat(40000) + 'x'];
	const started = Date.now();
	for (const s of attacks) for (const [, delims] of CASES) beforeLastLineDelim(s, delims);
	assert.ok(Date.now() - started < 1500, `took ${Date.now() - started} ms`);
});
