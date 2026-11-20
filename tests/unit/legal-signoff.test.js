const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const signoff = require('../../scripts/legal-signoff');
const { check } = require('../../scripts/check-legal-signoff');

const text = fs.readFileSync(signoff.CLAUSES, 'utf8');
const clauses = JSON.parse(text).clauses;
const signed = JSON.parse(fs.readFileSync(signoff.SIGNOFF, 'utf8'));

test('every clause text matches the hash the owner signed off, and the status lines follow the rule (#4004)', () => {
	assert.deepEqual(check(clauses, signed, text), [], 'a clause text changed: sign it off with node scripts/legal-signoff.js --sign, then --apply');
});

test('a changed clause text fails the gate until legal/signoff.json is updated in the same change', () => {
	const edited = clauses.map((c) => (c.id === 'national.personal-data.2' ? { ...c, text: c.text + ' Edited.' } : c));
	const failed = check(edited, signed);
	assert.equal(failed.length, 1);
	assert.match(failed[0], /^national\.personal-data\.2 text changed since it was signed off \(\d{4}-\d{2}-\d{2}\)$/);
	const resigned = signoff.sign(edited, signed, { by: 'Owner', on: '2026-12-01', note: 'Reviewed the edit.' });
	assert.deepEqual(check(edited, resigned), []);
	assert.equal(resigned.signoffs['national.personal-data.2'].counselReviewedOn, null);
	assert.equal(resigned.signoffs['statute.CO'], signed.signoffs['statute.CO'], 'untouched clauses keep their sign-off');
});

test('a new clause has no sign-off and a removed clause leaves a stale one', () => {
	const added = clauses.concat({ ...clauses[0], id: 'new.clause', text: 'New.' });
	assert.match(check(added, signed)[0], /^new\.clause has no sign-off/);
	assert.match(check(clauses.slice(1), signed)[0], /^statute\.CO is signed off but no longer in legal\/clauses\.json$/);
});

test('every sign-off carries who, when and the text hash', () => {
	clauses.forEach((c) => {
		const entry = signed.signoffs[c.id];
		assert.equal(entry.sha256, signoff.hash(c.text), c.id);
		assert.ok(entry.signedOffBy && entry.note && /^\d{4}-\d{2}-\d{2}$/.test(entry.signedOffOn), c.id);
	});
});

test('--apply rewrites only the status and counselReviewedOn lines, by the sign-off rule', () => {
	const draft = signoff.applyToText(text, signoff.wanted(clauses, { signoffs: {} }));
	const changed = text.split('\n').filter((line, i) => line !== draft.split('\n')[i]);
	assert.ok(changed.length === 0 || changed.every((line) => /"(status|counselReviewedOn)":/.test(line)));
	assert.equal(draft.split('\n').length, text.split('\n').length);
	const drafts = JSON.parse(draft).clauses;
	assert.ok(drafts.every((c) => c.status === 'draft' && c.counselReviewedOn === null));
	assert.ok(drafts.every((c, i) => c.text === clauses[i].text && JSON.stringify(c.cites) === JSON.stringify(clauses[i].cites)));
	const back = signoff.applyToText(draft, signoff.wanted(clauses, signed));
	assert.equal(back, text, 'applying the sign-off to the drafts gives clauses.json back');
});

test('a clause whose text changed after sign-off is a draft again, with no counsel date', () => {
	const edited = clauses.map((c) => (c.id === 'statute.CO' ? { ...c, text: 'Ley 1581 de 2013' } : c));
	const want = signoff.wanted(edited, signed);
	assert.deepEqual(want['statute.CO'], { status: 'draft', counselReviewedOn: null });
	assert.equal(want['statute.EU'].status, 'counsel-approved');
	assert.equal(want['statute.EU'].counselReviewedOn, '2026-11-19');
});
