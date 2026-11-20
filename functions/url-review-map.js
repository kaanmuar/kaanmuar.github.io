'use strict';

/* Global live/historical cyber-attack context + operator-only reviewed-site hosting map (#3819).
   - Public `/threats/global`: GDELT 2.0 15m cyber-attack slice + rolling 90d daily totals + CISA KEV +
     DROP network count summary. Zero customer URLs, domains, or site scores ever exposed.
   - Internal `/desk/map/data`: Aggregates `url_review_threats` + `url_reviews` by `hosting_country`
     for the operator desk (`verifyOperator` required), with DB-IP Lite CC BY 4.0 attribution. */

const zlib = require('zlib');
const targeted = require('./url-review-targeted');
const hostGeo = require('./url-review-host-geo');
const threats = require('./url-review-threats');

const DAY_MS = 24 * 3600 * 1000;
const MAP_MEM_TTL_MS = 5 * 60 * 1000;
const FALLBACK_MEM_TTL_MS = 10 * 60 * 1000;
const MAX_EVENTS = 80;

const RANGE_DAYS = {
	live: 0,
	'7d': 7,
	'30d': 30,
	'90d': 90,
};

const LEVEL_ORDER = {
	critical: 4,
	high: 3,
	watch: 2,
	info: 1,
	clean: 0,
};

let memGlobalMap = null;
let memGlobalUntil = 0;

function stripForbidden(text) {
	return String(text == null ? '' : text)
		.replace(/\b(Spamhaus|PhishStats|URLhaus|Barracuda)\b/gi, 'Threat list')
		.replace(/\s+/g, ' ')
		.trim();
}

