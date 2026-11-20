'use strict';
// #3965: ReDoS rewrites in functions/jarvis-core.js and functions/url-review-heads-up.js.
// Old literal vs new form on real inputs and seeded random strings, then a timing check on 40k-char attack strings.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const core = require(path.join(__dirname, '../../functions/jarvis-core.js'));

let seed = 39650006;
const rnd = (n) => {
	seed = (seed * 1103515245 + 12345) & 0x7fffffff;
	return seed % n;
};
const ALPHABET = [
	'a',
	'b',
	'Z',
	'1',
	' ',
	'  ',
	'\t',
	'\n',
	'\r',
	'\u2028',
	'\u00a0',
	'-',
	'--',
	'/',
	'//',
	'(',
	')',
	'()',
	'"',
	"'",
	'Android',
	'iPhone',
	'iPod',
	'Mobile',
	'@',
	'.',
	'_',
	'%',
	'+',
	'<',
	'>',
	'/svg',
	'</svg>',
	'<svg class="jv-heat"',
	'<svg class="jv-fl"',
	'<svg class="jv-geo-map"',
	'<svg class="other"',
	'(tagged link)',
	' (tagged link)',
	'é',
];
const randomString = (max, alphabet = ALPHABET) => {
	let s = '';
	const len = rnd(max + 1);
	for (let i = 0; i < len; i += 1) s += alphabet[rnd(alphabet.length)];
	return s;
};
const sweepInputs = (real, max = 24) => {
	const inputs = real.slice();
	for (let i = 0; i < 3000; i += 1) inputs.push(randomString(max));
	return inputs;
};
const check = (inputs, oldFn, newFn) => {
	for (const s of sweepInputs(inputs)) assert.equal(newFn(s), oldFn(s), JSON.stringify(s));
};

const attack = (name, fn) => {
	const t0 = process.hrtime.bigint();
	fn();
	const ms = Number(process.hrtime.bigint() - t0) / 1e6;
	assert.ok(ms < 1500, `${name} took ${ms.toFixed(0)}ms`);
};

test('jarvis-core:649 trailing slashes on a GitHub repo name', () => {
	const OLD = /\/+$/;
	const NEW = /(?<!\/)\/+$/;
	check(['owner/repo/', 'owner/repo//', '/', '//', 'a/b', '', 'a//b/'], (s) => s.replace(OLD, ''), (s) => s.replace(NEW, ''));
});

test('jarvis-core:682 trailing parenthesis group dropped from a panel title', () => {
	const OLD = /\s*\([^)]*\)\s*$/;
	const real = [
		'Visitors (7 days)',
		'Visitors (7 days)  ',
		'Visitors (a) (b)',
		'Visitors ((a)',
		'Visitors (a))',
		'(x)',
		'()',
		')',
		'(',
		' \n (a\nb) \n',
		'a )(b)',
		'a (b) c',
		'a(b)(c)',
		'a ( ( ( b)',
		'',
	];
	check(real, (s) => s.replace(OLD, ''), core.stripTrailingParen);
	const slugOld = (title) =>
		String(title || '')
			.split(' · ')[0]
			.replace(OLD, '')
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-+|-+$/g, '')
			.slice(0, 80)
			.replace(/-+$/, '') || 'panel';
	for (const s of sweepInputs(['Visitors (7 days) · Last week', '--', '(x)', null, undefined, 'A  B -- C-'])) {
		assert.equal(core.panelSlug(s), slugOld(s), JSON.stringify(s));
	}
	const long = 'a-'.repeat(60) + '-- (x)';
	assert.equal(core.panelSlug(long), slugOld(long));
});

test('jarvis-core:685/687 dashes trimmed from the panel slug', () => {
	const OLD_BOTH = /^-+|-+$/g;
	const NEW = (s) => s.replace(/^-+/, '').replace(/(?<!-)-+$/, '');
	const real = ['-a-', '---', '-', '', 'a', 'a--', '--a', '-a-b--', 'a-b'];
	check(real, (s) => s.replace(OLD_BOTH, ''), NEW);
	const OLD_END = /-+$/;
	const NEW_END = /(?<!-)-+$/;
	check(real, (s) => s.replace(OLD_END, ''), (s) => s.replace(NEW_END, ''));
});

