const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { prune, KEEP } = require('../../scripts/engagement-browser/shots.js');

function folder() {
	return fs.mkdtempSync(path.join(os.tmpdir(), 'shots-'));
}

test('pruning removes a stale directory in the shots folder instead of failing with EISDIR (#3717)', () => {
	const dir = folder();
	fs.mkdirSync(path.join(dir, 'fb2b-logout-m'));
	fs.writeFileSync(path.join(dir, 'fb2b-logout-m', 'inner.png'), 'x');
	for (let i = 0; i < KEEP; i += 1) fs.writeFileSync(path.join(dir, 'x-2026-11-' + String(i + 10).padStart(2, '0') + '.png'), 'x');
	const removed = prune(dir);
	assert.deepEqual(removed, ['fb2b-logout-m']);
	assert.equal(fs.readdirSync(dir).length, KEEP);
	assert.equal(fs.existsSync(path.join(dir, 'fb2b-logout-m')), false);
});

test('pruning keeps the newest files and leaves a small folder alone (#3717)', () => {
	const dir = folder();
	['a-1.png', 'a-2.png', 'a-3.png'].forEach((n) => fs.writeFileSync(path.join(dir, n), 'x'));
	assert.deepEqual(prune(dir, 2), ['a-1.png']);
	assert.deepEqual(fs.readdirSync(dir).sort(), ['a-2.png', 'a-3.png']);
	assert.deepEqual(prune(dir), []);
});

test('a plain rmSync on that directory is the EISDIR the agent hit', () => {
	const dir = folder();
	fs.mkdirSync(path.join(dir, 'fb2b-logout-m'));
	assert.throws(() => fs.rmSync(path.join(dir, 'fb2b-logout-m'), { force: true }), /EISDIR|directory/i);
});
