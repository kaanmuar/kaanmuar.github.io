'use strict';
// #3965: regexes recheck flagged in url-review-core were rewritten to linear forms. Each one is read from the source and
// checked against the old regex the way the code uses it (replace, match list, first match, group or test), on real
// inputs and seeded token mixes; the new forms must stay fast on the inputs that made the old ones quadratic.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const CORE = fs.readFileSync(path.join(ROOT, 'functions', 'url-review-core.js'), 'utf8');
const LIT = /\/(?:\\.|\[(?:\\.|[^\]\\\n])*\]|[^/\\\n[])+\/[dgimsuy]*/y;

/** The regex literal right after `head` in url-review-core.js; head must be unique and end just before the literal. */
function lit(head) {
	const at = CORE.indexOf(head);
	assert.ok(at >= 0, head);
	assert.equal(CORE.indexOf(head, at + 1), -1, `${head} is not unique`);
	LIT.lastIndex = at + head.length;
	const found = LIT.exec(CORE)[0];
	const last = found.lastIndexOf('/');
	return new RegExp(found.slice(1, last), found.slice(last + 1));
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

function same(oldView, newView, inputs) {
	for (const s of inputs) assert.deepEqual(newView(s), oldView(s), JSON.stringify(s));
}

function fast(fn, inputs, ms = 250) {
	for (const s of inputs) {
		const t0 = Date.now();
		fn(s);
		assert.ok(Date.now() - t0 < ms, `slow on ${JSON.stringify(s.slice(0, 40))}… (${s.length} chars)`);
	}
}

const blankBlock = (block, open) => (open ? block : ' ');
const closedMatches = (re, text) => [...String(text).matchAll(re)].filter((m) => !m[1]).map((m) => m[0]);
const N = 40000;

const replaced = (OLD, NEW) => [(s) => s.replace(OLD, ' '), (s) => s.replace(NEW, blankBlock)];
const listed = (OLD, NEW) => [(s) => s.match(OLD) || [], (s) => closedMatches(NEW, s)];
const first = (OLD, NEW) => [(s) => (s.match(OLD) || [''])[0], (s) => closedMatches(NEW, s)[0] || ''];
const tested = (OLD, NEW) => [(s) => OLD.test(s), (s) => NEW.test(s)];

/** Each row: name, old regex, new regex, view, real inputs, mix tokens, adversarial inputs. */
const ROWS = [
	[
		'trailing slashes',
		/\/+$/,
		lit('return path.replace('),
		(O, W) => [(s) => s.replace(O, ''), (s) => s.replace(W, '')],
		['/a/b/', '/', '///', '/a//b'],
		['/', 'a', '\n'],
		[`${'/'.repeat(N)}a`],
	],
	[
		'[at] spellings',
		/\s*(?:\[at\]|\(at\)|\{at\}|\[arroba\]|\(arroba\))\s*/gi,
		lit('const plain = String(text || "")\n    .replace('),
		(O, W) => [(s) => s.replace(O, '@'), (s) => s.replace(W, '@')],
		['info [at] acme [dot] com', 'a (AT) b', 'a  [at] (at) b', 'a{at}b', 'a [arroba]  (arroba) b', 'a [ at ] b'],
		[' ', '\t', '[at]', '(at)', '{at}', '[arroba]', 'x', '\n', '['],
		[`${' '.repeat(N)}x`, ' [at'.repeat(N / 4)],
	],
	[
		'[dot] spellings',
		/\s*(?:\[dot\]|\(dot\)|\{dot\}|\[punto\]|\(punto\))\s*/gi,
		lit('"@")\n    .replace('),
		(O, W) => [(s) => s.replace(O, '.'), (s) => s.replace(W, '.')],
		['acme [dot] com', 'a (DOT) b [punto] c', 'a  [dot] (dot) b'],
		[' ', '[dot]', '(dot)', '{dot}', '[punto]', 'x', '\n'],
		[`${' '.repeat(N)}x`],
	],
	[
		'addresses in text',
		/[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}/gi,
		lit('[...plain.matchAll('),
		(O, W) => [(s) => s.match(O) || [], (s) => [...s.matchAll(W)].map((m) => m[1]).filter(Boolean)],
		['Mail info@acme.co.uk or a.b+c@x-y.io.', 'a@b.com_x@c.de', 'a@b.c9x@d.ef', 'a@b@c.de', 'x@y', 'A@B.CO'],
		['a', '.', '-', '_', '@', 'co', ' ', '9', '@x.io', '+'],
		['a'.repeat(N), `a@${'b.'.repeat(N / 2)}`, 'a@b'.repeat(N / 3)],
	],
	[
		'Akamai block page',
		/\/_sec\/cp_challenge\/|<title>\s*Access Denied\s*<\/title>[\s\S]{0,2000}errors\.edgesuite\.net/i,
		lit('["Akamai", '),
		tested,
		[
			'<title>Access Denied</title><p>Reference</p> https://errors.edgesuite.net/18.x',
			'<title> Access Denied </title>' + 'x'.repeat(2001) + 'errors.edgesuite.net',
			'<title>Access Denied</title>' + 'x'.repeat(2000) + 'errors.edgesuite.net',
			'/_sec/cp_challenge/',
		],
		[
			'<title>Access Denied</title>',
			'<title> Access Denied </title>',
			'x'.repeat(500),
			'errors.edgesuite.net',
			' ',
			'<title>',
		],
		['<title>Access Denied</title>'.repeat(N / 27)],
	],
	[
		'ld+json blocks',
		/<script\b[^>]*application\/ld\+json[^>]*>[\s\S]*?<\/script>/gi,
		lit('const blocks = closedMatches('),
		listed,
		[
			'<script type="application/ld+json">{"@type":"Organization"}</script><script>x</script>',
			'<script type=application/ld+json>{',
			'<SCRIPT TYPE="application/ld+json" >a</script>',
		],
		['<script', ' type="application/ld+json"', '>', '</script>', 'x', ' ', '<script>'],
		[
			'<script'.repeat(N / 7),
			`<script${' application/ld+json'.repeat(N / 20)}`,
			'<script application/ld+json>'.repeat(N / 28),
		],
	],
	[
		'comments',
		/<!--[\s\S]*?-->/g,
		lit('/<(script|style|noscript|template|svg|head)\\b/gi, " ")\n    .replace('),
		replaced,
		['a<!-- b -->c<!-- d', '<!---->'],
		['<!--', '-->', '-', '>', 'a', '<!'],
		['<!--'.repeat(N / 4)],
	],
	[
		'tags',
		/<[^>]+>/g,
		lit('(<!--)[\\s\\S]*/g, blankBlock)\n    .replace('),
		replaced,
		['<p>a</p><b', 'a<>b'],
		['<', '>', 'a', '<>', ' '],
		['<'.repeat(N)],
	],
	[
		'Meta Pixel',
		/connect\.facebook\.net\/[^"']*\/fbevents\.js|fbq\(\s*['"]init/,
		lit('["Meta Pixel", '),
		tested,
		[
			'<script src="https://connect.facebook.net/en_US/fbevents.js">',
			"fbq( 'init', '123')",
			'connect.facebook.net/a connect.facebook.net/fbevents.js',
			'connect.facebook.net/fbevents.js',
		],
		['connect.facebook.net/', '/fbevents.js', 'fbevents.js', '"', 'x', 'connect.facebook.net', '/'],
		['connect.facebook.net/'.repeat(N / 21)],
	],
	[
		'Plausible',
		/plausible\.io\/js|\/js\/script\.js["'][^>]*data-domain/,
		lit('["Plausible", '),
		tested,
		[
			'<script defer data-domain="a.com" src="https://plausible.io/js/script.js">',
			'<script src="/js/script.js" data-domain="a.com">',
			'<script src="/js/script.js">data-domain',
		],
		['/js/script.js"', "/js/script.js'", 'data-domain', '>', 'x', '"'],
		['/js/script.js"'.repeat(N / 14)],
	],
	[
		'Klaro',
		/klaro(-[\w-]+)?(\.min)?\.js|klaroConfig/,
		lit('["Klaro", '),
		tested,
		[
			'<script src="/klaro-no-css.min.js">',
			'klaro.js',
			'klaro-xklaro-.js',
			'klaro--.js',
			'myklaro.js',
			'klaroXklaro.js',
			'klaro-a.min.js',
			'klaro-.js',
		],
		['klaro', '-', 'x', '.js', '.min', 'klaro-', '_', '.', 'Config'],
		['klaro-'.repeat(N / 6), `klaro-${'a'.repeat(N)}`],
	],
	[
		'consent region list',
		/region['"]?\s*:\s*\[([^\]]*)\]/,
		lit('const list = (match[1].match('),
		(O, W) => [(s) => (s.match(O) || [])[1] || '', (s) => (s.match(W) || [])[1] || ''],
		["region: ['ES', 'FR']", '"region":["DE"]', 'region:[', 'region :  [ ] region:[a]'],
		['region', "'", ':', ' ', '[', ']', 'x'],
		['region:['.repeat(N / 8)],
	],
	[
		'analytics loader',
		/<script\b[^>]*\ssrc\s*=\s*["'][^"']*(analytics|gtag|gtm|tracking|tagmanager)[^"']*["']/i,
		lit('loader: '),
		tested,
		[
			'<script async src="https://www.googletagmanager.com/gtag/js?id=G-1">',
			'<script src="/app.js">',
			'<script <script src="/gtm.js">',
			"<script src='gtag",
			'<script>x</script> src="gtm"',
		],
		['<script', ' src=', '"', "'", 'gtag', 'x', '>', ' ', '/', '<script src="', ' src="/gtm'],
		['<script'.repeat(N / 7), `<script src="${'gtag'.repeat(N / 4)}`, '<script src="x"'.repeat(N / 15)],
	],
	[
		'<html> start tag',
		/<html\b[^>]*>/i,
		lit('const htmlTag = closedMatches('),
		first,
		['<!doctype html><html lang="en">', '<html', '<html><html lang=x>'],
		['<html', '>', ' lang=en', 'x', '<'],
		['<html'.repeat(N / 5)],
	],
	[
		'script blocks',
		/<script\b[^>]*>[\s\S]*?<\/script>/gi,
		lit('const markup = html.replace('),
		replaced,
		['<script>a</script>b<script src=x>', '<script>a</script'],
		['<script', '>', '</script>', 'x', '<'],
		['<script'.repeat(N / 7), '<script>'.repeat(N / 8)],
	],
	[
		'template blocks',
		/<template\b[\s\S]*?<\/template>/gi,
		lit('.replace(/<script\\b[^>]*>[\\s\\S]*?<\\/script>|(<script\\b)[\\s\\S]*/gi, blankBlock).replace('),
		replaced,
		['<template>a</template>b<template>'],
		['<template', '>', '</template>', 'x'],
		['<template'.repeat(N / 9)],
	],
	[
		'h1 blocks',
		/<h1\b[^>]*>[\s\S]*?<\/h1>/gi,
		lit('const h1 = closedMatches('),
		listed,
		['<h1>A</h1><h1 class=x>B</h1><h1>open'],
		['<h1', '>', '</h1>', 'x', '<'],
		['<h1'.repeat(N / 3), '<h1>'.repeat(N / 4)],
	],
	[
		'label blocks',
		/<label\b[\s\S]*?<\/label>/gi,
		lit('[^>]*$/gi, markup.replace('),
		replaced,
		['<label>a<input></label><input>', '<label>open'],
		['<label', '>', '</label>', '<input>', 'x'],
		['<label'.repeat(N / 6)],
	],
	[
		'form fields',
		/<(?:input|select|textarea)\b[^>]*>/gi,
		lit('const unlabeled = closedMatches('),
		listed,
		['<input type=text><select><textarea x>', '<input'],
		['<input', '<select', '<textarea', '>', ' ', 'x'],
		['<input'.repeat(N / 6)],
	],
	[
		'<head> block',
		/<head\b[\s\S]*?<\/head>/i,
		lit('const head = closedMatches('),
		first,
		['<html><head><title>t</title></head><body>', '<head>never', '<head></head><head>x</head>'],
		['<head', '>', '</head>', 'x'],
		['<head'.repeat(N / 5)],
	],
	[
		'inline scripts',
		/<script\b[^>]*>[\s\S]*?<\/script>/gi,
		lit('const inlineScripts = closedMatches('),
		listed,
		['<script>a</script><script src=x></script><script>'],
		['<script', '>', '</script>', 'x'],
		['<script>'.repeat(N / 8)],
	],
	[
		'inline handlers',
		/<[a-z][^>]*\son(?:click|load|error|submit|change|mouseover|focus|blur|input|keydown|keyup)\s*=/gi,
		lit('}).length + closedMatches('),
		listed,
		['<a onclick="x" onload="y"><img onerror=z>', '<b <i onfocus=1>', '<a onclick=1 <b onblur=2>'],
		['<a', '<b', ' onclick=', ' onload =', '>', ' ', 'x', '<'],
		['<a'.repeat(N / 2), `<a${' onclick'.repeat(N / 8)}`, `<a onclick=${'<a'.repeat(N / 2)}`],
	],
	[
		'style attributes',
		/<[a-z][^>]*\sstyle\s*=/gi,
		lit('const inlineStyles = (html.match(/<style\\b/gi) || []).length + closedMatches('),
		listed,
		['<p style="x"><b style=y>', '<a <b style=1>'],
		['<a', '<p', ' style=', ' style =', '>', ' ', 'x'],
		['<a'.repeat(N / 2), `<a style=${'<a'.repeat(N / 2)}`],
	],
	[
		'anchor blocks',
		/<a\b[^>]*>[\s\S]*?<\/a>/gi,
		lit('const anchors = closedMatches('),
		listed,
		['<a href=x>X</a><a>open', '<a><b>c</b></a>'],
		['<a', '>', '</a>', 'x', ' href=y'],
		['<a'.repeat(N / 2), '<a>'.repeat(N / 3)],
	],
	[
		'address in a query value',
		/[^\s@]+@[^\s@]+\.[a-z]{2,}/i,
		lit('return values.some((value) => '),
		tested,
		['me@site.com', 'a b@c.de', 'x@y', '@a.co', 'a@b@c.de'],
		['a', '@', '.', 'co', ' ', 'b', '.c'],
		['a'.repeat(N), `a@${'b'.repeat(N)}`],
	],
	[
		'viewport meta',
		/<meta\b[^>]*\bname\s*=\s*(?:["']viewport["']|viewport\b)/i,
		lit('viewport: '),
		tested,
		[
			'<meta name="viewport" content="width=device-width">',
			'<meta name=viewport>',
			'<meta <meta name="viewport">',
			'<meta charset=x>name=viewport',
		],
		['<meta', ' name=', '"viewport"', 'viewport', '>', ' ', 'x'],
		['<meta'.repeat(N / 5)],
	],
	[
		'noscript blocks',
		/<noscript\b[\s\S]*?<\/noscript>/gi,
		lit('untitledFrames: collect(markup.replace('),
		replaced,
		['<noscript><iframe></iframe></noscript><noscript>'],
		['<noscript', '>', '</noscript>', 'x'],
		['<noscript'.repeat(N / 9)],
	],
	[
		'mixed content sources',
		/<(?:script|img|iframe|source|video|audio|embed|track)\b[^>]*\ssrc\s*=\s*["']?http:\/\//gi,
		lit('mixed: closedMatches('),
		listed,
		['<img src="http://a/x.png"><script src=http://b>', '<img <img src=http://x>', '<img src="https://a">'],
		['<img', '<script', ' src=', '"', 'http://', '>', ' ', 'x'],
		['<img'.repeat(N / 4), `<img src=http://${'<img'.repeat(N / 4)}`],
	],
	[
		'skip link',
		/<a\b[^>]*href\s*=\s*["']#[^"']+/i,
		lit('skip: '),
		tested,
		['<a class="skip" href="#main">', '<a href="#">', '<a <a href="#x">', '<a>href="#x"'],
		['<a', ' href=', '"', '#', 'x', '>', ' '],
		['<a'.repeat(N / 2)],
	],
	[
		'required inputs',
		/<input\b[^>]*\brequired\b/gi,
		lit('required: closedMatches('),
		listed,
		['<input required><input type=x required>', '<input <input required>', '<input notrequired>'],
		['<input', ' required', 'x', '>', ' '],
		['<input'.repeat(N / 6), `<input required${'<input'.repeat(N / 6)}`],
	],
	[
		'images',
		/<img\b[^>]*>/gi,
		lit('imgNoSize: closedMatches('),
		listed,
		['<img src=x><img', '<img alt=y>'],
		['<img', '>', ' ', 'x'],
		['<img'.repeat(N / 4)],
	],
	[
		'app shell',
		/<div\b[^>]*\bid\s*=\s*["'](root|app|__next|__nuxt|svelte|___gatsby)["'][^>]*>\s*<\/div>/i,
		lit('appShell: text.length < 300 && '),
		tested,
		[
			'<div id="root"></div>',
			'<div id="app" class="x">\n</div>',
			'<div id="app">x</div>',
			'<div <div id="__next"> </div>',
			'<div id="root" data-id="app"></div>',
		],
		['<div', ' id=', '"root"', "'app'", '>', '</div>', ' ', 'x', ' id="app"', '<div id="root">', '<div id="app"'],
		['<div'.repeat(N / 4), `<div${' id="app"'.repeat(N / 9)}`, `<div id="app"${' x'.repeat(N / 2)}`],
	],
	[
		'time datetime',
		/<time\b[^>]*datetime\s*=/i,
		lit('|| metaValue("article:modified_time") || '),
		tested,
		['<time datetime="2026-01-01">', '<time>x</time>', '<time <time datetime=1>'],
		['<time', ' datetime=', '>', ' ', 'x'],
		['<time'.repeat(N / 5)],
	],
	[
		'heading cut',
		/\s+\S*$/,
		lit('text.slice(0, 40).replace('),
		(O, W) => [(s) => s.replace(O, ''), (s) => s.replace(W, '')],
		['A long heading that is cut', 'one', ' x', 'a  b'],
		[' ', 'a', '\t', 'bc'],
		[`${' '.repeat(N)}x\n`],
	],
	[
		'wildcard script source',
		/(default|script)-src[^;]*\s\*(\s|;|$)/,
		lit('"no script-src or default-src" : "", '),
		tested,
		["default-src 'self' *; img-src *", 'script-src * ', "script-src 'self'; img-src *", 'default-src script-src *'],
		['default-src', 'script-src', ' ', '*', ';', 'x', "'self'"],
		['script-src'.repeat(N / 10), `default-src${' x'.repeat(N / 2)}`],
	],
];

for (const [name, OLD, NEW, view, real, tokens, hostile] of ROWS) {
	test(`url-review-core ${name}`, () => {
		const [oldOf, newOf] = view(OLD, NEW);
		same(oldOf, newOf, real);
		same(oldOf, newOf, mixes(tokens));
		fast(newOf, hostile);
	});
}

test('url-review-core ld+json strip uses the same regex as the schema scan', () => {
	const strip = lit('return String(html || "")\n    .replace(');
	assert.equal(strip.source, lit('const blocks = closedMatches(').source);
});

test('url-review-core visibleText still drops script, style and head blocks', () => {
	const core = require('../../functions/url-review-core');
	if (typeof core.visibleText !== 'function') return;
	assert.equal(
		core.visibleText('<head><title>t</title></head><p>a<script>x</script> b</p><svg><text>s</text></svg>'),
		core.visibleText('<p>a  b</p>')
	);
	fast(core.visibleText, ['<script'.repeat(N / 7), '<head<svg'.repeat(N / 9)]);
});
