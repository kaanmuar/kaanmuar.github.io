#!/usr/bin/env node
// Fails a PR that changes the web Jarvis without changing the Android app (#1447).
// Usage in CI: node scripts/check-jarvis-parity.js <base-sha> <head-sha>, with the PR body in PR_BODY.
// Locally both refs are optional: base defaults to origin/main, head to HEAD (#3989).
'use strict';

const { execFileSync } = require('child_process');

const JARVIS = [/^js\/admin-jarvis[^/]*\.js$/, /^css\/admin-jarvis\.css$/, /^functions\/jarvis[^/]*\.js$/];
const OPT_OUT = /no app change:\s*\S/i;

function check(files, body) {
	const web = files.filter((f) => JARVIS.some((re) => re.test(f)));
	if (!web.length) return { ok: true, web };
	if (files.some((f) => f.startsWith('android/'))) return { ok: true, web };
	if (OPT_OUT.test(body || '')) return { ok: true, web, optOut: true };
	return { ok: false, web };
}

function refs(args) {
	const [base, head] = args;
	return { base: base || 'origin/main', head: head || 'HEAD' };
}

if (require.main === module) {
	const { base, head } = refs(process.argv.slice(2));
	let files;
	try {
		files = execFileSync('git', ['diff', '--name-only', `${base}...${head}`], {
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'pipe'],
		})
			.split('\n')
			.filter(Boolean);
	} catch (e) {
		console.error(
			`Could not diff ${base}...${head}: ${String(e.stderr || e.message).trim()}\nUsage: node scripts/check-jarvis-parity.js [<base-ref> [<head-ref>]] (defaults: origin/main HEAD)`
		);
		process.exit(2);
	}
	const out = check(files, process.env.PR_BODY);
	if (out.ok) {
		console.log(
			out.web.length
				? out.optOut
					? "Jarvis changed with 'no app change' in the PR body."
					: 'Jarvis and android/ changed together.'
				: 'No web Jarvis change.'
		);
	} else {
		console.error(
			`This PR changes the web Jarvis (${out.web.join(', ')}) but not android/.\nMake the same change in the app, or add "no app change: <why>" to the PR body.`
		);
		process.exit(1);
	}
}

module.exports = { check, refs };
