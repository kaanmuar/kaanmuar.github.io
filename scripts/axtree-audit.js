#!/usr/bin/env node
/*
 * Out-of-band accessibility-tree audit (#3831). Opens a page in Chromium with Playwright, reads the browser's own
 * accessibility tree over the DevTools Protocol (Accessibility.getFullAXTree), and reduces it with
 * functions/url-review-axtree.js. No script is injected into the page, so a strict Content-Security-Policy cannot
 * block it the way it blocks an injected axe-core (#998). This runs on a machine with a browser, never in Cloud Functions.
 *
 *   node scripts/axtree-audit.js <url>                       prints a summary, exits 1 when any error-level rule fails
 *   node scripts/axtree-audit.js <url> --earl out.json       also writes W3C EARL 1.0 (JSON-LD)
 *   node scripts/axtree-audit.js <url> --sarif out.sarif     also writes SARIF 2.1.0
 *   node scripts/axtree-audit.js <url> --json out.json       also writes the reduce() report (attach as extras.axtree)
 *   node scripts/axtree-audit.js --file tree.json [--url u]  reduces a saved getFullAXTree response, no browser
 *
 * URL Review findings: attach the reduce() report or the raw CDP `{ nodes }` response on the review as
 * `extras.axtree` (or pass `axtree` into insights.analyze). Cloud Functions only call findings()/reduce(); capture
 * stays here. Production auto-attach (same CDP helper): set QA_AXTREE_CDP=1 or URL_REVIEW_AXTREE_CDP=1 on the
 * managed review browser runner — see functions/url-review-axtree-cdp.js.
 */
const fs = require('fs');
const axtree = require('../functions/url-review-axtree');

function args(argv) {
	const out = { target: '', earl: '', sarif: '', json: '', file: '', url: '' };
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === '--earl') out.earl = argv[++i] || '';
		else if (arg === '--sarif') out.sarif = argv[++i] || '';
		else if (arg === '--json') out.json = argv[++i] || '';
		else if (arg === '--file') out.file = argv[++i] || '';
		else if (arg === '--url') out.url = argv[++i] || '';
		else if (!arg.startsWith('--')) out.target = arg;
	}
	return out;
}

async function capture(url) {
	if (!/^https?:\/\//i.test(url)) throw new Error('Give an http(s) address.');
	const axtreeCdp = require('../functions/url-review-axtree-cdp');
	require('./playwright-sandbox');
	const { chromium } = require('playwright');
	const browser = await chromium.launch();
	try {
		const page = await browser.newPage();
		await page.goto(url, { waitUntil: 'load', timeout: 45000 });
		const got = await axtreeCdp.attach(page, { force: true, reduce: false, keepTree: true });
		return got.tree;
	} finally {
		await browser.close();
	}
}

async function main() {
	const opts = args(process.argv.slice(2));
	if (!opts.target && !opts.file) {
		console.error(
			'Usage: node scripts/axtree-audit.js <url> [--earl out.json] [--sarif out.sarif] [--json out.json] | --file tree.json'
		);
		process.exit(2);
	}
	const tree = opts.file ? JSON.parse(fs.readFileSync(opts.file, 'utf8')) : await capture(opts.target);
	const report = axtree.reduce(tree, { url: opts.target || opts.url });
	if (opts.earl) fs.writeFileSync(opts.earl, JSON.stringify(axtree.earl(report), null, 2) + '\n');
	if (opts.sarif) fs.writeFileSync(opts.sarif, JSON.stringify(axtree.sarif(report), null, 2) + '\n');
	if (opts.json) fs.writeFileSync(opts.json, JSON.stringify(report, null, 2) + '\n');
	console.log(report.total + ' accessibility nodes (' + report.ignored + ' ignored), ' + report.issues.length + ' problems');
	Object.keys(report.counts).forEach((rule) => console.log('  ' + rule + ': ' + report.counts[rule]));
	process.exit(Object.keys(report.counts).some((rule) => axtree.RULES[rule].level === 'error') ? 1 : 0);
}

main().catch((error) => {
	console.error(error.message || error);
	process.exit(2);
});
