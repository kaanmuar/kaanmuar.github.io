#!/usr/bin/env node
'use strict';
/* ReDoS scan for functions/ and workers/ with recheck (#3833). CI installs recheck with npm --no-save. */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ROOTS = process.argv.slice(2).length
	? process.argv.slice(2).map((p) => path.resolve(p))
	: [path.join(ROOT, 'functions'), path.join(ROOT, 'workers')];

let checkSync;
try {
	({ checkSync } = require('recheck'));
} catch {
	console.error('Install recheck: npm install --no-save recheck@4.6.2');
	process.exit(2);
}

const NEW_RE = /new RegExp\(\s*(`(?:[^`\\]|\\.)*`|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')\s*(?:,\s*(`(?:[^`\\]|\\.)*`|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|'[^']*'|"[^"]*"))?\s*\)/g;
// The class excludes backslash so \\. and the class never match the same character (CodeQL js/polynomial-redos).
// A [...] class is read whole: a / inside it does not end the literal.
const LIT_RE = /=\s*(\/(?:\\.|\[(?:\\.|[^\]\\\n])*\]|[^/\\\n[])+\/[gimsuy]*)/g;

const unquote = (raw) => {
	const q = raw[0];
	if (q !== '"' && q !== "'" && q !== '`') return raw;
	let out = '';
	for (let i = 1; i < raw.length - 1; i += 1) {
		if (raw[i] === '\\' && i + 1 < raw.length - 1) {
			out += raw[i + 1];
			i += 1;
		} else out += raw[i];
	}
	return out;
};

const walk = (dir, out = []) => {
	for (const name of fs.readdirSync(dir)) {
		const full = path.join(dir, name);
		const st = fs.statSync(full);
		if (st.isDirectory()) {
			if (name === 'node_modules' || name === '.git') continue;
			walk(full, out);
		} else if (name.endsWith('.js') && !name.endsWith('.min.js')) out.push(full);
	}
	return out;
};

const patterns = [];
for (const root of ROOTS) {
	if (!fs.existsSync(root)) continue;
	for (const file of walk(root)) {
		const text = fs.readFileSync(file, 'utf8');
		let m;
		NEW_RE.lastIndex = 0;
		while ((m = NEW_RE.exec(text))) {
			const source = unquote(m[1]);
			const flags = m[2] ? unquote(m[2]) : '';
			patterns.push({ file, line: text.slice(0, m.index).split('\n').length, source, flags });
		}
		LIT_RE.lastIndex = 0;
		while ((m = LIT_RE.exec(text))) {
			const lit = m[1];
			const last = lit.lastIndexOf('/');
			if (last < 1) continue;
			patterns.push({
				file,
				line: text.slice(0, m.index).split('\n').length,
				source: lit.slice(1, last).replace(/\\\//g, '/'),
				flags: lit.slice(last + 1),
			});
		}
	}
}

const seen = new Set();
const vulnerable = [];
const budget = { timeout: 10000, attackTimeout: 2000 };

for (const row of patterns) {
	const key = row.source + '\0' + row.flags;
	if (seen.has(key)) continue;
	seen.add(key);
	let diag;
	try {
		diag = checkSync(row.source, row.flags, budget);
	} catch (err) {
		vulnerable.push({ ...row, status: 'error', detail: String(err.message || err).slice(0, 120) });
		continue;
	}
	if (diag.status === 'vulnerable' || diag.status === 'unknown') {
		vulnerable.push({ ...row, status: diag.status });
	}
}

console.log('patterns checked:', seen.size);
if (!vulnerable.length) {
	console.log('recheck: no vulnerable patterns');
	process.exit(0);
}
for (const v of vulnerable) {
	const rel = path.relative(ROOT, v.file);
	console.log(`${rel}:${v.line} ${v.status} /${v.source}/${v.flags}`);
}
process.exit(1);