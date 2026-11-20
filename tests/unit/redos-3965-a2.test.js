'use strict';
// #3965: regexes recheck flagged, rewritten to linear regexes or helpers. Old and new must agree on real and random inputs.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const LIT = /\/(?:\\.|\[(?:\\.|[^\]\\\n])*\]|[^/\\\n[])+\/[dgimsuy]*/y;
const source = (file) => fs.readFileSync(path.join(ROOT, 'functions', file), 'utf8');

function unique(text, file, head) {
	const at = text.indexOf(head);
	assert.ok(at >= 0, `${file}: ${head}`);
	assert.equal(text.indexOf(head, at + 1), -1, `${file}: ${head} is not unique`);
	return at;
}

/** The regex literal `shift` characters after the end of `before` in functions/<file>; before must be unique. */
function fromSource(file, before, shift = 0) {
	const text = source(file);
	LIT.lastIndex = unique(text, file, before) + before.length + shift;
	const lit = LIT.exec(text)[0];
	const last = lit.lastIndexOf('/');
	return new RegExp(lit.slice(1, last), lit.slice(last + 1));
}

/** The top-level `function name(...) {...}` in functions/<file>, as a callable. */
function fnFromSource(file, name) {
	const text = source(file);
	const at = unique(text, file, `\nfunction ${name}(`) + 1;
	let depth = 0;
	let end = text.indexOf('{', at);
	do {
		if (text[end] === '{') depth++;
		else if (text[end] === '}') depth--;
		end++;
	} while (depth > 0);
	return new Function(`${text.slice(at, end)}; return ${name};`)();
}

const hits = (re, s) => (re.global ? [...s.matchAll(re)].map((m) => [m.index, ...m]) : ((m) => m && [m.index, ...m])(re.exec(s)));
const tests = (re, s) => re.test(s);

function same(oldView, newView, inputs) {
	for (const s of inputs) assert.deepEqual(newView(s), oldView(s), JSON.stringify(s));
}

/** Seeded random strings built from `parts`, so failures reproduce. */
function fuzz(parts, count = 3000, maxLen = 24, seed = 3965) {
	let x = seed;
	const rand = (n) => ((x = (Math.imul(x, 1103515245) + 12345) | 0) >>> 16) % n;
	const out = [];
	for (let i = 0; i < count; i++) {
		let s = '';
		for (let n = rand(maxLen + 1); n > 0; n--) s += parts[rand(parts.length)];
		out.push(s);
	}
	return out;
}

test('url-review-auth address line breaks', () => {
	const OLD = /\s*\n\s*/g;
	const NEW = fromSource('url-review-auth.js', 'String(item.formattedValue || "").replace(');
	const view = (re) => (s) => [hits(re, s), s.replace(re, ', ')];
	same(view(OLD), view(NEW), [
		'Calle Mayor 1\n28013 Madrid\nSpain', 'Main St 5 \n  Springfield\r\nUSA', '\n  leading', 'trailing  \n', 'no break   here',
		'a\n\n \n b', 'a\u00a0\n\u00a0b', ' \t \n', `a${' '.repeat(5000)}b${' '.repeat(5000)}\n${' '.repeat(5000)}c`,
		...fuzz(['a', ' ', '\t', '\n', '\r', '\u00a0']),
	]);
});

test('url-review-geo-agent llms.txt title, summary and heading', () => {
	const file = 'url-review-geo-agent.js';
	const OLD_HAS = /^\s*#\s+\S/m;
	const OLD_TITLE = /^\s*#\s+(.+)$/m;
	const OLD_SUMMARY = /^\s*>\s*(.+)$/m;
	const NEW_HAS = fromSource(file, 'if (!/^(?<!', -6);
	const NEW_TITLE = fromSource(file, 'report.title = ((text.match(');
	const NEW_SUMMARY = fromSource(file, 'report.summary = ((text.match(');
	const inputs = [
		'# Acme\n\n> Widgets for everyone.\n\n## Docs\n- [Guide](https://acme.test/guide.md)\n',
		'\n\n  # Title\r\n> quote', '   # x', '#nospace\n# real', '# ', '#  \n  next line', 'text\n> quote', '>no space', '> ',
		'foo # bar\n  >  baz  ', 'x\n  \n# y\n>\n> s', '\r\n\r\n#\tT\r\n>\tS\r\n', 'a\u2028# b\u2029> c', '\n \n\t\n# T',
		'#\n\n\n', '>\n\n\n', `${'\n'.repeat(3000)}x`, `${' \n'.repeat(3000)}# late`, `#${' '.repeat(3000)}`, `>${'\n'.repeat(3000)}`,
		...fuzz(['#', '>', ' ', '\t', '\n', '\r', 'a', '\u2028', '\u00a0']),
	];
	same((s) => tests(OLD_HAS, s), (s) => tests(NEW_HAS, s), inputs);
	same((s) => hits(OLD_TITLE, s), (s) => hits(NEW_TITLE, s), inputs);
	same((s) => hits(OLD_SUMMARY, s), (s) => hits(NEW_SUMMARY, s), inputs);
});

