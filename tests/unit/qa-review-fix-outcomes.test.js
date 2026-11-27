// After-report outcomes strip on paid reports (#4416 / epic #4360).
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const fix = require('../../js/qa-review-fix.js');

const ROOT = path.join(__dirname, '../..');
const OUTCOME_KEYS = [
	'outcomesEyebrow',
	'outcomesTitle',
	'outcomesLead',
	'outcomeWatchTitle',
	'outcomeWatchCopy',
	'outcomeIndexTitle',
	'outcomeIndexCopy',
	'outcomeDeskTitle',
	'outcomeDeskCopy',
];

test('outcomes copy exists in every fix language table (#4416)', () => {
	Object.keys(fix.T).forEach((lang) => {
		OUTCOME_KEYS.forEach((key) => assert.ok(fix.T[lang][key], lang + ' missing ' + key));
	});
});

test('deskFindings keeps only open seo/geo/perf keys (#4416)', () => {
	const report = {
		insights: {
			findings: [
				{ id: 'F-1', key: 'seo-title', verdict: 'fail' },
				{ id: 'F-2', key: 'sec-hsts', verdict: 'fail' },
				{ id: 'F-3', key: 'geo-llms', verdict: 'risk' },
				{ id: 'F-4', key: 'seo-desc', verdict: 'pass' },
			],
		},
	};
	const rows = fix.deskFindings(report);
	assert.deepEqual(
		rows.map((f) => f.id),
		['F-1', 'F-3']
	);
});

test('deskSummary does not promise auto publish (#4416)', () => {
	const text = fix.deskSummary(
		{ id: 'rep1', host: 'example.com' },
		[{ id: 'F-1', title: 'Missing title' }],
		(f) => f.title
	);
	assert.match(text, /human review/i);
	assert.match(text, /server/i);
	assert.doesNotMatch(text, /auto.?publish/i);
});

test('qa-review-fix.js mounts outcomes without IndexNow fetch (#4416)', () => {
	const source = fs.readFileSync(path.join(ROOT, 'js/qa-review-fix.js'), 'utf8');
	assert.ok(source.includes('paintOutcomes'), 'missing paintOutcomes');
	assert.ok(source.includes('fix-outcomes'), 'missing fix-outcomes section');
	assert.ok(source.includes('data-fix-outcome-index'), 'IndexNow path must be present');
	assert.doesNotMatch(source, /indexnow.*fetch\(/i, 'must not call IndexNow from the browser');
	assert.doesNotMatch(source, /\/review\/indexnow/i);
});