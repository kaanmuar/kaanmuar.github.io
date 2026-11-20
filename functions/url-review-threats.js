'use strict';

/* Internal threat list for the review desk (#3817): stores every attack, exploit, compromise,
   exposure, lookalike, or blocklist finding per reviewed site with explicit levels, kinds,
   subject/actor differentiators, evidence, confidence, and retention.
   Never exposed on Live Reports or public endpoints; `public_ok` defaults to false. */

const crypto = require('crypto');

const COLLECTION = 'url_review_threats';

const LEVELS = ['info', 'watch', 'high', 'critical'];
const LEVEL_RANK = { info: 1, watch: 2, high: 3, critical: 4 };
const SUBJECT_TYPES = ['domain', 'host', 'ip', 'software', 'company', 'sector', 'country'];
const ROLES = ['host_used', 'site_hit', 'company_hit', 'context'];
const CONFIDENCE = ['observed', 'third_party', 'inferred'];
const TIME_WINDOWS = ['live', 'recent', 'historical'];
const DELIST_STATUSES = ['none', 'pending', 'requested', 'delisted', 'false_positive'];

const KINDS = [
	'phishing-host',
	'malware-host',
	'c2-indicator',
	'hacked-spam',
	'defacement',
	'cloaking',
	'known-exploit-software',
	'outdated-cms',
	'exposed-secret',
	'lookalike',
	'mail-blocklist',
	'cert-anomaly',
	'ransomware-victim',
	'breach-news',
	'ddos-trend',
];

const RETENTION_DAYS = {
	critical: 365,
	high: 365,
	watch: 180,
	info: 90,
};

const DAY_MS = 24 * 3600 * 1000;
const LIVE_MS = 24 * 3600 * 1000;
const RECENT_MS = 90 * DAY_MS;

// text.replace(/<[^>]{0,120}>/g, " ") in one pass: a tag runs from the first "<" at most 121 characters before the next ">".
function blankTags(text) {
	let out = '';
	let kept = 0;
	for (let open = text.indexOf('<'); open >= 0; ) {
		const close = text.indexOf('>', open + 1);
		if (close < 0) break;
		const start = close - open > 121 ? text.indexOf('<', close - 121) : open;
		if (start >= 0 && start < close) {
			out += text.slice(kept, start) + ' ';
			kept = close + 1;
		}
		open = text.indexOf('<', close + 1);
	}
	return out + text.slice(kept);
}

function clip(value, max) {
	const text = blankTags(String(value == null ? '' : value))
		.replace(/\s+/g, ' ')
		.trim();
	if (!text) return '';
	return text.length > max ? text.slice(0, max - 1) + '…' : text;
}

function iso(value, fallback) {
	if (!value) return fallback || '';
	const ms = typeof value === 'number' ? value : Date.parse(String(value));
	return Number.isFinite(ms) ? new Date(ms).toISOString() : fallback || '';
}

function countryCode(value) {
	const code = String(value || '')
		.trim()
		.toUpperCase();
	return /^[A-Z]{2}$/.test(code) ? code : '';
}

function bareHost(value) {
	const raw = String(value || '')
		.trim()
		.toLowerCase();
	if (!raw) return '';
	try {
		const parsed = raw.includes('://') ? new URL(raw) : new URL('https://' + raw);
		return parsed.hostname.replace(/^www\./, '').replace(/\.$/, '');
	} catch (error) {
		return raw
			.replace(/^www\./, '')
			.replace(/\.$/, '')
			.slice(0, 160);
	}
}

function timeWindowOf(lastSeen, nowMs) {
	const ms = Date.parse(String(lastSeen || ''));
	if (!Number.isFinite(ms)) return 'historical';
	const age = Math.max(0, (nowMs || Date.now()) - ms);
	if (age <= LIVE_MS) return 'live';
	if (age <= RECENT_MS) return 'recent';
	return 'historical';
}

