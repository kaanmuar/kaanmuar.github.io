'use strict';
// #3965: regexes recheck flagged in outreach-trials, engagement*, jarvis-geo, jarvis-github-fix, url-review-owner-proof,
// url-review-lookalikes and mail-inbound were rewritten to linear forms. Old and new must agree on real and random inputs.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { beforeLastLineDelim } = require('../../functions/line-cut.js');

const ROOT = path.join(__dirname, '..', '..');

/** The regex literal `lit` (written exactly as in the source) after checking it appears `count` times in functions/<file>. */
function fromSource(file, lit, count = 1) {
	const text = fs.readFileSync(path.join(ROOT, 'functions', file), 'utf8');
	assert.equal(text.split(lit).length - 1, count, `${file}: ${lit}`);
	const last = lit.lastIndexOf('/');
	return new RegExp(lit.slice(1, last), lit.slice(last + 1));
}

/** A top-level function of functions/<file> that is not exported, built from its source with `scope` as its free names. */
function sourceFn(file, name, scope = {}) {
	const text = fs.readFileSync(path.join(ROOT, 'functions', file), 'utf8');
	const at = text.indexOf(`\nfunction ${name}(`);
	assert.ok(at >= 0, `${file}: ${name}`);
	const body = text.slice(at, text.indexOf('\n}\n', at) + 2);
	return new Function(...Object.keys(scope), `${body}\nreturn ${name};`)(...Object.values(scope));
}

const hits = (re, s) => (re.global ? [...s.matchAll(re)].map((m) => [m.index, ...m]) : ((m) => m && [m.index, ...m])(re.exec(s)));
const tests = (re, s) => re.test(s);
const withText = (rep) => (re, s) => [hits(re, s), s.replace(re, rep)];

function same(oldRe, newRe, inputs, oldView = hits, newView = oldView) {
	for (const s of inputs) assert.deepEqual(newView(newRe, s), oldView(oldRe, s), JSON.stringify(s));
}

