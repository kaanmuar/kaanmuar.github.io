'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const heads = require('../../functions/url-review-heads-up');
const send = require('../../functions/url-review-heads-up-send');
const replies = require('../../functions/url-review-owner-replies');
const { POSTAL } = require('../../functions/url-review-customer-mail');

const NOW = Date.parse('2026-11-20T12:00:00Z');
const DAY = 864e5;
const ON = { HEADS_UP_SEND: 'on', OWNER_REPLY_DOMAIN: 'reply.example.test' };

function threat(host, over) {
	return Object.assign(
		{
			id: 't-' + host,
			kind: 'hacked-spam',
			level: 'critical',
			host,
			role: 'site_hit',
			last_seen: new Date(NOW - DAY).toISOString(),
			observed_at: new Date(NOW - DAY).toISOString(),
			evidence: 'Hidden casino links in footer',
			confidence: 'observed',
			delist_status: 'none',
			company_country: 'US',
		},
		over || {}
	);
}

const found = (host) => [
	{ email: 'security@' + host, source: 'security.txt', url: 'https://' + host + '/.well-known/security.txt' },
];
const ctx = (host, over) =>
	Object.assign({ now: NOW, found: found(host), stopped: new Set(), lastNoticeAt: null, lang: 'en' }, over || {});

function approved(host, at) {
	const row = send.queueRow(threat(host), ctx(host));
	return Object.assign(row, {
		status: 'approved',
		approvedBy: send.OWNER,
		approvedAt: new Date(at || NOW - 3600e3).toISOString(),
	});
}

// Fakes: every send, record and link lands in memory; nothing leaves the process.
function fakes(rows, over) {
	const mails = [];
	const records = [];
	const byHost = new Map(rows.map((row) => [row.domain, threat(row.host)]));
	const deps = Object.assign(
		{
			env: ON,
			confirm: send.CONFIRM,
			now: NOW,
			rows,
			from: 'sender@example.test',
			threatFor: async (row) => byHost.get(row.domain) || null,
			contextFor: async (row) => ctx(row.host),
			mintLink: async (row) => ({
				stop: 'https://x.test/owner?t=abc&do=stop',
				replyTo: 'reply+abc@reply.example.test',
			}),
			send: async (msg) => mails.push(msg),
			record: async (row, patch) => records.push([row.domain, patch]),
		},
		over || {}
	);
	return { deps, mails, records };
}

test('flag: only the exact value "on" turns the send on', () => {
	assert.equal(send.enabled({ HEADS_UP_SEND: 'on' }), true);
	['', 'ON', 'true', '1', 'yes', undefined].forEach((v) => assert.equal(send.enabled({ HEADS_UP_SEND: v }), false));
	assert.equal(send.enabled({}), false);
	assert.equal(send.enabled(undefined), false);
});

test('queueRow: carries the full draft, the face sender postal address and the domain key', () => {
	const other = send.queueRow(
		threat('northwind-shop.io'),
		ctx('northwind-shop.io', { found: found('vendor.example') })
	);
	assert.equal(other, null, 'a contact on another domain than the host is held');
	const ok = send.queueRow(threat('northwind-shop.io'), ctx('northwind-shop.io', { lang: 'es' }));
	assert.equal(ok.status, 'pending');
	assert.equal(ok.domain, 'northwind-shop.io');
	assert.equal(ok.to, 'security@northwind-shop.io');
	assert.equal(ok.lang, 'es');
	assert.ok(ok.text.includes(POSTAL), 'postal address from the legal page');
	assert.ok(ok.text.includes('QA-lab URL Review · Carlos A. Muñoz'));
	assert.ok(ok.text.includes('STOP'));
});

test('queueRow: role mailboxes only, DE/AT out, opted-out and recent domains out', () => {
	const host = 'northwind-shop.io';
	assert.equal(
		send.queueRow(threat(host), ctx(host, { found: [{ email: 'info@' + host, source: 'security.txt' }] })),
		null
	);
	assert.equal(send.queueRow(threat('shop-example.de'), ctx('shop-example.de')), null);
	assert.equal(send.queueRow(threat(host, { company_country: 'AT' }), ctx(host)), null);
	assert.equal(send.queueRow(threat(host), ctx(host, { stopped: new Set(['@' + host]) })), null);
	assert.equal(send.queueRow(threat(host), ctx(host, { lastNoticeAt: new Date(NOW - 10 * DAY).toISOString() })), null);
});

