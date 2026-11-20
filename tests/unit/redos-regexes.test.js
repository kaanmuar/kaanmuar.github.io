'use strict';
// #3922: each regex recheck flagged was rewritten to a linear form. Old and new must agree on real inputs.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const { locate } = require('./_loose-head');
const LIT = /\/(?:\\.|\[(?:\\.|[^\]\\\n])*\]|[^/\\\n[])+\/[dgimsuy]*/y;

/** The regex literal that follows `head` (which ends in "= /...") in functions/<file>; head must be unique. */
function fromSource(file, head) {
	const text = fs.readFileSync(path.join(ROOT, 'functions', file), 'utf8');
	LIT.lastIndex = locate(text, head, file, head.indexOf('= /') + 2).end;
	const lit = LIT.exec(text)[0];
	const last = lit.lastIndexOf('/');
	return new RegExp(lit.slice(1, last), lit.slice(last + 1));
}

const hits = (re, s) => (re.global ? [...s.matchAll(re)].map((m) => [m.index, ...m]) : ((m) => m && [m.index, ...m])(re.exec(s)));

function same(oldRe, newRe, inputs, view = hits) {
	for (const s of inputs) assert.deepEqual(view(newRe, s), view(oldRe, s), JSON.stringify(s));
}

const tests = (re, s) => re.test(s);

test('company-contacts JSON-LD blocks', () => {
	const OLD = /<script[^>]+type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script[^>]*>/gi;
	same(OLD, fromSource('company-contacts.js', 'const re = /<script'), [
		'<script type="application/ld+json">{"@type":"Organization","email":"a@b.co"}</script>',
		"<SCRIPT id=\"x\" type='application/ld+json'>\n[{\"a\":1}]\n</SCRIPT >",
		'<script src="a.js"></script><script type="application/ld+json">{"x":"<b>y</b>"}</script><script data-type="application/ld+json">{}</script>',
		'<script>var a = 1;</script><p>no data</p>',
	]);
});

test('company-contacts contact links', () => {
	const OLD = /<a\b[^>]*?\bhref\s*=\s*(?:"([^"#]+)"|'([^'#]+)')/gi;
	same(OLD, fromSource('company-contacts.js', 'const re = /<a\\b'), [
		'<a href="/contact">Contact</a> <a class="x" href=\'/about#team\'>A</a> <A HREF="https://x.com/kontakt">K</A>',
		'<a href="#top">t</a> <a name=x>n</a> <a data-href="/a" href="/b">b</a> <abbr href="/no">no</abbr>',
	]);
});

test('engagement-profiles Mastodon hosts', () => {
	const OLD = /(^|\.)(mastodon\.[a-z.]+|mstdn\.[a-z.]+|[a-z0-9-]*masto[a-z0-9-]*\.[a-z.]+|fosstodon\.org|hachyderm\.io|infosec\.exchange|social\.[a-z0-9.-]+|toot\.[a-z.]+|chaos\.social|det\.social|norden\.social|troet\.cafe)$/i;
	same(OLD, fromSource('engagement-profiles.js', 'const MASTODON_HOST = /'), [
		'mastodon.social', 'mstdn.jp', 'fosstodon.org', 'social.vivaldi.net', 'social.politicaconciencia.org', 'toot.community',
		'masto.ai', 'infosec.exchange', 'pixel.mastodon.art', 'my-masto-server.org', 'notmasto.example.com', 'chaos.social',
		'x.toot.cat', 'example.com', 'twitter.com', 'a.b.c', 'mastodon.example', 'masto-1.social',
	], tests);
});

test('engagement-profiles profile links and sameAs', () => {
	const OLD_LINK = /<a\b[^>]*?\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
	same(OLD_LINK, fromSource('engagement-profiles.js', 'const linkRe = /'), [
		'<a href="https://x.com/foo">x</a><a target=_blank href=\'https://www.instagram.com/bar/\'>i</a><a href="">e</a><link href="x">',
	]);
	const OLD_SAME = /"sameAs"\s*:\s*(\[[^\]]*\]|"[^"]*")/g;
	same(OLD_SAME, fromSource('engagement-profiles.js', 'const sameRe = /'), [
		'{"@type":"Organization","sameAs":["https://x.com/a","https://facebook.com/b"]}',
		'{"sameAs" : "https://linkedin.com/company/c"}', '{"sameAs":[ ]}',
	]);
});

