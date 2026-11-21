'use strict';

/* Security heads-up send path (#3997, parent #3992). The pure gate in url-review-heads-up.js decides whether a threat
   may get a heads-up and writes the copy; this module is what stands between a draft and a mailbox.

   Nothing goes out unless ALL of these hold (each refusal names its reason):
     - HEADS_UP_SEND=on in functions/.env (off by default; unset in production until Carlos has had the copy reviewed
       by native speakers, #3996). No other value counts.
     - A person approved that exact draft (status "approved", approvedBy the owner). Approval is per draft and has no
       automatic mode: the launch campaign's rule (scripts/launch-campaign.js --approve) applied to every heads-up.
     - The pure gate passes again at send time (security role mailbox, not DE/AT, not opted out, 182-day quiet period).
     - At most WEEK_CAP sends in any rolling 7 days, and one send per domain, ever (the queue row id is the domain).
     - A reply address exists (OWNER_REPLY_DOMAIN), so a STOP or FALSE POSITIVE reply always reaches ownerReplies.

   Sender: the brand face owner notices already go out as (functions/mail-face.js), with the postal address those mails
   and the legal page carry. Opt-out: the List-Unsubscribe / List-Unsubscribe-Post headers point at the owner-notice
   stop link (url_review_owner_links ... do=stop), which writes url_review_owner_stops for the address and its domain;
   replying STOP does the same. Both feed the pure gate's `stopped` set, so an opted-out address is never mailed again.

   Pure and dependency-injected: Firestore and SendGrid live in scripts/heads-up-send.js, and tests use fakes. */

const heads = require('./url-review-heads-up');
const mailFace = require('./mail-face');
const ownerNotice = require('./url-review-owner-notice');
const { POSTAL } = require('./url-review-customer-mail');

const FLAG = 'HEADS_UP_SEND';
const OWNER = 'kaanmuar@gmail.com';
const WEEK_CAP = 10;
const WEEK_MS = 7 * 864e5;
const COLLECTION = 'url_review_heads_up';
const CONFIRM = 'heads-up-send';
const FALLBACK_REPLY_TO = 'qa@carlosandmunoz.com';
const PAUSE_MS = 3000;
const BRAND = 'QA-lab URL Review · Carlos A. Muñoz';
const KEEP_MS = 400 * 864e5;

const REASONS = {
	'env-off': 'HEADS_UP_SEND is not "on".',
	'not-approved': 'A person has not approved this draft.',
	'not-pending': 'This draft is not waiting to be sent.',
	'week-cap': 'The cap of ' + WEEK_CAP + ' heads-ups in 7 days is reached.',
	'domain-sent': 'This domain already got its heads-up.',
	'no-reply-address': 'OWNER_REPLY_DOMAIN is not set, so STOP replies would not reach us.',
	'no-confirm': 'Run with --confirm ' + CONFIRM + '.',
	'gate-held': 'The heads-up gate no longer passes.',
};

const lower = (value) =>
	String(value || '')
		.trim()
		.toLowerCase();
const msOf = (value) =>
	value && typeof value.toDate === 'function' ? value.toDate().getTime() : Date.parse(value || '') || 0;

/** True only for the exact value "on". "true", "1" and "ON" do not turn mail on. */
function enabled(env) {
	return !!env && env[FLAG] === 'on';
}

/** The sender block the pure draft needs: the brand, the postal address from the legal page, the language's own page. */
function senderFor(lang) {
	const face = mailFace.faceOf(lang) || mailFace.faceOf(mailFace.DEFAULT);
	return { name: BRAND, postalAddress: POSTAL, website: face.page };
}

/* A queue row for one passing threat, or null when the pure gate holds it. The row keeps the whole draft so the
   person approving reads exactly what would go out. ctx as heads.evaluate, plus lang. One row per registrable domain. */
