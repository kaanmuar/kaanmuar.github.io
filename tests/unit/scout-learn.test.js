'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Learn = require('../../functions/scout-learn');

const NOW = Date.parse('2026-11-22T18:00:00Z');

test('SCOUTS and ask cadences are defined', () => {
	assert.deepEqual(Learn.SCOUTS, ['tool', 'engagement', 'field-sweep', 'trending']);
	for (const scout of Learn.SCOUTS) assert.ok(Learn.ASK_EVERY_MS[scout] >= 86400000);
	assert.equal(Learn.normalizeScout('field'), 'field-sweep');
});

test('tool learnFile asks about candidates with decision options (private)', () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scout-learn-'));
	const prev = Learn.DIR;
	Learn.DIR = dir;
	try {
		const learned = Learn.learnFile(
			'tool',
			{ drift: 2, candidates: 3, traps: 1, flags: 1, corners: [{ id: 'B', name: 'GEO', usable: 3, traps: 1 }] },
			NOW
		);
		assert.equal(learned.slice.scout, 'tool');
		assert.equal(learned.slice.runs, 1);
		assert.equal(learned.private, true);
		assert.ok(learned.asked.some((q) => /candidates|drift/i.test(q.text)));
		assert.ok(learned.asked[0].options.some((o) => o.id === 'ticket'));
		assert.ok(learned.slice.odds.some((o) => o.id === 'usable-candidates'));
		assert.match(learned.markdown, /private/i);
		assert.ok(fs.existsSync(path.join(dir, 'tool.json')));
	} finally {
		Learn.DIR = prev;
	}
});

test('ask cadence suppresses new questions until the window passes', () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scout-learn-'));
	const prev = Learn.DIR;
	Learn.DIR = dir;
	try {
		Learn.learnFile('engagement', { fresh: 1, drafted: 1, needs: ['Mac agent: not paired'] }, NOW);
		const again = Learn.learnFile('engagement', { fresh: 2, drafted: 6, needs: ['Mac agent: not paired'] }, NOW + 3600000);
		assert.equal(again.asked.length, 0);
	} finally {
		Learn.DIR = prev;
	}
});

test('field-sweep and trending learnFile expand knowledge under their scopes', () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scout-learn-'));
	const prev = Learn.DIR;
	Learn.DIR = dir;
	try {
		const field = Learn.learnFile('field-sweep', { proposed: 4, sources: 6, failedSources: 1 }, NOW);
		assert.ok(field.asked.some((q) => /field-sweep|source/i.test(q.text)));
		const trend = Learn.learnFile('trending', { drafts: 2, tags: 2 }, NOW);
		assert.ok(trend.asked.some((q) => /#3814|trending/i.test(q.text)));
	} finally {
		Learn.DIR = prev;
	}
});

test('analyze is pure and jarvisSlice is bounded', () => {
	const a = Learn.analyze('tool', { drift: 0, candidates: 0 }, Learn.emptyState('tool'), NOW);
	assert.equal(a.askDue, true);
	assert.ok(a.lessons.some((l) => /clean|quiet|no new/i.test(l)));
	const slice = Learn.jarvisSlice(Object.assign(Learn.emptyState('tool'), { runs: 3, lessons: ['a', 'b'], openQuestions: [{ id: '1', text: 'q' }] }));
	assert.equal(slice.runs, 3);
	assert.equal(slice.openQuestions.length, 1);
});
