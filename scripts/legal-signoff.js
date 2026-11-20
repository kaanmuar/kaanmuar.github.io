/**
 * The owner's sign-off on the legal page text (#4004). legal/signoff.json binds each clause id of legal/clauses.json to the
 * SHA-256 of its `text`, with who signed it off and when. scripts/check-legal-signoff.js fails CI when a clause text no
 * longer matches its hash, so a text change reaches main only in a PR that also changes legal/signoff.json: the owner's act,
 * visible in the PR diff.
 *
 *   node scripts/legal-signoff.js --sign --by "<name>" --on YYYY-MM-DD --note "<why>" [--counsel-on YYYY-MM-DD] [--all]
 *       signs off every clause that has no matching hash yet (all of them with --all) and drops entries of removed clauses.
 *       --counsel-on is the day the owner reported counsel's read of that text; without it the clause stays a draft.
 *   node scripts/legal-signoff.js --apply
 *       sets `status` and `counselReviewedOn` in legal/clauses.json by one rule: a clause whose text matches its signed-off
 *       hash and whose sign-off carries counselReviewedOn is "counsel-approved" on that day; every other clause is a "draft"
 *       with null. Only those two lines of a clause change; no counsel name or other fact is written.
 *   node scripts/legal-signoff.js --apply --check
 *       exits 1 when --apply would change legal/clauses.json.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const CLAUSES = path.join(__dirname, '..', 'legal', 'clauses.json');
const SIGNOFF = path.join(__dirname, '..', 'legal', 'signoff.json');
const ABOUT = [
	'One entry per clause id of legal/clauses.json: sha256 is the SHA-256 (hex, UTF-8) of the clause `text` the owner signed off.',
	'scripts/check-legal-signoff.js fails CI when a clause text no longer matches, unless the PR also updates this file; that update is the owner\'s act.',
	'counselReviewedOn is the day the owner reported that counsel had read that text; scripts/legal-signoff.js --apply copies it into legal/clauses.json.',
	'Sign off with: node scripts/legal-signoff.js --sign --by "<name>" --on YYYY-MM-DD --note "<why>" [--counsel-on YYYY-MM-DD], then --apply.',
];

function hash(text) {
	return crypto.createHash('sha256').update(String(text), 'utf8').digest('hex');
}

const realDay = (day) =>
	/^\d{4}-\d{2}-\d{2}$/.test(day || '') && new Date(day + 'T00:00:00Z').toISOString().slice(0, 10) === day;

/** What the sign-off file says is wrong with the clauses: changed, new, or removed text, and a status that is not the rule's. */
function problems(clauses, signoff) {
	const entries = (signoff && signoff.signoffs) || {};
	const out = [];
	clauses.forEach((clause) => {
		const entry = entries[clause.id];
		if (!entry) return out.push({ id: clause.id, why: 'has no sign-off in legal/signoff.json' });
		if (entry.sha256 !== hash(clause.text)) return out.push({ id: clause.id, why: 'text changed since it was signed off (' + entry.signedOffOn + ')' });
		if (!entry.signedOffBy || !realDay(entry.signedOffOn)) out.push({ id: clause.id, why: 'sign-off lacks signedOffBy or a real signedOffOn' });
		if (entry.counselReviewedOn && !realDay(entry.counselReviewedOn)) out.push({ id: clause.id, why: 'sign-off counselReviewedOn is not a real day' });
	});
	const known = new Set(clauses.map((clause) => clause.id));
	Object.keys(entries)
		.filter((id) => !known.has(id))
		.forEach((id) => out.push({ id, why: 'is signed off but no longer in legal/clauses.json' }));
	return out;
}

/** The status and counselReviewedOn each clause must carry: counsel-approved only on a matching hash with a counsel day. */
function wanted(clauses, signoff) {
	const entries = (signoff && signoff.signoffs) || {};
	return Object.fromEntries(
		clauses.map((clause) => {
			const entry = entries[clause.id];
			const approved = entry && entry.sha256 === hash(clause.text) && entry.counselReviewedOn;
			return [clause.id, approved ? { status: 'counsel-approved', counselReviewedOn: entry.counselReviewedOn } : { status: 'draft', counselReviewedOn: null }];
		})
	);
}

