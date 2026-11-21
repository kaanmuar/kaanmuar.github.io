'use strict';

/* Owner-verified DMARC aggregate and TLS-RPT data (#3777). Slice 1: the parsers and the verdict, no mailbox and no DNS.

   A domain owner who proved the domain (functions/url-review-owner-proof.js) and consented (functions/url-review-dmarc-consent.js)
   points rua= (DMARC, RFC 7489, XML) and the TLS-RPT rua (RFC 8460, JSON) at a mailbox we control. Each report is reduced
   here the moment it is read, to counts and nothing else:

   KEPT     per source IP per UTC day: message counts (aligned pass, aligned fail); per day: disposition totals
            (none, quarantine, reject), pass and fail totals, failure-type counts (spf-fail, dkim-fail; TLS-RPT result types)
   DROPPED  everything message-level or identifying: subject, envelope and header-from addresses, recipients, message IDs,
            DKIM selectors, auth_results domains, the reporter's contact address and report ID, receiving hostnames, free text.

   parse*() returns only that reduced shape, so a caller cannot store more than counts by mistake. No dependency: DMARC XML is read with
   indexOf (no XML library, no entity expansion, nothing nested under a quantifier), TLS-RPT with JSON.parse. */

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_SOURCES = 2000;
const MAX_POLICIES = 50;
const MAX_FAILURES = 500;
const MAX_COUNT = 1e9;

// Verdict thresholds (documented, tested; change them here and in the notice copy together):
//   - a window needs at least MIN_MESSAGES messages over at least MIN_DAYS days before any verdict, or the answer is "not-enough-data";
//   - a source is significant when it sent at least max(MIN_SOURCE, 1% of all messages);
//   - a significant source fails when fewer than SOURCE_PASS of its messages pass DMARC (aligned SPF or aligned DKIM);
//   - "safe" needs an overall pass rate of at least OVERALL_PASS and no failing significant source.
// p=reject drops every message that fails, so 98% overall means 1 in 50 real messages would be lost: that is the line, and it is stricter
// than "most mail passes". A failing source may be a legitimate sender not yet aligned or an abuser; the owner has to tell which.
const THRESHOLDS = {
	MIN_MESSAGES: 200,
	MIN_DAYS: 7,
	MIN_SOURCE: 10,
	SOURCE_SHARE: 0.01,
	SOURCE_PASS: 0.95,
	OVERALL_PASS: 0.98,
	TLS_MIN_SESSIONS: 100,
	TLS_OK: 0.99,
};

const count = (value) => {
	const text = String(value == null ? '' : value).trim();
	if (!/^\d{1,10}$/.test(text)) return 0;
	return Math.min(Number(text), MAX_COUNT);
};

function dayOf(value) {
	const text = String(value == null ? '' : value).trim();
	let ms = NaN;
	if (/^\d{9,11}$/.test(text)) ms = Number(text) * 1000;
	else if (/^\d{4}-\d{2}-\d{2}/.test(text)) ms = Date.parse(text);
	return Number.isFinite(ms) && ms > 0 ? new Date(ms).toISOString().slice(0, 10) : '';
}

function ipOf(value) {
	const text = String(value == null ? '' : value)
		.trim()
		.toLowerCase();
	if (/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.test(text) && text.split('.').every((part) => Number(part) < 256))
		return text;
	if (text.length <= 45 && text.split(':').length > 2 && /^[0-9a-f:.]+$/.test(text)) return text;
	return '';
}

function hostOf(value) {
	const host = String(value == null ? '' : value)
		.trim()
		.toLowerCase()
		.replace(/\.$/, '');
	return /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(host) ? host : '';
}

function empty(kind) {
	return { kind, domain: '', policy: { p: '', pct: 100 }, days: {}, sources: {} };
}