function cleanCc(value) {
	const cc = String(value || '')
		.trim()
		.toUpperCase();
	return /^[A-Z]{2}$/.test(cc) ? cc : '';
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

function parseRange(value) {
	const v = String(value || 'live')
		.trim()
		.toLowerCase();
	if (Object.prototype.hasOwnProperty.call(RANGE_DAYS, v)) return v;
	if (v === '7' || v === '7days') return '7d';
	if (v === '30' || v === '30days') return '30d';
	if (v === '90' || v === '90days') return '90d';
	return 'live';
}

function safeHttpUrl(value) {
	const s = String(value || '').trim();
	if (!/^https?:\/\//i.test(s)) return '';
	try {
		const u = new URL(s);
		return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString().slice(0, 320) : '';
	} catch (error) {
		return '';
	}
}

function sanitizeEvent(ev) {
	if (!ev || typeof ev !== 'object') return null;
	const url = safeHttpUrl(ev.url);
	if (!url) return null;
	const host = bareHost(url);
	const countries = Array.isArray(ev.countries) ? [...new Set(ev.countries.map(cleanCc).filter(Boolean))] : [];
	const themes = Array.isArray(ev.themes)
		? ev.themes
				.map((t) => stripForbidden(String(t || '')).slice(0, 40))
				.filter(Boolean)
				.slice(0, 6)
		: [];
	const source = stripForbidden(ev.source || host || 'News').slice(0, 80);
	return {
		date: String(ev.date || '').slice(0, 32),
		source: source || host || 'News',
		host,
		url,
		themes,
		countries,
	};
}

function sumHistoryWindow(history, days, nowMs) {
	const out = {};
	const map = history && typeof history === 'object' ? history : {};
	const cutoffDay = new Date(nowMs - Math.max(0, days - 1) * DAY_MS).toISOString().slice(0, 10);
	const maxDay = new Date(nowMs + DAY_MS).toISOString().slice(0, 10);
	Object.keys(map).forEach((day) => {
		if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return;
		if (day < cutoffDay || day > maxDay) return;
		const row = map[day];
		if (!row || typeof row !== 'object') return;
		Object.keys(row).forEach((rawCc) => {
			const cc = cleanCc(rawCc);
			const count = Number(row[rawCc]) || 0;
			if (cc && count > 0) out[cc] = (out[cc] || 0) + count;
		});
	});
	return out;
}

function cleanCountryCounts(byCountry) {
	const out = {};
	if (!byCountry || typeof byCountry !== 'object') return out;
	Object.keys(byCountry).forEach((rawCc) => {
		const cc = cleanCc(rawCc);
		const n = Number(byCountry[rawCc]) || 0;
		if (cc && n > 0) out[cc] = n;
	});
	return out;
}

function sumCounts(map) {
	let total = 0;
	Object.keys(map || {}).forEach((k) => {
		total += Number(map[k]) || 0;
	});
	return total;
}

function buildGlobalMapPayload(rawMap, query, nowMs) {
	const now = Number.isFinite(nowMs) ? nowMs : Date.now();
	const q = query || {};
	const range = parseRange(q.range);
	const filterCountry = cleanCc(q.country);
	const filterTheme = String(q.theme || '')
		.trim()
		.toUpperCase();
	const raw = rawMap && typeof rawMap === 'object' ? rawMap : {};
	const liveMap = cleanCountryCounts(raw.liveSlice && raw.liveSlice.byCountry);
	const map7 = sumHistoryWindow(raw.history, 7, now);
	const map30 = sumHistoryWindow(raw.history, 30, now);
	const map90 = sumHistoryWindow(raw.history, 90, now);

	const totalsByRange = {
		live: sumCounts(liveMap),
		'7d': sumCounts(map7),
		'30d': sumCounts(map30),
		'90d': sumCounts(map90),
	};

	const activeMap = range === 'live' ? liveMap : range === '7d' ? map7 : range === '30d' ? map30 : map90;

	const activeTotal = Math.max(0, sumCounts(activeMap));
	const countries = Object.keys(activeMap)
		.map((cc) => ({
			cc,
			count: activeMap[cc],
			share: activeTotal ? Math.round((activeMap[cc] / activeTotal) * 1000) / 10 : 0,
		}))
		.sort((a, b) => b.count - a.count || a.cc.localeCompare(b.cc));

	let events = (Array.isArray(raw.recentEvents) ? raw.recentEvents : []).map(sanitizeEvent).filter(Boolean);
	if (filterCountry) events = events.filter((ev) => ev.countries.includes(filterCountry));
	if (filterTheme) events = events.filter((ev) => ev.themes.some((t) => t.toUpperCase().includes(filterTheme)));

	const baseAttributions =
		Array.isArray(raw.attributions) && raw.attributions.length
			? raw.attributions.map(stripForbidden).filter(Boolean)
			: ['GDELT Project (https://www.gdeltproject.org/)', 'CISA Known Exploited Vulnerabilities Catalog (CC0 1.0)'];

	const dropV4Ranges = Number(raw.dropSummary && raw.dropSummary.v4Ranges) || 0;
	if (dropV4Ranges > 0 && !baseAttributions.some((a) => /DROP/i.test(a))) {
		baseAttributions.push('DROP hijacked network blocklist (summary count only)');
	}

	return {
		version: 1,
		updatedAt: String(raw.updatedAt || ''),
		slice: String((raw.liveSlice && raw.liveSlice.slice) || ''),
		range,
		historyDays: Object.keys(raw.history || {}).length,
		totalMentions: activeTotal,
		countryCount: countries.length,
		totalsByRange,
		countries,
		events: events.slice(0, MAX_EVENTS),
		botnetNow:
			raw.botnetNow && Array.isArray(raw.botnetNow.countries)
				? {
						asOf: String(raw.botnetNow.asOf || ''),
						online: Number(raw.botnetNow.online) || 0,
						countries: raw.botnetNow.countries
							.slice(0, 40)
							.map((x) => ({ cc: String(x.cc || '').slice(0, 2), count: Number(x.count) || 0 })),
						source: String(raw.botnetNow.source || '').slice(0, 120),
					}
				: null,
		kevSummary: {
			version: stripForbidden((raw.kevSummary && raw.kevSummary.version) || ''),
			count: Number(raw.kevSummary && raw.kevSummary.count) || 0,
		},
		dropSummary: {
			v4Ranges: dropV4Ranges,
		},
		attributions: [...new Set(baseAttributions)],
		// Explicit design placeholder (#3819): aggregate anonymized reviewed-country counts remain disabled publicly.
		reviewSummary: {
			enabled: false,
			countries: null,
		},
	};
}

async function fetchColdGlobalMap(fetchImpl, nowMs) {
	if (typeof fetchImpl !== 'function') return null;
	try {
		const [gdelt, kevRes, dropText] = await Promise.all([
			targeted.fetchLatestGdelt(fetchImpl).catch(() => ({ byCountry: {}, mentions: [], slice: '' })),
			fetchImpl(targeted.CISA_KEV_URL, { signal: AbortSignal.timeout(7000) })
				.then((r) => (r && r.ok ? r.json() : null))
				.catch(() => null),
			targeted.DROP_V4_URL
				? fetchImpl(targeted.DROP_V4_URL, { signal: AbortSignal.timeout(7000) })
						.then((r) => (r && r.ok ? r.text() : ''))
						.catch(() => '')
				: Promise.resolve(''),
		]);
		const kev = targeted.parseCisaKev(kevRes);
		const drop = targeted.parseDropV4(dropText);
		const hasData =
			Object.keys((gdelt && gdelt.byCountry) || {}).length ||
			(gdelt && gdelt.mentions && gdelt.mentions.length) ||
			kev.count ||
			drop.count;
		if (!hasData) return null;
		return targeted.updateGlobalMapHistory(null, gdelt, kev, drop, nowMs);
	} catch (error) {
		return null;
	}
}

async function loadGlobalMapPayload(options) {
	const opts = options || {};
	const now = Number.isFinite(opts.now) ? opts.now : Date.now();
	let rawMap = opts.rawMap || null;

	if (!rawMap && opts.useCache !== false && memGlobalMap && now < memGlobalUntil) {
		rawMap = memGlobalMap;
	}

	if (!rawMap && opts.storage !== null && opts.storage !== false) {
		try {
			const storage = opts.storage || require('firebase-admin/storage').getStorage();
			const file = storage.bucket(targeted.BUCKET).file(targeted.MAP_GLOBAL_OBJECT);
			const [exists] = await file.exists();
			if (exists) {
				const [buf] = await file.download();
				rawMap = JSON.parse(zlib.gunzipSync(buf).toString('utf8'));
				if (opts.useCache !== false) {
					memGlobalMap = rawMap;
					memGlobalUntil = now + MAP_MEM_TTL_MS;
				}
			}
		} catch (error) {
			/* fallback to direct GDELT/KEV */
		}
	}

	if (!rawMap && opts.fetch !== false) {
		const fetchImpl = opts.fetch || global.fetch;
		rawMap = await fetchColdGlobalMap(fetchImpl, now);
		if (rawMap && opts.useCache !== false) {
			memGlobalMap = rawMap;
			memGlobalUntil = now + FALLBACK_MEM_TTL_MS;
		}
	}

	return buildGlobalMapPayload(rawMap, opts.query, now);
}

function resetGlobalMapCache() {
	memGlobalMap = null;
	memGlobalUntil = 0;
}

function maxLevelOf(levels) {
	let best = 'clean';
	let bestRank = 0;
	(levels || []).forEach((lvl) => {
		const r = LEVEL_ORDER[lvl] || 0;
		if (r > bestRank) {
			bestRank = r;
			best = lvl;
		}
	});
	return best;
}

function buildDeskMapData(threatItems, reviewRows, filters, nowMs) {
	const now = Number.isFinite(nowMs) ? nowMs : Date.now();
	const f = filters || {};
	const filterWindow = String(f.window || f.time_window || '')
		.trim()
		.toLowerCase();
	const filterLevel = String(f.level || '')
		.trim()
		.toLowerCase();
	const filterKind = String(f.kind || '')
		.trim()
		.toLowerCase();
	const filterCc = cleanCc(f.country || f.hosting_country);
	const q = String(f.q || '')
		.trim()
		.toLowerCase();

	const normalizedThreats = (Array.isArray(threatItems) ? threatItems : [])
		.filter(Boolean)
		.map((item) => threats.normalizeRecord(item, now));

	const filteredThreats = normalizedThreats.filter((item) => {
		if (!item.hosting_country) return false;
		if (filterCc && item.hosting_country !== filterCc) return false;
		if (filterWindow && filterWindow !== 'all' && item.time_window !== filterWindow) return false;
		if (filterLevel && item.level !== filterLevel) return false;
		if (filterKind && item.kind !== filterKind) return false;
		if (q) {
			const hay = [item.host, item.subject, item.source, item.evidence, item.hosting_country, item.host_ip, item.kind]
				.join(' ')
				.toLowerCase();
			if (!hay.includes(q)) return false;
		}
		return true;
	});

	const countriesMap = new Map();
	const ensureCountry = (cc) => {
		if (!countriesMap.has(cc)) {
			countriesMap.set(cc, {
				cc,
				sitesMap: new Map(),
				findingsCount: 0,
				byLevel: { critical: 0, high: 0, watch: 0, info: 0 },
				byKind: {},
			});
		}
		return countriesMap.get(cc);
	};

	const ensureSite = (countryBucket, host, meta) => {
		if (!countryBucket.sitesMap.has(host)) {
			countryBucket.sitesMap.set(host, {
				host,
				ip: (meta && meta.ip) || '',
				asn: Number(meta && meta.asn) || 0,
				asName: (meta && meta.asName) || '',
				country: countryBucket.cc,
				reviewId: (meta && meta.reviewId) || '',
				score: meta && meta.score != null ? Number(meta.score) : null,
				observedAt: (meta && meta.observedAt) || '',
				timeWindow: (meta && meta.timeWindow) || 'historical',
				findings: [],
			});
		} else if (meta) {
			const site = countryBucket.sitesMap.get(host);
			if (!site.ip && meta.ip) site.ip = meta.ip;
			if (!site.asn && meta.asn) site.asn = Number(meta.asn) || 0;
			if (!site.asName && meta.asName) site.asName = meta.asName;
			if (!site.reviewId && meta.reviewId) site.reviewId = meta.reviewId;
			if (site.score == null && meta.score != null) site.score = Number(meta.score);
			if (meta.observedAt && String(meta.observedAt) > String(site.observedAt || '')) {
				site.observedAt = meta.observedAt;
				if (meta.timeWindow) site.timeWindow = meta.timeWindow;
			}
		}
		return countryBucket.sitesMap.get(host);
	};

	const reviewByHost = new Map();
	(Array.isArray(reviewRows) ? reviewRows : []).forEach((row) => {
		if (!row || typeof row !== 'object') return;
		const report = row.report && typeof row.report === 'object' ? row.report : {};
		const host = bareHost(report.host || report.finalUrl || row.requestedUrl || row.host || '');
		if (!host) return;
		const hosting = (report.targeted && report.targeted.hosting) || {};
		const cc = cleanCc(hosting.country || row.hostingCountry || '');
		const observedAt = String(report.fetchedAt || row.createdAt || '');
		const ms = Date.parse(observedAt);
		const age = Number.isFinite(ms) ? Math.max(0, now - ms) : Infinity;
		const timeWindow = age <= DAY_MS ? 'live' : age <= 90 * DAY_MS ? 'recent' : 'historical';
		const meta = {
			host,
			cc,
			ip: String(hosting.ip || row.hostIp || ''),
			asn: Number(hosting.asn) || 0,
			asName: String(hosting.asName || ''),
			reviewId: String(row.id || report.id || ''),
			score:
				report.insights && report.insights.score && report.insights.score.overall != null
					? report.insights.score.overall
					: null,
			observedAt,
			timeWindow,
		};
		const prev = reviewByHost.get(host);
		if (!prev || observedAt > String(prev.observedAt || '')) reviewByHost.set(host, meta);
	});

	filteredThreats.forEach((item) => {
		const cc = item.hosting_country;
		const host = bareHost(item.host || item.subject || '');
		if (!cc || !host) return;
		const cBucket = ensureCountry(cc);
		const revMeta = reviewByHost.get(host) || null;
		const site = ensureSite(cBucket, host, {
			ip: item.host_ip || (revMeta && revMeta.ip) || '',
			asn: revMeta && revMeta.asn,
			asName: revMeta && revMeta.asName,
			reviewId: item.review_id || (revMeta && revMeta.reviewId) || '',
			score: revMeta ? revMeta.score : null,
			observedAt: item.observed_at || (revMeta && revMeta.observedAt) || '',
			timeWindow: item.time_window || (revMeta && revMeta.timeWindow) || 'historical',
		});
		site.findings.push({
			id: item.id,
			kind: item.kind,
			level: item.level,
			subject: item.subject,
			source: item.source,
			evidence: item.evidence,
			observed_at: item.observed_at,
			time_window: item.time_window,
			delist_status: item.delist_status,
		});
		cBucket.findingsCount += 1;
		if (cBucket.byLevel[item.level] != null) cBucket.byLevel[item.level] += 1;
		cBucket.byKind[item.kind] = (cBucket.byKind[item.kind] || 0) + 1;
	});

	// Include clean reviewed sites (0 threat records) only when no level/kind filter requires threat hits.
	if (!filterLevel && !filterKind) {
		reviewByHost.forEach((meta) => {
			if (!meta.cc) return;
			if (filterCc && meta.cc !== filterCc) return;
			if (filterWindow && filterWindow !== 'all' && meta.timeWindow !== filterWindow) return;
			if (q) {
				const hay = [meta.host, meta.cc, meta.ip, meta.asName].join(' ').toLowerCase();
				if (!hay.includes(q)) return;
			}
			const cBucket = ensureCountry(meta.cc);
			ensureSite(cBucket, meta.host, meta);
		});
	}

	const byLevelTotal = { critical: 0, high: 0, watch: 0, info: 0 };
	const byKindTotal = {};
	const byWindowTotal = { live: 0, recent: 0, historical: 0 };
	let totalSites = 0;
	let withFindings = 0;
	let cleanSites = 0;
	let totalFindings = 0;

	const countries = [...countriesMap.values()]
		.map((cBucket) => {
			const sites = [...cBucket.sitesMap.values()]
				.map((site) => {
					const sortedFindings = site.findings
						.slice()
						.sort(
							(a, b) =>
								(LEVEL_ORDER[b.level] || 0) - (LEVEL_ORDER[a.level] || 0) ||
								String(b.observed_at || '').localeCompare(String(a.observed_at || ''))
						);
					const maxLevel = maxLevelOf(sortedFindings.map((x) => x.level));
					if (sortedFindings.length) withFindings += 1;
					else cleanSites += 1;
					totalSites += 1;
					if (byWindowTotal[site.timeWindow] != null) byWindowTotal[site.timeWindow] += 1;
					return Object.assign({}, site, {
						maxLevel,
						findingCount: sortedFindings.length,
						findings: sortedFindings,
					});
				})
				.sort(
					(a, b) =>
						(LEVEL_ORDER[b.maxLevel] || 0) - (LEVEL_ORDER[a.maxLevel] || 0) ||
						b.findingCount - a.findingCount ||
						a.host.localeCompare(b.host)
				);

			totalFindings += cBucket.findingsCount;
			Object.keys(byLevelTotal).forEach((lvl) => {
				byLevelTotal[lvl] += cBucket.byLevel[lvl] || 0;
			});
			Object.keys(cBucket.byKind).forEach((k) => {
				byKindTotal[k] = (byKindTotal[k] || 0) + cBucket.byKind[k];
			});

			const topLevel = maxLevelOf(sites.map((s) => s.maxLevel));
			const topKinds = Object.entries(cBucket.byKind)
				.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
				.slice(0, 4)
				.map(([kind, count]) => ({ kind, count }));

			return {
				cc: cBucket.cc,
				siteCount: sites.length,
				withFindings: sites.filter((s) => s.findingCount > 0).length,
				cleanSites: sites.filter((s) => s.findingCount === 0).length,
				findingsCount: cBucket.findingsCount,
				topLevel,
				byLevel: cBucket.byLevel,
				topKinds,
				sites: sites.slice(0, 80),
			};
		})
		.sort(
			(a, b) =>
				(LEVEL_ORDER[b.topLevel] || 0) - (LEVEL_ORDER[a.topLevel] || 0) ||
				b.findingsCount - a.findingsCount ||
				b.siteCount - a.siteCount ||
				a.cc.localeCompare(b.cc)
		);

	return {
		generatedAt: new Date(now).toISOString(),
		attribution: hostGeo.DBIP_ATTRIBUTION,
		filters: {
			window: filterWindow || 'all',
			level: filterLevel || '',
			kind: filterKind || '',
			country: filterCc || '',
			q,
		},
		summary: {
			totalCountries: countries.length,
			totalSites,
			withFindings,
			cleanSites,
			totalFindings,
			byLevel: byLevelTotal,
			byKind: byKindTotal,
			byWindow: byWindowTotal,
		},
		countries,
	};
}

module.exports = {
	RANGE_DAYS,
	parseRange,
	buildGlobalMapPayload,
	loadGlobalMapPayload,
	resetGlobalMapCache,
	buildDeskMapData,
};
