const test = require('node:test');
const assert = require('node:assert/strict');
const ask = require('../../js/qa-review-ask.js');
const sample = require('./fixtures/review-carlosandmunoz.json');

function report(changes) {
	return Object.assign(JSON.parse(JSON.stringify(sample)), changes || {});
}

function words(result) {
	return result.parts.map((part) => (part.kind === 'list' ? part.items.join(' ') : part.text)).join(' ');
}

const KEYS = ['askListed', 'listedTitle', 'listedNone', 'listedClear', 'listedFound', 'listedHow', 'askFirst', 'firstTitle', 'firstLead', 'firstNext', 'firstNone'];

test('ask answers "am I listed" and "what first" from the saved cyber check (#3850)', () => {
	const rep = report();
	rep.targeted = {
		host: 'carlosandmunoz.com',
		status: 'critical',
		items: [
			{ level: 'critical', kind: 'c2-indicator', subject: '198.51.100.7', source: 'Feodo Tracker', evidence: 'Active botnet C2 indicator' },
			{ level: 'info', kind: 'c2-indicator', subject: '203.0.113.9', source: 'Tor exit list', evidence: 'Tor exit' },
			{ level: 'high', kind: 'known-exploit-software', subject: 'nginx', source: 'CISA KEV', evidence: 'KEV' },
		],
		sourcesRead: ['Feodo Tracker'],
	};
	assert.equal(ask.intentOf('Am I listed anywhere?'), 'listed');
	assert.equal(ask.intentOf('What should I do first?'), 'first');
	assert.equal(ask.intentOf('Fix F-01 first'), 'fix');

	const listed = ask.answer(rep, 'Am I listed anywhere?');
	assert.equal(listed.intent, 'listed');
	assert.match(words(listed), /appears in 1 blocklist or threat-list entries/);
	assert.match(words(listed), /Feodo Tracker/);
	assert.doesNotMatch(words(listed), /Tor exit|CISA KEV/);

	const clean = report();
	clean.targeted = { host: 'carlosandmunoz.com', status: 'clear', items: [] };
	assert.match(words(ask.answer(clean, 'Am I on a blocklist?')), /is not on any blocklist this report checked/);
	assert.match(words(ask.answer(report(), 'Am I listed?')), /no saved blocklist check/);
	assert.match(words(ask.answer(clean, 'Estoy en una lista de bloqueo?', { lang: 'es' })), /no está en ninguna lista de bloqueo/);

	const first = ask.answer(rep, 'What should I do first?');
	assert.equal(first.intent, 'first');
	assert.equal(first.title, 'Start here');
	assert.match(words(first), /Start with F-\d+/);
	assert.ok(first.ref);

	assert.equal(ask.answer(Object.assign(report(), { preview: true }), 'Am I listed anywhere?').intent, 'closed');
	Object.keys(ask.T).forEach((lang) => KEYS.forEach((key) => assert.ok(ask.T[lang][key], lang + '.' + key)));
});