test('candidates: one per domain, and skipped domains stay out', () => {
	const a = threat('northwind-shop.io', { last_seen: new Date(NOW - 2 * DAY).toISOString() });
	const b = threat('northwind-shop.io', { id: 'second', last_seen: new Date(NOW - DAY).toISOString() });
	const c = threat('contoso-web.io');
	const list = send.candidates([a, b, c], (t) => ctx(t.host), ['contoso-web.io']);
	assert.equal(list.length, 1);
	assert.equal(list[0].threatId, 'second');
});

test('approval: only the owner approves, and only a pending draft', () => {
	const row = send.queueRow(threat('northwind-shop.io'), ctx('northwind-shop.io'));
	assert.deepEqual(send.approval(row, 'someone@else.test', NOW), { ok: false, why: 'not-approved' });
	const ok = send.approval(row, 'Kaanmuar@gmail.com', NOW);
	assert.equal(ok.ok, true);
	assert.equal(ok.patch.status, 'approved');
	assert.equal(send.approval(Object.assign({}, row, { status: 'sent' }), send.OWNER, NOW).why, 'not-pending');
});

test('block: refuses by default and names the reason', () => {
	const row = approved('northwind-shop.io');
	const base = {
		env: ON,
		row,
		rows: [row],
		confirm: send.CONFIRM,
		now: NOW,
		threat: threat('northwind-shop.io'),
		found: found('northwind-shop.io'),
		stopped: new Set(),
		lastNoticeAt: null,
	};
	assert.equal(send.block(base), '');
	assert.equal(send.block(Object.assign({}, base, { env: {} })), 'env-off');
	assert.equal(send.block(Object.assign({}, base, { env: { HEADS_UP_SEND: 'true' } })), 'env-off');
	assert.equal(send.block(Object.assign({}, base, { confirm: '' })), 'no-confirm');
	assert.equal(send.block(Object.assign({}, base, { env: { HEADS_UP_SEND: 'on' } })), 'no-reply-address');
	const pending = Object.assign({}, row, { status: 'pending' });
	assert.equal(send.block(Object.assign({}, base, { row: pending })), 'not-approved');
	assert.equal(
		send.block(Object.assign({}, base, { row: Object.assign({}, row, { approvedBy: 'x@y.test' }) })),
		'not-approved'
	);
	assert.equal(send.block(Object.assign({}, base, { stopped: new Set(['@northwind-shop.io']) })), 'gate-held');
	assert.equal(send.block(Object.assign({}, base, { found: [] })), 'gate-held');
	assert.equal(send.block(Object.assign({}, base, { threat: null })), 'gate-held');
	assert.equal(
		send.block(Object.assign({}, base, { threat: threat('northwind-shop.io', { delist_status: 'false_positive' }) })),
		'gate-held'
	);
});

test('sendApproved: sends nothing while the flag is off or unset', async () => {
	const rows = [approved('northwind-shop.io')];
	for (const env of [{}, { OWNER_REPLY_DOMAIN: 'r.test' }, { HEADS_UP_SEND: 'true', OWNER_REPLY_DOMAIN: 'r.test' }]) {
		const f = fakes(rows, { env });
		const tally = await send.sendApproved(f.deps);
		assert.equal(tally.sent, 0);
		assert.equal(f.mails.length, 0);
		assert.equal(f.records.length, 0);
		assert.equal(tally.held[0].why, 'env-off');
	}
});

test('sendApproved: never sends a draft nobody approved', async () => {
	const row = send.queueRow(threat('northwind-shop.io'), ctx('northwind-shop.io'));
	const f = fakes([row]);
	const tally = await send.sendApproved(f.deps);
	assert.equal(tally.sent, 0);
	assert.equal(f.mails.length, 0);
});