test('url-review-geo-agent markdown links', () => {
	const OLD = /\[[^\]]+\]\([^)]+\)/g;
	const OLD_ONE = /\[[^\]]+\]\([^)]+\)/;
	const markdownLinks = fnFromSource('url-review-geo-agent.js', 'markdownLinks');
	const inputs = [
		'- [Guide](https://a.test/g.md)\n- [API](https://a.test/api.md): reference', '[[a](b)', '[](x)', '[a]()', '[a] (b)',
		'[a](b[c)d[e](f)', '[a](b)[c](d)', '[a](b', '[x]\n(y)', '[a\nb](c\nd)', '](a)[b](c)', '[a](b))', '[[x]](y)', '[a][b](c)',
		'[[](x)', '[a](([b)', '['.repeat(3000), '[)'.repeat(3000), `[a](${'('.repeat(3000)}`,
		...fuzz(['[', ']', '(', ')', 'a', '\n']),
	];
	same((s) => (s.match(OLD) || []).length, (s) => markdownLinks(s), inputs);
	same((s) => OLD_ONE.test(s), (s) => markdownLinks(s, 1) > 0, inputs);
});

test('url-review-head-order query strings dropped from tags', () => {
	const OLD = /((?:href|src)\s*=\s*["']?[^"'\s>?]*)\?[^"'\s>]*/gi;
	const dropQueries = fnFromSource('url-review-head-order.js', 'dropQueries');
	same((s) => s.replace(OLD, '$1'), dropQueries, [
		'<link rel="stylesheet" href="/a.css?v=1">', "<script src='x.js?token=abc' async>", '<img src=a.png?x=1 data-src="b?c">',
		'<a HREF = "x?y">', 'src=src="a?b"', 'src=src= a?b', 'src=x?src =?c', '<img data-src="b?x">', '<link href=/a?b?c>',
		'<script src="/x.js">', 'src=src=src=src=', 'hrefsrc=?q', 'src=href="a?b"', 'src=href =a?b', `<x ${'src='.repeat(2000)}?t>`,
		...fuzz(['src', 'href', 'SRC', 'Href', '=', '"', "'", ' ', '\t', '?', '>', 'a', '/', '-']),
		...fuzz(['src=', 'href =', 'SRC', 'Href', '=', '"', "'", ' ', '\t', '?', '>', 'a', '/', '-']),
	]);
});

test('url-review-libraries trailing separators', () => {
	const OLD = /[._-]+$/;
	const NEW = fromSource('url-review-libraries.js', 'value.replace(/[._-](min|js|slim|prod|production)$/i, "").replace(');
	const view = (re) => (s) => [hits(re, s), s.replace(re, '')];
	same(view(OLD), view(NEW), ['3.7.1', '3.7.1-', '1.2.3._-', '-', '', '1-.2', '._-1', `${'.'.repeat(5000)}a`, ...fuzz(['.', '_', '-', '1', 'a'])]);
});

test('url-review-mail-auth DMARC tags', () => {
	const OLD = /^\s*([a-z]+)\s*=\s*(.*?)\s*$/i;
	const NEW = fromSource('url-review-mail-auth.js', 'part.match(');
	same((s) => hits(OLD, s), (s) => hits(NEW, s), [
		'v=DMARC1', ' p = reject ', ' rua=mailto:dmarc@acme.test', 'p=', 'p=  ', 'sp=quar antine ', 'p=re\nject', 'p=reject\n',
		' \n p=x', '1p=x', 'p==x', '=x', 'P=Reject', 'p=a\tb', 'p=a\u00a0b ', 'p=a\u2028', 'p=\u2028a', `p=${'a '.repeat(3000)}\nx`,
		`A=${'\n'.repeat(3000)}\tA\n=`,
		...fuzz(['p', '=', ' ', '\t', '\n', '\r', 'a', '\u2028', '\u00a0', ':']),
	]);
});

test('url-review-multi site name before a tagline', () => {
	const OLD = /\s+[—–|·:-]\s+|\s*[|·]\s*/;
	const NEW = fromSource('url-review-multi.js', '.trim().split(');
	const norm = (s) => String(s).replace(/\s+/g, ' ').trim();
	same((s) => norm(s).split(OLD), (s) => norm(s).split(NEW), [
		'Acme | Best widgets', 'Acme — Home', 'Acme · Shop', 'Acme: the best', 'Acme|Shop', 'Acme |Shop', 'Acme - Shop', 'Acme-Shop',
		'a | |b', '  Acme  \n | x ', 'Acme\u00a0–\u00a0Inicio', ...fuzz(['a', ' ', '|', '·', '—', '–', ':', '-', '\n', '\t']),
	]);
});

test('url-review-rescue JSON object in the model answer', () => {
	const OLD = /\{[\s\S]*\}/;
	const outerBraces = fnFromSource('url-review-rescue.js', 'outerBraces');
	same((s) => (s.match(OLD) || [])[0], outerBraces, [
		'```json\n{"blocker":"waf","vendor":"cloudflare","confidence":0.8}\n```', 'no json', '{', '}{', '{}', 'a{b}c}d', '{"a":{"b":1}} x',
		'{'.repeat(3000), ...fuzz(['{', '}', 'a', '\n']),
	]);
});

test('url-review-threats tags blanked before clipping', () => {
	const OLD = /<[^>]{0,120}>/g;
	const blankTags = fnFromSource('url-review-threats.js', 'blankTags');
	same((s) => s.replace(OLD, ' '), blankTags, [
		'<b>Phishing</b> page at <a href="x">x</a>', 'a < b and c > d', '<>', `<${'a'.repeat(120)}>`, `<${'a'.repeat(121)}>`,
		`<${'a'.repeat(150)}<b>`, `<${'a'.repeat(100)}<${'a'.repeat(30)}>`, '<<<', '>>><<', '<'.repeat(3000),
		...fuzz(['<', '>', 'a', ' ', 'a'.repeat(40)], 3000, 30),
	]);
});

test('url-review-verified-spec trailing " i" selector flags', () => {
	const OLD = /(\[[^\]]*?)\s+i\]/gi;
	const NEW = fromSource('url-review-verified-spec.js', 'String(selector || "").replace(');
	same((s) => s.replace(OLD, '$1]'), (s) => s.replace(NEW, '$1]'), [
		'input[type="email" i]', 'input[name="q" I]', '[a i][b  i]', '[a[b i]', '[ i]', '[x i] [y]', 'a[href$=".pdf"   i]', '[i]',
		'[a\ti]', '[a i ]', 'button:has-text("Buy")', `[${' '.repeat(3000)}x]`, '['.repeat(3000),
		...fuzz(['[', ']', ' ', '\t', 'i', 'I', 'a']),
	]);
});

