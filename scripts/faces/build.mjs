#!/usr/bin/env node
// Writes the shipped faces (#3826) from designs/faces/catalog.js:
//   assets/faces/badge/<id>.svg and <id>-light.svg   report rows and headings, dark and light themes
//   assets/faces/line/<id>.svg                        cyber side and threat levels
// Run after editing the catalog: node scripts/faces/build.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FULL } from '../../designs/faces/catalog.js';
import { LEVELS } from '../../designs/faces/symbols.js';
import { faceSVG, levelItem } from '../../designs/faces/svg.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const out = (dir) => {
	const d = path.join(root, 'assets/faces', dir);
	fs.mkdirSync(d, { recursive: true });
	return d;
};
const badge = out('badge');
const line = out('line');
const levels = LEVELS.map(levelItem);
let n = 0;
const write = (dir, name, svg) => {
	fs.writeFileSync(path.join(dir, `${name}.svg`), svg + '\n');
	n++;
};

for (const it of [...FULL, ...levels]) {
	write(badge, it.id, faceSVG(it, 'badge', { size: 64 }));
	write(badge, `${it.id}-light`, faceSVG(it, 'badge', { size: 64, theme: 'light' }));
	if (it.group === 'cyber' || it.id.startsWith('lvl-')) write(line, it.id, faceSVG(it, 'line', { size: 64 }));
}
console.log(`${n} faces in assets/faces`);