function day(agg, key) {
	if (!agg.days[key])
		agg.days[key] = {
			messages: 0,
			pass: 0,
			fail: 0,
			disposition: { none: 0, quarantine: 0, reject: 0 },
			failureTypes: {},
		};
	return agg.days[key];
}

function source(agg, key, ip) {
	const id = key + '|' + ip;
	if (agg.sources[id]) return agg.sources[id];
	if (Object.keys(agg.sources).length >= MAX_SOURCES) return null;
	agg.sources[id] = { ip, day: key, messages: 0, pass: 0, fail: 0 };
	return agg.sources[id];
}

// --- DMARC aggregate XML -------------------------------------------------------------------------------------------------------------

// Every <tag ...>...</tag> body inside xml, found with indexOf. A tag name is matched exactly (<record>, not <records>).
function blocks(xml, tag, limit) {
	const out = [];
	const open = '<' + tag;
	const close = '</' + tag + '>';
	let at = 0;
	while (out.length < limit) {
		const start = xml.indexOf(open, at);
		if (start < 0) break;
		const after = xml.charAt(start + open.length);
		if (after !== '>' && after !== ' ' && after !== '\n' && after !== '\t' && after !== '\r' && after !== '/') {
			at = start + open.length;
			continue;
		}
		const bodyStart = xml.indexOf('>', start);
		if (bodyStart < 0) break;
		if (xml.charAt(bodyStart - 1) === '/') {
			out.push('');
			at = bodyStart + 1;
			continue;
		}
		const end = xml.indexOf(close, bodyStart);
		if (end < 0) break;
		out.push(xml.slice(bodyStart + 1, end));
		at = end + close.length;
	}
	return out;
}

const first = (xml, tag) => (blocks(xml, tag, 1)[0] || '').trim();

function dmarcResult(value) {
	return (
		String(value || '')
			.trim()
			.toLowerCase() === 'pass'
	);
}

function parseDmarcAggregate(input) {
	const xml = String(input == null ? '' : input);
	if (!xml || xml.length > MAX_BYTES) return null;
	if (/<!ENTITY|<!DOCTYPE/i.test(xml)) return null; // no entity tricks: a report has neither
	if (xml.indexOf('<feedback') < 0) return null;
	const agg = empty('dmarc');
	const range = first(xml, 'date_range');
	const begin = dayOf(first(range, 'begin'));
	if (!begin) return null;
	const published = first(xml, 'policy_published');
	agg.domain = hostOf(first(published, 'domain'));
	agg.policy.p = /^(none|quarantine|reject)$/.test(first(published, 'p').toLowerCase())
		? first(published, 'p').toLowerCase()
		: '';
	const pct = first(published, 'pct');
	agg.policy.pct = /^\d{1,3}$/.test(pct) && Number(pct) <= 100 ? Number(pct) : 100;
	let seen = 0;
	for (const record of blocks(xml, 'record', MAX_SOURCES * 4)) {
		const row = first(record, 'row');
		const evaluated = first(row, 'policy_evaluated');
		const n = count(first(row, 'count'));
		if (!n) continue;
		const dkim = dmarcResult(first(evaluated, 'dkim'));
		const spf = dmarcResult(first(evaluated, 'spf'));
		const pass = dkim || spf;
		const disposition = /^(none|quarantine|reject)$/.test(first(evaluated, 'disposition').toLowerCase())
			? first(evaluated, 'disposition').toLowerCase()
			: 'none';
		const bucket = day(agg, begin);
		bucket.messages += n;
		bucket[pass ? 'pass' : 'fail'] += n;
		bucket.disposition[disposition] += n;
		// Mechanism failures, counted apart: a message that passes through DKIM alone still shows its SPF failure here.
		if (!spf) bucket.failureTypes['spf-fail'] = (bucket.failureTypes['spf-fail'] || 0) + n;
		if (!dkim) bucket.failureTypes['dkim-fail'] = (bucket.failureTypes['dkim-fail'] || 0) + n;
		const ip = ipOf(first(row, 'source_ip'));
		const entry = ip ? source(agg, begin, ip) : null;
		if (entry) {
			entry.messages += n;
			entry[pass ? 'pass' : 'fail'] += n;
		}
		seen += 1;
	}
	return seen ? agg : null;
}

