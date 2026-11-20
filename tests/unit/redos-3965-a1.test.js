'use strict';
// #3965: regexes recheck flagged in url-review insights, hack-signs, failures, local, exposed and legal were rewritten
// to linear forms. Old and new must agree on real inputs and on random mixes of the tokens each one reads.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const LIT = /\/(?:\\.|\[(?:\\.|[^\]\\\n])*\]|[^/\\\n[])+\/[dgimsuy]*/y;
const failures = require('../../functions/url-review-failures');
const hackSigns = require('../../functions/url-review-hack-signs');
const { LEGAL } = require('../../functions/url-review-legal');

/** The regex literal right after `head` in functions/<file>; head must be unique and end just before the literal. */
function fromSource(file, head) {
	const text = fs.readFileSync(path.join(ROOT, 'functions', file), 'utf8');
	const at = text.indexOf(head);
	assert.ok(at >= 0, `${file}: ${head}`);
	assert.equal(text.indexOf(head, at + 1), -1, `${file}: ${head} is not unique`);
	LIT.lastIndex = at + head.length;
	const lit = LIT.exec(text)[0];
	const last = lit.lastIndexOf('/');
	return new RegExp(lit.slice(1, last), lit.slice(last + 1));
}

const hits = (re, s) => (re.global ? [...s.matchAll(re)].map((m) => [m.index, ...m]) : ((m) => m && [m.index, ...m])(re.exec(s)));
const tests = (re, s) => re.test(s);