function pickEnum(value, allowed, fallback) {
	const v = String(value || '')
		.trim()
		.toLowerCase();
	return allowed.includes(v) ? v : fallback;
}

function recordId(reviewId, kind, subject, source) {
	const raw = [reviewId || '-', kind || '-', subject || '-', source || '-'].join('|').toLowerCase();
	return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 20);
}

function normalizeRecord(input, nowMs) {
	const now = Number.isFinite(nowMs) ? nowMs : Date.now();
	const observedAt = iso(input.observed_at || input.observedAt, new Date(now).toISOString());
	const firstSeen = iso(input.first_seen || input.firstSeen, observedAt);
	const lastSeen = iso(input.last_seen || input.lastSeen, observedAt);
	const kind = pickEnum(input.kind, KINDS, 'breach-news');
	const level = pickEnum(input.level, LEVELS, 'info');
	const subjectType = pickEnum(input.subject_type || input.subjectType, SUBJECT_TYPES, 'host');
	const role = pickEnum(input.role, ROLES, kind === 'ddos-trend' ? 'context' : 'site_hit');
	const confidence = pickEnum(input.confidence, CONFIDENCE, 'third_party');
	const subject = clip(input.subject || input.host || '', 180).toLowerCase();
	const host = bareHost(input.host || (subjectType === 'host' || subjectType === 'domain' ? subject : ''));
	const source = clip(input.source || 'url-review', 80);
	const reviewId = clip(input.review_id || input.reviewId || '', 60);
	const retentionDays = RETENTION_DAYS[level] || 180;
	const retentionMs = (Date.parse(observedAt) || now) + retentionDays * DAY_MS;
	const retentionUntil = iso(input.retention_until || input.retentionUntil, new Date(retentionMs).toISOString());
	const defaultDelist =
		level === 'critical' && (kind === 'phishing-host' || kind === 'malware-host' || kind === 'mail-blocklist')
			? 'pending'
			: 'none';
	const delistStatus = pickEnum(input.delist_status || input.delistStatus, DELIST_STATUSES, defaultDelist);
	const id = clip(input.id || '', 40) || recordId(reviewId, kind, subject || host, source);

	return {
		id,
		kind,
		level,
		subject_type: subjectType,
		subject: subject || host,
		host,
		role,
		host_ip: clip(input.host_ip || input.hostIp || '', 80),
		hosting_country: countryCode(input.hosting_country || input.hostingCountry),
		company_country: countryCode(input.company_country || input.companyCountry),
		source,
		source_ref: clip(input.source_ref || input.sourceRef || '', 320),
		first_seen: firstSeen,
		last_seen: lastSeen,
		observed_at: observedAt,
		time_window: timeWindowOf(lastSeen, now),
		evidence: clip(input.evidence || '', 280),
		confidence,
		review_id: reviewId,
		public_ok: input.public_ok === true,
		owner_notified_at: iso(input.owner_notified_at || input.ownerNotifiedAt, ''),
		delist_status: delistStatus,
		retention_until: retentionUntil,
		note: clip(input.note || '', 240),
	};
}

function findingLevel(verdict, severity) {
	const sev = String(severity || '').toLowerCase();
	if (sev === 'critical') return 'critical';
	if (sev === 'high') return 'high';
	if (verdict === 'fail') return 'high';
	if (verdict === 'risk') return 'watch';
	return 'info';
}

