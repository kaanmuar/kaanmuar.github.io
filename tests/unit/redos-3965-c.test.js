'use strict';
// #3965: each regex recheck flagged was rewritten to a linear form. Old and new must agree on real inputs.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { beforeLastLineDelim } = require('../../functions/line-cut.js');

const ROOT = path.join(__dirname, '..', '..');
const { locate } = require('./_loose-head');
const LIT = /\/(?:\\.|\[(?:\\.|[^\]\\\n])*\]|[^/\\\n[])+\/[dgimsuy]*/y;

/** The regex literal opening at head[open] (default: the last "/" in head) in functions/<file>; head must be unique. */
function fromSource(file, head, open = head.lastIndexOf('/')) {
	const text = fs.readFileSync(path.join(ROOT, 'functions', file), 'utf8');
	LIT.lastIndex = locate(text, head, file, open).end;
	const lit = LIT.exec(text)[0];
	const last = lit.lastIndexOf('/');
	return new RegExp(lit.slice(1, last), lit.slice(last + 1));
}

const hits = (re, s) => (re.global ? [...s.matchAll(re)].map((m) => [m.index, ...m]) : ((m) => m && [m.index, ...m])(re.exec(s)));

function same(oldRe, newRe, inputs, view = hits) {
	for (const s of inputs) assert.deepEqual(view(newRe, s), view(oldRe, s), JSON.stringify(s));
}

/** Old and new regexes whose replace calls differ but must leave the same text. */
function sameText(oldRun, newRun, inputs) {
	for (const s of inputs) assert.equal(newRun(s), oldRun(s), JSON.stringify(s));
}

const HTML_BREAK = fromSource('index.js', 'String(html || "").replace(/');
const FENCE = fromSource('jarvis-actions.js', 'String(raw || "").replace(/');
const DRAFT_FENCE = fromSource('jarvis-share.js', 'const text = raw.replace(/');
// Stands in for the old prefix regex on the call site: String#replace(AFTER_ADDRESS, '$1') gives beforeLastLineDelim (#3965).
const AFTER_ADDRESS = { [Symbol.replace]: (s) => beforeLastLineDelim(String(s), '>') };
// Stands in for the old prefix regex on the call site: String#replace(HOST_END, '$1') gives beforeLastLineDelim (#3965).
const HOST_END = { [Symbol.replace]: (s) => beforeLastLineDelim(String(s), '/:') };
// Stands in for the old prefix regex on the call site: String#replace(PATH_START, '$1') gives beforeLastLineDelim (#3965).
const PATH_START = { [Symbol.replace]: (s) => beforeLastLineDelim(String(s), '/') };
// Stands in for the old prefix regex on the call site: String#replace(QUERY, '$1') gives beforeLastLineDelim (#3965).
const QUERY = { [Symbol.replace]: (s) => beforeLastLineDelim(String(s), '?') };
const TRACE = fromSource('jarvis-outreach.js', '.message)) || "").replace(/');
const TRAILING = fromSource('jarvis-review.js', 'raw = raw.replace(/');
const SHORTS = fromSource('jarvis-share.js', '(d.youtubeTitle || out.title).replace(/');
const SKIT_ID = fromSource('jarvis-studio.js', 'String(skitsJs || "").matchAll(/');
const MD_LINK = fromSource('jarvis.js', '.replace(/\\[(');
const EMAIL_OK = fromSource('launch-campaign.js', 'return /^[^\\s@/]+@', 'return '.length);
const RULE_LINES = fromSource('student-communities.js', 't.split(/');
const ADDRESS = fromSource('tiktok-business-watch.js', 'const ADDRESS = /');
const ADDRESS_AT = fromSource('tiktok-business-watch.js', 'const ADDRESS_AT = /');

const htmlBreaks = (s) => s.replace(HTML_BREAK, (tag, name, close) => (close ? '\n' : tag));
const unlink = (s) => s.replace(MD_LINK, (link, label, target, close) => (target && close ? label : link));
function addresses(text) {
	const out = [];
	for (let at = 0, m; ; at = m.index + m[0].length) {
		ADDRESS_AT.lastIndex = at;
		ADDRESS.lastIndex = at;
		m = ADDRESS_AT.exec(text) || ADDRESS.exec(text);
		if (!m) break;
		out.push(m[0]);
	}
	return out;
}