function queueRow(threat, ctx) {
	const opts = ctx || {};
	const result = heads.evaluate(threat, opts);
	if (result.decision !== 'draft') return null;
	const lang = heads.LANGS.indexOf(opts.lang) === -1 ? 'en' : opts.lang;
	const mail = heads.draft(threat, Object.assign({}, opts, { lang, sender: senderFor(lang) }));
	const host = String(threat.host).toLowerCase().replace(/\.$/, '');
	return {
		domain: ownerNotice.domainOf(host),
		host,
		threatId: String(threat.id || ''),
		kind: threat.kind,
		to: mail.to,
		lang: mail.lang,
		subject: mail.subject,
		text: mail.text,
		status: 'pending',
		createdAt: new Date(opts.now || Date.now()).toISOString(),
	};
}

/** The threats that make a queue row, one per domain, newest sighting first. ctxFor(threat) gives each one's context. */
function candidates(threats, ctxFor, skip) {
	const taken = new Set(skip || []);
	const out = [];
	(threats || [])
		.slice()
		.sort((a, b) => msOf(b.last_seen || b.observed_at) - msOf(a.last_seen || a.observed_at))
		.forEach((threat) => {
			const row = queueRow(threat, ctxFor(threat));
			if (!row || taken.has(row.domain)) return;
			taken.add(row.domain);
			out.push(row);
		});
	return out;
}

/** Records one person's approval of one draft. Only the owner can approve; an approved or sent draft is left alone. */
function approval(row, by, now) {
	if (!row || row.status !== 'pending') return { ok: false, why: 'not-pending' };
	if (lower(by) !== OWNER) return { ok: false, why: 'not-approved' };
	return {
		ok: true,
		patch: { status: 'approved', approvedBy: lower(by), approvedAt: new Date(now || Date.now()).toISOString() },
	};
}

/** Sends in the rolling week before `now`: rows that carry a sentAt. */
function sentThisWeek(rows, now) {
	const at = now == null ? Date.now() : now;
	return (rows || []).filter(
		(row) => row && row.status === 'sent' && at - msOf(row.sentAt) < WEEK_MS && msOf(row.sentAt) <= at + 6e4
	).length;
}

/* Why this row may not be sent now, or "". input: { env, row, rows (every queue row), confirm, now, stopped, found,
   threat }. The pure gate re-runs with the live opt-out set, so a STOP that arrived after approval still wins. */
function block(input) {
	const o = input || {};
	const row = o.row || {};
	const now = o.now == null ? Date.now() : o.now;
	if (!enabled(o.env)) return 'env-off';
	if (o.confirm !== CONFIRM) return 'no-confirm';
	if (!(o.env && o.env.OWNER_REPLY_DOMAIN)) return 'no-reply-address';
	if (row.status === 'sent') return 'domain-sent';
	if (row.status !== 'approved') return row.status === 'pending' ? 'not-approved' : 'not-pending';
	if (lower(row.approvedBy) !== OWNER || !msOf(row.approvedAt) || msOf(row.approvedAt) > now) return 'not-approved';
	if ((o.rows || []).some((other) => other && other.domain === row.domain && other.status === 'sent'))
		return 'domain-sent';
	if (sentThisWeek(o.rows, now) >= WEEK_CAP) return 'week-cap';
	if (!o.threat) return 'gate-held';
	const result = heads.evaluate(o.threat, { now, found: o.found, stopped: o.stopped, lastNoticeAt: o.lastNoticeAt });
	if (result.decision !== 'draft' || result.contact !== row.to) return 'gate-held';
	return '';
}

