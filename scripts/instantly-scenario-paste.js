#!/usr/bin/env node
/* Export cold_safe Instantly bodies for sequence T (#4321). No Instantly API call — paste or diff only.
 *
 *   node scripts/instantly-scenario-paste.js              # markdown to stdout
 *   node scripts/instantly-scenario-paste.js --json     # JSON to stdout
 *   node scripts/instantly-scenario-paste.js --out path # write markdown (or .json when --json)
 *
 * Live campaign upload still goes through the private qa-lab-outreach folder and instantly_campaigns.py
 * when INSTANTLY_API_KEY is available there; this repo ships the copy guard + paste pack only.
 */

const fs = require('fs');
const path = require('path');
const templates = require('../functions/outreach-scenario-templates');

function main(argv) {
	const json = argv.includes('--json');
	const outIdx = argv.indexOf('--out');
	const outPath = outIdx >= 0 ? path.resolve(argv[outIdx + 1] || '') : '';
	if (outIdx >= 0 && !outPath) throw new Error('--out needs a file path');
	const text = json ? JSON.stringify(templates.formatJsonPastePack(), null, 2) + '\n' : templates.formatMarkdownPastePack();
	if (outPath) {
		fs.mkdirSync(path.dirname(outPath), { recursive: true });
		fs.writeFileSync(outPath, text, 'utf8');
		console.log('Wrote ' + outPath);
		return;
	}
	process.stdout.write(text);
}

if (require.main === module) main(process.argv.slice(2));

module.exports = { main };