test('index htmlText line breaks', () => {
	const OLD = /<(br|\/p|\/div|\/tr)[^>]*>/gi;
	sameText((s) => s.replace(OLD, '\n'), htmlBreaks, [
		'<p>Hello<br>there</p><div>Second</div><table><tr><td>x</td></tr></table>', '<BR/>a<br class="x">b<Br >c',
		'<brx>odd</p >', '<br <b>bold</b> tail', 'text then <br', 'x<br<br<br', '<p>a</p><br', '</div>\n<br\n>end',
		'plain text, no tags', '', `${'<br'.repeat(50)}>`, `<p>${' '.repeat(200)}</p${' '.repeat(200)}`,
	]);
});

test('jarvis-actions and jarvis-share JSON fences', () => {
	const OLD = /^```(?:json)?\s*|\s*```$/g;
	const fences = [
		'```json\n[{"key":"a","action":"rerun"}]\n```', '```\n[]\n```', '[]', '[{"a":1}]\n\n```', '``` ```', '```json```',
		'```', '  ```', '```json   \n  ```', '```json\n[1]\n```\n', '[1] ``` [2]', `\`\`\`json${' '.repeat(300)}[]${'\n'.repeat(300)}\`\`\``,
	];
	const view = (re, s) => [hits(re, s), s.replace(re, '')];
	same(OLD, FENCE, fences, view);
	same(OLD, DRAFT_FENCE, fences, view);
});

test('jarvis-geo-heat and jarvis-outreach bare hosts', () => {
	const hosts = [
		'carlosandmunoz.com', 'carlosandmunoz.com/path?q=1', 'x.com:8080/a', 'x.com:443', 'a/b:c', 'a:b/c', '', '/', ':',
		'a\nb/c', 'a/b\nc', 'a\r\nb:c', `${'/'.repeat(300)}\nx`, `${':'.repeat(300)}\nx:`,
	];
	const OLD_HOST = /[/:].*$/;
	sameText((s) => s.replace(OLD_HOST, ''), (s) => s.replace(HOST_END, '$1'), hosts);
	const OLD_PATH = /\/.*$/;
	sameText((s) => s.replace(OLD_PATH, ''), (s) => s.replace(PATH_START, '$1'), hosts);
});

test('jarvis-geo-heat sender address end', () => {
	const OLD = />.*$/;
	sameText((s) => s.replace(OLD, ''), (s) => s.replace(AFTER_ADDRESS, '$1'), [
		'ana@x.com>', 'ana@x.com> (via list)', 'ana@x.com', '', '>', 'a>b>c', 'x>y\nz>w', 'x>y\nz', 'line1\nline2 > tail',
		'a\r\nb>c', 'a\u2028b>c>d', 'a>b\u2029c', `${'>'.repeat(300)}\n>x`, `a${' '.repeat(300)}>b`,
	]);
});

test('jarvis-log-poll request URLs', () => {
	const OLD = /\?.*$/;
	sameText((s) => s.replace(OLD, ''), (s) => s.replace(QUERY, '$1'), [
		'https://carlosandmunoz.com/api/x?y=1&z=2', '/path/only', '/a?b?c', '?', '', 'a?b\nc', 'a\nb?c', 'a\r\n?b',
		`/${'?'.repeat(300)}\n/x?q`,
	]);
});

test('jarvis-outreach Instantly error trace ids', () => {
	const OLD = /\s*Trace ID:.*$/s;
	same(OLD, TRACE, [
		'Mailbox disconnected. Trace ID: abc-123', 'SMTP error   \n Trace ID: x\ny', 'Trace ID: at start', 'no trace here',
		'a Trace ID: x Trace ID: y', '   ', 'x \t Trace ID:', `x${' '.repeat(300)}Trace ID: z`, `x${' '.repeat(300)}y`,
	], (re, s) => [hits(re, s), s.replace(re, '')]);
});

test('jarvis-review trailing punctuation', () => {
	const OLD = /[).,;!?]+$/;
	same(OLD, TRAILING, [
		'https://x.com/a).', 'https://x.com/a', 'x.com!!!?', ')))', 'a.b,c;', 'a)b)', '', 'https://x.com/(a)', `${')'.repeat(300)}x`,
	]);
});

test('jarvis-share #shorts tags', () => {
	const OLD = /\s*#shorts\b/ig;
	same(OLD, SHORTS, [
		'My video #shorts', 'My video #Shorts #shorts', '#shorts first', 'x   #shortsy', 'a #shorts\t#SHORTS b', 'tag#shorts',
		'no tag', `a${' '.repeat(300)}#shorts`, `a${' '.repeat(300)}b`,
	], (re, s) => [hits(re, s), s.replace(re, '')]);
});

