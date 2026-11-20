const test = require('node:test');
const assert = require('node:assert/strict');
const lines = require('../../scripts/tips-studio/caption-lines');
const tips = require('../../scripts/tips-studio/tips');
const i18n = require('../../scripts/social-hub/i18n');

test('scaffolding is stable per post id and varies across posts', () => {
	const a = lines.actionLead({ id: 'canonical' }, 'try');
	assert.equal(a, lines.actionLead({ id: 'canonical' }, 'try'));
	assert.ok(lines.TRY.includes(a.trim()));
	const leads = new Set(tips.TIPS.slice(0, 12).map((tip) => lines.actionLead(tip, 'try')));
	assert.ok(leads.size >= 2, String([...leads]));
	const closes = new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((id) => lines.fairClose({ id })));
	assert.ok(closes.size >= 2, String([...closes]));
});

test("reworded captions keep the tip's title, body and action", () => {
	const tip = tips.TIPS[0];
	const head = tips.plainTitle(tip);
	const cap = tips.captions(tip, 0, tips.TIPS.length);
	assert.ok(cap.linkedin.startsWith(head));
	assert.ok(cap.linkedin.includes(tip.body));
	assert.ok(cap.linkedin.includes(tip.action));
	assert.ok(cap.instagram.includes(tip.action));
	assert.ok(cap.facebook.includes(tip.action));
});

test('phrasebooks cover every scaffold variant string', () => {
	const books = Object.fromEntries(i18n.LANGS.map((lang) => [lang, i18n.readBook(lang)]));
	const url = 'https://example.com/x';
	const sample = [
		...lines.TRY.map((s) => s + ' Ship the fix.'),
		...lines.LESSON.map((s) => s + ' Ship the fix.'),
		...lines.CHECK.map((s) => s + ' Ship the fix.'),
		...lines.GUIDE_LINK.map((s) => s + ' ' + url),
		...lines.REPORT_LINK.map((s) => s + ' ' + url),
		...lines.GUIDE_BIO,
		...lines.REPORT_BIO,
		...lines.FAIR_CLOSE,
		...lines.DID_YOU.map((s) => s + ' Extra fact here.'),
		...lines.YT_GUIDE.map((s) => s + ' ' + url),
		lines.fairLine({ id: 'fair' }, '15 Nov 2026'),
	].join('\n\n');
	// Action bodies and "Extra fact here." are not scaffold; only assert scaffold templates.
	const scaffold = new Set();
	for (const list of [lines.TRY, lines.LESSON, lines.CHECK, lines.DID_YOU]) {
		list.forEach((s) => scaffold.add(s));
	}
	for (const list of [lines.GUIDE_LINK, lines.REPORT_LINK, lines.YT_GUIDE]) {
		list.forEach((s) => scaffold.add(s + ' ⟦1⟧'));
	}
	lines.GUIDE_BIO.forEach((s) => scaffold.add(s));
	lines.REPORT_BIO.forEach((s) => scaffold.add(s));
	lines.FAIR_CLOSE.forEach((s) => scaffold.add(s));
	scaffold.add('One automated analysis of public pages on ⟦1⟧ Nov ⟦2⟧.');
	for (const lang of i18n.LANGS) {
		const missing = [...scaffold].filter((tpl) => !books[lang][tpl]);
		assert.deepEqual(missing, [], lang + ' missing scaffold phrases');
	}
	// And a composed caption with only scaffold + URL still translates once a known body is used.
	const known = 'A starting point, not a verdict.';
	for (const id of ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8']) {
		const text = [
			lines.actionLead({ id }, 'try') + known,
			lines.guideLinked({ id }, url),
			lines.reportLinked({ id }, url),
			lines.guideBio({ id }),
			lines.reportBio({ id }),
			lines.fairClose({ id }),
			lines.didYouKnow({ id }) + known,
			lines.youtubeGuide({ id }, url),
		].join('\n');
		for (const lang of i18n.LANGS) {
			const missing = i18n.templates(text).filter((tpl) => !books[lang][tpl]);
			assert.equal(i18n.translate(text, books[lang]) == null, false, lang + ' ' + id + ': ' + missing.join(' | '));
		}
	}
});
