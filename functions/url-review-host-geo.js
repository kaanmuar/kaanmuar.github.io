'use strict';

/* Hosting IP, Country (DB-IP Country Lite, CC BY 4.0) and ASN lookup (Team Cymru DNS + Cloudflare DoH fallback).
   Commercial-safe: DB-IP Country Lite is CC BY 4.0 ("IP Geolocation by DB-IP", https://db-ip.com).
   Team Cymru DNS is used strictly for ASN/prefix/provider names, never for physical geolocation. */

const dns = require('dns').promises;
const net = require('net');
const zlib = require('zlib');
const { ipBlocked } = require('./url-review-ip');

const BUCKET = 'carlosm-interactive-cv.firebasestorage.app';
const DBIP_OBJECT = 'geo/dbip-country.json.gz';
const DBIP_ATTRIBUTION = 'IP Geolocation by DB-IP (https://db-ip.com)';
const CACHE_TTL_MS = 12 * 3600 * 1000;
const MISSING_TTL_MS = 30 * 60 * 1000;
const REFRESH_MAX_AGE_MS = 20 * 24 * 3600 * 1000;
const DOH_URL = 'https://cloudflare-dns.com/dns-query';
const DNS_TIMEOUT_MS = 4000;

let memIndex = null;
let memUntil = 0;

function withTimeout(promise, ms, fallback) {
	let timer = null;
	return Promise.race([
		promise,
		new Promise((resolve) => {
			timer = setTimeout(() => resolve(fallback), ms);
		}),
	]).finally(() => {
		if (timer) clearTimeout(timer);
	});
}

function ip4ToInt(ip) {
	const s = String(ip || '').trim();
	const parts = s.split('.');
	if (parts.length !== 4) return -1;
	let out = 0;
	for (let i = 0; i < 4; i += 1) {
		if (!/^\d{1,3}$/.test(parts[i])) return -1;
		const n = Number(parts[i]);
		if (n < 0 || n > 255) return -1;
		out = out * 256 + n;
	}
	return out >>> 0;
}

function reverseIp4(ip) {
	return String(ip || '')
		.split('.')
		.reverse()
		.join('.');
}

function reverseIp6(ip) {
	const full = String(ip || '').toLowerCase();
	const halves = full.split('::');
	if (halves.length > 2) return '';
	const left = halves[0] ? halves[0].split(':').filter(Boolean) : [];
	const right = halves[1] ? halves[1].split(':').filter(Boolean) : [];
	const missing = 8 - (left.length + right.length);
	if (missing < 0) return '';
	const groups = left.concat(Array(missing).fill('0'), right).map((g) => g.padStart(4, '0'));
	if (groups.length !== 8) return '';
	return groups.join('').split('').reverse().join('.');
}

// Compact IPv4 sorted range table from DB-IP Country Lite CSV (`start,end,cc`).
function buildDbipIndex(csvText, version) {
	const lines = String(csvText || '').split(/\r?\n/);
	const ccs = [];
	const ccMap = new Map();
	const ranges = [];
	for (let i = 0; i < lines.length; i += 1) {
		const line = lines[i].trim();
		if (!line || line.startsWith('#')) continue;
		const parts = line.split(',');
		if (parts.length < 3) continue;
		const a = parts[0].trim();
		const b = parts[1].trim();
		const cc = parts[2].trim().toUpperCase();
		if (!/^[A-Z]{2}$/.test(cc) || cc === 'ZZ') continue;
		if (a.includes(':')) continue;
		const start = ip4ToInt(a);
		const end = ip4ToInt(b);
		if (start < 0 || end < start) continue;
		let idx = ccMap.get(cc);
		if (idx === undefined) {
			idx = ccs.length;
			ccs.push(cc);
			ccMap.set(cc, idx);
		}
		ranges.push([start, end, idx]);
	}
	ranges.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
	const flat = new Uint32Array(ranges.length * 3);
	for (let i = 0; i < ranges.length; i += 1) {
		flat[i * 3] = ranges[i][0];
		flat[i * 3 + 1] = ranges[i][1];
		flat[i * 3 + 2] = ranges[i][2];
	}
	return {
		version: version || new Date().toISOString().slice(0, 7),
		source: 'DB-IP Lite',
		attribution: DBIP_ATTRIBUTION,
		count: ranges.length,
		ccs,
		v4: Buffer.from(flat.buffer).toString('base64'),
	};
}