function classifyFinding(finding, host) {
	const key = String((finding && finding.key) || '');
	const verdict = String((finding && finding.verdict) || '');
	if (!key || (verdict !== 'fail' && verdict !== 'risk')) return null;
	const sev = String(finding.severity || '').toLowerCase();
	const title = String(finding.title || '');
	const evidence = String(finding.evidence || '');
	const combined = title + ' ' + evidence;

	if (key === 'sec-safebrowsing') {
		return {
			kind: /phish|social.?engineering|deceptive/i.test(combined) ? 'phishing-host' : 'malware-host',
			level: 'critical',
			subject_type: 'host',
			subject: host,
			role: 'host_used',
			source: 'Google Web Risk',
			confidence: 'third_party',
		};
	}
	if (key === 'sec-linked-script' || key === 'sec-linked-risk') {
		return {
			kind: /phish|social.?engineering|deceptive/i.test(combined) ? 'phishing-host' : 'malware-host',
			level: 'critical',
			subject_type: 'host',
			subject: host,
			role: 'site_hit',
			source: 'Google Web Risk (linked host)',
			confidence: 'third_party',
		};
	}
	if (key === 'sec-threatlists') {
		return {
			kind: /phish/i.test(combined) ? 'phishing-host' : 'malware-host',
			level: 'critical',
			subject_type: 'host',
			subject: host,
			role: 'host_used',
			source: /urlhaus/i.test(combined)
				? 'URLhaus'
				: /phishstats/i.test(combined)
					? 'PhishStats'
					: /cloudflare/i.test(combined)
						? 'Cloudflare URL Scanner'
						: 'Threat Lists',
			confidence: 'third_party',
		};
	}
	if (key === 'sec-seo-spam' || key === 'sec-spam-links') {
		return {
			kind: 'hacked-spam',
			level: sev === 'high' ? 'high' : 'watch',
			subject_type: 'host',
			subject: host,
			role: 'site_hit',
			source: key === 'sec-seo-spam' ? 'Hack signs search/spam' : 'Hack signs links',
			confidence: 'observed',
		};
	}
	if (key === 'sec-cloaking') {
		return {
			kind: 'cloaking',
			level: verdict === 'fail' || sev === 'high' ? 'high' : 'watch',
			subject_type: 'host',
			subject: host,
			role: 'site_hit',
			source: 'Googlebot comparison',
			confidence: 'observed',
		};
	}
	if (key === 'sec-wordpress') {
		return {
			kind: 'outdated-cms',
			level: sev === 'high' ? 'high' : 'watch',
			subject_type: 'software',
			subject: host + ' (WordPress)',
			role: 'site_hit',
			source: 'Wordfence Intelligence',
			confidence: 'inferred',
		};
	}
	if (key === 'sec-libraries') {
		return {
			kind: 'known-exploit-software',
			level: sev === 'high' ? 'high' : 'watch',
			subject_type: 'software',
			subject: host + ' (JS libraries)',
			role: 'site_hit',
			source: 'Front-end library audit',
			confidence: 'inferred',
		};
	}
	if (/^sec-exposed-/.test(key)) {
		return {
			kind: 'exposed-secret',
			level: sev === 'critical' ? 'critical' : 'high',
			subject_type: 'host',
			subject: host,
			role: 'site_hit',
			source: 'Exposed files probe',
			confidence: 'observed',
		};
	}
	if (key === 'sec-lookalike') {
		return {
			kind: 'lookalike',
			level: verdict === 'fail' || sev === 'high' ? 'high' : 'watch',
			subject_type: 'domain',
			subject: host,
			role: 'company_hit',
			source: 'Lookalike domain scan',
			confidence: 'observed',
		};
	}
	if (/^sec-blocklist/.test(key)) {
		return {
			kind: 'mail-blocklist',
			level: 'high',
			subject_type: 'host',
			subject: host,
			role: 'host_used',
			source: 'DNSBL check',
			confidence: 'third_party',
		};
	}
	if (/^sec-leak-/.test(key)) {
		return {
			kind: 'exposed-secret',
			level: 'critical',
			subject_type: 'host',
			subject: host,
			role: 'site_hit',
			source: 'Page leak scanner',
			confidence: 'observed',
		};
	}
	if (key === 'sec-kev' || key === 'sec-osv') {
		return {
			kind: 'known-exploit-software',
			level: findingLevel(verdict, sev),
			subject_type: 'software',
			subject: host,
			role: 'site_hit',
			source: key === 'sec-kev' ? 'CISA KEV' : 'OSV.dev',
			confidence: 'inferred',
		};
	}
	if (key === 'sec-drop' || key === 'sec-feodo') {
		return {
			kind: 'c2-indicator',
			level: findingLevel(verdict, sev),
			subject_type: 'ip',
			subject: host,
			role: 'host_used',
			source: key === 'sec-feodo' ? 'Feodo Tracker' : 'Network DROP',
			confidence: 'third_party',
		};
	}
	if (key === 'sec-breach-news') {
		return {
			kind: 'breach-news',
			level: findingLevel(verdict, sev),
			subject_type: 'company',
			subject: host,
			role: 'company_hit',
			source: 'GDELT Project',
			confidence: 'third_party',
		};
	}
	if (key === 'sec-cert-anomaly') {
		return {
			kind: 'cert-anomaly',
			level: findingLevel(verdict, sev),
			subject_type: 'domain',
			subject: host,
			role: 'site_hit',
			source: 'Certificate check',
			confidence: 'observed',
		};
	}
	return null;
}

