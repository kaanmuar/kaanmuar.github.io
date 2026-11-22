/**
 * Clean-room ACT / eMAG map for axe-core rule ids (#3831).
 *
 *   node --test tests/unit/url-review-act-map.test.js
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('path');
const actMap = require('../../functions/url-review-act-map');
const standards = require('../../functions/url-review-a11y-standards');

test('list covers aliases and axe-only rows with no unmapped keys', () => {
	const keys = actMap.list();
	assert.ok(keys.includes('link-name'));
	assert.ok(keys.includes('color-contrast'));
	assert.ok(keys.includes('html-has-lang'));
	const cov = actMap.coverage();
	assert.deepEqual(cov.unmapped, []);
	assert.equal(cov.rules, keys.length);
	assert.ok(cov.act >= 10, 'most rules map to at least one ACT id');
	assert.ok(cov.emag >= 10);
	assert.ok(cov.rgaa >= 10);
});

test('aliases reuse axtree standards rows so ACT ids stay consistent', () => {
	assert.deepEqual(actMap.forAxe('link-name').act, standards.forRule('ax-link-name').act);
	assert.deepEqual(actMap.forAxe('ax-button-name').act, standards.forRule('ax-button-name').act);
	assert.equal(actMap.forAxe('document-title').act[0].id, '2779a5');
	assert.equal(actMap.forAxe('image-alt').act[0].id, '23a2a8');
	assert.equal(actMap.forAxe('label').act[0].id, 'e086e5');
	assert.equal(actMap.normalizeId('ax-link-name'), 'link-name');
});

test('axe-only contrast and lang rows use public ACT ids', () => {
	const contrast = actMap.forAxe('color-contrast');
	assert.deepEqual(contrast.act, [
		{ id: 'afw4f7', match: 'equivalent', url: 'https://act-rules.github.io/rules/afw4f7' },
	]);
	assert.equal(contrast.rgaa[0].id, '3.2');
	assert.equal(contrast.emag[0].id, '4.1');
	assert.equal(actMap.forAxe('html-has-lang').act[0].id, 'b5c3f8');
	assert.equal(actMap.ids('html-has-lang').emag[0], '3.1');
	assert.deepEqual(actMap.forAxe('frame-title').act, []);
	assert.equal(actMap.forAxe('frame-title').rgaa[0].id, '2.1');
});

test('unknown ids stay empty; enrich omits empty maps', () => {
	['nope', '', 'constructor', undefined, null].forEach((id) => {
		actMap.SYSTEMS.forEach((s) => assert.deepEqual(actMap.forAxe(id)[s], []));
		assert.deepEqual(actMap.enrich(id), {});
	});
	const packed = actMap.enrich('link-name');
	assert.deepEqual(packed.standards.act, ['c487ae']);
	assert.ok(packed.standardTags.includes('act:c487ae'));
	assert.ok(packed.standardTags.includes('emag3.1:3.5'));
});

test('identifiers keep catalogue shapes; no upstream packages vendored', () => {
	actMap.list().forEach((rule) => {
		const row = actMap.forAxe(rule);
		row.act.forEach((e) => assert.match(e.id, /^[0-9a-z]{6}$/));
		row.rgaa.forEach((e) => assert.match(e.id, /^(1[0-3]|[1-9])\.\d{1,2}$/));
		row.emag.forEach((e) => assert.match(e.id, /^[1-6]\.\d{1,2}$/));
		row.markuplint.forEach((e) => assert.match(e.id, /^[a-z]+(-[a-z0-9]+)*$/));
		[].concat(row.act, row.rgaa, row.emag, row.markuplint).forEach((e) => {
			assert.ok(['equivalent', 'partial'].includes(e.match));
		});
	});
	const pkg = path.join(__dirname, '..', '..', 'package.json');
	const deps = JSON.parse(fs.readFileSync(pkg, 'utf8'));
	const all = Object.assign({}, deps.dependencies || {}, deps.devDependencies || {});
	['@qualweb/core', '@qualweb/act-rules', 'qualweb', 'emag-audit', 'markuplint', 'assistant-rgaa'].forEach((name) => {
		assert.equal(all[name], undefined, name + ' must not be a dependency');
	});
});

test('forAxe returns fresh objects', () => {
	const a = actMap.forAxe('color-contrast');
	a.act[0].id = 'changed';
	a.act.push({ id: 'x' });
	assert.equal(actMap.forAxe('color-contrast').act[0].id, 'afw4f7');
	assert.equal(actMap.forAxe('color-contrast').act.length, 1);
});
