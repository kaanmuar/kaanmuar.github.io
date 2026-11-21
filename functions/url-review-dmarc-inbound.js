'use strict';

/* Reduce DMARC aggregate / TLS-RPT mail that arrives at mailInbound (#3777 slice 2).
   Only counts when an owner-verified domain has consent on. Keeps aggregate counts only; the raw report is discarded.
   Supports plain XML/JSON, gzip, and zip (local-file DEFLATE/store via zlib; 50 MiB uncompressed cap). No DNS and no outbound mail.
   Dependency-free so url-review-unit CI (no functions/node_modules) can load this module. */
const zlib = require('zlib');
const proof = require('./url-review-owner-proof');
const reports = require('./url-review-dmarc-reports');
const consent = require('./url-review-dmarc-consent');
const storeApi = require('./url-review-dmarc-store');

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_ZIP = 50 * 1024 * 1024;
const MAX_ZIP_FILES = 20;

const REPORT_SUBJECT =
	/\bdmarc\b|\btls[\s_-]?rpt\b|\btls report\b|\bsmtp tls reporting\b|\baggregate report\b|report domain:/i;

function clipName(name) {
	return String(name || '')
		.trim()
		.slice(0, 200)
		.toLowerCase();
}

function asBuffer(value) {
	if (Buffer.isBuffer(value)) return value;
	if (value instanceof Uint8Array) return Buffer.from(value);
	if (typeof value === 'string') {
		const text = value.trim();
		if (!text) return Buffer.alloc(0);
		// ImprovMX often sends base64; accept raw UTF-8 when it already looks like XML/JSON.
		if (text.charAt(0) === '<' || text.charAt(0) === '{') return Buffer.from(text, 'utf8');
		try {
			return Buffer.from(text, 'base64');
		} catch (error) {
			return Buffer.from(text, 'utf8');
		}
	}
	return Buffer.alloc(0);
}

function gunzipSafe(buf) {
	try {
		return zlib.gunzipSync(buf, { maxOutputLength: MAX_BYTES });
	} catch (error) {
		return null;
	}
}

// Local-file headers only (PK\x03\x04), store (0) or deflate (8). Skips Zip64 and encrypted entries.
function unzipSafe(buf) {
	const out = [];
	let at = 0;
	let total = 0;
	while (out.length < MAX_ZIP_FILES && at + 30 <= buf.length) {
		if (buf[at] !== 0x50 || buf[at + 1] !== 0x4b || buf[at + 2] !== 0x03 || buf[at + 3] !== 0x04) break;
		const method = buf.readUInt16LE(at + 8);
		const flags = buf.readUInt16LE(at + 6);
		if (flags & 0x1 || flags & 0x8) return []; // encrypted or data-descriptor: refuse
		const comp = buf.readUInt32LE(at + 18);
		const uncomp = buf.readUInt32LE(at + 22);
		const nameLen = buf.readUInt16LE(at + 26);
		const extraLen = buf.readUInt16LE(at + 28);
		const nameStart = at + 30;
		const dataStart = nameStart + nameLen + extraLen;
		if (dataStart + comp > buf.length) return [];
		if (uncomp > MAX_BYTES || total + uncomp > MAX_ZIP) return [];
		const name = clipName(buf.slice(nameStart, nameStart + nameLen).toString('utf8'));
		const data = buf.subarray(dataStart, dataStart + comp);
		let plain = null;
		try {
			if (method === 0) plain = Buffer.from(data);
			else if (method === 8) plain = zlib.inflateRawSync(data, { maxOutputLength: MAX_BYTES });
			else return [];
		} catch (error) {
			return [];
		}
		if (!plain || plain.length > MAX_BYTES) return [];
		total += plain.length;
		if (!/(^|\/)\./.test(name)) out.push({ name, bytes: plain });
		at = dataStart + comp;
	}
	return out;
}

// Open one attachment (or body blob) into zero or more plain text payloads ready for the parsers.
function openBlob(buf, name) {
	const lower = clipName(name);
	const raw = Buffer.isBuffer(buf) ? buf : asBuffer(buf);
	if (!raw.length || raw.length > MAX_ZIP) return [];
	const gzipped = raw.length > 2 && raw[0] === 0x1f && raw[1] === 0x8b;
	const zipped = raw.length > 3 && raw[0] === 0x50 && raw[1] === 0x4b;
	if (gzipped || /\.gz$/.test(lower)) {
		const plain = gunzipSafe(raw);
		if (!plain || plain.length > MAX_BYTES) return [];
		const inner = lower.replace(/\.gz$/, '') || 'report';
		return [{ name: inner, text: plain.toString('utf8') }];
	}
	if (zipped || /\.zip$/.test(lower)) {
		return unzipSafe(raw).flatMap((file) => openBlob(file.bytes, file.name));
	}
	if (raw.length > MAX_BYTES) return [];
	return [{ name: lower || 'report', text: raw.toString('utf8') }];
}

