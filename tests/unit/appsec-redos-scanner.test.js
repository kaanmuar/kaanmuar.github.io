'use strict';
// #3953: the ReDoS scanner must collect regex literals in every expression position, not just `= /re/` assignments.
const test = require('node:test');
const assert = require('node:assert/strict');
const acorn = require('acorn');
const { collectPatterns } = require('../../scripts/appsec-redos.js');

const found = (code) => collectPatterns(code, acorn);
const sources = (code) => found(code).patterns.map((p) => `${p.source}/${p.flags}`);

test('assignment and new RegExp are still collected', () => {
	assert.deepEqual(sources("const a = /ab+c/gi; const b = new RegExp('x\\\\d+', 'm'); const c = RegExp(`y`);"), [
		'ab+c/gi',
		'x\\d+/m',
		'y/',
	]);
});

test('inline literals are collected: call arguments, array, object, return, ternary, logical, template', () => {
	const code = [
		"s.replace(/(<(script|style)\\b[^>]*>[\\s\\S]*?<\\/\\2\\s*>)/gi, '');",
		'if (/test-one/.test(s)) {}',
		's.match(/match-one/g);',
		's.split(/\\s*,\\s*/);',
		's.search(/search-one/);',
		'const list = [/in-array/, /in-array-2/i];',
		'const obj = { re: /in-object/u, f(x) { return /in-return/.test(x); } };',
		'const t = ok ? /then-one/ : /else-one/;',
		'const l = a || /or-one/;',
		'const n = `${/in-template/.source}`;',
		'run(a, /second-arg/y);',
		'const arrow = (x) => /arrow-body/.test(x);',
	].join('\n');
	const got = sources(code);
	for (const want of [
		'(<(script|style)\\b[^>]*>[\\s\\S]*?<\\/\\2\\s*>)/gi',
		'test-one/',
		'match-one/g',
		'\\s*,\\s*/',
		'search-one/',
		'in-array/',
		'in-array-2/i',
		'in-object/u',
		'in-return/',
		'then-one/',
		'else-one/',
		'or-one/',
		'in-template/',
		'second-arg/y',
		'arrow-body/',
	]) assert.ok(got.includes(want), `missing ${want}`);
	assert.equal(got.length, 15);
});

test('a slash inside a character class does not cut the pattern short', () => {
	assert.deepEqual(sources('x.replace(/[/:]+$/, "");'), ['[/:]+$/']);
});

test('line numbers are reported', () => {
	const { patterns } = found('\n\nfoo(/a/);\n');
	assert.equal(patterns[0].line, 3);
});

test('regex-looking text in strings, comments and division is not collected', () => {
	const code = ['const s = "x.replace(/a+/g, 1)";', '// = /b+/', '/* /c+/ */', 'const d = a / b / c;', "const u = 'http://x/y';"].join('\n');
	assert.deepEqual(sources(code), []);
});

test('run-time built RegExp is counted as dynamic, not checked', () => {
	const r = found('const re = new RegExp("^" + name + "$"); const ok = new RegExp("fixed");');
	assert.deepEqual(r.patterns.map((p) => p.source), ['fixed']);
	assert.equal(r.dynamic.length, 1);
});

test('a file acorn cannot parse falls back to the text scan and says so', () => {
	const r = found('const a = /fallback+/g; this is not javascript ((');
	assert.ok(r.parseError);
	assert.deepEqual(r.patterns.map((p) => p.source), ['fallback+']);
});

test('clean fixture has no regex at all', () => {
	const r = found("const a = 1; function f(s) { return s.trim().toLowerCase().split(',').map((x) => x.slice(1)); }");
	assert.deepEqual(r.patterns, []);
	assert.deepEqual(r.dynamic, []);
	assert.equal(r.parseError, undefined);
});

test('every functions/ and workers/ file parses with acorn (no silent text-scan fallback)', () => {
	const fs = require('fs');
	const path = require('path');
	const root = path.join(__dirname, '..', '..');
	const bad = [];
	const walk = (dir) => {
		for (const name of fs.readdirSync(dir)) {
			const full = path.join(dir, name);
			if (fs.statSync(full).isDirectory()) {
				if (name !== 'node_modules' && name !== '.git') walk(full);
			} else if (name.endsWith('.js') && !name.endsWith('.min.js')) {
				const r = collectPatterns(fs.readFileSync(full, 'utf8'), acorn);
				if (r.parseError) bad.push(`${path.relative(root, full)}: ${r.parseError}`);
			}
		}
	};
	for (const d of ['functions', 'workers']) if (fs.existsSync(path.join(root, d))) walk(path.join(root, d));
	assert.deepEqual(bad, []);
});
