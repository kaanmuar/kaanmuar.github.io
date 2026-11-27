// GEO empty states: GSC connect + watch adjacency (#4414).
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

test('GEO empty copy is present in EN (#4414)', () => {
	const en = loadCopy('en');
	assert.match(en.t('geoGscTitle'), /Search Console/i);
	assert.match(en.t('geoGscBody'), /decay/i);
	assert.match(en.t('geoWatchNote'), /watch/i);
	assert.doesNotMatch(en.t('geoWatchNote'), /is on|already on/i);
});

test('qa-review.js wires GSC connect and watch notes in paintGeo (#4414)', () => {
	const source = fs.readFileSync(path.join(ROOT, 'js/qa-review.js'), 'utf8');
	assert.ok(source.includes('function hasGscInsights(ins)'), 'missing hasGscInsights');
	assert.ok(source.includes('function geoGscConnectCard(ins)'), 'missing geoGscConnectCard');
	assert.ok(source.includes('function geoWatchNoteCard(report)'), 'missing geoWatchNoteCard');
	assert.match(source, /extras\.gsc/, 'must read insights.extras.gsc');
	assert.match(source, /\^seo-gsc-/, 'must detect GSC finding keys');
	assert.ok(source.includes('data-part="gsc-connect"'), 'GSC card marker');
	assert.match(source, /report\.watchOf/, 'watch note must skip watch reruns');
	assert.ok(source.includes('paintGeo(ins, report)'), 'paintInsights must pass report');
	assert.match(source, /qa-review-account\.html/, 'must link account');
});