function same(oldRe, newRe, inputs, view = hits) {
	for (const s of inputs) assert.deepEqual(view(newRe, s), view(oldRe, s), JSON.stringify(s));
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

const LINES = ['\n', '\r\n', '\r', '\u2028', ' ', '\t', '  \n', '\u00a0'];

test('url-review-exposed SQL dump statement', () => {
	const OLD = /^\s*(CREATE TABLE(?: IF NOT EXISTS)?|INSERT INTO|DROP TABLE IF EXISTS)\s+([`"\w.]{1,64})/im;
	const NEW = fromSource('url-review-exposed.js', 'const statement = text.match(');
	same(OLD, NEW, [
		'CREATE TABLE `users` (\n  id int\n);', '-- dump\n\n\n  INSERT INTO posts VALUES (1);', 'create table if not exists "a.b" (x)',
		'SET NAMES utf8;\r\n\r\n   \r\nDROP TABLE IF EXISTS wp_options;', '<html>CREATE TABLE x</html>', 'no sql here', '\n\n\n',
		'x CREATE TABLE t', '   \n\t\nCREATE TABLE t', 'INSERT INTO\n\nfoo',
	]);
	same(OLD, NEW, mixes([...LINES, 'CREATE TABLE', ' IF NOT EXISTS', 'INSERT INTO', 'x', '`t`', ';', 'DROP TABLE IF EXISTS', 'insert into']));
});

test('url-review-exposed git config [core]', () => {
	const OLD = /^\s*\[core\]\s*$/m;
	const NEW = fromSource('url-review-exposed.js', 'kind: "git", proof: (r) => !looksHtml(r.text) && ');
	const view = (re, s) => [re.test(s), hits(re, s)];
	same(OLD, NEW, [
		'[core]\n\trepositoryformatversion = 0\n\tfilemode = true', '\n\n  [core]  \n\tbare = false', '[core] x', 'x [core]',
		'\r\n\r\n[core]\r\n', '[remote "origin"]\n', '  \n \n[CORE]',
	], view);
	same(OLD, NEW, mixes([...LINES, '[core]', 'x', '[core] y', '['], 3000), view);
});

test('url-review-exposed config.json secret keys', () => {
	const OLD = /"((?:db_?|database_?|smtp_?|mail_?|admin_?)?pass(?:word|wd)?|[\w-]*secret[\w-]*|private_?key|aws_secret_access_key|connection_?string)"\s*:\s*"[^"]{3,}"/i;
	const NEW = fromSource('url-review-exposed.js', 'const key = r.text.match(');
	same(OLD, NEW, [
		'{"db_password": "hunter22"}', '{"client_secret":"abc123","x":1}', '{"name":"a","API-SECRET-KEY" : "xyz"}',
		'{"aws_secret_access_key": "AKIA..."}', '{"secret": "ab"}', '{"passwd":"\n\nxyz"}', '{"secretsecret_x": "1234"}',
		'{"connectionString":"Server=x"}', '{"private_key": "-----BEGIN"}', '{"other": "secret"}',
	]);
	same(OLD, NEW, mixes(['"', 'secret', 'SECRET', 'pass', 'word', 'db_', '-', '_', 'x', ':', ' ', '"abc"', '"ab"', 'private_key']));
});

test('url-review-failures Firestore save cause', () => {
	const OLD = /not a valid Firestore document|as a Firestore value|invalid nested entity|field name .+ is reserved/i;
	const NEW = fromSource('url-review-failures.js', '["save", "The finished report could not be saved", ');
	same(OLD, NEW, [
		'Value for argument "data" is not a valid Firestore document.', 'Field name "__name__" is reserved.', 'field name  is reserved',
		'field name x\n is reserved', 'field name field name x is reserved', 'Cannot use "undefined" as a Firestore value', 'timeout',
	], tests);
	same(OLD, NEW, mixes(['field name ', 'Field Name ', ' is reserved', 'x', ' ', '\n', '\r', 'field', ' is', 'invalid nested entity']), tests);
});

test('url-review-failures bot check vendor', () => {
	const OLD = /\b(?:a|an) (.+?) bot check/;
	const NEW = fromSource('url-review-failures.js', 'const vendor = (text.match(');
	same(OLD, NEW, [
		'The site answered with a Cloudflare bot check', 'blocked by an Akamai bot check (status 403)', 'a  bot check', 'a x bot check',
		'banana bot check', 'a b\na c bot check', 'an an bot check bot check', 'Sucuri bot check', 'a a a a',
	]);
	same(OLD, NEW, mixes(['a ', 'an ', 'a', 'n', ' ', 'x', 'bot check', ' bot check', '\n', '\r\n', 'Cloudflare', '_', '-']));
});

test('url-review-failures scrubbed emails and query strings', () => {
	const OLD_EMAIL = /[^\s@<>"'(),;]+@[^\s@<>"'(),;]+\.[a-z]{2,}/gi;
	const OLD_QUERY = /(https?:\/\/[^\s?#"'<>]+)[?#][^\s"'<>)]*/gi;
	const email = (s) => s.replace(OLD_EMAIL, '[email]');
	const query = (s) => s.replace(OLD_QUERY, '$1?…');
	const mails = [
		'Ana <ana.perez@example.com> wrote', 'mail info@x.co.uk, or bob@y.io.', 'a@b.c', 'a@b.cc1x@d.ee', 'x@y.ab1z@w.cd', 'a@b.cc@d.ee',
		'@x.com', 'a@.co', 'a@b..co', 'user+tag@sub.Example.ORG;', 'fetch failed for https://a.com/?u=bob@x.com&t=1',
	];
	for (const s of mails) assert.equal(failures.hideEmails(s), email(s), JSON.stringify(s));
	for (const s of mixes(['a', 'B', '1', '.', '@', '-', ' ', ',', '<', 'co', '.de', 'x@y.zz', '_', '"'], 4000, 14)) {
		assert.equal(failures.hideEmails(s), email(s), JSON.stringify(s));
	}
	const links = [
		'GET https://a.com/x?token=abc failed', 'see http://a.com/#frag and https://b.org/p?q=1&r=2)', 'https://?x', 'http://a.com',
		'http://a?xhttp://b)http://c?d', 'HTTPS://X.COM/A?B "https://y.com/z#w"', 'http://http://http://a?b', 'https://a.com/?u=bob@x.com&t=1',
	];
	for (const s of links) assert.equal(failures.hideQueries(s), query(s), JSON.stringify(s));
	for (const s of mixes(['http://', 'https://', 'HTTP://', 'a', '/', '?', '#', ')', ' ', '"', 'x=1', '&', 'h', 'ttp://'], 4000, 14)) {
		assert.equal(failures.hideQueries(s), query(s), JSON.stringify(s));
	}
	for (const s of [...mails, ...links]) assert.equal(failures.hideQueries(failures.hideEmails(s)), query(email(s)), JSON.stringify(s));
});

test('url-review-hack-signs blocks dropped before reading text and links', () => {
	const OLD_PAGE = /<(script|style|noscript|template|svg|head)\b[\s\S]*?<\/\1\s*>/gi;
	const OLD_SPAM = /<(script|style|template|noscript)\b[\s\S]*?<\/\1\s*>/gi;
	const pages = [
		'<head><title>x</title></head><body><script>var a="<b>";</script><p>hi</p><style>p{}</style ></body>',
		'<SCRIPT type="x">document.write("<script src=a></scr"+"ipt>")</Script ><svg><path/></svg>tail',
		'<script>a<script>b</script>c</script>', '<scripts>keep</scripts><scriptx>', '<style>never closed <p>text</p>',
		'<noscript><img></noscript><template><a href="/x">y</a></template>', '<script></script\n\n>', '<script></script \nx>',
	];
	const tokens = ['<script', '<style', '<svg', '<head', '<noscript', '<template', '>', '</script>', '</style >', '</SCRIPT\n>', '</svg>', '</head>',
		'x', ' ', '<', '/', 's', '</template>', '</noscript>', '</script'];
	for (const s of [...pages, ...mixes(tokens, 4000, 14)]) {
		assert.equal(hackSigns.dropBlocks(s, hackSigns.PAGE_BLOCKS), s.replace(OLD_PAGE, ' '), JSON.stringify(s));
		assert.equal(hackSigns.dropBlocks(s, hackSigns.SPAM_BLOCKS), s.replace(OLD_SPAM, ' '), JSON.stringify(s));
	}
});

test('url-review-hack-signs title and meta tags', () => {
	const OLD_TITLE = /<title\b[^>]*>([\s\S]*?)<\/title>/i;
	same(OLD_TITLE, fromSource('url-review-hack-signs.js', 'const titleMatch = body.match('), [
		'<html><head><title>Cheap pills</title></head>', '<TITLE id=t>\nA &amp; B\n</TITLE>', '<title>a<title>b</title>', '<titles>x</titles>',
		'<title>open', '<title', '<svg><title>icon</title></svg><title>Page</title>', 'no title',
	]);
	same(OLD_TITLE, fromSource('url-review-hack-signs.js', 'const titleMatch = body.match('),
		mixes(['<title', '<TITLE', '>', '</title>', '</title', 'x', ' ', '<', 's', '\n']));

	const OLD_META = /<meta\b[^>]*>/gi;
	const NEW_META = fromSource('url-review-hack-signs.js', 'const metas = body.match(');
	const view = (re, s) => [hits(re, s), s.match(re)];
	same(OLD_META, NEW_META, [
		'<meta name="robots" content="noindex"><META NAME=googlebot content=nofollow /><metadata>', '<meta<meta charset=utf-8>',
		'<meta name=x', '<p><meta a><meta b></p>',
	], view);
	same(OLD_META, NEW_META, mixes(['<meta', '<META', '>', 'x', ' ', '<', 'a', '=', 'd']), view);
});

test('url-review-insights sentence ends, versions, security.txt expiry, site name', () => {
	const OLD_END = /\.*$/;
	const NEW_END = fromSource('url-review-insights.js', 'const end = (text) => String(text).replace(');
	const end = (re, s) => [hits(re, s), s.replace(re, '.')];
	same(OLD_END, NEW_END, ['Registered 2010', 'Expires soon.', 'Wait...', '', '.', 'a.b.c', '...x', 'x..y..'], end);
	same(OLD_END, NEW_END, mixes(['.', 'x', ' ', '..', '\n']), end);

	const OLD_VER = /\d+\.\d+/;
	const NEW_VER = fromSource('url-review-insights.js', 'const version = [hdr.server, rawHeaders.poweredBy].filter((value) => ');
	same(OLD_VER, NEW_VER, ['nginx/1.18.0', 'Apache', 'PHP/8', 'Express', 'IIS 10.0', '1.', '.5', '12345', 'v1..2'], tests);
	same(OLD_VER, NEW_VER, mixes(['1', '22', '.', 'x', '/', ' ']), tests);

	const OLD_EXP = /^\s*expires\s*:\s*(.+)$/im;
	const NEW_EXP = fromSource('url-review-insights.js', '((sec.body || "").match(');
	same(OLD_EXP, NEW_EXP, [
		'Contact: mailto:a@b.com\nExpires: 2026-01-01T00:00:00.000Z\n', '\n\n   \nEXPIRES : 2025-12-31', 'Expires:\nContact: x',
		'Contact: x\r\n\r\n  Expires:   2030-01-01  \r\n', 'Policy: x\n# Expires: never', 'expires:', 'Expires:   \n\n',
	]);
	same(OLD_EXP, NEW_EXP, mixes([...LINES, 'Expires', 'expires', ':', ' 2026', 'x', 'Contact: y']));

	const OLD_NAME = /\s+[|–—·-]\s+/;
	const NEW_NAME = fromSource('url-review-insights.js', 'String(face.title || ctx.host).split(');
	const split = (re, s) => s.split(re);
	same(OLD_NAME, NEW_NAME, [
		'Acme Dental | Madrid', 'Shop – Home', 'A - B - C', 'Solo', 'x |y', 'a  |  b', 'a | | b', 'a — b · c', ' | lead',
	], split);
	same(OLD_NAME, NEW_NAME, mixes([' ', '  ', '|', '–', '—', '·', '-', 'x', '\n', 'ab']), split);
});

test('url-review-legal accessibility statement text and address', () => {
	const OLD_TEXT = /^(web )?(accessibility|accesibilidad|acessibilidade|barrierefreiheit|accessibilit[ée]|accessibilit[àa])$|(statement|declaraci[oó]n|declara[cç][ãa]o|erkl[äa]rung|d[ée]claration|dichiarazione)\b.{0,30}(accessib|accesib|acessib|barrierefrei)|(accessib|barrierefrei)\S*\s+(statement|erkl[äa]rung)|accessibilit[ée]\s*:\s*(non|partiellement|totalement)\s+conforme/i;
	const view = (re, s) => [re.test(s), hits(re, s)];
	same(OLD_TEXT, LEGAL.accessibility.text, [
		'Accessibility', 'Web accessibility', 'Accessibility statement', 'Barrierefreiheitserklärung', 'Erklärung zur Barrierefreiheit',
		'Déclaration d\'accessibilité', 'Accessibilité : partiellement conforme', 'accessibility-statement', 'Accessible design blog',
		'Declaración de accesibilidad', 'accessibaccessib statement', 'xaccessibilityx  Statement', 'barrierefreie Erklärung',
	], view);
	same(OLD_TEXT, LEGAL.accessibility.text, mixes(['accessib', 'barrierefrei', 'statement', 'erklärung', ' ', '\n', 'x', 'ility', '-', 'Accessibility']), view);

	const OLD_HREF = /\/[a-z-]*(accessib|accesib|acessib|barrierefrei)[a-z-]*(\.[a-z]+)?\/?$/i;
	same(OLD_HREF, LEGAL.accessibility.href, [
		'/accessibility', '/en/accessibility-statement/', '/barrierefreiheit.html', '/legal/accesibilidad.php/', '/accessibility/help',
		'/accessibility2', '/a11y', '/pages/declaracion-accesibilidad', '/accessibaccessib', '/x.accessibility',
	]);
	same(OLD_HREF, LEGAL.accessibility.href, mixes(['/', 'accessib', 'accesib', 'barrierefrei', 'x', '-', '.', 'html', '1', 'ility']));
});

test('url-review-local opening days and name words', () => {
	const split = (re, s) => s.split(re);
	const OLD_COMMA = /\s*,\s*/;
	const NEW_COMMA = fromSource('url-review-local.js', 'spec.split(');
	same(OLD_COMMA, NEW_COMMA, ['Mo-Fr', 'Mo, We ,Fr', 'Mo , , Tu', 'x , , y', ' , a', 'a,', 'a ,\n b', ''], split);
	same(OLD_COMMA, NEW_COMMA, mixes([' ', ',', 'Mo', '\t', 'x', '  ']), split);

	const OLD_DASH = /\s*[-–]\s*/;
	const NEW_DASH = fromSource('url-review-local.js', 'part.split(');
	same(OLD_DASH, NEW_DASH, ['Mo-Fr', 'Mo – Fr', 'Sa', 'Mo - - Fr', 'a -', ' -b'], split);
	same(OLD_DASH, NEW_DASH, mixes([' ', '-', '–', 'Mo', 'x', '\t']), split);

	const OLD_DOTS = /\.+$/;
	const NEW_DOTS = fromSource('url-review-local.js', '.map((word) => word.replace(');
	const strip = (re, s) => [hits(re, s), s.replace(re, '')];
	same(OLD_DOTS, NEW_DOTS, ['inc.', 'co..', 's.l.', 'acme', '...', '', 'a..b'], strip);
	same(OLD_DOTS, NEW_DOTS, mixes(['.', 'a', '..', '1']), strip);
});

test('attack strings recheck found finish in linear time', () => {
	const timed = (label, run) => {
		const t = Date.now();
		run();
		assert.ok(Date.now() - t < 1500, `${label} took ${Date.now() - t} ms`);
	};
	const cases = [
		['url-review-exposed.js', 'const statement = text.match(', ' \n'.repeat(30000) + 'x'],
		['url-review-exposed.js', 'kind: "git", proof: (r) => !looksHtml(r.text) && ', ' \n'.repeat(30000) + 'x'],
		['url-review-exposed.js', 'const key = r.text.match(', '"' + 'secret'.repeat(20000)],
		['url-review-failures.js', '["save", "The finished report could not be saved", ', 'field name x'.repeat(20000)],
		['url-review-failures.js', 'const vendor = (text.match(', 'a '.repeat(30000) + 'x'],
		['url-review-hack-signs.js', 'const titleMatch = body.match(', '<title'.repeat(20000)],
		['url-review-hack-signs.js', 'const titleMatch = body.match(', '<title>'.repeat(20000)],
		['url-review-hack-signs.js', 'const metas = body.match(', '<meta'.repeat(20000)],
		['url-review-insights.js', 'const end = (text) => String(text).replace(', '.'.repeat(50000) + 'x'],
		['url-review-insights.js', 'const version = [hdr.server, rawHeaders.poweredBy].filter((value) => ', '1'.repeat(50000)],
		['url-review-insights.js', '((sec.body || "").match(', ' \n'.repeat(30000) + 'x'],
		['url-review-insights.js', 'String(face.title || ctx.host).split(', ' '.repeat(50000) + 'x'],
		['url-review-local.js', 'spec.split(', ' '.repeat(50000) + 'x'],
		['url-review-local.js', 'part.split(', ' '.repeat(50000) + 'x'],
		['url-review-local.js', '.map((word) => word.replace(', '.'.repeat(50000) + 'x'],
	];
	for (const [file, head, input] of cases) {
		const re = fromSource(file, head);
		timed(`${file} ${head}`, () => (re.global ? [...input.matchAll(re)] : re.exec(input)));
	}
	timed('legal text', () => LEGAL.accessibility.text.test('accessib'.repeat(10000) + 'x'));
	timed('legal href', () => LEGAL.accessibility.href.test('/' + 'accessib'.repeat(10000) + '!'));
	timed('hideEmails', () => failures.hideEmails('a'.repeat(50000) + ' ' + 'a'.repeat(30000) + '@' + 'b'.repeat(30000)));
	timed('hideQueries', () => failures.hideQueries('http://'.repeat(20000) + ' ' + 'http://)'.repeat(10000)));
	timed('dropBlocks', () => hackSigns.dropBlocks('<script'.repeat(10000) + '<style '.repeat(10000), hackSigns.PAGE_BLOCKS));
});
