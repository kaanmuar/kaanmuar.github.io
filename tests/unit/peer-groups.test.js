/**
 * Peer-group campaign helpers (#2363): taxonomy walk, phrases and language by country.
 *
 *   npm run test:review
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const { SECTORS, pairs, phraseOf, langOf } = require('../../scripts/peer-groups');

const sector = (key, preset) => SECTORS.find((s) => s.key === key) || { key, en: key, preset, scopes: [preset] };

test('phraseOf names global, continental, cross and local groups in plain English', () => {
	const hotels = sector('hotels', 'local');
	const place = { name: 'Cartagena, Colombia', cc: 'co', id: 'co-Cartagena' };
	assert.equal(phraseOf(hotels, 'global', place), 'hotels worldwide');
	assert.equal(phraseOf(hotels, 'continent', { name: 'Europe', id: 'Europe' }), 'hotels across Europe');
	assert.equal(phraseOf(hotels, 'cross', { name: 'Colombia', cc: 'co', id: 'co' }), 'hotels in Colombia and worldwide');
	assert.equal(phraseOf(hotels, 'city', place), 'hotels in Cartagena, Colombia');
});

test('langOf follows Spanish- and Portuguese-speaking countries', () => {
	assert.equal(langOf('co'), 'es');
	assert.equal(langOf('br'), 'pt');
	assert.equal(langOf('de'), 'de');
	assert.equal(langOf('us'), 'en');
});

test('pairs walks each sector once before repeats and never duplicates a triple', () => {
	const taken = new Set();
	const list = pairs(taken);
	assert.ok(list.length >= SECTORS.length);
	const keys = list.map((item) => item.sector.key + '|' + item.scope + '|' + item.place.id);
	assert.equal(new Set(keys).size, keys.length);
	for (const item of list) {
		assert.ok(item.sector.scopes.includes(item.scope));
	}
	const more = pairs(taken);
	for (const item of more) {
		const key = item.sector.key + '|' + item.scope + '|' + item.place.id;
		assert.ok(!keys.includes(key));
		keys.push(key);
	}
});