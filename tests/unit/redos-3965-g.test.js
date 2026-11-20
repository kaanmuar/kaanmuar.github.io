'use strict';
// #3965: jarvis-index path trim and jarvis-worker slug. Old and new must agree on random input.
const test = require('node:test');
const assert = require('node:assert/strict');

let seed = 7300;
const rnd = (n) => {
	seed = (seed * 1103515245 + 12345) & 0x7fffffff;
	return seed % n;
};

test('jarvis-index trims trailing slashes exactly as before', () => {
	const OLD = /\/+$/;
	const NEW = /(?<!\/)\/+$/;
	const al = ['/', '/', 'a', '.', '-', ' ', '\n'];
	for (let i = 0; i < 3000; i += 1) {
		let s = '';
		const len = rnd(20);
		for (let j = 0; j < len; j += 1) s += al[rnd(al.length)];
		assert.equal(s.replace(NEW, ''), s.replace(OLD, ''), JSON.stringify(s));
	}
});

test('jarvis-worker slug trims leading and trailing dashes exactly as before', () => {
	const OLD = (s) => s.replace(/^-+|-+$/g, '');
	const NEW = (s) => s.replace(/^-+/, '').replace(/(?<!-)-+$/, '');
	const al = ['-', '-', 'a', 'b', ' ', '_'];
	for (let i = 0; i < 3000; i += 1) {
		let s = '';
		const len = rnd(16);
		for (let j = 0; j < len; j += 1) s += al[rnd(al.length)];
		assert.equal(NEW(s), OLD(s), JSON.stringify(s));
	}
	assert.ok(NEW('-'.repeat(40000) + 'x') === 'x');
	assert.ok(NEW('x' + '-'.repeat(40000) + 'y') === 'x' + '-'.repeat(40000) + 'y');
});
