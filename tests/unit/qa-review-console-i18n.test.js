/**
 * Review console T dictionaries (#4042).
 *
 *   node --test tests/unit/qa-review-console-i18n.test.js
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const LANGS = ['es', 'pt', 'de', 'fr', 'it'];

function consoleT() {
	const source = fs.readFileSync(path.join(__dirname, '../../js/qa-review-console.js'), 'utf8');
	const chunk = source.slice(source.indexOf('const T ='), source.indexOf('const L ='));
	return vm.runInNewContext(chunk + '; T;', { document: { documentElement: { lang: 'en' } } });
}

const looksTranslated = (text) => /[A-Za-z]{2,} [a-z]{2,}/.test(String(text));

test('every locale has the same keys and placeholders as English (#4042)', () => {
	const T = consoleT();
	const slots = (text) => (String(text).match(/\{\w+\}/g) || []).sort().join(' ');
	const en = T.en;
	for (const lang of LANGS) {
		assert.ok(T[lang], lang + ' missing');
		for (const key of Object.keys(en)) {
			assert.ok(T[lang][key] != null, lang + ' missing ' + key);
			if (T[lang][key] === en[key] && looksTranslated(en[key])) {
				assert.fail(lang + '.' + key + ' is still English: ' + en[key]);
			}
			assert.equal(slots(T[lang][key]), slots(en[key]), lang + '.' + key + ' slots');
		}
	}
});