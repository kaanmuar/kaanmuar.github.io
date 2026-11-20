// Run-to-run delta badge copy and FE wiring (#3483).
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const LANGS = ['es', 'pt', 'de', 'fr', 'it'];
const ROOT = path.join(__dirname, '../..');
const KEYS = [
	'delta',
	'deltaFixed',
	'deltaNew',
	'historySince',
	'historyLastReview',
	'historyScore',
	'historyCounts',
	'historyFixedTitle',
	'historyNewTitle',
	'historyMore',
];

function loadCopy(lang) {
	const sandbox = { window: {}, document: { documentElement: { lang }, querySelectorAll: () => [] } };
	vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js/qa-review-report-copy.js'), 'utf8'), sandbox);
	return sandbox.window.QAReviewReportCopy;
}

function templates(lang) {
	const source = fs.readFileSync(path.join(ROOT, 'js/qa-review-report-copy.js'), 'utf8');
	const start = source.indexOf('    ' + lang + ': {');
	assert.ok(start >= 0, lang + ' block missing');
	const next = ['en', 'es', 'pt', 'de', 'fr', 'it']
		.map((other) => (other === lang ? -1 : source.indexOf('\n    ' + other + ': {', start + 1)))
		.filter((i) => i > start)
		.concat([source.indexOf('\n  };', start)])
		.sort((a, b) => a - b)[0];
	const section = source.slice(start, next);
	const out = {};
	for (const key of KEYS) {
		const one = section.match(new RegExp(key + '_one: "([^"]*)"'));
		const plain = section.match(new RegExp(key + ': "([^"]*)"'));
		out[key] = (one && one[1]) || (plain && plain[1]) || '';
	}
	return out;
}

test('delta badge copy exists in every language with matching slots (#3483)', () => {
	const slots = (text) => (String(text).match(/\{\w+\}/g) || []).sort().join(' ');
	const en = loadCopy('en');
	const enT = templates('en');
	assert.equal(en.t('deltaFixed', { n: 1 }), '1 fixed');
	assert.equal(en.t('deltaNew', { n: 2 }), '2 new');
	assert.match(en.t('historySince', { date: '1 Nov' }), /1 Nov/);
	for (const lang of LANGS) {
		const rc = loadCopy(lang);
		const own = templates(lang);
		for (const key of KEYS) {
			const text = rc.t(key, { n: 2, date: 'D', before: 1, now: 2, fixed: 1, fresh: 2, still: 3 });
			const english = en.t(key, { n: 2, date: 'D', before: 1, now: 2, fixed: 1, fresh: 2, still: 3 });
			assert.ok(own[key], lang + '.' + key + ' missing');
			assert.notEqual(text, english, lang + '.' + key + ' is still English');
			assert.equal(slots(own[key]), slots(enT[key]), lang + '.' + key + ' slots drift');
			assert.ok(!/\{\w+\}/.test(text), lang + '.' + key + ' left a slot: ' + text);
		}
	}
});

test('qa-review.js gates the badge on paid unlock and builds overall Δ plus fixed/new (#3483)', () => {
	const source = fs.readFileSync(path.join(ROOT, 'js/qa-review.js'), 'utf8');
	assert.ok(source.includes('function runHistory(report, paid)'), 'missing runHistory gate');
	assert.ok(source.includes('function deltaBadge(history)'), 'missing deltaBadge');
	assert.match(source, /rc\.t\(\s*['"]deltaFixed['"]/, 'badge must read fixed count copy');
	assert.match(source, /rc\.t\(\s*['"]deltaNew['"]/, 'badge must read new count copy');
	assert.ok(source.includes('paintHealth(ins, paid)'), 'health must receive paid');
	assert.ok(source.includes('historyBlock(runHistory(report, paid))'), 'exec history must be gated');
	assert.ok(!source.includes('Since your review on '), 'exec history must not hardcode English');
	assert.ok(!source.includes('Fixed since then'), 'exec history must not hardcode English titles');
});
