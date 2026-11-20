// The queue's thread label reads twitter.thread only when it exists (#3840). An X post with an AI label and no thread
// carries twitter metadata without one; reading .thread.length on it stopped the whole Live Reports queue.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SRC = fs.readFileSync(path.join(__dirname, '../../scripts/buffer-queue.js'), 'utf8');

test('the thread count is read only when twitter.thread exists', () => {
	assert.match(
		SRC,
		/input\.metadata\.twitter\.thread\s*\?\s*' \(thread of '\s*\+\s*input\.metadata\.twitter\.thread\.length/,
		'the thread label is written only when the thread exists'
	);
});