test('jarvis-studio skit ids', () => {
	const OLD = /^\s*id:\s*"([a-z0-9-]+)"/gm;
	same(OLD, SKIT_ID, [
		'const SKITS = [\n  {\n    id: "intro-1",\n    title: "x"\n  },\n  { id: "b" },\n\n\n  id: "c-2"\n];',
		'\r\n  id: "x"\r\n\r\n id: "y"', 'id:"top"\nid: "two" id: "same-line"', '  \n  \n  id: "z"', ' x\n \n\tid: "w"',
		'a "q"\nid: "after"', 'id: "a"\n\n\nid: "b"', '\u2028 id: "u"', `${'\n'.repeat(300)}  id: "far"`, 'id: "Bad"\nid: "ok"',
	]);
});

test('jarvis speakable markdown links', () => {
	const OLD = /\[([^\]]+)\]\([^)]+\)/g;
	sameText((s) => s.replace(OLD, '$1'), unlink, [
		'See [the docs](https://x.com/docs) now', '[a](b) and [c](d)', '[x[a](b)', '[]([a](b))', '[a]()', '[a](', '[a] (b)',
		'[a](b', '[[a]](b)', 'text [a](b)(c)', '[a](b [c](d))', '[x]([y)[a](b)', '[unclosed', ']]][a](b)', '[a]\n(b)',
		'[a](\n)', '[a](b)[c](d', '[a]([b](c)', '[](x)', `${'['.repeat(300)}a](b)`, `${'[a]('.repeat(100)})`,
	]);
});

test('launch-campaign email shape', () => {
	const OLD = /^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/;
	same(OLD, EMAIL_OK, [
		'ana@clinic.es', 'ana.perez@mail.example.org', 'a@b.c', 'a@.b', 'a@b.', 'a@.bc', 'a@..b', 'a@..', 'a@b..', 'a@.', 'a@b',
		'a b@c.d', 'a@b/c.d', 'a@b.c.d', 'a@@b.c', '@b.c', 'a@...b', 'a@b.c ', `a@${'.'.repeat(300)}`, `a@${'a.'.repeat(300)}`,
	], (re, s) => re.test(s));
});

test('student-communities rule lines', () => {
	const OLD = /(?<=[.!?])\s+|\s*\n\s*/;
	same(OLD, RULE_LINES, [
		'No self promo. Be kind!  Spam is banned.\nLinks ok on Fridays', 'a\n\n  b', 'a  \n  b', 'a.   b', 'line1\r\nline2',
		'a   b', '\n start', 'end \n', 'Wow!\n\nnext', '  ', 'x.\ny', 'Really?\tYes', `a${' '.repeat(300)}b`, `a${' \n'.repeat(100)}b`,
	], (re, s) => s.split(re));
});

test('tiktok-business-watch sender addresses', () => {
	const OLD = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
	for (const s of [
		'TikTok For Business <no-reply@business.tiktok.com>', 'noreply@tiktok.com', 'Ana <ana@x.com>, Bo <bo@y.co.uk>',
		'"a@b.com" <real@sender.io>', 'a@b.cc1@y.zz', 'a@b.cc.d@e.ff', 'a@b.ccd@e.ff', 'x @b.cc1@y.zz', 'no address', '',
		'a..b@c.de', `${'a'.repeat(300)}@x`, `${'a'.repeat(300)}@x.com`, 'A@B.COM_c@d.org',
	]) assert.deepEqual(addresses(s), s.match(OLD) || [], JSON.stringify(s));
});

test('attack strings finish in linear time', () => {
	const cases = [
		() => htmlBreaks('<br'.repeat(30000)),
		() => '```'.concat(' '.repeat(50000), 'x').replace(FENCE, ''),
		() => '>'.repeat(50000).concat('\n').replace(AFTER_ADDRESS, '$1'),
		() => '/:'.repeat(25000).concat('\n').replace(HOST_END, '$1'),
		() => '/'.repeat(50000).concat('\n').replace(PATH_START, '$1'),
		() => '?'.repeat(50000).concat('\n').replace(QUERY, '$1'),
		() => ' '.repeat(50000).concat('x').replace(TRACE, ''),
		() => ')'.repeat(50000).concat('x').replace(TRAILING, ''),
		() => ' '.repeat(50000).concat('x').replace(SHORTS, ''),
		() => [...'\n'.repeat(50000).concat('x').matchAll(SKIT_ID)],
		() => unlink('['.repeat(50000)),
		() => unlink('[a]('.repeat(20000)),
		() => EMAIL_OK.test('a@'.concat('.'.repeat(50000), '@')),
		() => ' '.repeat(50000).concat('x').split(RULE_LINES),
		() => addresses('a'.repeat(50000)),
		() => addresses('a@b.cc'.repeat(10000)),
	];
	for (const run of cases) {
		const t = Date.now();
		run();
		assert.ok(Date.now() - t < 1500, `${run} took ${Date.now() - t} ms`);
	}
});