// --- TLS-RPT JSON --------------------------------------------------------------------------------------------------------------------

function parseTlsRpt(input) {
	const text = typeof input === 'string' ? input : '';
	let report = input && typeof input === 'object' ? input : null;
	if (text) {
		if (text.length > MAX_BYTES) return null;
		try {
			report = JSON.parse(text);
		} catch (error) {
			return null;
		}
	}
	if (!report || typeof report !== 'object' || !Array.isArray(report.policies)) return null;
	const begin = dayOf(report['date-range'] && report['date-range']['start-datetime']);
	if (!begin) return null;
	const agg = empty('tlsrpt');
	let seen = 0;
	for (const entry of report.policies.slice(0, MAX_POLICIES)) {
		if (!entry || typeof entry !== 'object') continue;
		const policy = entry.policy || {};
		const domain = hostOf(policy['policy-domain']);
		if (domain && !agg.domain) agg.domain = domain;
		const summary = entry.summary || {};
		const ok = count(summary['total-successful-session-count']);
		const bad = count(summary['total-failure-session-count']);
		if (!ok && !bad) continue;
		const bucket = day(agg, begin);
		bucket.messages += ok + bad; // sessions, not messages: TLS-RPT counts SMTP sessions
		bucket.pass += ok;
		bucket.fail += bad;
		for (const failure of (Array.isArray(entry['failure-details']) ? entry['failure-details'] : []).slice(
			0,
			MAX_FAILURES
		)) {
			if (!failure || typeof failure !== 'object') continue;
			const n = count(failure['failed-session-count']);
			if (!n) continue;
			const type = /^[a-z0-9-]{1,40}$/.test(String(failure['result-type'] || '')) ? failure['result-type'] : 'other';
			bucket.failureTypes[type] = (bucket.failureTypes[type] || 0) + n;
			const ip = ipOf(failure['sending-mta-ip']);
			const row = ip ? source(agg, begin, ip) : null;
			if (row) {
				row.messages += n;
				row.fail += n;
			}
		}
		seen += 1;
	}
	return seen ? agg : null;
}

// --- merging and the verdict -----------------------------------------------------------------------------------------------------------

// Fold reduced aggregates of one kind (the counts a store keeps) into one. Order does not matter.
function merge(list, kind) {
	const out = empty(kind);
	for (const agg of list || []) {
		if (!agg || agg.kind !== kind) continue;
		if (agg.domain && !out.domain) out.domain = agg.domain;
		if (agg.policy && agg.policy.p) out.policy = { p: agg.policy.p, pct: agg.policy.pct };
		for (const key of Object.keys(agg.days || {})) {
			const from = agg.days[key];
			const to = day(out, key);
			['messages', 'pass', 'fail'].forEach((name) => {
				to[name] += count(from[name]);
			});
			['none', 'quarantine', 'reject'].forEach((name) => {
				to.disposition[name] += count(from.disposition && from.disposition[name]);
			});
			Object.keys(from.failureTypes || {}).forEach((type) => {
				to.failureTypes[type] = (to.failureTypes[type] || 0) + count(from.failureTypes[type]);
			});
		}
		for (const id of Object.keys(agg.sources || {})) {
			const from = agg.sources[id];
			const to = source(out, from.day, from.ip);
			if (to) {
				to.messages += count(from.messages);
				to.pass += count(from.pass);
				to.fail += count(from.fail);
			}
		}
	}
	return out;
}