function recordsFromReview(record, options) {
	const opts = options || {};
	const now = Number.isFinite(opts.now) ? opts.now : Date.now();
	const row = record || {};
	const report = row.report;
	if (!report || typeof report !== 'object') return [];
	const reviewId = clip(row.id || report.id || '', 60);
	const host = bareHost(report.host || report.finalUrl || row.requestedUrl || '');
	if (!host) return [];
	const observedAt = iso(report.fetchedAt || row.createdAt, new Date(now).toISOString());
	const targeted = report.targeted && typeof report.targeted === 'object' ? report.targeted : null;
	const hosting = (targeted && targeted.hosting) || {};
	const hostIp = clip(hosting.ip || row.hostIp || '', 80);
	const hostingCountry = countryCode(hosting.country || row.hostingCountry);
	const companyCountry = countryCode((targeted && targeted.companyCountry) || (row.sweep && row.sweep.cc));
	const out = [];
	const seen = new Set();
	const push = (item) => {
		const normalized = normalizeRecord(
			Object.assign(
				{
					host,
					host_ip: hostIp,
					hosting_country: hostingCountry,
					company_country: companyCountry,
					observed_at: observedAt,
					review_id: reviewId,
					public_ok: false,
				},
				item
			),
			now
		);
		const dedupe = normalized.kind + '|' + normalized.subject + '|' + normalized.source;
		if (seen.has(dedupe)) return;
		seen.add(dedupe);
		out.push(normalized);
	};

	if (targeted && Array.isArray(targeted.items)) {
		targeted.items.forEach((item) => {
			if (!item || !item.kind) return;
			push({
				kind: item.kind,
				level: item.level || 'info',
				subject_type: item.subject_type || item.subjectType || 'host',
				subject: item.subject || host,
				role: item.role || 'site_hit',
				host_ip: item.host_ip || item.hostIp || hostIp,
				hosting_country: item.hosting_country || item.hostingCountry || hostingCountry,
				company_country: item.company_country || item.companyCountry || companyCountry,
				source: item.source || 'url-review',
				source_ref: item.source_ref || item.sourceRef || '',
				first_seen: item.first_seen || item.firstSeen || observedAt,
				last_seen: item.last_seen || item.lastSeen || observedAt,
				evidence: item.evidence || item.title || '',
				confidence: item.confidence || 'third_party',
			});
		});
	}

	const findings = report.insights && Array.isArray(report.insights.findings) ? report.insights.findings : [];
	findings.forEach((finding) => {
		const mapped = classifyFinding(finding, host);
		if (!mapped) return;
		push(
			Object.assign({}, mapped, {
				first_seen: observedAt,
				last_seen: observedAt,
				evidence: clip(finding.evidence || finding.title || '', 280),
			})
		);
	});

	if (!findings.some((f) => f && /^sec-leak-/.test(String(f.key || '')))) {
		(Array.isArray(report.alerts) ? report.alerts : []).forEach((alert) => {
			if (!alert || alert.level !== 'Leak') return;
			push({
				kind: 'exposed-secret',
				level: 'critical',
				subject_type: 'host',
				subject: host,
				role: 'site_hit',
				source: 'Page leak scanner',
				first_seen: observedAt,
				last_seen: observedAt,
				evidence: clip((alert.title || '') + (alert.detail ? ': ' + alert.detail : ''), 280),
				confidence: 'observed',
			});
		});
	}

	return out;
}

