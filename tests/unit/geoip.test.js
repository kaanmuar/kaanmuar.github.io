const test = require('node:test');
const assert = require('node:assert/strict');

const load = () => import('../../workers/shared/geoip.js');

// --- Tiny MMDB writer (24-bit records, IPv6 tree) so the reader is tested without any real .mmdb file ---
const enc = new TextEncoder();
const str = (s) => { const b = enc.encode(s); return b.length < 29 ? [(2 << 5) | b.length, ...b] : [(2 << 5) | 29, b.length - 29, ...b]; };
const u32 = (n) => [(6 << 5) | 4, (n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const u16 = (n) => [(5 << 5) | 2, n >> 8, n & 255];
const map = (items) => [(7 << 5) | (items.length / 2), ...items.flat()]; // items: key, value, key, value, ...
function buildMmdb(nets, data) {
	// nets: [[ipv6 bytes (16), prefixBits, dataIndex]]; data: encoded records
	const nodes = [[null, null]];
	for (const [bytes, bits, idx] of nets) {
		let n = 0;
		for (let i = 0; i < bits; i++) {
			const bit = (bytes[i >> 3] >> (7 - (i & 7))) & 1;
			if (i === bits - 1) { nodes[n][bit] = { data: idx }; break; }
			if (nodes[n][bit] === null || typeof nodes[n][bit] !== 'number') { nodes.push([null, null]); nodes[n][bit] = nodes.length - 1; }
			n = nodes[n][bit];
		}
	}
	const nodeCount = nodes.length;
	const offsets = [];
	let at = 0;
	for (const d of data) { offsets.push(at); at += d.length; }
	const val = (r) => (r === null ? nodeCount : typeof r === 'number' ? r : nodeCount + 16 + offsets[r.data]);
	const tree = nodes.flatMap(([l, r]) => [l, r].flatMap((x) => { const v = val(x); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; }));
	const meta = map([
		str('node_count'), u32(nodeCount), str('record_size'), u16(24), str('ip_version'), u16(6),
		str('binary_format_major_version'), u16(2), str('database_type'), str('Test'),
	]);
	return Uint8Array.from([
		...tree, ...new Array(16).fill(0), ...data.flat(),
		0xab, 0xcd, 0xef, ...enc.encode('MaxMind.com'), ...meta,
	]);
}
const v4net = (a, b, c, d) => [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, a, b, c, d];

const countryDb = () => buildMmdb(
	[[v4net(8, 8, 0, 0), 96 + 16, 0], [v4net(81, 0, 0, 0), 96 + 8, 1],
		[[0x20, 0x01, 0x48, 0x60, ...new Array(12).fill(0)], 32, 0]],
	[map([str('country'), map([str('iso_code'), str('US')])]), map([str('country_code'), str('DE')])],
);
const asnDb = () => buildMmdb(
	[[v4net(8, 8, 0, 0), 96 + 16, 0]],
	[map([str('autonomous_system_number'), u32(15169), str('autonomous_system_organization'), str('GOOGLE')])],
);
const bucketOf = (files) => ({ gets: [], async get(key) { this.gets.push(key); const f = files[key]; return f ? { arrayBuffer: async () => f.buffer.slice(f.byteOffset, f.byteOffset + f.byteLength) } : null; } });

test('parseIp handles IPv4, IPv6, mapped and invalid input', async () => {
	const { parseIp } = await load();
	assert.deepEqual(parseIp('8.8.4.4'), [8, 8, 4, 4]);
	assert.deepEqual(parseIp('::ffff:1.2.3.4'), [1, 2, 3, 4]);
	assert.equal(parseIp('2001:db8::1').length, 16);
	assert.equal(parseIp('[2001:db8::1]')[15], 1);
	assert.equal(parseIp('2001:db8::')[15], 0);
	for (const bad of ['', 'x', '1.2.3', '256.1.1.1', '1:2:3', '::g', '1::2::3', null, undefined, 42]) assert.equal(parseIp(bad), null, String(bad));
});

test('parseMmdb finds IPv4 (under ::/96) and IPv6 records, null otherwise', async () => {
	const { parseMmdb } = await load();
	const db = parseMmdb(countryDb());
	assert.equal(db.metadata.ip_version, 6);
	assert.deepEqual(db.find('8.8.8.8'), { country: { iso_code: 'US' } });
	assert.deepEqual(db.find('::ffff:8.8.4.4'), { country: { iso_code: 'US' } });
	assert.deepEqual(db.find('81.2.3.4'), { country_code: 'DE' });
	assert.deepEqual(db.find('2001:4860::1'), { country: { iso_code: 'US' } });
	assert.equal(db.find('9.9.9.9'), null);
	assert.equal(db.find('not an ip'), null);
});

test('parseMmdb rejects garbage and truncated files', async () => {
	const { parseMmdb } = await load();
	assert.throws(() => parseMmdb(new Uint8Array(64)), /marker/);
	assert.throws(() => parseMmdb(countryDb().slice(0, 30)), /marker|truncated|bad/);
});

test('lookup returns country and ASN through an R2-like bucket and caches the readers', async () => {
	const { createGeoip, DEFAULT_COUNTRY_KEY, DEFAULT_ASN_KEY } = await load();
	const bucket = bucketOf({ [DEFAULT_COUNTRY_KEY]: countryDb(), [DEFAULT_ASN_KEY]: asnDb() });
	const geo = createGeoip({ bucket });
	assert.deepEqual(await geo.lookup('8.8.8.8'), { country: 'US', asn: 15169, asnOrg: 'GOOGLE' });
	assert.deepEqual(await geo.lookup('81.9.9.9'), { country: 'DE', asn: null, asnOrg: null });
	assert.equal(await geo.country('8.8.4.4'), 'US');
	assert.deepEqual(await geo.asn('8.8.4.4'), { asn: 15169, asnOrg: 'GOOGLE' });
	assert.equal(await geo.lookup('9.9.9.9'), null);
	assert.equal(bucket.gets.length, 2, 'each database is read from R2 once');
});

test('missing binding, missing object or bad database gives null, never a throw', async () => {
	const { createGeoip } = await load();
	for (const geo of [createGeoip(), createGeoip({ bucket: null }), createGeoip({ bucket: {} }),
		createGeoip({ bucket: bucketOf({}) }),
		createGeoip({ bucket: bucketOf({ 'geoip/iptoasn-country.mmdb': new Uint8Array([1, 2, 3]) }) }),
		createGeoip({ bucket: { get: async () => { throw new Error('r2 down'); } } }),
		createGeoip({ bucket: { get: () => { throw new Error('sync'); } } })]) {
		assert.equal(await geo.lookup('8.8.8.8'), null);
		assert.equal(await geo.country('8.8.8.8'), null);
		assert.equal(await geo.asn('8.8.8.8'), null);
	}
});

test('a mocked reader replaces the MMDB parser, and a failed load is retried after retryMs', async () => {
	const { createGeoip } = await load();
	let t = 1000;
	const files = {};
	const bucket = bucketOf(files);
	const opened = [];
	const openReader = (buf) => { opened.push(buf.byteLength); return { find: (ip) => (ip === '1.1.1.1' ? { country: { iso_code: 'au' }, autonomous_system_number: 13335 } : null) }; };
	const geo = createGeoip({ bucket, openReader, retryMs: 5000, now: () => t });
	assert.equal(await geo.lookup('1.1.1.1'), null, 'object missing');
	files['geoip/iptoasn-country.mmdb'] = new Uint8Array(4);
	files['geoip/iptoasn-asn.mmdb'] = new Uint8Array(4);
	t += 1000;
	assert.equal(await geo.lookup('1.1.1.1'), null, 'still cooling down, no R2 read');
	assert.equal(bucket.gets.length, 2);
	t += 5000;
	assert.deepEqual(await geo.lookup('1.1.1.1'), { country: 'AU', asn: 13335, asnOrg: null });
	assert.equal(opened.length, 2);
});

test('custom keys are honoured', async () => {
	const { createGeoip } = await load();
	const bucket = bucketOf({ 'x/c.mmdb': countryDb() });
	const geo = createGeoip({ bucket, countryKey: 'x/c.mmdb', asnKey: null });
	assert.deepEqual(await geo.lookup('8.8.8.8'), { country: 'US', asn: null, asnOrg: null });
});

test('geoip-fetch argument parsing and keys', async () => {
	const { parseArgs, keyFor, FILES } = await import('../../scripts/geoip-fetch.js');
	assert.deepEqual(parseArgs(['--bucket', 'b', '--dry-run'], {}), { bucket: 'b', prefix: 'geoip/', dryRun: true, keep: '' });
	assert.equal(parseArgs([], { GEOIP_BUCKET: 'env-b' }).bucket, 'env-b');
	assert.throws(() => parseArgs(['--nope'], {}), /unknown argument/);
	assert.deepEqual(FILES.map((f) => keyFor(f, 'geoip/')), ['geoip/iptoasn-country.mmdb', 'geoip/iptoasn-asn.mmdb']);
	assert.equal(keyFor(FILES[0], 'v2/'), 'v2/iptoasn-country.mmdb');
});