function totals(agg) {
	const out = {
		messages: 0,
		pass: 0,
		fail: 0,
		days: 0,
		disposition: { none: 0, quarantine: 0, reject: 0 },
		failureTypes: {},
	};
	for (const key of Object.keys((agg && agg.days) || {})) {
		const row = agg.days[key];
		if (!row.messages) continue;
		out.days += 1;
		out.messages += row.messages;
		out.pass += row.pass;
		out.fail += row.fail;
		Object.keys(row.disposition).forEach((name) => {
			out.disposition[name] += row.disposition[name];
		});
		Object.keys(row.failureTypes).forEach((type) => {
			out.failureTypes[type] = (out.failureTypes[type] || 0) + row.failureTypes[type];
		});
	}
	return out;
}

// Pass rate by source IP over the whole window (a source's days added up).
function bySource(agg) {
	const rows = {};
	for (const id of Object.keys((agg && agg.sources) || {})) {
		const row = agg.sources[id];
		const to = rows[row.ip] || (rows[row.ip] = { ip: row.ip, messages: 0, pass: 0, fail: 0, days: 0 });
		to.messages += row.messages;
		to.pass += row.pass;
		to.fail += row.fail;
		to.days += 1;
	}
	return Object.keys(rows)
		.map((ip) => Object.assign(rows[ip], { rate: rows[ip].messages ? rows[ip].pass / rows[ip].messages : 0 }))
		.sort((a, b) => b.fail - a.fail || b.messages - a.messages || (a.ip < b.ip ? -1 : 1));
}

// "Safe to tighten?" for a DMARC aggregate (already merged). verdict: "not-enough-data" | "safe" | "not-yet" | "at-reject" | "at-reject-check".
// Under p=reject (pct 100) the question turns round: "safe" no longer applies, so the clean case is "at-reject" and a window that would
// fail the "safe" test is "at-reject-check": those messages are being dropped now, and the owner has to tell whether the failing
// servers are their own senders (fix alignment) or spoofers (reject is doing its job). It never says "working" over a failing sender.
function tightenVerdict(agg) {
	const T = THRESHOLDS;
	const sum = totals(agg);
	const rate = sum.messages ? sum.pass / sum.messages : 0;
	const base = {
		messages: sum.messages,
		days: sum.days,
		passRate: rate,
		policy: (agg && agg.policy) || { p: '', pct: 100 },
		failing: [],
		thresholds: T,
	};
	if (sum.messages < T.MIN_MESSAGES || sum.days < T.MIN_DAYS)
		return Object.assign(base, { verdict: 'not-enough-data' });
	const floor = Math.max(T.MIN_SOURCE, Math.ceil(sum.messages * T.SOURCE_SHARE));
	const failing = bySource(agg)
		.filter((row) => row.messages >= floor && row.rate < T.SOURCE_PASS)
		.slice(0, 5)
		.map((row) => ({ ip: row.ip, messages: row.messages, fail: row.fail, passRate: row.rate }));
	const safe = rate >= T.OVERALL_PASS && !failing.length;
	const atReject = base.policy.p === 'reject' && base.policy.pct === 100;
	const verdict = atReject ? (safe ? 'at-reject' : 'at-reject-check') : safe ? 'safe' : 'not-yet';
	return Object.assign(base, { failing, verdict });
}

// TLS-RPT: is mail to this domain arriving over verified TLS? "ok" | "failing" | "not-enough-data".
function tlsVerdict(agg) {
	const T = THRESHOLDS;
	const sum = totals(agg);
	const failRate = sum.messages ? sum.fail / sum.messages : 0;
	const verdict = sum.messages < T.TLS_MIN_SESSIONS ? 'not-enough-data' : 1 - failRate >= T.TLS_OK ? 'ok' : 'failing';
	return { verdict, sessions: sum.messages, failed: sum.fail, failRate, failureTypes: sum.failureTypes };
}

module.exports = { THRESHOLDS, parseDmarcAggregate, parseTlsRpt, merge, totals, bySource, tightenVerdict, tlsVerdict };