test('engagement links stripped from replies', () => {
	const OLD = /\bhttps?:\/\/\S+|\b(?:www\.)?[a-z0-9-]+\.(?:com|net|org|io|dev|app|co)\b\S*/gi;
	const strip = (re, s) => [hits(re, s), s.replace(re, '')];
	same(OLD, fromSource('engagement.js', 'const URLS = /'), [
		'Check https://foo.com/x and www.bar.io/y now', 'visit my-site.dev or carlosandmunoz.com.',
		'no links here, e.g. 3.14 and a-b-c', 'email me at a.b@c.co', 'foo.company is not a link', 'Try -x-y.app today',
	], strip);
});

test('engagement GIF asks', () => {
	const OLD = /\s*\[gif:\s*([^\]\n]{1,40}?)\s*\]\s*/i;
	const ask = (re, s) => [hits(re, s), s.replace(re, ' ').trim()];
	same(OLD, fromSource('engagement.js', 'const GIF_ASK = /'), [
		'Nice one [gif: thumbs up]', '  [GIF:cat]  hello', 'hello [gif:  dancing cat  ] world', 'no gif here',
		'text\n[gif: wow]\nmore', 'x[gif:a]y', `[gif: ${'a'.repeat(40)}]`, `[gif: ${'a'.repeat(41)}]`,
	], ask);
});

test('jarvis-calendar rule offsets', () => {
	const OLD = /^(.*?)(?:\s+([+-]\d+))?$/;
	const rule = (re, s) => ((m) => m && [m[1].trim(), m[2]])(re.exec(s));
	same(OLD, fromSource('jarvis-calendar.js', 'const m = /^(.*?)(?:'), [
		'easter', 'easter +1', 'easter -2', '12-25', 'first monday of september +3', 'day 100', 'easter  +1', 'easter+1',
	], rule);
});

test('jarvis-geo-heat windows', () => {
	const OLD = /^(.*?)\s*(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})(?:\s+(\S+))?\s*$/;
	const win = (re, s) => ((m) => m && [m[1].trim(), ...m.slice(2)])(re.exec(s));
	same(OLD, fromSource('jarvis-geo-heat.js', 'const m = /^(.*?)'), [
		'Mon-Fri 9:00-17:00', 'Sat 10:00 - 14:00 Europe/Madrid', '9:00-17:00', 'Mon,Wed 08:30-12:00 UTC', 'bad', 'Sun 1:00-2:00 a b',
	], win);
});

test('jarvis-marketing campaign names', () => {
	const OLD = /^(W\d+)\s+([A-Z])-([a-z]{2})\s+(.+)$/;
	same(OLD, fromSource('jarvis-marketing.js', 'const m = /^(W\\d+)'), [
		'W12 A-es Madrid', 'W3  B-en  North America', 'W1 a-es X', 'W4 C-pt São Paulo', 'W5 D-de',
	]);
});