test('sendApproved: one approved draft goes out with face sender, unsubscribe headers and a reply address', async () => {
	const row = approved('northwind-shop.io');
	const f = fakes([row]);
	const tally = await send.sendApproved(f.deps);
	assert.equal(tally.sent, 1);
	const msg = f.mails[0];
	assert.equal(msg.to, 'security@northwind-shop.io');
	assert.equal(msg.from.email, 'qalaburlreview@carlosandmunoz.com');
	assert.equal(msg.replyTo, 'reply+abc@reply.example.test');
	assert.equal(msg.headers['List-Unsubscribe'], '<https://x.test/owner?t=abc&do=stop>');
	assert.equal(msg.headers['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click');
	assert.equal(msg.html, undefined, 'plain text only');
	assert.equal(msg.trackingSettings.openTracking.enable, false);
	assert.equal(f.records[0][1].status, 'sent');
});

test('sendApproved: Spanish copy goes out as the ES/PT face', async () => {
	const base = send.queueRow(threat('northwind-shop.io'), ctx('northwind-shop.io', { lang: 'es' }));
	const row = Object.assign(base, {
		status: 'approved',
		approvedBy: send.OWNER,
		approvedAt: new Date(NOW - 1000).toISOString(),
	});
	const f = fakes([row]);
	await send.sendApproved(f.deps);
	assert.equal(f.mails[0].from.email, 'qaurlreview@carlosandmunoz.com');
});

test('sendApproved: weekly cap of 10 holds the rest, and a prior week of sends counts', async () => {
	const hosts = Array.from({ length: 14 }, (_, i) => 'site' + i + '-example.io');
	const rows = hosts.map((h, i) => approved(h, NOW - (100 - i) * 60e3));
	const f = fakes(rows);
	const tally = await send.sendApproved(f.deps);
	assert.equal(tally.sent, 10);
	assert.equal(f.mails.length, 10);
	assert.equal(tally.held[0].why, 'week-cap');
	// Three already sent two days ago leave room for seven.
	const earlier = hosts
		.slice(0, 3)
		.map((h) => Object.assign(approved(h), { status: 'sent', sentAt: new Date(NOW - 2 * DAY).toISOString() }));
	const later = hosts.slice(3, 14).map((h, i) => approved(h, NOW - (100 - i) * 60e3));
	const g = fakes(earlier.concat(later));
	const next = await send.sendApproved(g.deps);
	assert.equal(next.sent, 7);
	// Sends older than a week free the cap.
	const old = hosts
		.slice(0, 10)
		.map((h) => Object.assign(approved(h), { status: 'sent', sentAt: new Date(NOW - 8 * DAY).toISOString() }));
	assert.equal(send.sentThisWeek(old, NOW), 0);
	assert.equal(send.sentThisWeek(earlier, NOW), 3);
});

test('sendApproved: one send per domain, even with two approved drafts or a sent one', async () => {
	const a = approved('northwind-shop.io');
	const b = Object.assign(approved('northwind-shop.io'), { host: 'www.northwind-shop.io' });
	const f = fakes([a]);
	await send.sendApproved(f.deps);
	assert.equal(f.mails.length, 1);
	const sent = Object.assign(approved('northwind-shop.io'), {
		status: 'sent',
		sentAt: new Date(NOW - 3600e3).toISOString(),
	});
	const g = fakes([sent, Object.assign({}, b, { domain: 'northwind-shop.io', status: 'approved' })]);
	const tally = await send.sendApproved(g.deps);
	assert.equal(tally.sent, 0);
	assert.equal(g.mails.length, 0);
});

test('sendApproved: a STOP that arrived after approval wins over the approval', async () => {
	const row = approved('northwind-shop.io');
	const f = fakes([row], {
		contextFor: async () => ctx(row.host, { stopped: new Set(['security@northwind-shop.io']) }),
	});
	const tally = await send.sendApproved(f.deps);
	assert.equal(tally.sent, 0);
	assert.equal(tally.held[0].why, 'gate-held');
	assert.equal(f.mails.length, 0);
});

test('sendApproved: unknown history holds instead of sending', async () => {
	const row = approved('northwind-shop.io');
	const f = fakes([row], { contextFor: async () => ({}) });
	assert.equal((await send.sendApproved(f.deps)).sent, 0);
});

test('sendApproved: a failed send is recorded and is not counted as sent', async () => {
	const row = approved('northwind-shop.io');
	const f = fakes([row], {
		send: async () => {
			throw new Error('sendgrid down');
		},
	});
	const tally = await send.sendApproved(f.deps);
	assert.equal(tally.sent, 0);
	assert.equal(f.records[0][1].lastError, 'sendgrid down');
	assert.equal(tally.held[0].why, 'send-failed');
});

test('linkRow: the stop link and reply token belong to the domain and its threat', () => {
	const link = send.linkRow(approved('northwind-shop.io'), NOW);
	assert.equal(link.kind, 'heads-up');
	assert.equal(link.domain, 'northwind-shop.io');
	assert.equal(link.email, 'security@northwind-shop.io');
	assert.equal(link.threatId, 't-northwind-shop.io');
});

test('replyKind: STOP and FALSE POSITIVE in every copy language, first line only', () => {
	assert.equal(send.replyKind('STOP'), 'stop');
	assert.equal(send.replyKind('Stop.\n\nOn Mon, X wrote:\n> ...'), 'stop');
	assert.equal(send.replyKind('stop please'), 'stop');
	assert.equal(send.replyKind('FALSE POSITIVE'), 'false-positive');
	assert.equal(send.replyKind('false positive, we checked'), 'false-positive');
	assert.equal(send.replyKind('FALSO POSITIVO'), 'false-positive');
	assert.equal(send.replyKind('Falso positivo.'), 'false-positive');
	assert.equal(send.replyKind('FEHLALARM'), 'false-positive');
	assert.equal(send.replyKind('FAUX POSITIF'), 'false-positive');
	assert.equal(send.replyKind('> quoted\nSTOP'), 'stop');
	assert.equal(send.replyKind('Thanks, we will not stop checking'), '');
	assert.equal(send.replyKind('We are looking into it'), '');
	assert.equal(send.replyKind(''), '');
});

test('every copy language names the same two reply words the reader understands', () => {
	const words = {
		en: 'FALSE POSITIVE',
		es: 'FALSO POSITIVO',
		pt: 'FALSO POSITIVO',
		de: 'FEHLALARM',
		fr: 'FAUX POSITIF',
		it: 'FALSO POSITIVO',
	};
	heads.LANGS.forEach((lang) => {
		const copy = heads.COPY[lang];
		assert.ok(copy.once.includes(words[lang]), lang + ' false-positive word');
		assert.ok(copy.final.includes('STOP'), lang + ' STOP word');
		assert.equal(send.replyKind(words[lang]), 'false-positive');
		assert.equal(send.replyKind('STOP'), 'stop');
	});
});

test('owner replies: the heads-up kinds stop the domain and file the operator note', () => {
	const reply = { kind: 'false-positive', mentioned: [] };
	const decision = replies.plan(reply, null);
	assert.deepEqual(decision.apply, ['stop-domain', 'false-positive']);
	assert.equal(decision.status, 'applied');
	assert.ok(replies.KIND_LABELS['false-positive']);
	assert.equal(replies.outreachCategory('false-positive'), 'opt_out');
	assert.deepEqual(replies.plan({ kind: 'stop', mentioned: [] }, null).apply, ['stop-domain']);
	assert.deepEqual(send.FALSE_POSITIVE_PATCH, { delist_status: 'false_positive' });
});

test('the opt-out a STOP writes is the one the gate reads', () => {
	// takeOwnerReply writes the replier address and "@domain" into url_review_owner_stops; the gate reads the same keys.
	const host = 'northwind-shop.io';
	assert.ok(send.queueRow(threat(host), ctx(host)));
	assert.equal(send.queueRow(threat(host), ctx(host, { stopped: new Set(['@' + host]) })), null);
	assert.equal(send.queueRow(threat(host), ctx(host, { stopped: new Set(['security@' + host]) })), null);
});

test('the flag is documented in functions/.env.example and empty there', () => {
	const text = require('node:fs').readFileSync(
		require('node:path').join(__dirname, '../../functions/.env.example'),
		'utf8'
	);
	assert.match(text, /^HEADS_UP_SEND=$/m);
});
