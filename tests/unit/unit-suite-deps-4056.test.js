'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.join(__dirname, '../..');
const pkg = require('../../package.json');

test('test:review and test:unit go through the CI-parity runner (#4056)', () => {
	assert.equal(pkg.scripts['test:review'], 'scripts/run-test-review.sh');
	assert.equal(pkg.scripts['test:unit'], 'npm run test:review');
	const sh = fs.readFileSync(path.join(root, 'scripts/run-test-review.sh'), 'utf8');
	assert.match(sh, /build-critical-css\.js --deps/);
	assert.match(sh, /NODE_PATH/);
	assert.match(sh, /#4056/);
});

test('ticket-worktree only links a root node_modules that has postcss and css-select (#4056)', () => {
	const sh = fs.readFileSync(path.join(root, 'scripts/ticket-worktree.sh'), 'utf8');
	assert.match(sh, /root_modules_usable/);
	assert.match(sh, /postcss\/package\.json/);
	assert.match(sh, /css-select\/package\.json/);
	assert.match(sh, /drop_unusable_root_modules/);
	assert.match(sh, /#4056/);
});

test('critical CSS deps resolve the same packages CI puts on NODE_PATH (#4056)', () => {
	const listed = spawnSync(process.execPath, ['scripts/build-critical-css.js', '--deps'], {
		cwd: root,
		encoding: 'utf8',
	});
	assert.equal(listed.status, 0, listed.stderr);
	const deps = listed.stdout.trim().split(/\s+/);
	assert.ok(
		deps.some((d) => d === 'postcss' || d.startsWith('postcss@')),
		listed.stdout
	);
	assert.ok(
		deps.some((d) => d === 'css-select' || d.startsWith('css-select@')),
		listed.stdout
	);
	for (const name of ['postcss', 'css-select']) {
		assert.doesNotThrow(() => require(name), `missing ${name}; run npm ci or npm run test:review`);
	}
});