test('owner-tags social profile links', () => {
	const OLD = /https?:\/\/(?:www\.|m\.)?(?:x\.com|twitter\.com|instagram\.com|threads\.(?:net|com)|tiktok\.com|bsky\.app|youtube\.com|facebook\.com|linkedin\.com|[a-z0-9-]*(?:mastodon|mstdn)[a-z0-9.-]*|social\.[a-z0-9.-]+|toot\.[a-z0-9.-]+)\/[^\s"'<>\\)]+/gi;
	same(OLD, fromSource('owner-tags.js', 'const SOCIAL = /'), [
		'<a href="https://twitter.com/foo">t</a> https://mastodon.social/@bar, https://m.facebook.com/page',
		'https://hachyderm.io/@x https://social.coop/@z https://my.mastodon-host.org/@q "https://toot.cafe/@w"',
		'https://pixel-mstdn.example.org/@p https://example.com/mastodon/x',
	]);
});

test('student-check pupil domains', () => {
	const OLD = /(^|\.)k12\.|(^|\.)(sch|school|schule|escola|escuela)\.[a-z.]+$/;
	same(OLD, fromSource('student-check.js', 'const PUPILS = /'), [
		'k12.ca.us', 'lincoln.k12.ne.us', 'school.nz', 'x.sch.uk', 'schule.bayern.de', 'escola.sp.gov.br', 'harvard.edu',
		'myschool.com', 'sch.ac.uk', 'school.nsw.edu.au',
	], tests);
});

test('student-communities promotion bans', () => {
	const OLD = /(no|without|zero) (self[- ]?promo\w*|promo\w*|advertis\w*|ads|spam|selling|solicit\w*|marketing|links? to your)|self[- ]?promo\w* (is )?(not allowed|prohibited|banned|forbidden)|advertising (is )?(not allowed|prohibited)|sin (auto)?promoci|no (se permite|está permitid[ao]) (la )?(publicidad|promoci)|prohibid[ao] (la )?(publicidad|promoci|spam)|sem (auto)?promo|proibid[ao] (propaganda|divulga)|keine (eigen)?werbung|werbung (ist )?(nicht erlaubt|verboten)|pas de (publicit|promo|pub)|publicité (est )?interdite|niente (pubblicit|promo|spam)|vietat[ao] (la )?(pubblicit|promo)/i;
	same(OLD, fromSource('student-communities.js', 'const NO_PROMO = /'), [
		'No self-promotion', 'Self-promotion is not allowed', 'self promo prohibited', 'selfpromotional is banned',
		'Advertising is prohibited', 'Promote your work on Fridays', 'keine Werbung', 'self-promotions forbidden',
	], tests);
});

test('url-review-chat-talk prices', () => {
	const OLD = /(?:US\$|R\$|[$€£¥]|\b(?:USD|EUR|GBP|COP|MXN|BRL|ARS|CLP|CHF)\b)\s?(\d[\d.,\s]*\d|\d)|(\d[\d.,\s]*\d|\d)\s?(?:[$€£¥]|\b(?:USD|EUR|GBP|COP|MXN|BRL|ARS|CLP|CHF|euros?|dollars?|d[oó]lares|reais|pesos|franken)\b)/gi;
	same(OLD, fromSource('url-review-chat-talk.js', 'const PRICE = /'), [
		'It costs $1,200 per month', 'Price: 1.500,00 € al mes', 'USD 99', 'about 300 dollars', '2 500 euros', 'R$ 49,90',
		'call 555 1234 now', '100 EUR or 120 USD', '1 2 3 4 USD', 'plan 3, 49 €', '12.5% off, 7 días', '€5 6 USD',
	]);
});

test('url-review-core script strings, headings, consent, password, sitemap', () => {
	const OLD_QUOTED = /"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/g;
	const blank = (re, s) => s.replace(re, (text) => (/\s/.test(text) ? '""' : text));
	same(OLD_QUOTED, fromSource('url-review-core.js', 'const quoted = /'), [
		'var a = "hello world"; var b = \'x\'; var c = `multi\nline`;',
		'say("he said \\"hi there\\""); t = \'it\\\'s here\'; u = "a\\\\"; v = "b c";',
		'if (x) { el.innerHTML = "<b>Buy now</b>"; }',
	], blank);

	const OLD_H = /<h([1-3])\b[^>]*>([\s\S]*?)<\/h\1>/gi;
	same(OLD_H, fromSource('url-review-core.js', 'const re = /<h('), [
		'<h1>Title</h1><p>x</p><h2 class="a">Sub <span>part</span></h2><H3>Third</H3><h4>four</h4><h2>Open',
		'<h1 id=t>A <a href="/x">link</a> <br> B</h1><h2>x</h2 >',
	]);

	const OLD_GTAG = /gtag\(\s*['"]consent['"]\s*,\s*['"]default['"]\s*,\s*\{([\s\S]{0,1200}?)\}/g;
	same(OLD_GTAG, fromSource('url-review-core.js', 'const re = /gtag'), [
		"gtag('consent', 'default', {\n 'ad_storage': 'denied',\n 'analytics_storage': 'denied',\n 'region': ['ES','FR']\n});",
		'gtag("consent","default",{analytics_storage:"granted",wait_for_update:500}); gtag("consent","update",{a:1})',
	]);

	const OLD_PW = /<input\b[^>]*type\s*=\s*["']?password/i;
	const pw = ['<input type="password" name="p">', '<INPUT class=x TYPE=password>', '<input type="text">', '<input data-type="password">', '<form><input name=q></form>'];
	same(OLD_PW, fromSource('url-review-core.js', 'const password = /'), pw, tests);

	const OLD_LOC = /<loc>\s*([\s\S]*?)\s*<\/loc>/gi;
	const NEW_LOC = fromSource('url-review-core.js', 'const re = /<loc>');
	const xml = '<urlset><url><loc>https://a.com/</loc></url><url><loc>\n  https://a.com/b\n</loc></url><url><LOC><![CDATA[https://a.com/c]]></LOC></url></urlset>';
	assert.deepEqual([...xml.matchAll(NEW_LOC)].map((m) => m[1].trim()), [...xml.matchAll(OLD_LOC)].map((m) => m[1]));
});

test('url-review-hack-signs links, hidden styles and hidden blocks', () => {
	const OLD_A = /<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi;
	same(OLD_A, fromSource('url-review-hack-signs.js', 'const re = /<a\\b'), [
		'<a href="/x">Home</a><a href=\'https://spam.example\'>cheap <b>pills</b></a ><abbr>x</abbr><a name=y>z</a>',
		'<p><a class="btn" href="/buy"><img src="a.png"> Buy</a></p><area href="/m">',
	]);

	const OLD_HIDDEN = /display\s*:\s*none|visibility\s*:\s*hidden|(?:left|top|text-indent|margin-left)\s*:\s*-\d{3,}(?:px|em)|font-size\s*:\s*[01](?:px)?\s*(?:;|$|!)|opacity\s*:\s*0\s*(?:;|$|!)|(?:height|width)\s*:\s*[01](?:px)?\s*;[^"']*overflow\s*:\s*hidden|overflow\s*:\s*hidden\s*;[^"']*(?:height|width)\s*:\s*[01](?:px)?\s*(?:;|$)/i;
	same(OLD_HIDDEN, fromSource('url-review-hack-signs.js', 'const HIDDEN_STYLE = /'), [
		'display:none', 'height:0;overflow:hidden', 'overflow: hidden; width: 1px', 'width:1px; position:absolute; overflow:hidden',
		'height:10px;overflow:hidden', 'color:red', 'overflow:hidden;height:0', 'height:0; width:0; overflow:hidden',
		'overflow:hidden; overflow:hidden; height:1px;', 'height:0; overflow:auto', 'overflow:hidden; color:red; height:1px; x',
		'left:-9999px', 'font-size:0', 'opacity:0;',
	], tests);

	const OLD_OPENS = /<(div|span|p|section|aside|footer|font|small|ul|li|ins|marquee)\b([^>]*)>/gi;
	same(OLD_OPENS, fromSource('url-review-hack-signs.js', 'const opens = /'), [
		'<div style="display:none">x</div><span class=a><p><pre>no</pre><marquee behavior="scroll">m</marquee>',
	]);
});

test('url-review-lookalikes login forms', () => {
	const OLD = /<input\b[^>]*\btype\s*=\s*["']?password\b/i;
	same(OLD, fromSource('url-review-lookalikes.js', 'row.login = /'), [
		'<input type="password" name="p">', '<INPUT class=x TYPE=password>', '<input type="text">', '<input data-type="password">',
		'<input type="passwords">',
	], tests);
});

test('url-review-owner-replies forwards, headers, quotes and addresses', () => {
	const OLD_FWD = /-{4,}\s*(forwarded message|mensaje reenviado|message transf[ée]r[ée]|weitergeleitete nachricht|messaggio inoltrato|mensagem encaminhada)\s*-{4,}|^[ \t]*(begin forwarded message|inicio del mensaje reenviado|d[ée]but du message r[ée]exp[ée]di[ée]|anfang der weitergeleiteten nachricht|inizio messaggio inoltrato|in[íi]cio da mensagem (re)?encaminhada)\s?:/im;
	const NEW_FWD = fromSource('url-review-owner-replies.js', 'const FORWARD = /');
	const mails = [
		'Hi\n\n---------- Forwarded message ---------\nFrom: A <a@b.com>', 'Begin forwarded message:\n\nFrom: x',
		'------ Mensaje reenviado ------', 'no marker', '--- short --- forwarded message ----',
	];
	same(OLD_FWD, NEW_FWD, mails, (re, s) => [s.search(re), s.replace(new RegExp(re.source, 'gim'), '')]);

	const OLD_HEAD = /^[\s*]*([^:*]{1,12}?)[\s*]*:[\s*]*(.*?)[\s*]*$/;
	same(OLD_HEAD, fromSource('url-review-owner-replies.js', 'const HEADER_LINE = /'), [
		'From: Ana <ana@x.com>', '**Subject:** Hello there**', '  * De: Juan  ', 'Sent: Monday, 3 March', 'Not a header line',
		'Reply-To:', 'Datum: 1.2.2026 *', 'a very long key here: x', 'To: *', 'Cc:   b@x.com , c@x.com   ',
	]);

	const OLD_QUOTE = /^\s*(on .+wrote:|el .+escribi[óo]:|le .+a [ée]crit\s?:|am .+schrieb.*:|il giorno .+ha scritto:|em .+escreveu:|-{3,}\s*(original message|mensaje original|message d'origine|urspr[üu]ngliche nachricht|messaggio originale|mensagem original)\s*-{3,}|\**(from|de|von|da):\**\s.+@.+|_{8,})/im;
	same(OLD_QUOTE, fromSource('url-review-owner-replies.js', 'const QUOTE_START = /'), [
		'Thanks!\n\nOn Mon, 3 Mar 2026, Ana <a@x.com> wrote:\n> hi', '\nOn Tue, X wrote:\nquoted',
		'Gracias\n\nEl lun, 3 mar 2026, Juan escribió:\n', 'Danke\nAm 3. März 2026 um 10:00 schrieb Max <m@x.de>:\n',
		'Ok\n-----Original Message-----\nFrom: a', 'Sure\n\n   \n**From:** Ana ana@x.com\n', 'Ok\n________________\nFrom',
		'no quote here', 'Am Montag schrieb er nichts', 'Hi\n  \n\t\nLe 3 mars, Paul a écrit :',
	], (re, s) => s.search(re));

	const OLD_EMAIL = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
	const email = ['Write to ana.perez@example.com or info@x.co.uk.', 'a..b@c.de', '<john+tag@mail.example.org>', 'no email @ here'];
	same(OLD_EMAIL, fromSource('url-review-owner-replies.js', 'const EMAIL = /'), email, (re, s) => [hits(re, s), s.split(re)]);
});

test('url-review-prospects platform hosts', () => {
	const OLD = /(^|\.)(facebook|instagram|linktr|wa|whatsapp|google|goo|youtube|tiktok|twitter|x|linkedin|yelp|tripadvisor|doctoralia|doctolib|jameda|booksy|fresha|treatwell|planity|ubereats|rappi|ifood|deliveroo|justeat|glovoapp|opentable|thefork|resy|zocdoc|healthgrades|houzz|angi|homeadvisor|thumbtack|idealista|fotocasa|zillow|realtor|rightmove|immobilienscout24|seloger|immobiliare|wixsite|business\.site|square|squareup|toasttab|beacons|carrd|bio)\.[a-z.]+$/i;
	same(OLD, fromSource('url-review-prospects.js', 'const PLATFORMS = /'), [
		'facebook.com', 'm.facebook.com', 'business.site', 'linktr.ee', 'wa.me', 'goo.gl', 'immobilienscout24.de', 'myclinic.es',
		'google.com.br', 'x.com', 'box.com', 'shop.wixsite.com', 'clinica-dental.es',
	], tests);
});

test('url-review-wordpress generator tags', () => {
	const OLD = /<meta\b[^>]*name\s*=\s*["']?generator["']?[^>]*>/gi;
	same(OLD, fromSource('url-review-wordpress.js', 'const GENERATOR = /'), [
		'<meta name="generator" content="WordPress 6.4.2" />', "<META content='Wix.com' NAME=generator>",
		'<meta name="description" content="x"><meta property="og:x" name=\'generator\'>',
	]);
});

test('attack strings recheck found finish in linear time', () => {
	const cases = [
		['url-review-owner-replies.js', 'const EMAIL = /', '.'.repeat(50000) + '-.AA'],
		['url-review-chat-talk.js', 'const PRICE = /', 'G' + '0'.repeat(50000)],
		['url-review-core.js', 'const re = /<h(', 'H' + '<H1>H'.repeat(20000) + 'a'],
		['url-review-hack-signs.js', 'const re = /<a\\b', '<A\x00'.repeat(30000)],
		['engagement.js', 'const URLS = /', 'M-'.repeat(30000) + 'M'],
		['url-review-owner-replies.js', 'const FORWARD = /', 'B' + '--'.repeat(30000) + '\n'],
		['url-review-prospects.js', 'const PLATFORMS = /', 'T' + '.ANGI'.repeat(20000) + '4'],
	];
	for (const [file, head, input] of cases) {
		const re = fromSource(file, head);
		const t = Date.now();
		if (re.global) [...input.matchAll(re)];
		else re.test(input);
		assert.ok(Date.now() - t < 1500, `${file} ${head} took ${Date.now() - t} ms`);
	}
});
