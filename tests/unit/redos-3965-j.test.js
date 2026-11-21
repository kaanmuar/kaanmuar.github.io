'use strict';
// #3965: regexes recheck flagged in company-contacts, url-review-browser, url-review-heads-up and their one-line copies
// were rewritten to linear forms or plain scans. Old and new must agree on real inputs and on random token mixes, and
// the new forms must stay fast on the long inputs that made the old ones quadratic.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const { locate } = require('./_loose-head');
const LIT = /\/(?:\\.|\[(?:\\.|[^\]\\\n])*\]|[^/\\\n[])+\/[dgimsuy]*/y;
const { replaceBlocks } = require('../../functions/tag-blocks');
const { htmlText, insecureTarget } = require('../../functions/url-review-browser');
const { scrubAddresses } = require('../../functions/url-review-heads-up');

/** The regex literal right after `head` in `file`; head must be unique and end just before the literal. */
function fromSource(file, head) {
	const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
	LIT.lastIndex = locate(text, head, file).end;
	const lit = LIT.exec(text)[0];
	const last = lit.lastIndexOf('/');
	return new RegExp(lit.slice(1, last), lit.slice(last + 1));
}

function same(oldView, newView, inputs) {
	for (const s of inputs) assert.deepEqual(newView(s), oldView(s), JSON.stringify(s));
}

