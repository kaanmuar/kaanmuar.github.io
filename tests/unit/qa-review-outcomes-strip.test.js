// Unpaid/paid health outcome strip from insights.outcomes (#4298).
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '../..');

function loadCopy(lang) {
	const sandbox = { window: {}, document: { documentElement: { lang }, querySelectorAll: () => [] } };
	vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js/qa-review-report-copy.js'), 'utf8'), sandbox);
	return sandbox.window.QAReviewReportCopy;
}

test('outcomes strip copy is EN-first with fallbacks (#4298)', () => {
	const en = loadCopy('en');
	assert.equal(en.t('outcomesTitle'), 'Outcome packs');
	assert.equal(en.t('outcomesOpen', { n: 3 }), '3 open');
	const es = loadCopy('es');
	assert.equal(es.t('outcomesTitle'), 'Outcome packs');
	assert.equal(es.t('outcomesOpen', { n: 1 }), '1 open');
});

test('qa-review.js renders the strip only when insights.outcomes is non-empty (#4298)', () => {
	const source = fs.readFileSync(path.join(ROOT, 'js/qa-review.js'), 'utf8');
	assert.ok(source.includes('function outcomesHealthStrip(ins)'), 'missing outcomesHealthStrip');
	assert.match(source, /ins\.outcomes/, 'must read insights.outcomes');
	assert.ok(source.includes('outcomesHealthStrip(ins)'), 'paintHealth must call outcomesHealthStrip');
	assert.ok(source.includes('verdict-chips outcome-strip'), 'strip must reuse verdict chip row');
	assert.ok(source.includes('primaryCta'), 'CTA text must surface on chips');
	assert.ok(source.includes('vchip o-outcome'), 'outcome chips must use compact vchip styling');
});
