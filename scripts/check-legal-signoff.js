/**
 * CI gate for the legal page text (#4004): every clause of legal/clauses.json must match the SHA-256 the owner signed off in
 * legal/signoff.json, and its status must be the one scripts/legal-signoff.js --apply sets. A PR that changes a clause text
 * passes only when it also updates legal/signoff.json (the owner's act, visible in the diff).
 *
 *   node scripts/check-legal-signoff.js
 */
const fs = require('fs');
const signoff = require('./legal-signoff');

function check(clauses, sign, text) {
	const out = signoff.problems(clauses, sign).map((row) => row.id + ' ' + row.why);
	if (!out.length && text !== undefined) {
		const next = signoff.applyToText(text, signoff.wanted(clauses, sign));
		if (next !== text) out.push('status or counselReviewedOn lines of legal/clauses.json differ from legal/signoff.json (run node scripts/legal-signoff.js --apply)');
	}
	return out;
}

if (require.main === module) {
	const text = fs.readFileSync(signoff.CLAUSES, 'utf8');
	const clauses = JSON.parse(text).clauses;
	const sign = fs.existsSync(signoff.SIGNOFF) ? JSON.parse(fs.readFileSync(signoff.SIGNOFF, 'utf8')) : { signoffs: {} };
	const out = check(clauses, sign, text);
	if (out.length) {
		console.error('Legal sign-off check failed (' + out.length + '):');
		out.slice(0, 20).forEach((line) => console.error('  - ' + line));
		if (out.length > 20) console.error('  ... and ' + (out.length - 20) + ' more');
		console.error('A clause text may change only in a PR that also updates legal/signoff.json: the owner runs');
		console.error('  node scripts/legal-signoff.js --sign --by "<name>" --on YYYY-MM-DD --note "<why>" [--counsel-on YYYY-MM-DD]');
		console.error('  node scripts/legal-signoff.js --apply');
		process.exit(1);
	}
	console.log('legal/signoff.json matches all ' + clauses.length + ' clauses.');
}

module.exports = { check };