test('jarvis-core:726 plate strip wraps each map or dense SVG', () => {
	const OLD = /<svg class="(?:jv-geo-map|jv-heat|jv-fl)"[\s\S]*?<\/svg>/g;
	const wrapOld = (html) =>
		String(html).replace(OLD, (svg) => `<div class="jv-plate-strip"><div class="jv-plate-inner">${svg}</div></div>`);
	const real = [
		'<p>x</p><svg class="jv-heat" viewBox="0"><g/></svg><p>y</p>',
		'<svg class="jv-geo-map"></svg><svg class="jv-fl">\n</svg>',
		'<svg class="jv-fl"><svg class="jv-heat"></svg> tail </svg>',
		'<svg class="jv-fl"> never closed',
		'<svg class="other"></svg>',
		'<svg class="jv-heat"></svg></svg>',
		'a $& $1 <svg class="jv-fl">$&</svg>',
		'',
		null,
		undefined,
		12,
	];
	for (const s of sweepInputs(real, 14)) assert.equal(core.plateWrap(s), wrapOld(s), JSON.stringify(s));
});

test('jarvis-core:3622 Android phone user agents', () => {
	const OLD = /Android.+Mobile|iPhone|iPod/;
	const real = [
		'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit Mobile Safari',
		'Mozilla/5.0 (Linux; Android 14; Pixel Tablet) Safari',
		'Android Mobile',
		'AndroidMobile',
		'Android\nMobile',
		'Android x\nMobile',
		'Android\u2028Mobile Android x Mobile',
		'Mobile Android',
		'Android',
		'iPhone',
		'iPod',
		'',
	];
	check(real, (s) => OLD.test(s), (s) => /iPhone|iPod/.test(s) || core.androidMobileUa(s));
	check(real, (s) => /Android.+Mobile/.test(s), core.androidMobileUa);
});

test('jarvis-core:3763 "(tagged link)" suffix dropped from a source label', () => {
	const OLD = /\s*\(tagged link\)$/;
	const NEW = /(?<!\s)\s*\(tagged link\)$/;
	const real = ['Mastodon (tagged link)', 'Mastodon  \n(tagged link)', '(tagged link)', ' (tagged link) ', 'x (tagged link)(tagged link)', ''];
	check(real, (s) => s.replace(OLD, ''), (s) => s.replace(NEW, ''));
});

test('jarvis-core:3848 trailing parenthesis group dropped from a connection name', () => {
	const OLD = /\s*\(.*\)$/;
	const real = [
		'GitHub (token)',
		'GitHub (a) (b)',
		'GitHub (a',
		'GitHub (a\nb)',
		'GitHub \n (a)',
		'GitHub (\n(a)',
		'(x)',
		'()',
		')',
		'a )',
		' \u2028 (x)',
		'a(b)c)',
		'',
	];
	check(real, (s) => s.replace(OLD, ''), core.stripTrailingParenLine);
});

test('attack strings of 40k characters stay fast', () => {
	const N = 40000;
	attack('trailing slash', () => 'a'.repeat(N).replace(/(?<!\/)\/+$/, '') && ('/'.repeat(N) + 'x').replace(/(?<!\/)\/+$/, ''));
	attack('slug dashes', () => {
		('-'.repeat(N) + 'a').replace(/^-+/, '').replace(/(?<!-)-+$/, '');
		('a' + '-'.repeat(N) + 'a').replace(/(?<!-)-+$/, '');
		core.panelSlug('(' .repeat(N));
		core.panelSlug(' '.repeat(N) + 'x');
		core.panelSlug('a (' .repeat(N / 3));
	});
	attack('trailing paren', () => {
		core.stripTrailingParen('('.repeat(N));
		core.stripTrailingParen('('.repeat(N) + ')');
		core.stripTrailingParen(' '.repeat(N) + '(x) y');
		core.stripTrailingParen(' '.repeat(N) + '(x)');
		core.stripTrailingParenLine('('.repeat(N) + ')');
		core.stripTrailingParenLine(' '.repeat(N) + '(x)');
		core.stripTrailingParenLine(' '.repeat(N) + '(x');
		core.stripTrailingParenLine('a'.repeat(N) + ')');
		core.stripTrailingParenLine('('.repeat(N));
	});
	attack('plate svg', () => {
		core.plateWrap('<svg class="jv-heat"'.repeat(N / 20));
		core.plateWrap('<svg class="jv-fl"></svg>'.repeat(N / 25));
	});
	attack('android', () => {
		core.androidMobileUa('Android'.repeat(N / 7));
		core.androidMobileUa('Android\n'.repeat(N / 8));
		core.androidMobileUa('Android' + 'x'.repeat(N));
	});
	attack('tagged link', () => (' '.repeat(N) + 'x').replace(/(?<!\s)\s*\(tagged link\)$/, ''));
});
