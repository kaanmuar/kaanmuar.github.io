#!/usr/bin/env node
/**
 * Refresh LAB_LINE in js/qa-lab.js from actual `id: '…'` lines (#3571 / #3552).
 * Run after Biome mass-format so qa-lab-lines unit test stays green.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const file = path.join(__dirname, '..', 'js', 'qa-lab.js');
const src = fs.readFileSync(file, 'utf8');
const actual = {};
src.split('\n').forEach((line, i) => {
	const m = line.match(/^\s+id: ['"]([A-Z]+-\d+)['"]/);
	if (m) actual[m[1]] = i + 1;
});
const block = src.match(/const LAB_LINE = \{([\s\S]*?)\};/);
if (!block) {
	console.error('LAB_LINE missing');
	process.exit(1);
}
const ids = [...block[1].matchAll(/['"]([A-Z]+-\d+)['"]:\s*(\d+)/g)].map((m) => m[1]);
const missing = ids.filter((id) => !(id in actual));
if (missing.length) {
	console.error('missing ids', missing.join(','));
	process.exit(1);
}
const body = ids.map((id) => `\t\t'${id}': ${actual[id]},`).join('\n');
fs.writeFileSync(file, src.replace(/const LAB_LINE = \{[\s\S]*?\};/, `const LAB_LINE = {\n${body}\n\t};`));
console.log('LAB_LINE refreshed:', ids.length, 'entries');
