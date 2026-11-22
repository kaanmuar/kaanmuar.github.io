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

test('board builds study stats and chart series (#4240)', () => {
	const scouts = [
		Learn.jarvisSlice(
			Object.assign(Learn.emptyState('tool'), {
				runs: 4,
				lessons: ['a', 'b'],
				odds: [{ id: 'usable-candidates', p: 0.7, claim: 'candidates may deserve a ticket' }],
				openQuestions: [{ id: 'tool:x', text: 'Ticket?' }],
				asked: [{ id: 'tool:y', option: 'ticket', status: 'answered', at: '2026-11-20T00:00:00Z' }],
			})
		),
		Learn.jarvisSlice(Object.assign(Learn.emptyState('engagement'), { runs: 2, lessons: ['c'], openQuestions: [] })),
	];
	const asked = [{ option: 'ticket', status: 'answered' }, { option: 'later', status: 'later' }, { option: 'skip', status: 'dismissed' }];
	const runs = [
		{ at: '2026-11-20T12:00:00Z', questions: [{ id: '1' }] },
		{ at: '2026-11-21T12:00:00Z', questions: [] },
		{ at: '2026-11-21T18:00:00Z', questions: [{ id: '2' }, { id: '3' }] },
	];
	const b = Learn.board(scouts, asked, runs);
	assert.equal(b.totals.runs, 6);
	assert.equal(b.totals.open, 1);
	assert.ok(b.runsByScout.some((r) => r.scout === 'tool' && r.value === 4));
	assert.ok(b.odds[0].value === 70);
	assert.ok(b.decisions.some((d) => d.label === 'ticket'));
	assert.equal(b.daily.length, 2);
	assert.ok(b.study.length >= 2);
	assert.match(b.study.join(' '), /open ask/i);
});