/** Deterministic random strings built from `parts`, so old and new also meet inputs nobody thought to write. */
function fuzz(parts, n = 4000, max = 14, seed = 3965) {
	let x = seed >>> 0;
	const rnd = () => {
		x = (x + 0x6d2b79f5) >>> 0;
		let t = Math.imul(x ^ (x >>> 15), 1 | x);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
	const out = [];
	for (let i = 0; i < n; i += 1) {
		let s = '';
		for (let k = Math.floor(rnd() * max); k >= 0; k -= 1) s += parts[Math.floor(rnd() * parts.length)];
		out.push(s);
	}
	return out;
}
const chars = (s) => [...s];
const BIG = 300;

const EMAIL = fromSource('outreach-trials.js', String.raw`/^[^\s@/]+@[^\s@/][^\s@/.]*\.[^\s@/]+$/`);
const TRIAL_DOMAIN = fromSource('outreach-trials.js', String.raw`/[/?#](?<![/?#][^\n\r\u2028\u2029/?#]*[/?#]).*$/`);
const SITE_SLASH = fromSource('engagement-field-sweep.js', String.raw`/(?<!\/)\/+$/`);
const REPLY_DASH = fromSource('engagement-reports.js', String.raw`/(?<!\s)\s+—\s*|—\s*/g`);
const LAST_WORD = fromSource('engagement-reports.js', String.raw`/(?<!\s)\s+\S*$/`);
const TAGS = fromSource('engagement-sources.js', String.raw`/<[^>]+>|(<[^>]*$)/g`);
const URL_QUERY = fromSource('engagement-sources.js', String.raw`/[?#](?<![?#][^\n\r\u2028\u2029?#]*[?#]).*$/`);
const WORD_CLASS = fromSource('engagement.js', String.raw`/\[(.)[^\]]*\]|(\[.[^\]]*$)/g`);
// Stands in for the old prefix regex on the call site: String#replace(SENDER_END, '$1') gives beforeLastLineDelim (#3965).
const SENDER_END = { [Symbol.replace]: (s) => beforeLastLineDelim(String(s), '>') };
const FENCE = fromSource('jarvis-github-fix.js', '/^```(?:json)?\\s*|(?<!\\s)\\s+```$|```$/g');
const META = fromSource('url-review-owner-proof.js', String.raw`/<meta\b(?<=(?:^|>)(?:(?!<meta\b)[^>])*<meta)[^>]*>/gi`);
const TITLE = fromSource('url-review-lookalikes.js', String.raw`/<title\b(?<=^(?:(?!<title\b)[\s\S])*<title)[^>]*>([\s\S]*?)<\/title>/i`);
const seeker = sourceFn('mail-inbound.js', 'seeker');
const spfPassFroms = sourceFn('mail-inbound.js', 'spfPassFroms', { seeker });

test('outreach-trials email shape and bare domain', () => {
	const OLD_EMAIL = /^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/;
	same(OLD_EMAIL, EMAIL, [
		'ana@clinic.es', 'ana.perez@mail.example.org', 'a@b.c', 'a@.b', 'a@b.', 'a@.bc', 'a@..b', 'a@..', 'a@b..', 'a@.', 'a@b',
		'a b@c.d', 'a@b/c.d', 'a@b.c.d', 'a@@b.c', '@b.c', 'a@...b', 'a@b.c ', `a@${'.'.repeat(BIG)}`, `a@${'a.'.repeat(BIG)}`,
		...fuzz(chars('a@./ \t'), 6000, 10),
	], tests);

	const OLD_DOMAIN = /[/?#].*$/;
	same(OLD_DOMAIN, TRIAL_DOMAIN, [
		'clinic.es', 'clinic.es/', 'clinic.es/about?x=1#y', 'shop.example.com?ref=a', 'a.com#top', '', '/', '?#/', 'a/b\nc/d',
		'a/b\nc', 'x\n/y', 'a\r\nb?c', 'a/\u2028b', `${'/'.repeat(BIG)}\n`, `${'?#'.repeat(BIG)}\nx/`,
		...fuzz(chars('a/?#\n\r\u2028\u2029 '), 6000),
	], withText(''));
});

test('engagement-field-sweep site without trailing slashes', () => {
	same(/\/+$/, SITE_SLASH, [
		'https://carlosandmunoz.com/', 'https://carlosandmunoz.com', 'https://x.com///', '/', '', 'a//b//', `${'/'.repeat(BIG)}a`,
		...fuzz(chars('a/ \n')),
	], withText(''));
});

test('engagement-reports reply dashes and cut words', () => {
	const real = [
		'Great site — check it', 'a—b', 'a — — b', 'x  —  y — z', '— lead', 'tail —', 'Nice work —\n— really', `a${' '.repeat(BIG)}—b`,
		`a${' '.repeat(BIG)}b`, `${' —'.repeat(BIG)}`,
	];
	same(/\s*—\s*/g, REPLY_DASH, [...real, ...fuzz(chars('a — \n\t—\u00a0'))], withText(', '));

	same(/\s+\S*$/, LAST_WORD, [
		'Your site scores well on speed but the hero ima', 'one', 'one two', 'trailing ', 'a  b\t c', '', ' ', '  lead', 'a\nb\n',
		`a${' '.repeat(BIG)}x`, `${'a '.repeat(BIG)}b`, ...fuzz(chars('ab \t\n\u00a0')),
	], withText(''));
});

test('engagement-sources plain text and error URLs', () => {
	const OLD_TAGS = /<[^>]+>/g;
	same(OLD_TAGS, TAGS, [
		'<p>Hi <b>there</b></p>', 'a <> b', 'a < b', '<<a>', 'x<', '<a<b>', '<p>open <b', '<span class="h-card">@a</span>',
		`${'<'.repeat(BIG)}x`, ...fuzz(chars('<>a \n'), 6000),
	], (re, s) => s.replace(re, ''), (re, s) => s.replace(re, (m, open) => open || ''));
	const { plain } = require('../../functions/engagement-sources.js');
	// Expected text as main's plain() gives it (#3965): tags dropped, entities decoded, an unfinished "<b" kept.
	const CASES = [
		['<p>Hello <a href="x">@ana</a>&amp; co</p><p>2</p>', 'Hello @ana& co\n2'],
		['<br/>a<br>b', 'a\nb'],
		['a < b &lt; c', 'a < b < c'],
		['<p>x <b', 'x <b'],
		['<<b>b>', 'b>'],
		['<p>a&lt;b&gt;c&quot;&#39;&nbsp;d</p>', 'a<b>c"\' d'],
		[null, ''],
		['', ''],
		['a<b>c', 'ac'],
	];
	for (const [input, want] of CASES) assert.equal(plain(input), want, JSON.stringify(input));

	same(/[?#].*$/, URL_QUERY, [
		'https://mastodon.social/api/v2/search?q=x&type=statuses', 'https://bsky.social/xrpc/app.bsky.feed.searchPosts?q=a#b',
		'https://a.b/c', '', '?', '#', 'a?b\nc', 'a\nb?c', 'a\r\n?b', `/${'?'.repeat(BIG)}\n/x?q`, ...fuzz(chars('a?#\n\r\u2028 ')),
	], withText(''));
});

test('engagement keyword labels from their regex sources', () => {
	const { TOPICS, INTL } = require('../../functions/engagement.js');
	const words = [...Object.values(TOPICS).flat(), ...Object.values(INTL).flatMap((o) => Object.values(o).flat())];
	assert.ok(words.some((w) => w.includes('[')));
	same(/\[(.)[^\]]*\]/g, WORD_CLASS, [
		...words, 'optimi[sz]ation', 'colo[u]r', '[ab]c[de]', '[]]', '[]', '[', 'a[b', '[\n]', '[\nab]', '[a\nb]', '[[[x]', '[a[b]c]',
		`${'['.repeat(BIG)}`, `${'[\n'.repeat(BIG)}]`, `[${'a'.repeat(BIG)}`, ...fuzz(chars('[]a\n\r\u2028b'), 8000),
	], (re, s) => s.replace(re, '$1'), (re, s) => s.replace(re, '$1$2'));
});

test('jarvis-geo reply sender address', () => {
	same(/>.*$/, SENDER_END, [
		'ana@x.com>', 'ana@x.com> (via list)', 'ana@x.com', '', '>', 'a>b>c', 'x>y\nz>w', 'x>y\nz', 'line1\nline2 > tail',
		'a\r\nb>c', 'a\u2028b>c>d', 'a>b\u2029c', `${'>'.repeat(BIG)}\n>x`, `a${' '.repeat(BIG)}>b`,
		...fuzz(chars('a>\n\r\u2028\u2029 ')),
	], (re, s) => s.replace(re, ''), (re, s) => s.replace(re, '$1'));
});

test('jarvis-github-fix diagnosis JSON fence', () => {
	same(/^```(?:json)?\s*|\s*```$/g, FENCE, [
		'```json\n{"cause":"x"}\n```', '```\n{}\n```', '{}', '{"a":1}\n\n```', '``` ```', '```json```', '```', '  ```',
		'```json   \n  ```', '```json\n{}\n```\n', '{} ``` {}', `\`\`\`json${' '.repeat(BIG)}{}${'\n'.repeat(BIG)}\`\`\``,
		...fuzz(['```', 'json', ' ', '\n', '{', '}', '`', 'a']),
	], withText(''));
});

test('url-review-owner-proof meta tags and url-review-lookalikes title', () => {
	const OLD_META = /<meta\b[^>]*>/gi;
	same(OLD_META, META, [
		'<meta name="qa-lab-verify" content="abc"><META NAME=x content=y /><metadata>', '<meta<meta charset=utf-8>', '<meta name=x',
		'<p><meta a><meta b></p>', `${'<meta'.repeat(BIG)}>`, `${'<meta '.repeat(BIG)}`,
		...fuzz(['<meta', '<META', '<metax', '>', 'x', ' ', '<', 'a', '=', '"'], 6000),
	], (re, s) => [hits(re, s), s.match(re)]);
	const { metaTokens } = require('../../functions/url-review-owner-proof.js');
	assert.deepEqual(metaTokens('<head><meta name="qa-lab-verify" content=" tok1 "><meta<meta name=qa-lab-verify content=tok2></head>'), ['tok1', 'tok2']);

	const OLD_TITLE = /<title\b[^>]*>([\s\S]*?)<\/title>/i;
	same(OLD_TITLE, TITLE, [
		'<html><head><title>Clinica Dental</title></head>', '<TITLE id=t>\nA &amp; B\n</TITLE>', '<title>a<title>b</title>',
		'<titles>x</titles>', '<title>open', '<title', '<svg><title>icon</title></svg><title>Page</title>', 'no title',
		`${'<title'.repeat(BIG)}>`, `${'<title>'.repeat(BIG)}`, ...fuzz(['<title', '<TITLE', '>', '</title>', '</title', 'x', ' ', '<', 's', '\n'], 6000),
	]);
});

test('mail-inbound SPF pass domains', () => {
	const OLD = /spf=pass[^;]*?smtp\.mailfrom=(?:[^@\s;]*@)?([a-z0-9.-]+)/gi;
	const real = [
		'mx.improvmx.com; dkim=pass header.d=example.com; spf=pass (domain of x designates) smtp.mailfrom=bounce@mail.example.com; dmarc=pass',
		'i=1; mx.google.com; spf=pass (google.com: domain of a@b.co designates 1.2.3.4) smtp.mailfrom=a@b.co; dkim=pass header.i=@b.co',
		'spf=pass smtp.mailfrom=plain.example.org', 'SPF=PASS SMTP.MAILFROM=UP@UPPER.COM', 'spf=softfail smtp.mailfrom=a.b',
		'spf=pass smtp.mailfrom=@;spf=pass smtp.mailfrom=x@y.z', 'spf=pass smtp.mailfrom==smtp.mailfrom=x', 'spf=pass smtp.mailfrom=a@ b',
		'spf=pass smtp.mailfrom=a@_ smtp.mailfrom=c@d.e', 'spf=passsmtp.mailfrom=x.io', 'spf=pass spf=pass smtp.mailfrom=a smtp.mailfrom=b',
		'spf=pass smtp.mailfrom=x spf=pass smtp.mailfrom=y; spf=pass smtp.mailfrom=z', 'spf=pass; smtp.mailfrom=no', '',
		`spf=pass ${'smtp.mailfrom=='.repeat(BIG)}`, `${'spf=pass'.repeat(BIG)}`, `${'spf=pass;'.repeat(BIG)}smtp.mailfrom=x`,
		'spf=pass smtp.mailfrom=a@b@c.d', 'spf=pass smtp.mailfrom=@@x', 'spf=pass smtp.mailfrom=ü@x.de', 'spf=pass smtp.mailfrom=a\n@b.c',
	];
	const parts = ['spf=', 'SPF=', 'pass', 'fail', 'spf=pass', 'smtp', '.mailfrom=', 'smtp.mailfrom=', 'SMTP.MailFrom=', '@', 'x.com',
		';', ' ', '\n', 'a', '=', '-', '_', '.', 'ü'];
	const inputs = [...real, ...fuzz(parts, 20000, 18)];
	for (const s of inputs) assert.deepEqual(spfPassFroms(s), [...s.matchAll(OLD)].map((m) => m[1]), JSON.stringify(s));

	const { passedDomains } = require('../../functions/mail-inbound.js');
	const DKIM = /dkim=pass[^;]*?header\.(?:d|i)=@?([a-z0-9.-]+)/gi;
	const oldPassed = (auth) => {
		const out = new Set();
		for (const m of auth.matchAll(DKIM)) out.add(m[1].toLowerCase());
		for (const m of auth.matchAll(OLD)) out.add(m[1].toLowerCase());
		return [...out];
	};
	for (const s of [...real, ...fuzz([...parts, 'dkim=pass', ' header.d=', 'y.org'], 6000, 18)]) {
		assert.deepEqual(passedDomains({ 'Authentication-Results': s }), oldPassed(s), JSON.stringify(s));
	}
});

test('attack strings finish in linear time', () => {
	const n = 50000;
	const cases = [
		() => EMAIL.test(`a@${'.'.repeat(n)}@`),
		() => `${'/'.repeat(n)}\n`.replace(TRIAL_DOMAIN, ''),
		() => `${'/'.repeat(n)}a`.replace(SITE_SLASH, ''),
		() => `${' '.repeat(n)}a`.replace(REPLY_DASH, ', '),
		() => `${' '.repeat(n)}\n`.replace(LAST_WORD, ''),
		() => `a${' '.repeat(n)}\u00a0`.replace(LAST_WORD, ''),
		() => '<'.repeat(n).replace(TAGS, (m, open) => open || ''),
		() => `${'?'.repeat(n)}\n`.replace(URL_QUERY, ''),
		() => '['.repeat(n).replace(WORD_CLASS, '$1$2'),
		() => `${'[\n'.repeat(n)}]`.replace(WORD_CLASS, '$1$2'),
		() => `${'>'.repeat(n)}\n`.replace(SENDER_END, '$1'),
		() => `\`\`\`${' '.repeat(n)}x`.replace(FENCE, ''),
		() => '<meta'.repeat(n / 5).match(META),
		() => '<title'.repeat(n / 6).match(TITLE),
		() => `<title>${'<title>'.repeat(n / 7)}`.match(TITLE),
		() => spfPassFroms(`spf=pass ${'smtp.mailfrom=='.repeat(n / 15)}`),
		() => spfPassFroms('spf=pass'.repeat(n / 8)),
		() => spfPassFroms(`${'spf=pass;'.repeat(n / 9)}smtp.mailfrom=x`),
		() => spfPassFroms(`spf=pass${' smtp.mailfrom=@'.repeat(n / 16)}`),
	];
	for (const run of cases) {
		const t = Date.now();
		run();
		assert.ok(Date.now() - t < 1500, `${run} took ${Date.now() - t} ms`);
	}
});