function decodeDbipIndex(raw) {
	if (!raw || !raw.v4 || !Array.isArray(raw.ccs)) return null;
	const buf = Buffer.from(raw.v4, 'base64');
	const count = Math.floor(buf.byteLength / 12);
	const view = new Uint32Array(buf.buffer, buf.byteOffset, count * 3);
	return {
		version: raw.version || '',
		source: raw.source || 'DB-IP Lite',
		attribution: raw.attribution || DBIP_ATTRIBUTION,
		ccs: raw.ccs,
		view,
		count,
	};
}

function lookupIpCountry(ip, index) {
	const num = ip4ToInt(ip);
	if (num < 0 || !index) return '';
	const decoded = index.view ? index : decodeDbipIndex(index);
	if (!decoded || !decoded.count) return '';
	const view = decoded.view;
	let lo = 0;
	let hi = decoded.count - 1;
	while (lo <= hi) {
		const mid = (lo + hi) >>> 1;
		const base = mid * 3;
		const start = view[base];
		const end = view[base + 1];
		if (num < start) hi = mid - 1;
		else if (num > end) lo = mid + 1;
		else return decoded.ccs[view[base + 2]] || '';
	}
	return '';
}

async function dohResolve(hostname, type, fetchImpl) {
	const fn = fetchImpl || global.fetch;
	if (typeof fn !== 'function') return [];
	try {
		const url = DOH_URL + '?name=' + encodeURIComponent(hostname) + '&type=' + encodeURIComponent(type);
		const res = await fn(url, {
			headers: { accept: 'application/dns-json' },
			signal: AbortSignal.timeout(DNS_TIMEOUT_MS),
		});
		if (!res || !res.ok) return [];
		const data = await res.json();
		const want = type === 'AAAA' ? 28 : 1;
		return (Array.isArray(data && data.Answer) ? data.Answer : [])
			.filter((a) => a && a.type === want && a.data)
			.map((a) => String(a.data).trim());
	} catch (error) {
		return [];
	}
}

async function resolveHostIps(hostname, options) {
	const opts = options || {};
	const host = String(hostname || '')
		.trim()
		.toLowerCase()
		.replace(/\.$/, '');
	if (!host) return { ipv4: [], ipv6: [] };
	if (net.isIPv4(host)) return { ipv4: ipBlocked(host) ? [] : [host], ipv6: [] };
	if (net.isIPv6(host)) return { ipv4: [], ipv6: ipBlocked(host) ? [] : [host] };

	const resolver = opts.resolver || dns;
	const fetchImpl = opts.fetch;
	let v4 = [];
	let v6 = [];
	if (resolver && typeof resolver.resolve4 === 'function') {
		const [r4, r6] = await Promise.all([
			withTimeout(
				resolver.resolve4(host).catch(() => []),
				DNS_TIMEOUT_MS,
				[]
			),
			typeof resolver.resolve6 === 'function'
				? withTimeout(
						resolver.resolve6(host).catch(() => []),
						DNS_TIMEOUT_MS,
						[]
					)
				: Promise.resolve([]),
		]);
		v4 = Array.isArray(r4) ? r4 : [];
		v6 = Array.isArray(r6) ? r6 : [];
	}
	if (!v4.length && fetchImpl !== false) {
		v4 = await dohResolve(host, 'A', fetchImpl);
	}
	if (!v6.length && !v4.length && fetchImpl !== false) {
		v6 = await dohResolve(host, 'AAAA', fetchImpl);
	}
	return {
		ipv4: [...new Set(v4.map(String).filter((ip) => net.isIPv4(ip) && !ipBlocked(ip)))].slice(0, 6),
		ipv6: [...new Set(v6.map(String).filter((ip) => net.isIPv6(ip) && !ipBlocked(ip)))].slice(0, 4),
	};
}