/** The SendGrid message: plain text, face sender, a reply address that reaches ownerReplies, one-click unsubscribe. */
function message(row, links, from, replyTo) {
	const sender = mailFace.envelope(row.lang, from, replyTo || undefined, FALLBACK_REPLY_TO);
	return {
		to: row.to,
		from: sender.from,
		replyTo: sender.replyTo,
		subject: row.subject,
		text: row.text,
		categories: ['url-review-heads-up'],
		trackingSettings: { clickTracking: { enable: false, enableText: false }, openTracking: { enable: false } },
		headers: { 'List-Unsubscribe': '<' + links.stop + '>', 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
	};
}

/** The url_review_owner_links row behind the stop link and the reply address of one heads-up. */
function linkRow(row, now) {
	const at = now == null ? Date.now() : now;
	return {
		kind: 'heads-up',
		domain: row.domain,
		host: row.host,
		email: row.to,
		lang: row.lang,
		threatId: row.threatId,
		createdAt: new Date(at).toISOString(),
		expireAt: new Date(at + KEEP_MS),
	};
}

// The first words of a reply, lower case without accents or punctuation, to read the one word the copy asked for.
function opening(words) {
	const first =
		String(words || '')
			.replace(/\r/g, '')
			.split('\n')
			.map((line) => line.trim())
			.find((line) => line && !/^>/.test(line)) || '';
	return first
		.toLowerCase()
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/[^a-z\s]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, 60);
}

const STOP_WORD = /^(stop|parar|detener|arret|arreter|basta|fermare|stopp)\b/;
const FALSE_WORD = /^(false positive|falso positivo|fehlalarm|faux positif)\b/;

/* What a reply to a heads-up asks for: "stop" (opt out of every message), "false-positive" (the finding is wrong) or
   "". Only the first line counts, so a sentence that merely contains the word does not opt anyone out. */
function replyKind(words) {
	const head = opening(words);
	if (STOP_WORD.test(head)) return 'stop';
	if (FALSE_WORD.test(head)) return 'false-positive';
	return '';
}

// What a FALSE POSITIVE reply writes on the threat: the pure gate holds a record marked this way, so it is never drafted again.
const FALSE_POSITIVE_PATCH = { delist_status: 'false_positive' };

/* Sends every approved row the gate allows, oldest approval first, and no more than the week's cap leaves.
   deps: { env, now, confirm, rows, threatFor(row), contextFor(row) => { found, stopped, lastNoticeAt }, mintLink(row) =>
   { stop, replyTo }, send(message), record(row, patch), from, pause() }. Returns { sent, held: [{ domain, why }] }. */
async function sendApproved(deps) {
	const d = deps || {};
	const rows = (d.rows || []).map((row) => Object.assign({}, row));
	const queue = rows.filter((row) => row.status === 'approved').sort((a, b) => msOf(a.approvedAt) - msOf(b.approvedAt));
	const tally = { sent: 0, held: [] };
	for (const row of queue) {
		const now = d.now == null ? Date.now() : d.now;
		const threat = await d.threatFor(row);
		const ctx = (await d.contextFor(row)) || {};
		const why = block({
			env: d.env,
			row,
			rows,
			confirm: d.confirm,
			now,
			threat,
			found: ctx.found,
			stopped: ctx.stopped,
			lastNoticeAt: ctx.lastNoticeAt,
		});
		if (why) {
			tally.held.push({ domain: row.domain, why });
			if (why === 'env-off' || why === 'no-confirm' || why === 'no-reply-address' || why === 'week-cap') break;
			continue;
		}
		const links = await d.mintLink(row);
		try {
			await d.send(message(row, links, d.from, links.replyTo));
			const patch = { status: 'sent', sentAt: new Date(now).toISOString() };
			await d.record(row, patch);
			Object.assign(row, patch);
			tally.sent += 1;
		} catch (error) {
			const patch = { lastError: String((error && error.message) || error).slice(0, 200) };
			await d.record(row, patch);
			tally.held.push({ domain: row.domain, why: 'send-failed' });
		}
		if (d.pause) await d.pause();
	}
	return tally;
}

module.exports = {
	FLAG,
	OWNER,
	WEEK_CAP,
	WEEK_MS,
	COLLECTION,
	CONFIRM,
	PAUSE_MS,
	BRAND,
	REASONS,
	enabled,
	senderFor,
	queueRow,
	candidates,
	approval,
	sentThisWeek,
	block,
	message,
	linkRow,
	opening,
	replyKind,
	FALSE_POSITIVE_PATCH,
	sendApproved,
};