function summarizeThreats(items) {
	const byLevel = { critical: 0, high: 0, watch: 0, info: 0 };
	const byKind = {};
	const byConfidence = {};
	const byRole = {};
	const byDelist = {};
	const countries = {};
	const windows = { live: 0, recent: 0, historical: 0 };
	const rows = Array.isArray(items) ? items : [];
	rows.forEach((item) => {
		if (!item) return;
		if (byLevel[item.level] != null) byLevel[item.level] += 1;
		byKind[item.kind] = (byKind[item.kind] || 0) + 1;
		byConfidence[item.confidence] = (byConfidence[item.confidence] || 0) + 1;
		byRole[item.role] = (byRole[item.role] || 0) + 1;
		byDelist[item.delist_status] = (byDelist[item.delist_status] || 0) + 1;
		if (windows[item.time_window] != null) windows[item.time_window] += 1;
		if (item.hosting_country) countries[item.hosting_country] = (countries[item.hosting_country] || 0) + 1;
	});
	return {
		total: rows.length,
		byLevel,
		byKind,
		byConfidence,
		byRole,
		byDelist,
		windows,
		countries,
	};
}

function filterThreats(items, filters) {
	const f = filters || {};
	const level = String(f.level || '')
		.trim()
		.toLowerCase();
	const kind = String(f.kind || '')
		.trim()
		.toLowerCase();
	const confidence = String(f.confidence || '')
		.trim()
		.toLowerCase();
	const delist = String(f.delist_status || f.delist || '')
		.trim()
		.toLowerCase();
	const country = countryCode(f.country || f.hosting_country);
	const windowName = String(f.time_window || f.window || '')
		.trim()
		.toLowerCase();
	const q = String(f.q || '')
		.trim()
		.toLowerCase();
	return (Array.isArray(items) ? items : [])
		.filter((item) => {
			if (!item) return false;
			if (level && item.level !== level) return false;
			if (kind && item.kind !== kind) return false;
			if (confidence && item.confidence !== confidence) return false;
			if (delist && item.delist_status !== delist) return false;
			if (country && item.hosting_country !== country) return false;
			if (windowName && item.time_window !== windowName) return false;
			if (q) {
				const hay = [item.host, item.subject, item.source, item.evidence, item.hosting_country, item.host_ip, item.kind]
					.join(' ')
					.toLowerCase();
				if (!hay.includes(q)) return false;
			}
			return true;
		})
		.sort((a, b) => {
			const rankDiff = (LEVEL_RANK[b.level] || 0) - (LEVEL_RANK[a.level] || 0);
			if (rankDiff !== 0) return rankDiff;
			return String(b.observed_at || '').localeCompare(String(a.observed_at || ''));
		});
}

async function recordThreats(db, record, options) {
	if (!db || typeof db.collection !== 'function') return [];
	const items = recordsFromReview(record, options);
	if (!items.length) return [];
	const col = db.collection(COLLECTION);
	const saved = [];
	for (const item of items) {
		try {
			const ref = col.doc(item.id);
			const existing = await ref.get().catch(() => null);
			const prev = existing && existing.exists ? existing.data() || {} : null;
			const merged = prev
				? Object.assign({}, item, {
						first_seen: prev.first_seen && prev.first_seen < item.first_seen ? prev.first_seen : item.first_seen,
						delist_status:
							prev.delist_status && prev.delist_status !== 'none' ? prev.delist_status : item.delist_status,
						public_ok: prev.public_ok === true,
						owner_notified_at: prev.owner_notified_at || item.owner_notified_at,
						note: prev.note || item.note,
					})
				: item;
			const expireDate = new Date(Date.parse(merged.retention_until) || Date.now() + 180 * DAY_MS);
			await ref.set(Object.assign({}, merged, { expireAt: expireDate }), { merge: true });
			saved.push(merged);
		} catch (error) {
			console.error('Threat list write failed for ' + item.id + ':', error && error.message ? error.message : error);
		}
	}
	return saved;
}