async function lookupAsn(ip, options) {
	const opts = options || {};
	const addr = String(ip || '').trim();
	const family = net.isIP(addr);
	if (!family) return null;
	const query = family === 6 ? reverseIp6(addr) + '.origin6.asn.cymru.com' : reverseIp4(addr) + '.origin.asn.cymru.com';
	const resolver = opts.resolver || dns;
	if (!resolver || typeof resolver.resolveTxt !== 'function' || !query || query.startsWith('.')) return null;
	try {
		const rows = await withTimeout(
			resolver.resolveTxt(query).catch(() => []),
			DNS_TIMEOUT_MS,
			[]
		);
		const line = Array.isArray(rows) && rows[0] ? (Array.isArray(rows[0]) ? rows[0].join('') : String(rows[0])) : '';
		if (!line) return null;
		// Format: "ASN | Prefix | CC | RIR | Date"
		const parts = line.split('|').map((p) => p.trim());
		const asn = Number(String(parts[0] || '').split(/\s+/)[0]);
		if (!Number.isInteger(asn) || asn <= 0) return null;
		const prefix = parts[1] || '';
		let asName = '';
		try {
			const nameRows = await withTimeout(
				resolver.resolveTxt('AS' + asn + '.asn.cymru.com').catch(() => []),
				DNS_TIMEOUT_MS,
				[]
			);
			const nameLine =
				Array.isArray(nameRows) && nameRows[0]
					? Array.isArray(nameRows[0])
						? nameRows[0].join('')
						: String(nameRows[0])
					: '';
			const nameParts = nameLine.split('|').map((p) => p.trim());
			if (nameParts.length >= 5) asName = nameParts.slice(4).join(' ').slice(0, 120);
			else if (nameParts.length >= 1) asName = nameParts[nameParts.length - 1].slice(0, 120);
		} catch (error) {
			/* AS name is optional */
		}
		return { asn, prefix, asName };
	} catch (error) {
		return null;
	}
}

async function loadDbipIndex(options) {
	const opts = options || {};
	if (opts.index) return opts.index.view ? opts.index : decodeDbipIndex(opts.index);
	const now = opts.now || Date.now();
	if (memIndex && now < memUntil) return memIndex;
	try {
		const storage = opts.storage || require('firebase-admin/storage').getStorage();
		const file = storage.bucket(BUCKET).file(DBIP_OBJECT);
		const [exists] = await file.exists();
		if (!exists) {
			memIndex = null;
			memUntil = now + MISSING_TTL_MS;
			return null;
		}
		const [buf] = await file.download();
		const raw = JSON.parse(zlib.gunzipSync(buf).toString('utf8'));
		const decoded = decodeDbipIndex(raw);
		memIndex = decoded;
		memUntil = now + CACHE_TTL_MS;
		return decoded;
	} catch (error) {
		memUntil = now + MISSING_TTL_MS;
		return null;
	}
}

async function refreshDbipIndex(options) {
	const opts = options || {};
	const now = opts.now || Date.now();
	const storage = opts.storage || require('firebase-admin/storage').getStorage();
	const file = storage.bucket(BUCKET).file(DBIP_OBJECT);
	if (!opts.force) {
		try {
			const [exists] = await file.exists();
			if (exists) {
				const [meta] = await file.getMetadata();
				const age = now - Date.parse(meta.updated || 0);
				if (age < REFRESH_MAX_AGE_MS) return { skipped: 'fresh', days: Math.round(age / 86400000) };
			}
		} catch (error) {
			/* continue */
		}
	}
	const fetchImpl = opts.fetch || global.fetch;
	const d = new Date(now);
	const ym = (dt) => dt.getUTCFullYear() + '-' + String(dt.getUTCMonth() + 1).padStart(2, '0');
	const prev = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1));
	const candidates = [ym(d), ym(prev)];
	let chosen = null;
	let csv = '';
	for (const ver of candidates) {
		const url = 'https://download.db-ip.com/free/dbip-country-lite-' + ver + '.csv.gz';
		try {
			const res = await fetchImpl(url, { signal: AbortSignal.timeout(45000) });
			if (!res || !res.ok) continue;
			const gz = Buffer.from(await res.arrayBuffer());
			csv = zlib.gunzipSync(gz).toString('utf8');
			chosen = ver;
			break;
		} catch (error) {
			/* try previous month */
		}
	}
	if (!chosen || !csv) return { skipped: 'download failed' };
	const built = buildDbipIndex(csv, chosen);
	if (built.count < 1000) return { skipped: 'too few rows', count: built.count };
	const payload = zlib.gzipSync(Buffer.from(JSON.stringify(built)));
	await file.save(payload, { contentType: 'application/gzip', resumable: false });
	memIndex = decodeDbipIndex(built);
	memUntil = now + CACHE_TTL_MS;
	return { ok: true, version: chosen, count: built.count, bytes: payload.length };
}

