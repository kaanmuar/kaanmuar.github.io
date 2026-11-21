#!/usr/bin/env node
// Keeps the living URL Review deck (#3931) from going stale (#4102).
//
// PR mode (CI): a PR that changes user-facing URL Review code must also change
// scripts/feature-deck/changes.js (and usually rebuild presentation/), or say
// "deck: skip: <why>" in the PR body — same pattern as Jarvis app parity (#1447).
//
// Drift mode (main / daily): lists commits after the last commit that touched
// changes.js that touch URL Review without also touching changes.js. Exit 1 when
// any remain. That is how we know the deck is current without reading every chat.
//
// Usage:
//   node scripts/check-deck-parity.js [<base-ref> [<head-ref>]]   # PR check; defaults origin/main HEAD
//   node scripts/check-deck-parity.js --drift [ref]               # since CHANGES date; default HEAD
// Env: PR_BODY for the opt-out line (CI should fetch the live PR body; commit messages are also scanned).
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const CHANGES_FILE = 'scripts/feature-deck/changes.js';

// Paths that change what a visitor sees or pays for in URL Review.
const REVIEW = [
	/^functions\/url-review[^/]*\.js$/,
	/^qa-review[^/]*\.html$/,
	/^js\/qa-review[^/]*\.js$/,
	/^css\/qa-review[^/]*\.css$/,
	/^llms\.txt$/,
	/^llms\/.*\.txt$/,
];

const DECK = [/^scripts\/feature-deck\/changes\.js$/, /^presentation\//];

const OPT_OUT = /deck:\s*skip:\s*\S/i;

// Commits that never need a deck line (CI noise, regen, social ledgers).
const SKIP_SUBJECT = /\[skip ci\]|Social ledgers:|Live reports:|PageSpeed daily:|Field sweep:|Domain index:|Sweep seeds:|Sweep round-up:|Rebuild generated/i;

function isReview(f) {
	return REVIEW.some((re) => re.test(f));
}

function isDeck(f) {
	return DECK.some((re) => re.test(f));
}

function checkPr(files, body) {
	const review = files.filter(isReview);
	if (!review.length) return { ok: true, review };
	if (files.some(isDeck)) return { ok: true, review, updated: true };
	if (OPT_OUT.test(body || '')) return { ok: true, review, optOut: true };
	return { ok: false, review };
}

function git(args, opts) {
	return execFileSync('git', args, {
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'pipe'],
		cwd: ROOT,
		...opts,
	}).trim();
}

function newestChangesDate() {
	const file = path.join(ROOT, CHANGES_FILE);
	if (!fs.existsSync(file)) {
		return { date: null, missing: true };
	}
	const { CHANGES } = require(file);
	const dates = (CHANGES || []).map((d) => d.date).filter(Boolean).sort();
	return { date: dates.length ? dates[dates.length - 1] : null, missing: false };
}

function lastChangesCommit(ref) {
	try {
		const sha = git(['log', '-1', '--format=%H', ref, '--', CHANGES_FILE]);
		return sha || null;
	} catch {
		return null;
	}
}

function drift(ref) {
	const { date, missing } = newestChangesDate();
	if (missing) {
		return {
			ok: false,
			missing: true,
			message: `${CHANGES_FILE} is missing. The living deck must exist before drift can be checked.`,
		};
	}
	const base = lastChangesCommit(ref);
	if (!base) {
		return {
			ok: false,
			message: `No commit on ${ref} touches ${CHANGES_FILE}. Add the living deck first.`,
		};
	}
	let log;
	try {
		log = git(['log', `${base}..${ref}`, '--format=%H\t%s']);
	} catch (e) {
		return { ok: false, message: `Could not read git log: ${String(e.stderr || e.message).trim()}` };
	}
	if (!log) return { ok: true, date, base: base.slice(0, 9), drifted: [] };

	const drifted = [];
	for (const line of log.split('\n')) {
		const tab = line.indexOf('\t');
		const sha = tab === -1 ? line : line.slice(0, tab);
		const subject = tab === -1 ? '' : line.slice(tab + 1);
		if (SKIP_SUBJECT.test(subject)) continue;
		let files;
		try {
			files = git(['diff-tree', '--no-commit-id', '--name-only', '-r', sha]).split('\n').filter(Boolean);
		} catch {
			continue;
		}
		if (!files.some(isReview)) continue;
		if (files.some(isDeck)) continue;
		drifted.push({ sha: sha.slice(0, 9), subject });
	}
	return { ok: !drifted.length, date, base: base.slice(0, 9), drifted };
}

function refs(args) {
	const [base, head] = args;
	return { base: base || 'origin/main', head: head || 'HEAD' };
}

function commitMessages(base, head) {
	try {
		return git(['log', `${base}..${head}`, '--format=%B']);
	} catch {
		return '';
	}
}

// "deck: skip" in any commit on the branch counts, so a push can pass without a body-only edit (#4139).
function optOutText(body, base, head) {
	return [body || '', base && head ? commitMessages(base, head) : ''].filter(Boolean).join('\n');
}

if (require.main === module) {
	const argv = process.argv.slice(2);
	if (argv[0] === '--drift') {
		const ref = argv[1] || 'HEAD';
		const out = drift(ref);
		if (out.missing) {
			console.error(out.message);
			process.exit(1);
		}
		if (out.ok) {
			console.log(
				`Deck drift: ok. Last ${CHANGES_FILE} commit ${out.base}; newest day ${out.date}; no unmatched URL Review commits after that on ${ref}.`
			);
			process.exit(0);
		}
		if (out.message && !out.drifted) {
			console.error(out.message);
			process.exit(2);
		}
		console.error(
			`Deck drift (#4102): URL Review shipped after ${CHANGES_FILE} @ ${out.base} (newest day ${out.date}) without updating the deck:\n` +
				out.drifted.map((c) => `  ${c.sha}  ${c.subject}`).join('\n') +
				`\nAdd a plain-language item to changes.js, run npm --prefix scripts/feature-deck run deck, and commit presentation/.\n` +
				`Or, for a commit that must not appear in the deck, put "deck: skip: <why>" in that PR body next time.`
		);
		process.exit(1);
	}

	const { base, head } = refs(argv);
	let files;
	try {
		files = git(['diff', '--name-only', `${base}...${head}`]).split('\n').filter(Boolean);
	} catch (e) {
		console.error(
			`Could not diff ${base}...${head}: ${String(e.stderr || e.message).trim()}\n` +
				`Usage: node scripts/check-deck-parity.js [<base-ref> [<head-ref>]] | --drift [ref]`
		);
		process.exit(2);
	}
	const out = checkPr(files, optOutText(process.env.PR_BODY, base, head));
	if (out.ok) {
		console.log(
			out.review.length
				? out.optOut
					? "URL Review changed with 'deck: skip' in the PR or commit messages."
					: 'URL Review and the living deck (changes.js / presentation/) changed together.'
				: 'No user-facing URL Review change.'
		);
		process.exit(0);
	}
	console.error(
		`This PR changes URL Review (${out.review.join(', ')}) but not ${CHANGES_FILE} or presentation/.\n` +
			`Update changes.js with a plain-language item, run npm --prefix scripts/feature-deck run deck, commit presentation/,\n` +
			`or add "deck: skip: <why>" to the PR body or a commit message when the change must not appear in the deck (#4102).`
	);
	process.exit(1);
}

module.exports = {
	checkPr,
	drift,
	isReview,
	isDeck,
	OPT_OUT,
	REVIEW,
	DECK,
	refs,
	newestChangesDate,
	optOutText,
	commitMessages,
};
