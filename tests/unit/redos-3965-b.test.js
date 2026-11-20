'use strict';
// #3965: each regex recheck flagged in these files was rewritten to a linear form. Old and new must agree on real inputs.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');

/** The regex literal `lit` (written exactly as in the source) after checking it appears `count` times in functions/<file>. */
function fromSource(file, lit, count = 1) {
	const text = fs.readFileSync(path.join(ROOT, 'functions', file), 'utf8');
	assert.equal(text.split(lit).length - 1, count, `${file}: ${lit}`);
	const last = lit.lastIndexOf('/');
	return new RegExp(lit.slice(1, last), lit.slice(last + 1));
}

/** A top-level function of functions/<file> that is not exported, built from its source with `scope` as its free names. */
function sourceFn(file, name, scope) {
	const text = fs.readFileSync(path.join(ROOT, 'functions', file), 'utf8');
	const at = text.indexOf(`\nfunction ${name}(`);
	assert.ok(at >= 0, `${file}: ${name}`);
	const body = text.slice(at, text.indexOf('\n}\n', at) + 2);
	return new Function(...Object.keys(scope), `${body}\nreturn ${name};`)(...Object.values(scope));
}

const hits = (re, s) => (re.global ? [...s.matchAll(re)].map((m) => [m.index, ...m]) : ((m) => m && [m.index, ...m])(re.exec(s)));
const tests = (re, s) => re.test(s);

function same(oldRe, newRe, inputs, oldView = hits, newView = oldView) {
	for (const s of inputs) assert.deepEqual(newView(newRe, s), oldView(oldRe, s), JSON.stringify(s));
}