/** clauses.json text with only each clause's status and counselReviewedOn lines rewritten to `want`. */
function applyToText(text, want) {
	let id = null;
	return text
		.split('\n')
		.map((line) => {
			const named = /^\t\t\t"id": "([^"]+)"/.exec(line);
			if (named) id = named[1];
			const wants = id && want[id];
			if (!wants) return line;
			const status = /^(\t\t\t"status": )"[^"]*"(,?)$/.exec(line);
			if (status) return status[1] + JSON.stringify(wants.status) + status[2];
			const counsel = /^(\t\t\t"counselReviewedOn": )(?:null|"[^"]*")(,?)$/.exec(line);
			if (counsel) return counsel[1] + JSON.stringify(wants.counselReviewedOn) + counsel[2];
			return line;
		})
		.join('\n');
}

/** A new signoff object: the clauses without a matching hash (all with `all`) signed by `who`, in clause order. */
function sign(clauses, signoff, who, all) {
	const before = (signoff && signoff.signoffs) || {};
	const signoffs = {};
	clauses.forEach((clause) => {
		const keep = before[clause.id];
		signoffs[clause.id] =
			!all && keep && keep.sha256 === hash(clause.text)
				? keep
				: {
						sha256: hash(clause.text),
						signedOffBy: who.by,
						signedOffOn: who.on,
						note: who.note,
						counselReviewedOn: who.counselOn || null,
					};
	});
	return { about: ABOUT, signoffs };
}

const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const readSignoff = () => (fs.existsSync(SIGNOFF) ? read(SIGNOFF) : { signoffs: {} });

function main(argv) {
	const flag = (name) => {
		const at = argv.indexOf('--' + name);
		return at === -1 ? undefined : argv[at + 1];
	};
	const clauses = read(CLAUSES).clauses;
	if (argv.includes('--sign')) {
		const who = { by: flag('by'), on: flag('on'), note: flag('note'), counselOn: flag('counsel-on') };
		if (!who.by || !who.note || !realDay(who.on) || (who.counselOn && !realDay(who.counselOn))) {
			console.error('--sign needs --by "<name>", --on YYYY-MM-DD and --note "<why>"; --counsel-on must be YYYY-MM-DD.');
			return 1;
		}
		const before = readSignoff();
		const next = sign(clauses, before, who, argv.includes('--all'));
		const changed = clauses.filter((clause) => (before.signoffs || {})[clause.id] !== next.signoffs[clause.id]).length;
		fs.writeFileSync(SIGNOFF, JSON.stringify(next, null, '\t') + '\n');
		console.log('legal/signoff.json: ' + changed + ' of ' + clauses.length + ' clauses signed off by ' + who.by + ' on ' + who.on + '.');
		return 0;
	}
	if (argv.includes('--apply')) {
		const current = fs.readFileSync(CLAUSES, 'utf8');
		const next = applyToText(current, wanted(clauses, readSignoff()));
		JSON.parse(next);
		if (argv.includes('--check')) {
			if (next !== current) {
				console.error('legal/clauses.json status lines are not what legal/signoff.json says. Run node scripts/legal-signoff.js --apply');
				return 1;
			}
			console.log('legal/clauses.json status lines match legal/signoff.json.');
			return 0;
		}
		fs.writeFileSync(CLAUSES, next);
		const counted = Object.values(wanted(clauses, readSignoff())).filter((row) => row.status === 'counsel-approved').length;
		console.log('legal/clauses.json: ' + counted + ' of ' + clauses.length + ' clauses counsel-approved, the rest draft.');
		return 0;
	}
	console.error('Usage: node scripts/legal-signoff.js --sign --by <name> --on <day> --note <why> [--counsel-on <day>] [--all] | --apply [--check]');
	return 1;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));

module.exports = { hash, problems, wanted, applyToText, sign, CLAUSES, SIGNOFF };