async function inspectHostGeo(hostname, options) {
	const opts = options || {};
	const ips = await resolveHostIps(hostname, opts);
	const ip = ips.ipv4[0] || ips.ipv6[0] || '';
	if (!ip) return { ip: '', ips: [], country: '', asn: 0, asName: '', prefix: '', source: '', attribution: '' };
	const [index, asnInfo] = await Promise.all([loadDbipIndex(opts), lookupAsn(ip, opts)]);
	const country = ips.ipv4[0] && index ? lookupIpCountry(ips.ipv4[0], index) : '';
	return {
		ip,
		ips: ips.ipv4.concat(ips.ipv6),
		country,
		asn: asnInfo ? asnInfo.asn : 0,
		asName: asnInfo ? asnInfo.asName : '',
		prefix: asnInfo ? asnInfo.prefix : '',
		source: country ? 'DB-IP Lite' : '',
		attribution: country ? DBIP_ATTRIBUTION : '',
	};
}

// FIPS-10-4 (used by GDELT V2Locations) -> ISO 3166-1 alpha-2.
const FIPS_TO_ISO = {
	AF: 'AF',
	AL: 'AL',
	AG: 'DZ',
	AQ: 'AS',
	AN: 'AD',
	AO: 'AO',
	AV: 'AI',
	AC: 'AG',
	AR: 'AR',
	AM: 'AM',
	AA: 'AW',
	AS: 'AU',
	AU: 'AT',
	AJ: 'AZ',
	BF: 'BS',
	BA: 'BH',
	BG: 'BD',
	BB: 'BB',
	BO: 'BY',
	BE: 'BE',
	BH: 'BZ',
	BN: 'BJ',
	BD: 'BM',
	BT: 'BT',
	BL: 'BO',
	BK: 'BA',
	BC: 'BW',
	BR: 'BR',
	BX: 'BN',
	BU: 'BG',
	UV: 'BF',
	BM: 'MM',
	BY: 'BI',
	CB: 'KH',
	CM: 'CM',
	CA: 'CA',
	CV: 'CV',
	CJ: 'KY',
	CT: 'CF',
	CD: 'TD',
	CI: 'CL',
	CH: 'CN',
	CO: 'CO',
	CN: 'KM',
	CF: 'CG',
	CG: 'CD',
	CW: 'CK',
	CS: 'CR',
	IV: 'CI',
	HR: 'HR',
	CU: 'CU',
	CY: 'CY',
	EZ: 'CZ',
	DA: 'DK',
	DJ: 'DJ',
	DO: 'DM',
	DR: 'DO',
	EC: 'EC',
	EG: 'EG',
	ES: 'SV',
	EK: 'GQ',
	ER: 'ER',
	EN: 'EE',
	ET: 'ET',
	FJ: 'FJ',
	FI: 'FI',
	FR: 'FR',
	FP: 'PF',
	GB: 'GA',
	GA: 'GM',
	GG: 'GE',
	GM: 'DE',
	GH: 'GH',
	GI: 'GI',
	GR: 'GR',
	GL: 'GL',
	GJ: 'GD',
	GQ: 'GU',
	GT: 'GT',
	GV: 'GN',
	PU: 'GW',
	GY: 'GY',
	HA: 'HT',
	HO: 'HN',
	HK: 'HK',
	HU: 'HU',
	IC: 'IS',
	IN: 'IN',
	ID: 'ID',
	IR: 'IR',
	IZ: 'IQ',
	EI: 'IE',
	IS: 'IL',
	IT: 'IT',
	JM: 'JM',
	JA: 'JP',
	JO: 'JO',
	KZ: 'KZ',
	KE: 'KE',
	KR: 'KI',
	KN: 'KP',
	KS: 'KR',
	KU: 'KW',
	KG: 'KG',
	LA: 'LA',
	LG: 'LV',
	LE: 'LB',
	LT: 'LS',
	LI: 'LR',
	LY: 'LY',
	LS: 'LI',
	LH: 'LT',
	LU: 'LU',
	MC: 'MO',
	MK: 'MK',
	MA: 'MG',
	MI: 'MW',
	MY: 'MY',
	MV: 'MV',
	ML: 'ML',
	MT: 'MT',
	RM: 'MH',
	MR: 'MR',
	MP: 'MU',
	MX: 'MX',
	FM: 'FM',
	MD: 'MD',
	MN: 'MC',
	MG: 'MN',
	MJ: 'ME',
	MO: 'MA',
	MZ: 'MZ',
	WA: 'NA',
	NR: 'NR',
	NP: 'NP',
	NL: 'NL',
	NC: 'NC',
	NZ: 'NZ',
	NU: 'NI',
	NG: 'NE',
	NI: 'NG',
	NO: 'NO',
	MU: 'OM',
	PK: 'PK',
	PS: 'PW',
	PM: 'PA',
	PP: 'PG',
	PA: 'PY',
	PE: 'PE',
	RP: 'PH',
	PL: 'PL',
	PO: 'PT',
	QA: 'QA',
	RO: 'RO',
	RS: 'RU',
	RW: 'RW',
	SC: 'KN',
	ST: 'LC',
	VC: 'VC',
	WS: 'WS',
	SM: 'SM',
	TP: 'ST',
	SA: 'SA',
	SG: 'SN',
	RI: 'RS',
	SE: 'SC',
	SL: 'SL',
	SN: 'SG',
	LO: 'SK',
	SI: 'SI',
	BP: 'SB',
	SO: 'SO',
	SF: 'ZA',
	OD: 'SS',
	SP: 'ES',
	CE: 'LK',
	SU: 'SD',
	NS: 'SR',
	WZ: 'SZ',
	SW: 'SE',
	SZ: 'CH',
	SY: 'SY',
	TW: 'TW',
	TI: 'TJ',
	TZ: 'TZ',
	TH: 'TH',
	TT: 'TL',
	TO: 'TG',
	TN: 'TO',
	TD: 'TT',
	TS: 'TN',
	TU: 'TR',
	TX: 'TM',
	TV: 'TV',
	UG: 'UG',
	UP: 'UA',
	AE: 'AE',
	UK: 'GB',
	US: 'US',
	UY: 'UY',
	UZ: 'UZ',
	NH: 'VU',
	VT: 'VA',
	VE: 'VE',
	VM: 'VN',
	YM: 'YE',
	ZA: 'ZM',
	ZI: 'ZW',
	KV: 'XK',
	GJ_P: 'PS',
};

function fipsToIso2(fips) {
	const code = String(fips || '')
		.trim()
		.toUpperCase();
	if (!/^[A-Z]{2}$/.test(code)) return '';
	return FIPS_TO_ISO[code] || '';
}

module.exports = {
	BUCKET,
	DBIP_OBJECT,
	DBIP_ATTRIBUTION,
	ip4ToInt,
	buildDbipIndex,
	decodeDbipIndex,
	lookupIpCountry,
	resolveHostIps,
	lookupAsn,
	loadDbipIndex,
	refreshDbipIndex,
	inspectHostGeo,
	fipsToIso2,
};
