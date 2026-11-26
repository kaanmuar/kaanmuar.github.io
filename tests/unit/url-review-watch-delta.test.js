'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
	diffSnapshots,
	AREAS,
	formatDeltaMarkdown,
	formatDeltaText,
} = require('../../functions/url-review-watch-delta');

test('diffSnapshots reads compact live-report snapshots (#4366)', () => {
	const a = { overall: 62, areas: { SEO: 75, GEO: 88, Security: 46 } };
	const b = { overall: 64, areas: { SEO: 62, GEO: 83, Security: 53 } };
	const out = diffSnapshots(a, b);
	assert.equal(out.before, 62);
	assert.equal(out.now, 64);
	assert.equal(out.overall, 2);
	assert.deepEqual(out.areas.SEO, { before: 75, now: 62, delta: -13 });
	assert.deepEqual(out.areas.GEO, { before: 88, now: 83, delta: -5 });
	assert.deepEqual(out.areas.Security, { before: 46, now: 53, delta: 7 });
});

test('diffSnapshots reads full report insights.score (#4366)', () => {
	const a = {
		insights: {
			score: {
				overall: 50,
				areas: {
					SEO: { score: 70, grade: 'C' },
					Accessibility: { score: 40, grade: 'F' },
				},
			},
		},
	};
	const b = {
		insights: {
			score: {
				overall: 55,
				areas: {
					SEO: { score: 72, grade: 'C' },
					Accessibility: { score: 38, grade: 'F' },
				},
			},
		},
	};
	const out = diffSnapshots(a, b);
	assert.equal(out.overall, 5);
	assert.equal(out.areas.SEO.delta, 2);
	assert.equal(out.areas.Accessibility.delta, -2);
});

test('diffSnapshots keeps canonical area keys when only one side has a score (#4366)', () => {
	const out = diffSnapshots({ overall: 80, areas: { SEO: 80 } }, { overall: 81, areas: {} });
	assert.ok(AREAS.indexOf('Performance') >= 0);
	assert.equal(out.areas.SEO.before, 80);
	assert.equal(out.areas.SEO.now, null);
	assert.equal(out.areas.SEO.delta, null);
	assert.equal(out.areas.Performance, undefined);
});

test('diffSnapshots returns null overall delta when a side is missing (#4366)', () => {
	assert.equal(diffSnapshots({ overall: 60 }, {}).overall, null);
	assert.equal(diffSnapshots({}, { overall: 60 }).before, null);
});

test('formatDeltaMarkdown renders overall and area movement (#4380)', () => {
	const diff = diffSnapshots(
		{ overall: 62, areas: { SEO: 75, Security: 46 } },
		{ overall: 64, areas: { SEO: 62, Security: 53 } }
	);
	const md = formatDeltaMarkdown(diff);
	assert.match(md, /Overall:\*\* 62 → 64 \(\+2\)/);
	assert.match(md, /SEO:\*\* 75 → 62 \(-13\)/);
	assert.match(md, /Security:\*\* 46 → 53 \(\+7\)/);
	const text = formatDeltaText(diff);
	assert.match(text, /Overall: 62 → 64/);
	assert.doesNotMatch(text, /\*\*/);
});

test('formatDeltaMarkdown returns empty when diff is missing (#4380)', () => {
	assert.equal(formatDeltaMarkdown(null), '');
});