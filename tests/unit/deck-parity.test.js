'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('child_process');
const path = require('path');

const parity = require('../../scripts/check-deck-parity.js');

test("deck parity: a URL Review change needs changes.js / presentation/ or 'deck: skip' in the PR body (#4102)", () => {
	assert.equal(parity.checkPr(['functions/jarvis.js'], '').ok, true);
	assert.equal(parity.checkPr(['functions/url-review-core.js'], '').ok, false);
	assert.equal(parity.checkPr(['qa-review.html', 'js/qa-review.js'], 'Fixes #1').ok, false);
	assert.equal(
		parity.checkPr(['functions/url-review-core.js', 'scripts/feature-deck/changes.js'], '').ok,
		true
	);
	assert.equal(parity.checkPr(['js/qa-review.js', 'presentation/index.html'], '').ok, true);
	assert.deepEqual(parity.checkPr(['llms.txt'], 'deck: skip: wording-only for agents, no visitor change.'), {
		ok: true,
		review: ['llms.txt'],
		optOut: true,
	});
	assert.equal(parity.checkPr(['llms.txt'], 'deck: skip:').ok, false);
});

test('deck parity: optOutText feeds checkPr so skip can live outside the webhook body (#4139)', () => {
	const text = parity.optOutText('deck: skip: commit-message lane (#4139).', null, null);
	assert.deepEqual(parity.checkPr(['functions/url-review-core.js'], text), {
		ok: true,
		review: ['functions/url-review-core.js'],
		optOut: true,
	});
});

test('deck parity: base and head refs default to origin/main and HEAD', () => {
	assert.deepEqual(parity.refs([]), { base: 'origin/main', head: 'HEAD' });
	assert.deepEqual(parity.refs(['abc']), { base: 'abc', head: 'HEAD' });
	assert.deepEqual(parity.refs(['abc', 'def']), { base: 'abc', head: 'def' });
});

test('deck parity: the script runs without refs and fails cleanly on a bad ref', () => {
	const script = path.join(__dirname, '../../scripts/check-deck-parity.js');
	const bad = spawnSync('node', [script, 'no-such-ref-4102', 'HEAD'], { encoding: 'utf8' });
	assert.equal(bad.status, 2);
	assert.match(bad.stderr, /Usage: node scripts\/check-deck-parity\.js/);
	assert.doesNotMatch(bad.stderr, /undefined|at Object|node:internal/);
});

test('deck parity: newestChangesDate reads changes.js when present', () => {
	const { date, missing } = parity.newestChangesDate();
	assert.equal(missing, false);
	assert.match(date, /^\d{4}-\d{2}-\d{2}$/);
});
