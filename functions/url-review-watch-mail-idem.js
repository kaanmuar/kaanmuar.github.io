'use strict';

/**
 * Idempotent continuous-watch report mail (#4396 / #4360; hardens #4390).
 * Pure gate + lock helpers; Firestore via webhook-idempotency runOnce. No SendGrid here.
 */

const crypto = require('node:crypto');
const webhookIdem = require('./webhook-idempotency');

const COLLECTION = 'url_review_watch_mails';
const KEEP_DAYS = 90;
const ENV_SEND = 'CONTINUOUS_WATCH_MAIL_SEND';
const ENV_ALLOWLIST = 'CONTINUOUS_WATCH_MAIL_ALLOWLIST';

const emailOf = (value) => {
	const e = String(value || '')
		.trim()
		.toLowerCase();
	return /^[^\s@/]+@[^\s@/][^\s@/.]*\.[^\s@/]+$/.test(e) && e.length <= 200 ? e : '';
};

function sha(text) {
	return crypto
		.createHash('sha256')
		.update(String(text))
		.digest('hex')
		.slice(0, 32);
}

function tag(value, max) {
	return String(value || '')
		.replace(/[^A-Za-z0-9_.:@-]/g, '')
		.slice(0, max || 80);
}

/** Stable subscription key: explicit watchSubId, or email__host, else watchOf / report id. */
function watchIdOf(record) {
	if (!record) return '';
	const sub = tag(record.watchSubId || record.watchSub, 120);
	if (sub) return sub;
	const email = emailOf(record.email);
	const host = tag((record.report && record.report.host) || record.host, 120).toLowerCase();
	if (email && host) return email + '__' + host;
	return tag(record.watchOf || record.id, 120);
}

/** One mail per watch run window: explicit watchWindow, else the completing report id. */
function windowKeyOf(record) {
	if (!record) return '';
	const w = tag(record.watchWindow, 120);
	if (w) return w;
	return tag(record.id, 120);
}

/** Firestore send-log doc key for a watch subscription + window. */
function sendKey(watchId, windowKey) {
	const w = tag(watchId, 120);
	const k = tag(windowKey, 120);
	if (!w || !k) return null;
	return {
		provider: 'watchmail',
		mode: 'live',
		source: 'window',
		eventId: w,
		type: k,
		docId: 'watchmail-' + sha(w + ':' + k),
	};
}

function allowlistOf(env) {
	return String((env && env[ENV_ALLOWLIST]) || '')
		.split(/[,;\s]+/)
		.map(emailOf)
		.filter(Boolean);
}

/**
 * Gate customer watch mail cron / manual sends. Off unless CONTINUOUS_WATCH_MAIL_SEND=on.
 * When CONTINUOUS_WATCH_MAIL_ALLOWLIST is set, only listed addresses may receive mail.
 */
function cronGate(input) {
	const o = input || {};
	const env = o.env || {};
	const email = emailOf(o.email);
	if (!email) return { ok: false, why: 'no-email' };
	if (!env[ENV_SEND] || env[ENV_SEND] !== 'on') return { ok: false, why: 'dry-run' };
	const list = allowlistOf(env);
	if (list.length && list.indexOf(email) === -1) return { ok: false, why: 'not-allowlisted' };
	return { ok: true };
}

/** RFC 2369 / one-click opt-out headers for watch report mail. */
function listUnsubscribeHeaders(stopUrl) {
	const url = String(stopUrl || '').trim();
	if (!url) return {};
	return {
		'List-Unsubscribe': '<' + url + '>',
		'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
	};
}

function mergeMailHeaders(mail, stopUrl) {
	const m = mail || {};
	const extra = listUnsubscribeHeaders(stopUrl);
	if (!Object.keys(extra).length) return m;
	return Object.assign({}, m, { headers: Object.assign({}, m.headers || {}, extra) });
}

/** Continuous-watch re-run: a report row linked to the prior snapshot (#4390). */
function isWatchRerun(record) {
	return !!String(record && record.watchOf || '').trim();
}

/** True when the customer already has (or just got) the idempotent watch report mail. */
function mailedFromIdem(result) {
	const r = result || {};
	if (!r.ok) return false;
	if (r.sent) return true;
	return r.state === 'duplicate';
}

function storeOf(input) {
	if (input.store) return input.store;
	if (!input.db) return webhookIdem.memoryStore();
	return webhookIdem.firestoreStore(input.db, COLLECTION);
}

/**
 * Claim send-log once per watchId+windowKey, then run send({ headers }).
 * send must resolve true when the message went out; false throws so the lock can retry.
 */
async function sendOnce(input) {
	const o = input || {};
	const record = o.record || {};
	const email = emailOf(o.email || record.email);
	const watchId = tag(o.watchId || watchIdOf(record), 120);
	const windowKey = tag(o.windowKey || windowKeyOf(record), 120);
	const gate = cronGate({ env: o.env, email });
	if (!gate.ok) return { ok: false, sent: false, why: gate.why, watchId, windowKey };
	const key = sendKey(watchId, windowKey);
	if (!key) return { ok: false, sent: false, why: 'bad-key', watchId, windowKey };
	const headers = listUnsubscribeHeaders(o.stopUrl);
	const store = storeOf(o);
	const result = await webhookIdem.runOnce(
		store,
		key,
		async () => {
			if (typeof o.send !== 'function') throw new Error('no send');
			const sent = await o.send({ headers, mergeMailHeaders: (mail) => mergeMailHeaders(mail, o.stopUrl) });
			if (sent !== true) throw new Error('mail not sent');
			return true;
		},
		o.opts
	);
	if (result.state === 'duplicate' || result.state === 'busy') {
		return { ok: true, sent: false, state: result.state, watchId, windowKey, docId: key.docId };
	}
	return { ok: true, sent: true, state: result.state, watchId, windowKey, docId: key.docId };
}

module.exports = {
	COLLECTION,
	KEEP_DAYS,
	ENV_SEND,
	ENV_ALLOWLIST,
	emailOf,
	watchIdOf,
	windowKeyOf,
	sendKey,
	allowlistOf,
	cronGate,
	listUnsubscribeHeaders,
	mergeMailHeaders,
	isWatchRerun,
	mailedFromIdem,
	sendOnce,
	memoryStore: webhookIdem.memoryStore,
	firestoreStore: (db) => webhookIdem.firestoreStore(db, COLLECTION),
};