/** Deterministic random strings built from `parts`, so old and new also meet inputs nobody thought to write. */
function fuzz(parts, n = 3000, max = 14, seed = 3965) {
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

test('cut from the first separator of the last line: chain-trials, engagement-act, outreach-people, owner-tags', () => {
	const real = [
		'example.com/path/to?x=1', 'shop.example.com', 'https://a.b/c#frag', 'a.com:8080/x', 'user@mastodon.social', '@foo@bar.baz',
		'api.x.com/2/tweets?ids=1#t', '', '/', 'a/b\nc/d', 'a/b\nc', 'x\n/y', '?#/:@', 'a\r\nb/c', 'a/\u2028b', `${'/'.repeat(200)}\n`,
	];
	const cases = [
		[/\/.*$/, fromSource('chain-trials.js', String.raw`/\/(?<!\/[^\n\r\u2028\u2029/]*\/).*$/`, 2), 'a/b\n\r\u2028\u2029'],
		[/[?#].*$/, fromSource('engagement-act.js', String.raw`/[?#](?<![?#][^\n\r\u2028\u2029?#]*[?#]).*$/`), 'a?#\n\r\u2028'],
		[/[/?#].*$/, fromSource('outreach-people.js', String.raw`/[/?#](?<![/?#][^\n\r\u2028\u2029/?#]*[/?#]).*$/`), 'a/?#\n\r\u2029'],
		[/[/:].*$/, fromSource('owner-tags.js', String.raw`/[/:](?<![/:][^\n\r\u2028\u2029/:]*[/:]).*$/`), 'a/:\n\r\u2028'],
		[/\?.*$/, fromSource('owner-tags.js', String.raw`/\?(?<!\?[^\n\r\u2028\u2029?]*\?).*$/`, 2), 'a?\n\r\u2029'],
		[/@.*$/, fromSource('owner-tags.js', String.raw`/@(?<!@[^\n\r\u2028\u2029@]*@).*$/`), 'a@\n\r\u2028'],
	];
	for (const [OLD, NEW, alphabet] of cases) same(OLD, NEW, [...real, ...fuzz(chars(alphabet + ' '))]);
});

test('trailing runs: engagement-act, owner-tags, mail-inbound', () => {
	const cases = [
		[/\/+$/, fromSource('engagement-act.js', String.raw`/(?<!\/)\/+$/`, 3), ['https://bsky.social/', 'https://m.social///', 'https://x', '/', '', 'a//b//']],
		[/[.,;:!?)\]"'»”]+$/, fromSource('engagement-act.js', String.raw`/(?<![.,;:!?)\]"'»”])[.,;:!?)\]"'»”]+$/`), ['https://a.com/x).', 'https://a.com/x', 'https://a.com/?q=1!»”', '"\'.', 'a.b,c;']],
		[/[.,;]+$/, fromSource('owner-tags.js', String.raw`/(?<![.,;])[.,;]+$/`), ['https://x.com/foo.', 'https://x.com/a,b;;', 'https://x.com/a', '.,;']],
		[/\s+$/, fromSource('owner-tags.js', String.raw`/(?<!\s)\s+$/`), ['Caption  \n ', 'Caption', '   ', 'a \tb \u00a0', '']],
		[/[>\s]+$/, fromSource('mail-inbound.js', String.raw`/(?<![>\s])[>\s]+$/`), ['x.com> ', 'x.com', 'a> b>>  ', '>>']],
	];
	for (const [OLD, NEW, real] of cases) same(OLD, NEW, [...real, ...fuzz(chars('a/.,;:!?)]"\'»”> \t\n'))]);
});

test('dash and space-before-punctuation cleanups: chain-trials, engagement-profiles', () => {
	const OLD_DASH = /\s*—\s*/g;
	const real = ['Great site — check it', 'a—b', 'a — — b', 'x  —  y — z', '— lead', 'tail —', 'a ,b . c', 'hi , there .', ' , '];
	const dash = [OLD_DASH, fromSource('chain-trials.js', String.raw`/(?<!\s)\s+—\s*|—\s*/g`)];
	assert.ok(fromSource('engagement-profiles.js', String.raw`/(?<!\s)\s+—\s*|—\s*/g`));
	same(...dash, [...real, ...fuzz(chars('a — \n\t—'))]);
	same(/\s+([,.])/g, fromSource('engagement-profiles.js', String.raw`/(?<!\s)\s+([,.])/g`), [...real, ...fuzz(chars('a ,.\n\t'))]);
});

test('outreach-people email check', () => {
	same(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, fromSource('outreach-people.js', String.raw`/^[^\s@]+@[^\s@][^\s@.]*\.[^\s@]+$/`), [
		'ana@example.com', 'a@b.co', 'a@.b.c', 'a@..b', 'a@b.', 'a@b', 'a@b..', 'a@b..c', '@b.c', 'a b@c.d', 'a@b.c d', 'a@@b.c',
		...fuzz(chars('a@. \t'), 4000, 10),
	], tests);
});

test('system-review causes', () => {
	const OLD_TOKEN = /access token is invalid|bad credentials|token (has )?expired|invalid[_ ]?token|\b401\b[^\n]*(token|credential|unauthori[sz]ed)/i;
	const NEW_TOKEN = fromSource('system-review.js', String.raw`/access token is invalid|bad credentials|token (has )?expired|invalid[_ ]?token|(?:^|\n)(?:(?!\b401\b)[^\n])*\b401\b[^\n]*(token|credential|unauthori[sz]ed)/i`);
	const OLD_MEM = /memory limit|heap out of memory|ENOMEM|killed.*signal 9/i;
	const NEW_MEM = fromSource('system-review.js', String.raw`/memory limit|heap out of memory|ENOMEM|(?:^|[\n\r\u2028\u2029])(?:(?!killed).)*killed.*signal 9/i`);
	const real = [
		'HttpError: 401 Unauthorized', 'curl: (22) The requested URL returned error: 401 - Bad credentials', 'status 401 for /token',
		'a4012 token', '401', 'Process completed with exit code 137 (killed by signal 9)', 'Killed: signal 9', 'killed\nsignal 9',
		'FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory', 'ok',
	];
	const parts = ['401', 'a401', '4012', ' ', 'x', '\n', '\r', 'token', 'Credential', 'killed', 'KILLED', 'signal 9', 'signal 8', 'unauthorised'];
	same(OLD_TOKEN, NEW_TOKEN, [...real, ...fuzz(parts)], tests);
	same(OLD_MEM, NEW_MEM, [...real, ...fuzz(parts)], tests);
});

test('owner-tags review hosts', () => {
	const OLD = /\b((?:[a-z0-9-]+\.)+[a-z]{2,})\s+Score\s+\d/gi;
	const NEW = fromSource('owner-tags.js', String.raw`/\b((?:[a-z0-9-]+\.)+[a-z]{2,})\s+Score\s+\d|\b[a-z0-9-]+(?:\.[a-z0-9-]+)*/gi`);
	const kept = (re, s) => hits(re, s).filter((h) => h[2]);
	same(OLD, NEW, [
		'Review: clinica-dental.es Score 72, www.example.co.uk Score 40 and foo.com score 9', 'a..b.com Score 1', 'x-a.com Score 2',
		'-a.com Score 3', '_a.com Score 4', 'a.com Score 12.b.org Score 3', 'a.b.c1 Score 5', 'a.com.  Score 6', 'A.COM\nScore\t7',
	], hits, kept);
	same(OLD, NEW, fuzz(['a', 'B', '1', '-', '.', '..', 'com', ' ', '  ', 'Score', ' 1', '_', '\n', 'SCORE 2', 'x.io'], 6000, 16), hits, kept);
});

test('YouTube feed entries: engagement-profiles (all) and owner-tags (first)', () => {
	const xml = [
		'<feed><entry><yt:videoId>abcdefghijk</yt:videoId></entry><entry><title>b</title></entry></feed>',
		'<entry>a<entry>b</entry>c', '<entry>open only', '<entry></entry><entry>tail', 'no entries', '</entry><entry>x</entry>',
	];
	const inputs = [...xml, ...fuzz(['<entry>', '</entry>', 'a', '<', '>', 'entry', '</entry'])];
	const OLD_ALL = /<entry>[\s\S]*?<\/entry>/g;
	const NEW_ALL = fromSource('engagement-profiles.js', String.raw`/<entry>[\s\S]*?<\/entry>|(<entry>)[\s\S]*/g`);
	same(OLD_ALL, NEW_ALL, inputs, hits, (re, s) => hits(re, s).filter((h) => !h[2]).map((h) => h.slice(0, 2)));
	const OLD_ONE = /<entry>[\s\S]*?<\/entry>/;
	const NEW_ONE = fromSource('owner-tags.js', String.raw`/<entry>[\s\S]*?<\/entry>|(<entry>)[\s\S]*/`);
	same(OLD_ONE, NEW_ONE, inputs, (re, s) => (s.match(re) || [''])[0], (re, s) => ((head) => (head && !head[1] ? head[0] : ''))(s.match(re)));
});

test('news-wire CDATA, tags and feed links', () => {
	const OLD_CDATA = /<!\[CDATA\[([\s\S]*?)\]\]>/g;
	const NEW_CDATA = fromSource('news-wire.js', String.raw`/<!\[CDATA\[([\s\S]*?)\]\]>|(<!\[CDATA\[[\s\S]*)/g`);
	same(OLD_CDATA, NEW_CDATA, [
		'<title><![CDATA[Hello & <b>world</b>]]></title>', '<![CDATA[a]]><![CDATA[b]]>', '<![CDATA[open', '<![CDATA[a]]> <![CDATA[b',
		...fuzz(['<![CDATA[', ']]>', ']', ']]', 'a', '<']),
	], (re, s) => s.replace(re, '$1'), (re, s) => s.replace(re, '$1$2'));

	const OLD_TAGS = /<[^>]+>/g;
	const NEW_TAGS = fromSource('news-wire.js', String.raw`/<[^>]+>|(<[^>]*$)/g`);
	assert.ok(fromSource('owner-tags.js', String.raw`/<[^>]+>|(<[^>]*$)/g`) && fromSource('mail-inbound.js', String.raw`/<[^>]+>|(<[^>]*$)/g`));
	same(OLD_TAGS, NEW_TAGS, [
		'<p>Hi <b>there</b></p>', 'a <> b', 'a < b', '<<a>', 'x<', '<a<b>', '<p>open <b', ...fuzz(chars('<>a '), 4000),
	], (re, s) => s.replace(re, ' '), (re, s) => s.replace(re, (m, open) => open || ' '));

	const OLD_LINK = /<link\b[^>]*href="(https:\/\/[^"]+)"/i;
	const linkOf = sourceFn('news-wire.js', 'linkOf', { tag: () => '' });
	const blocks = [
		'<entry><link rel="alternate" href="https://news.example/a"/></entry>', '<LINK href="https://x.y/z">', '<link href="http://x">',
		'<link rel="self"><link href="https://b.c/d"/>', '<linkx href="https://no">', '<link href="https://a" href="https://b">',
		'<link href="https://open', '<link href="https://href="https://x"', '<link a=">" href="https://late"', '<link HREF="HTTPS://UP"',
		'<link href="https://"">', '<link href="https://a"<link href="https://b', '<link href="https://a>b" x>',
		...fuzz(['<link', '<LINK', '<linkx', ' ', 'href="', 'HREF="', 'https://', 'x', '"', '>', '/', 'a'], 8000, 16),
	];
	for (const s of blocks) assert.equal(linkOf(s), ((m) => (m ? m[1] : ''))(s.match(OLD_LINK)), JSON.stringify(s));
	const t = Date.now();
	linkOf('<link href="https://'.repeat(10000));
	linkOf('<link'.repeat(20000));
	assert.ok(Date.now() - t < 1500, `linkOf took ${Date.now() - t} ms`);
});

test('mail-inbound Authentication-Results', () => {
	const real = [
		'mx.improvmx.com; dkim=pass header.d=example.com header.s=s1 header.b=abc; spf=pass (domain of x designates) smtp.mailfrom=bounce@mail.example.com; dmarc=pass',
		'i=1; mx.google.com; dkim=pass header.i=@carlosandmunoz.com; dkim=fail header.d=other.org; spf=softfail smtp.mailfrom=a.b',
		'dkim=none; dkim=pass header.d=@x.co', 'DKIM=PASS Header.D=UPPER.COM', 'dkim=pass dkim=pass header.d=a.com dkim=pass header.d=b.com',
		'dkim=passheader.d=x.io', 'dkim=passheader.d=x.io header.d=y.io', 'dkim=1 dkim=pass header.d=n.com', 'dkim=pass header.d=;dkim=pass header.i=z.net',
	];
	const parts = ['dkim=', 'DKIM=', 'pass', 'fail', 'header', 'Header', '.d=', '.i=', '@', 'x.com', ';', ' ', 'a', '=', '-', '1', '_'];
	const inputs = [...real, ...fuzz(parts, 8000, 16)];

	const OLD_PASS = /dkim=pass[^;]*?header\.(?:d|i)=@?([a-z0-9.-]+)/gi;
	const NEW_PASS = fromSource('mail-inbound.js', String.raw`/dkim=pass[^;]*?header\.(?:d|i)=@?([a-z0-9.-]+)|dkim=pass[^;]*/gi`);
	same(OLD_PASS, NEW_PASS, inputs, hits, (re, s) => hits(re, s).filter((h) => h[2]));

	const OLD_DKIM = /\bdkim=([a-z]+)[^;]*?header\.(?:d|i)=@?([a-z0-9.-]+)/gi;
	const NEW_DKIM = fromSource('mail-inbound.js', String.raw`/\bdkim=(?=([a-z]+))\1[^;]*?header\.(?:d|i)=@?([a-z0-9.-]+)|\bdkim=([a-z]+)header\.(?:d|i)=@?([a-z0-9.-]+)|\bdkim=[a-z][^;]*/gi`);
	same(OLD_DKIM, NEW_DKIM, inputs, hits, (re, s) => hits(re, s).filter((h) => h[3] || h[5]).map((h) => [h[0], h[1], h[2] || h[4], h[3] || h[5]]));

	const { replyAuth } = require('../../functions/mail-inbound.js');
	const oldReply = (auth) => [...auth.matchAll(OLD_DKIM)].map((m) => '{@' + m[2].toLowerCase() + ' : ' + m[1].toLowerCase() + '}').join(', ');
	for (const s of inputs) assert.equal(replyAuth({ 'Authentication-Results': s }).dkim, oldReply(s), JSON.stringify(s));
});

test('mail-inbound htmlText drops style and script blocks', () => {
	const { htmlText } = require('../../functions/mail-inbound.js');
	const oldText = (html) => String(html || '').replace(/<(style|script)[\s\S]*?<\/\1>/gi, ' ').replace(/<br\s*\/?>|<\/(p|div|tr|td|h\d|li)>/gi, '\n')
		.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/[ \t]+/g, ' ');
	const inputs = [
		'<html><head><style>p{color:red}</style></head><body><p>Hi&nbsp;Ana</p><script>alert(1)</script>Bye<br/>x</body></html>',
		'<STYLE type="text/css">a{}</Style><p>ok</p>', '<style>open <p>text</p>', '<script><style></script></style>tail',
		'<style><script></style></script>tail', '<style a <script>x</script> b', '<stylesheet>x</stylesheet>', '', null,
		...fuzz(['<style', '<script', '<Style', '</style>', '</script>', '</STYLE>', '>', 'a', '<br>', '<p>', '</p>', '&amp;', ' ', '<'], 6000, 16),
	];
	for (const s of inputs) assert.equal(htmlText(s), oldText(s), JSON.stringify(s));
});

test('attack strings finish in linear time', () => {
	const { htmlText } = require('../../functions/mail-inbound.js');
	const cases = [
		[String.raw`/\/(?<!\/[^\n\r\u2028\u2029/]*\/).*$/`, '/'.repeat(50000) + '\n'],
		[String.raw`/[?#](?<![?#][^\n\r\u2028\u2029?#]*[?#]).*$/`, '?'.repeat(50000) + '\n'],
		[String.raw`/(?<![.,;:!?)\]"'»”])[.,;:!?)\]"'»”]+$/`, '.'.repeat(50000) + 'a'],
		[String.raw`/(?<!\/)\/+$/`, '/'.repeat(50000) + 'a'],
		[String.raw`/(?<!\s)\s+$/`, ' '.repeat(50000) + 'a'],
		[String.raw`/(?<!\s)\s+—\s*|—\s*/g`, ' '.repeat(50000) + 'a'],
		[String.raw`/(?<!\s)\s+([,.])/g`, ' '.repeat(50000) + 'a'],
		[String.raw`/^[^\s@]+@[^\s@][^\s@.]*\.[^\s@]+$/`, 'a@' + '.'.repeat(50000) + ' '],
		[String.raw`/\b((?:[a-z0-9-]+\.)+[a-z]{2,})\s+Score\s+\d|\b[a-z0-9-]+(?:\.[a-z0-9-]+)*/gi`, 'a.'.repeat(30000) + 'com Score x'],
		[String.raw`/<entry>[\s\S]*?<\/entry>|(<entry>)[\s\S]*/g`, '<entry>'.repeat(20000)],
		[String.raw`/<!\[CDATA\[([\s\S]*?)\]\]>|(<!\[CDATA\[[\s\S]*)/g`, '<![CDATA['.repeat(20000)],
		[String.raw`/<[^>]+>|(<[^>]*$)/g`, '<'.repeat(50000)],
		[String.raw`/dkim=pass[^;]*?header\.(?:d|i)=@?([a-z0-9.-]+)|dkim=pass[^;]*/gi`, 'dkim=pass'.repeat(20000)],
		[String.raw`/\bdkim=(?=([a-z]+))\1[^;]*?header\.(?:d|i)=@?([a-z0-9.-]+)|\bdkim=([a-z]+)header\.(?:d|i)=@?([a-z0-9.-]+)|\bdkim=[a-z][^;]*/gi`, 'dkim=' + 'a'.repeat(50000)],
		[String.raw`/\bdkim=(?=([a-z]+))\1[^;]*?header\.(?:d|i)=@?([a-z0-9.-]+)|\bdkim=([a-z]+)header\.(?:d|i)=@?([a-z0-9.-]+)|\bdkim=[a-z][^;]*/gi`, ' dkim=a'.repeat(20000)],
		[String.raw`/access token is invalid|bad credentials|token (has )?expired|invalid[_ ]?token|(?:^|\n)(?:(?!\b401\b)[^\n])*\b401\b[^\n]*(token|credential|unauthori[sz]ed)/i`, ' 401'.repeat(20000)],
		[String.raw`/memory limit|heap out of memory|ENOMEM|(?:^|[\n\r\u2028\u2029])(?:(?!killed).)*killed.*signal 9/i`, 'killed'.repeat(20000)],
	];
	for (const [lit, input] of cases) {
		const last = lit.lastIndexOf('/');
		const re = new RegExp(lit.slice(1, last), lit.slice(last + 1));
		const t = Date.now();
		if (re.global) [...input.matchAll(re)];
		else re.test(input);
		assert.ok(Date.now() - t < 1500, `${lit} took ${Date.now() - t} ms`);
	}
	const t = Date.now();
	htmlText('<style'.repeat(10000) + '<script'.repeat(10000));
	assert.ok(Date.now() - t < 1500, `htmlText took ${Date.now() - t} ms`);
});