async function readThreats(db, options) {
	const opts = options || {};
	const limit = Math.max(1, Math.min(1000, Number(opts.limit) || 500));
	const now = Number.isFinite(opts.now) ? opts.now : Date.now();
	if (!db || typeof db.collection !== 'function') return { summary: summarizeThreats([]), items: [] };
	const snap = await db.collection(COLLECTION).orderBy('observed_at', 'desc').limit(limit).get();
	const rows = snap.docs.map((doc) => normalizeRecord(Object.assign({ id: doc.id }, doc.data() || {}), now));
	const filtered = filterThreats(rows, opts);
	return {
		summary: summarizeThreats(rows),
		items: filtered,
	};
}

async function updateThreat(db, body, operator, nowMs) {
	const input = body || {};
	const id = String(input.id || '')
		.replace(/[^A-Za-z0-9_-]/g, '')
		.slice(0, 60);
	if (!id) return { ok: false, status: 400, error: 'Which threat entry?' };
	const ref = db.collection(COLLECTION).doc(id);
	const snap = await ref.get();
	if (!snap.exists) return { ok: false, status: 404, error: 'That threat entry was not found.' };
	const patch = {
		updated_at: new Date(Number.isFinite(nowMs) ? nowMs : Date.now()).toISOString(),
		updated_by: clip(operator, 160),
	};
	if (input.delist_status !== undefined) {
		const status = String(input.delist_status || '')
			.trim()
			.toLowerCase();
		if (!DELIST_STATUSES.includes(status)) return { ok: false, status: 400, error: 'Unknown delist status.' };
		patch.delist_status = status;
	}
	if (input.note !== undefined) patch.note = clip(input.note, 240);
	if (typeof input.public_ok === 'boolean') patch.public_ok = input.public_ok;
	if (input.owner_notified_at !== undefined) patch.owner_notified_at = iso(input.owner_notified_at, '');
	await ref.set(patch, { merge: true });
	const fresh = await ref.get();
	return { ok: true, status: 200, item: normalizeRecord(Object.assign({ id }, fresh.data() || {}), nowMs) };
}

async function backfillFromReviews(db, options) {
	const opts = options || {};
	const limit = Math.max(1, Math.min(400, Number(opts.limit) || 200));
	if (!db || typeof db.collection !== 'function') return { scanned: 0, stored: 0 };
	let scanned = 0;
	let stored = 0;
	const col = db.collection('url_reviews').limit(limit);
	const processDoc = async (doc) => {
		scanned += 1;
		const data = doc.data() || {};
		if (!data.report) return;
		const saved = await recordThreats(db, Object.assign({ id: doc.id }, data), opts);
		stored += saved.length;
	};
	if (typeof col.stream === 'function') {
		for await (const doc of col.stream()) await processDoc(doc);
	} else {
		const snap = await col.get();
		for (const doc of snap.docs || []) await processDoc(doc);
	}
	return { scanned, stored };
}

module.exports = {
	COLLECTION,
	LEVELS,
	LEVEL_RANK,
	SUBJECT_TYPES,
	ROLES,
	CONFIDENCE,
	TIME_WINDOWS,
	DELIST_STATUSES,
	KINDS,
	RETENTION_DAYS,
	normalizeRecord,
	recordsFromReview,
	summarizeThreats,
	filterThreats,
	recordThreats,
	readThreats,
	updateThreat,
	backfillFromReviews,
};
