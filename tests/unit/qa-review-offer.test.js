// Unpaid report offer row (#4308 / #4255 §2 and §5).
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

const LANGS = ['en', 'es', 'pt', 'de', 'fr', 'it'];

test('offer copy keys exist in six languages (#4308)', () => {
	for (const lang of LANGS) {
		const copy = loadCopy(lang === 'en' ? 'en-US' : lang);
		for (const key of ['offerFullLine', 'offerLocalCompareLead', 'offerLocalCompareNote']) {
			assert.ok(copy.t(key), lang + ' missing ' + key);
		}
	}
	const en = loadCopy('en-US');
	assert.match(en.t('offerFullLine'), /19 USD/);
	assert.match(en.t('offerLocalCompareLead'), /9 USD/);
	assert.match(en.t('offerLocalCompareNote'), /BrightLocal/);
});

test('paintOffer paints fix-list primary and local compare hook (#4308)', () => {
	const source = fs.readFileSync(path.join(ROOT, 'js/qa-review.js'), 'utf8');
	assert.ok(source.includes('function reportTreatedAsLocal(report)'), 'missing reportTreatedAsLocal');
	assert.match(source, /local-'/, 'local detection must key off local-* findings');
	assert.ok(source.includes('offer-secondary'), 'full report must be a secondary line');
	assert.ok(source.includes('offer-local-compare'), 'local compare line must render');
	assert.ok(source.includes('data-offer="compare"') && source.includes('#compare'), 'compare must link to compare UI');
	assert.ok(source.includes('offer offer-full" data-offer="fixlist"'), 'fix list must be offer-full');
});