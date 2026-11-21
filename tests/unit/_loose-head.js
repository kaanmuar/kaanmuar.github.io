'use strict';
// #3577: Biome writes functions/ with single quotes and wraps long lines, but the redos tests name the source they
// read by a head written for the old layout. Match that head loosely: either quote, any whitespace (a wrap) where
// the head has a space, and around . ( ) [ ] and , where a wrap can add one.
const assert = require('node:assert/strict');

const loose = (head) =>
	new RegExp(
		head
			.split(/(\s+)/)
			.map((part) =>
				/^\s+$/.test(part)
					? '\\s*'
					: part
							.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
							.replace(/["']/g, '["\']')
							.replace(/(\\[.([)\]]|,)/g, '\\s*$1\\s*')
			)
			.join(''),
		'g'
	);

/** Start of the one place `head` is in `text`, and where the first `cut` characters of it end (default: all of it).
 *  The text after a wrapped `(` or `=` starts on the next line, so the end skips the whitespace there. */
function locate(text, head, label, cut = head.length) {
	const hits = [...text.matchAll(loose(head))];
	assert.ok(hits.length >= 1, `${label}: ${head}`);
	assert.equal(hits.length, 1, `${label}: ${head} is not unique`);
	const at = hits[0].index;
	const prefix = new RegExp(loose(head.slice(0, cut)).source, 'y');
	prefix.lastIndex = at;
	const end = prefix.exec(text)[0].length + at;
	const gap = /\s*/y;
	gap.lastIndex = end;
	return { at, end: end + gap.exec(text)[0].length };
}

module.exports = { locate };
