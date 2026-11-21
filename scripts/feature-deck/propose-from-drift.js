#!/usr/bin/env node
// Prints draft changes.js items for URL Review commits that drifted past the last
// changes.js update (#4102). Paste into changes.js under today's date, then:
//   npm --prefix scripts/feature-deck run deck
// Usage: node scripts/feature-deck/propose-from-drift.js [ref]
'use strict';

const path = require('path');
const parity = require('../check-deck-parity.js');

const ref = process.argv[2] || 'HEAD';
const out = parity.drift(ref);
if (out.missing || (out.message && !out.drifted)) {
	console.error(out.message || 'drift failed');
	process.exit(out.missing ? 1 : 2);
}
if (!out.drifted.length) {
	console.log(`No drift after ${out.base}. Nothing to propose.`);
	process.exit(0);
}

const today = new Date().toISOString().slice(0, 10);
console.log(`// Draft for changes.js (${today}). Edit faces and wording before committing.`);
console.log(`\t{`);
console.log(`\t\tdate: '${today}',`);
console.log(`\t\titems: [`);
for (const c of out.drifted) {
	const t = c.subject
		.replace(/\s*\(#[0-9]+\)\s*/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, 60);
	console.log(`\t\t\t{ face: 'tools', t: ${JSON.stringify(t)}, d: 'Shipped in ${c.sha}. Rewrite in plain words, then pick a face from assets/faces/badge.' },`);
}
console.log(`\t\t],`);
console.log(`\t},`);
