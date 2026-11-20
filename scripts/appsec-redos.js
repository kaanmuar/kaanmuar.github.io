#!/usr/bin/env node
'use strict';
/* ReDoS scan for functions/ and workers/ with recheck (#3833, #3953). CI installs recheck with npm --no-save.
   Patterns come from a real JS parse (acorn, already in the root lockfile): every regex literal in any expression
   position (call arguments, array and object literals, return, ternary, ...) and every new RegExp / RegExp("...")
   whose source is a plain string. A file acorn cannot parse falls back to the older text scan (assignments and
   new RegExp only) and is reported, so a parse failure never hides a file silently. */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

const NEW_RE = /new RegExp\(\s*(`(?:[^`\\]|\\.)*`|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')\s*(?:,\s*(`(?:[^`\\]|\\.)*`|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|'[^']*'|"[^"]*"))?\s*\)/g;
// The class excludes backslash so \\. and the class never match the same character (CodeQL js/polynomial-redos).
const LIT_RE = /=\s*(\/(?:\\.|[^/\\\n])+\/[gimsuy]*)/g;

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

const lineAt = (text, index) => text.slice(0, index).split('\n').length;

/** The older text scan: `= /re/` assignments and new RegExp('...'). Used only when acorn cannot parse a file. */
function collectByText(text) {
	const out = [];
	let m;
	NEW_RE.lastIndex = 0;
	while ((m = NEW_RE.exec(text))) {
		out.push({ line: lineAt(text, m.index), source: unquote(m[1]), flags: m[2] ? unquote(m[2]) : '' });
	}
	LIT_RE.lastIndex = 0;
	while ((m = LIT_RE.exec(text))) {
		const lit = m[1];
		const last = lit.lastIndexOf('/');
		if (last < 1) continue;
		out.push({ line: lineAt(text, m.index), source: lit.slice(1, last).replace(/\\\//g, '/'), flags: lit.slice(last + 1) });
	}
	return out;
}

const parseJs = (acorn, text) => {
	const base = { ecmaVersion: 'latest', locations: true, allowHashBang: true, allowReturnOutsideFunction: true, allowAwaitOutsideFunction: true };
	try {
		return acorn.parse(text, { ...base, sourceType: 'script' });
	} catch (err) {
		try {
			return acorn.parse(text, { ...base, sourceType: 'module' });
		} catch {
			throw err;
		}
	}
};

const staticString = (node) => {
	if (!node) return null;
	if (node.type === 'Literal' && typeof node.value === 'string') return node.value;
	if (node.type === 'TemplateLiteral' && !node.expressions.length) return node.quasis[0].value.cooked;
	return null;
};

/** Patterns in `text` ({line, source, flags}) plus `dynamic`: RegExp(...) calls whose source is built at run time. */
function collectPatterns(text, acorn) {
	let ast;
	try {
		ast = parseJs(acorn, text);
	} catch (err) {
		return { patterns: collectByText(text), dynamic: [], parseError: String(err.message || err).slice(0, 120) };
	}
	const patterns = [];
	const dynamic = [];
	const stack = [ast];
	while (stack.length) {
		const node = stack.pop();
		if (!node || typeof node.type !== 'string') continue;
		if (node.type === 'Literal' && node.regex) {
			patterns.push({ pos: node.start, line: node.loc.start.line, source: node.regex.pattern, flags: node.regex.flags });
		} else if ((node.type === 'NewExpression' || node.type === 'CallExpression') && node.callee.type === 'Identifier' && node.callee.name === 'RegExp' && node.arguments.length) {
			const source = staticString(node.arguments[0]);
			const flags = node.arguments[1] ? staticString(node.arguments[1]) : '';
			if (source !== null && flags !== null) patterns.push({ pos: node.start, line: node.loc.start.line, source, flags });
			else if (node.arguments[0].type !== 'Literal' || node.arguments[0].regex === undefined) dynamic.push({ line: node.loc.start.line });
		}
		for (const key of Object.keys(node)) {
			const v = node[key];
			if (Array.isArray(v)) for (const c of v) stack.push(c);
			else if (v && typeof v === 'object') stack.push(v);
		}
	}
	patterns.sort((a, b) => a.pos - b.pos);
	return { patterns: patterns.map(({ pos, ...rest }) => rest), dynamic };
}

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

function main() {
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
	let acorn = null;
	try {
		acorn = require('acorn');
	} catch {
		console.error('acorn not found (root devDependency tree): falling back to the text scan, which misses inline regex literals.');
	}

	const patterns = [];
	const parseErrors = [];
	let dynamicCount = 0;
	for (const root of ROOTS) {
		if (!fs.existsSync(root)) continue;
		for (const file of walk(root)) {
			const text = fs.readFileSync(file, 'utf8');
			const found = acorn ? collectPatterns(text, acorn) : { patterns: collectByText(text), dynamic: [] };
			if (found.parseError) parseErrors.push(`${path.relative(ROOT, file)}: ${found.parseError}`);
			dynamicCount += found.dynamic.length;
			for (const p of found.patterns) patterns.push({ file, ...p });
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

	console.log('regex occurrences found:', patterns.length);
	console.log('patterns checked:', seen.size);
	if (dynamicCount) console.log('RegExp(...) built at run time, not checkable:', dynamicCount);
	for (const e of parseErrors) console.log('parse failed, text scan used:', e);
	if (!vulnerable.length) {
		console.log('recheck: no vulnerable patterns');
		process.exit(0);
	}
	for (const v of vulnerable) {
		const rel = path.relative(ROOT, v.file);
		console.log(`${rel}:${v.line} ${v.status} /${v.source}/${v.flags}`);
	}
	process.exit(1);
}

if (require.main === module) main();
else module.exports = { collectPatterns, collectByText };