function attachmentsOf(payload) {
	const list = (payload && payload.attachments) || (payload && payload.attachment) || [];
	return (Array.isArray(list) ? list : []).slice(0, MAX_ZIP_FILES).map((item) => {
		if (!item || typeof item !== 'object') return { name: '', bytes: Buffer.alloc(0) };
		const name = item.filename || item.name || item.contentId || '';
		const data = item.content || item.data || item.bytes || item.body || '';
		return { name: clipName(name), bytes: asBuffer(data) };
	});
}

function bodiesFromPayload(payload) {
	const out = [];
	const seen = new Set();
	const push = (text, name) => {
		const value = String(text || '');
		if (!value || value.length > MAX_BYTES || seen.has(value.slice(0, 200))) return;
		seen.add(value.slice(0, 200));
		out.push({ name: clipName(name), text: value });
	};
	for (const file of attachmentsOf(payload)) {
		for (const opened of openBlob(file.bytes, file.name)) push(opened.text, opened.name);
	}
	const p = payload || {};
	const text = String(p.text || '');
	const html = String(p.html || '');
	if (text.indexOf('<feedback') >= 0 || text.indexOf('"policies"') >= 0) push(text, 'body.txt');
	if (html.indexOf('<feedback') >= 0) push(html, 'body.html');
	return out;
}

function parseBodies(bodies) {
	const found = [];
	for (const body of bodies || []) {
		const text = body && body.text;
		if (!text) continue;
		const dmarc = reports.parseDmarcAggregate(text);
		if (dmarc) {
			found.push(dmarc);
			continue;
		}
		const tls = reports.parseTlsRpt(text);
		if (tls) found.push(tls);
	}
	return found;
}

function looksLikeReport(payload) {
	const p = payload || {};
	const subject = String(p.subject || '');
	if (REPORT_SUBJECT.test(subject)) return true;
	if (attachmentsOf(p).some((file) => /\.(xml|json)(\.gz)?$|\.zip$/i.test(file.name))) return true;
	const text = String(p.text || '');
	return text.indexOf('<feedback') >= 0 || /"organization-name"\s*:/.test(text) || /"date-range"\s*:/.test(text);
}

/**
 * deps: {
 *   store,                 // url-review-auth firestoreStore / memoryStore
 *   proofsFor(email),      // -> owner proof rows for that account
 *   now?
 * }
 * Returns { outcome, counted, domain, kinds } where outcome is
 * "counted" | "no-consent" | "not-report" | "empty".
 */
async function ingest(payload, deps) {
	if (!looksLikeReport(payload)) return { outcome: 'not-report', counted: 0, domain: '', kinds: [] };
	const aggs = parseBodies(bodiesFromPayload(payload));
	if (!aggs.length) return { outcome: 'empty', counted: 0, domain: '', kinds: [] };
	const now = (deps && deps.now) || Date.now();
	const store = deps && deps.store;
	const proofsFor = (deps && deps.proofsFor) || (async () => []);
	let counted = 0;
	const kinds = new Set();
	let domain = '';
	for (const agg of aggs) {
		const host = proof.hostOf(agg.domain);
		if (!host) continue;
		if (!domain) domain = host;
		const rows = await storeApi.consentsForHost(store, host, now);
		for (const row of rows) {
			const email = proof.emailOf(row.email);
			const kind = storeApi.proofKindOf(await proofsFor(email), email, host, now);
			if (!consent.consentOn(row, kind, now)) continue;
			await storeApi.saveAggregate(store, email, host, agg, now);
			counted += 1;
			kinds.add(agg.kind);
		}
	}
	return {
		outcome: counted ? 'counted' : 'no-consent',
		counted,
		domain,
		kinds: [...kinds],
	};
}

module.exports = {
	MAX_BYTES,
	MAX_ZIP,
	looksLikeReport,
	bodiesFromPayload,
	openBlob,
	parseBodies,
	ingest,
	unzipSafe,
	REPORT_SUBJECT,
};