test('url-review-wordpress first block comment in style.css', () => {
	const OLD = /\/\*[\s\S]*?\*\//;
	const firstComment = fnFromSource('url-review-wordpress.js', 'firstComment');
	same((s) => (s.match(OLD) || [s])[0], firstComment, [
		'/*\nTheme Name: Astra\nVersion: 4.6.1\n*/\nbody{}', 'body{} /* a */ /* b */', '/*/', '/**/', '/*/ x */', 'no comment', '/*',
		'*/ /* x */', '/*'.repeat(3000), ...fuzz(['/', '*', 'a', '\n']),
	]);
});

test('attack strings finish in linear time', () => {
	const big = 50000;
	const cases = [
		[fromSource('url-review-auth.js', 'String(item.formattedValue || "").replace('), `a${' '.repeat(big)}b`],
		[fromSource('url-review-geo-agent.js', 'if (!/^(?<!', -6), '\n'.repeat(big)],
		[fromSource('url-review-geo-agent.js', 'report.title = ((text.match('), ' \n'.repeat(big)],
		[fromSource('url-review-geo-agent.js', 'report.summary = ((text.match('), `>${'\n'.repeat(big)}`],
		[fromSource('url-review-libraries.js', 'value.replace(/[._-](min|js|slim|prod|production)$/i, "").replace('), `${'.'.repeat(big)}a`],
		[fromSource('url-review-mail-auth.js', 'part.match('), `A=${'\n'.repeat(big)}\tA\n=`],
		[fromSource('url-review-mail-auth.js', 'part.match('), `p=${'a '.repeat(big)}\nx`],
		[fromSource('url-review-multi.js', '.trim().split('), ' -'.repeat(big)],
		[fromSource('url-review-verified-spec.js', 'String(selector || "").replace('), '['.repeat(big)],
		[fromSource('url-review-verified-spec.js', 'String(selector || "").replace('), `[${' '.repeat(big)}x]`],
	];
	for (const [re, input] of cases) {
		const t = Date.now();
		if (re.global) [...input.matchAll(re)];
		else re.test(input);
		assert.ok(Date.now() - t < 1500, `/${re.source}/ took ${Date.now() - t} ms`);
	}
	const helpers = [
		['url-review-geo-agent.js', 'markdownLinks', '['.repeat(big)],
		['url-review-geo-agent.js', 'markdownLinks', '[)'.repeat(big)],
		['url-review-head-order.js', 'dropQueries', 'src='.repeat(big)],
		['url-review-rescue.js', 'outerBraces', '{'.repeat(big)],
		['url-review-threats.js', 'blankTags', '<'.repeat(big)],
		['url-review-wordpress.js', 'firstComment', '/*'.repeat(big)],
	];
	for (const [file, name, input] of helpers) {
		const fn = fnFromSource(file, name);
		const t = Date.now();
		fn(input);
		assert.ok(Date.now() - t < 1500, `${name} took ${Date.now() - t} ms`);
	}
});