/** Seeded random strings of 0..max tokens, so the sweep is the same on every run. */
function mixes(tokens, count = 3000, max = 12) {
	let seed = 3965;
	const rand = () => {
		seed = (seed + 0x6d2b79f5) | 0;
		let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
	const out = [];
	for (let i = 0; i < count; i += 1) {
		let s = '';
		const n = Math.floor(rand() * (max + 1));
		for (let j = 0; j < n; j += 1) s += tokens[Math.floor(rand() * tokens.length)];
		out.push(s);
	}
	return out;
}

function fast(fn, inputs, ms = 250) {
	for (const s of inputs) {
		const t0 = Date.now();
		fn(s);
		assert.ok(Date.now() - t0 < ms, `slow on ${JSON.stringify(s.slice(0, 40))}… (${s.length} chars)`);
	}
}

const firstGroup = (re, text) => {
	re.lastIndex = 0;
	let m;
	while ((m = re.exec(text)) && !m[1]);
	return m ? m[1] : undefined;
};
const BREAKS = ['\n', '\r\n', '\r', '\u2028', '\u2029'];
const N = 40000;

test('host cut at the first / or : on the last line (company-contacts, company-prospects, jarvis-geo, jarvis-geo-clicks)', () => {
	const OLD = /[/:].*$/;
	const head = 'const bare = (host) => String(host || "").toLowerCase().replace(/^https?:\\/\\//, "").replace(';
	for (const file of ['company-contacts.js', 'company-prospects.js', 'jarvis-geo.js', 'jarvis-geo-clicks.js']) {
		const NEW = fromSource(`functions/${file}`, head);
		const cut = (re) => (s) => s.replace(re, '');
		same(cut(OLD), cut(NEW), [
			'example.com/a/b',
			'example.com:8080/x',
			'a.b',
			'',
			'/',
			':',
			'x/y:z',
			'a\nb/c',
			'a/b\nc',
			'a/b\nc:d/e',
		]);
		same(cut(OLD), cut(NEW), mixes([...BREAKS, '/', ':', 'a', 'b.c', '//']));
		fast(cut(NEW), [`${'/'.repeat(N)}\n`, `${':/'.repeat(N)}\n`, `${'a/'.repeat(N)}\r`]);
	}
});

test('host cut at the first / on the last line (company-contacts, url-review-cases)', () => {
	const OLD = /\/.*$/;
	const cut = (re) => (s) => s.replace(re, '');
	for (const [file, head] of [
		['functions/company-contacts.js', '"https://" + host.replace(/^https?:\\/\\//, "").replace('],
		['functions/url-review-cases.js', 'return String(origin || "").replace(/^https?:\\/\\//, "").replace('],
	]) {
		const NEW = fromSource(file, head);
		same(cut(OLD), cut(NEW), ['example.com/a/b', 'a', '', '/', 'a\nb/c', 'a/b\nc', 'a/b\nc/d']);
		same(cut(OLD), cut(NEW), mixes([...BREAKS, '/', 'a', '//']));
		fast(cut(NEW), [`${'/'.repeat(N)}\n`, `${'a/'.repeat(N)}\u2028`]);
	}
});

test('trailing punctuation and padding runs', () => {
	const cut = (re) => (s) => s.replace(re, '');
	const rows = [
		[
			/[.,;:]+$/,
			fromSource('functions/company-contacts.js', '.split("?")[0].replace('),
			['.', ',', ';', ':', 'a', '\n'],
		],
		[
			/=+$/,
			fromSource('functions/url-review-browser.js', 'Buffer.from(email).toString("base64").replace('),
			['=', 'a', '\n'],
		],
		[
			/=+$/,
			fromSource('workers/outreach-cron/src/index.js', 'String.fromCharCode(...new Uint8Array(bytes))).replace('),
			['=', 'a', '\n'],
		],
		[/\/+$/, fromSource('functions/url-review-trust-grade.js', 'String(text || "").trim().replace('), ['/', 'a', '\n']],
		[/\/+$/, fromSource('functions/url-review-insights.js', 'path = path.replace('), ['/', 'a', '\n']],
	];
	for (const [OLD, NEW, tokens] of rows) {
		same(cut(OLD), cut(NEW), mixes(tokens, 2000, 14));
		fast(cut(NEW), [`${tokens[0].repeat(N)}a`, `${tokens[0].repeat(N)}\n`]);
	}
});

test('company-contacts site language and og:site_name', () => {
	const OLD_LANG = /<html[^>]*\blang\s*=\s*["']?([a-zA-Z]{2})/i;
	const NEW_LANG = fromSource('functions/company-contacts.js', 'const l = (firstGroup(');
	const OLD_NAME = /<meta[^>]+property\s*=\s*["']og:site_name["'][^>]+content\s*=\s*["']([^"']+)/i;
	const NEW_NAME = fromSource('functions/company-contacts.js', 'name = org.name || (firstGroup(');
	const oldOf = (re) => (s) => (s.match(re) || [])[1];
	const newOf = (re) => (s) => firstGroup(re, s);
	same(oldOf(OLD_LANG), newOf(NEW_LANG), [
		'<!doctype html><html lang="es-CO"><head>',
		"<html class='x' lang=de>",
		'<HTML LANG = "FR">',
		'<html><body lang="en">',
		'<html data-lang="pt" lang="it">',
		'<html lang="e">',
		'<html xlang="en">',
		'<html <html lang=en>',
		'no html',
	]);
	same(
		oldOf(OLD_LANG),
		newOf(NEW_LANG),
		mixes(['<html', ' lang=', '"en"', 'de', '>', ' ', 'x', '"', '<', '=', 'lang'])
	);
	same(oldOf(OLD_NAME), newOf(NEW_NAME), [
		'<meta property="og:site_name" content="Acme S.A.">',
		"<meta  property = 'og:site_name'  content = 'Acme'>",
		'<meta content="x" property="og:site_name">',
		'<meta property="og:site_name" content="a>b">',
		'<meta property="og:site_name" a content="One" content="Two">',
		'<meta property="og:title" content="T">',
		'<meta property="og:site_name"><meta property="og:site_name" x content="Late">',
	]);
	same(
		oldOf(OLD_NAME),
		newOf(NEW_NAME),
		mixes([
			'<meta',
			' ',
			'property="og:site_name"',
			" property='og:site_name'",
			' content="',
			'Acme',
			'"',
			'>',
			'x',
			'content=',
		])
	);
	fast(newOf(NEW_LANG), ['<html'.repeat(N / 5), `<html${' lang lang='.repeat(N / 10)}`]);
	fast(newOf(NEW_NAME), [
		'<meta'.repeat(N / 5),
		`<meta${' property="og:site_name"'.repeat(N / 25)}`,
		`<meta x${' content="'.repeat(N / 10)}`,
	]);
});

test('company-contacts addresses in visible text', () => {
	const OLD = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
	const NEW = fromSource('functions/company-contacts.js', 'for (const m of text.matchAll(');
	const oldOf = (s) => [...s.matchAll(OLD)].map((m) => [m.index, m[0]]);
	const newOf = (s) => [...s.matchAll(NEW)].filter((m) => m[1]).map((m) => [m.index, m[1]]);
	same(oldOf, newOf, [
		'Write to info@acme.com.co or sales@acme.de.',
		'a@b.com_x@c.de',
		'a@b.com9x@c.de',
		'a@b@c.de',
		'x@y',
		'@a.com',
		'a@.com',
	]);
	same(oldOf, newOf, mixes(['a', 'b', '.', '-', '_', '+', '@', 'co', ' ', '9', '@x.io']));
	fast(newOf, ['a'.repeat(N), `a@${'b'.repeat(N)}`, 'a@b.'.repeat(N / 4), `${'a.'.repeat(N / 2)}@`]);
});

test('script and style blocks: replaceBlocks matches the lazy regexes', () => {
	const OLD_CONTACTS = /<script\b[\s\S]*?<\/script[^>]*>|<style\b[\s\S]*?<\/style[^>]*>/gi;
	const OLD_BACKREF = /<(script|style|noscript|template|svg|head)\b[\s\S]*?<\/\1>/gi;
	const inputs = [
		'<p>a</p><script>x()</script ><style>p{}</style><p>b</p>',
		'<SCRIPT>x</script><Style>y</STYLE>',
		'<script>never closed',
		'<style> <script> </style> </script>',
		'<script src=x></script foo>z',
		'<scripts>keep</scripts>',
		'<svg><path/></svg><head></head>',
		'<script>a</script>b<script>c',
		'<noscript><img></noscript><template>t</template>',
	];
	const tokens = [
		'<script',
		'<style',
		'</script>',
		'</style>',
		'</script',
		'>',
		' ',
		'x',
		'<SCRIPT',
		'</STYLE>',
		'<svg',
		'</svg>',
		'<head>',
		'</head>',
		'<noscript',
		'</noscript>',
		'S',
	];
	same(
		(s) => s.replace(OLD_CONTACTS, ' '),
		(s) => replaceBlocks(s, /<(script|style)\b/gi, ' ', true),
		[...inputs, ...mixes(tokens, 4000)]
	);
	same(
		(s) => s.replace(OLD_BACKREF, ' '),
		(s) => replaceBlocks(s, /<(script|style|noscript|template|svg|head)\b/gi, ' '),
		[...inputs, ...mixes(tokens, 4000)]
	);
	fast(
		(s) => replaceBlocks(s, /<(script|style)\b/gi, ' ', true),
		['<script'.repeat(N / 7), '<script<style'.repeat(N / 13), `<script>${'</script'.repeat(N / 8)}`]
	);
});

test('url-review-browser htmlText', () => {
	const oldText = (html) =>
		String(html || '')
			.replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
			.replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
			.replace(/<template\b[\s\S]*?<\/template>/gi, ' ')
			.replace(/<noscript\b[\s\S]*?<\/noscript>/gi, ' ')
			.replace(/<!--[\s\S]*?-->/g, ' ')
			.replace(/<[^>]+>/g, ' ')
			.replace(/&nbsp;|&#160;/gi, ' ')
			.replace(/&[a-z#0-9]+;/gi, ' ')
			.replace(/\s+/g, ' ')
			.trim();
	same(oldText, htmlText, [
		'<html><head><style>p{}</style></head><body><h1>Hi</h1><!-- c --><p>a&nbsp;b</p><script>x</script></body></html>',
		'<p>open <script>never',
		'a <b',
		'<template><p>t</p></template>x',
		'<!-- unclosed',
		'a<>b',
		'<noscript>n</noscript>',
	]);
	same(
		oldText,
		htmlText,
		mixes(
			[
				'<script>',
				'</script>',
				'<style>',
				'</style>',
				'<template>',
				'</template>',
				'<noscript>',
				'</noscript>',
				'<!--',
				'-->',
				'<',
				'>',
				'a',
				' ',
				'&nbsp;',
				'<p>',
			],
			4000
		)
	);
	fast(htmlText, ['<script'.repeat(N / 7), '<!--'.repeat(N / 4), '<'.repeat(N), '<template<noscript'.repeat(N / 18)]);
});

test('url-review-browser mixed-content console line', () => {
	const OLD = /^.*?requested an insecure \w+ '([^']+)'.*$/i;
	same((s) => s.replace(OLD, '$1'), insecureTarget, [
		"Mixed Content: The page at 'https://a.com/' was loaded over HTTPS, but requested an insecure image 'http://a.com/x.png'. This content should also be served over HTTPS.",
		"requested an insecure script ''",
		"requested an insecure x 'a'\nmore",
		"line\nrequested an insecure x 'a'",
		"Requested An Insecure FONT 'f'",
		"requested an insecure x 'a\nb'",
		"requested an insecure x 'requested an insecure y 'z'",
		"requested an insecure  x 'a'",
		'no match',
	]);
	same(
		(s) => s.replace(OLD, '$1'),
		insecureTarget,
		mixes(['requested an insecure ', 'img', ' ', "'", 'a', '\n', 'x', "img '", '_'], 4000)
	);
	fast(insecureTarget, [`${"requested an insecure a 'x'".repeat(N / 27)}\n`, `requested an insecure ${'a'.repeat(N)}`]);
});

test('url-review-browser phone user agent', () => {
	const OLD = /\([^)]*\)/;
	const NEW = fromSource('functions/url-review-browser.js', 'const phoneUa = ua.replace(');
	const PHONE = '(Linux; Android 14; Pixel 8)';
	same(
		(s) => s.replace(OLD, PHONE),
		(s) => s.replace(NEW, (group, open) => open || PHONE),
		[
			'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36',
			'no parens',
			'(open',
			'(a)(b)',
			'((a)',
		]
	);
	same(
		(s) => s.replace(OLD, PHONE),
		(s) => s.replace(NEW, (group, open) => open || PHONE),
		mixes(['(', ')', 'a', ' ', '$&'], 3000)
	);
	fast((s) => s.replace(NEW, (group, open) => open || PHONE), ['('.repeat(N)]);
});

test('url-review-heads-up address scrub', () => {
	const OLD = /[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]{1,253}/g;
	const long = 'l'.repeat(70);
	same((s) => s.replace(OLD, '[removed]'), scrubAddresses, [
		'mail admin@example.com now',
		'a@b_c@d',
		'a@b@c',
		'@x',
		'x@',
		`${long}@host.com`,
		`a@${'d'.repeat(300)}e@f`,
		'x@y.z+w@v',
		'',
	]);
	same(
		(s) => s.replace(OLD, '[removed]'),
		scrubAddresses,
		mixes(['a', '.', '_', '+', '@', '-', ' ', 'b'.repeat(30), 'c'.repeat(64), '%'], 4000, 16)
	);
	fast(scrubAddresses, ['a@'.repeat(N), '@'.repeat(N), `${'a'.repeat(N)}@b`]);
});

test('url-review-hack-signs tag and comment strips', () => {
	const NEW_TAG = fromSource(
		'functions/url-review-hack-signs.js',
		'const stripTags = (html) => decode(String(html || "").replace('
	);
	const NEW_COMMENT = fromSource(
		'functions/url-review-hack-signs.js',
		'dropBlocks(String(html || ""), SPAM_BLOCKS).replace('
	);
	same(
		(s) => s.replace(/<[^>]+>/g, ' '),
		(s) => s.replace(NEW_TAG, (tag, open) => open || ' '),
		mixes(['<', '>', 'a', '<>', ' '], 3000)
	);
	same(
		(s) => s.replace(/<!--[\s\S]*?-->/g, ' '),
		(s) => s.replace(NEW_COMMENT, (block, open) => (open ? block : ' ')),
		mixes(['<!--', '-->', '-', '>', 'a', '<!'], 3000)
	);
	fast((s) => s.replace(NEW_TAG, (tag, open) => open || ' '), ['<'.repeat(N)]);
	fast((s) => s.replace(NEW_COMMENT, (block, open) => (open ? block : ' ')), ['<!--'.repeat(N / 4)]);
});
