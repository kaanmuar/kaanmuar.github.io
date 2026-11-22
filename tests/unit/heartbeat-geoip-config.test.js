const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const load = () => import('../../workers/shared/ops-bindings.js');
const root = path.join(__dirname, '../..');

test('geoipR2Bindings is empty when bucket unset (local soft-fail)', async () => {
	const { geoipR2Bindings, assertGeoipConfigShape } = await load();
	assert.deepEqual(geoipR2Bindings(undefined), []);
	assert.deepEqual(geoipR2Bindings(''), []);
	assert.deepEqual(geoipR2Bindings('  '), []);
	assert.deepEqual(assertGeoipConfigShape({ enabled: false, bindings: [] }), { ok: true, skipped: true });
});

test('geoipR2Bindings uses binding name GEOIP when enabled', async () => {
	const { geoipR2Bindings, GEOIP_BINDING_NAME, assertGeoipConfigShape } = await load();
	const bindings = geoipR2Bindings('qa-lab-geoip');
	assert.deepEqual(bindings, [{ type: 'r2_bucket', name: GEOIP_BINDING_NAME, bucket_name: 'qa-lab-geoip' }]);
	const ok = assertGeoipConfigShape({ enabled: true, bindings });
	assert.equal(ok.ok, true);
	assert.equal(ok.binding.name, 'GEOIP');
});

test('assertGeoipConfigShape fails when enabled without GEOIP binding', async () => {
	const { assertGeoipConfigShape } = await load();
	const bad = assertGeoipConfigShape({
		enabled: true,
		bindings: [{ type: 'r2_bucket', name: 'WRONG', bucket_name: 'x' }],
	});
	assert.equal(bad.ok, false);
	assert.match(bad.error, /GEOIP/);
});

test('heartbeat secret names are documented (no values)', async () => {
	const { HEARTBEAT_SECRET_NAMES, UPTIME_OPTIONAL_NAMES } = await load();
	assert.ok(HEARTBEAT_SECRET_NAMES.includes('HEARTBEAT_OUTREACH_URL'));
	assert.ok(HEARTBEAT_SECRET_NAMES.includes('HEARTBEAT_UPTIME_URL'));
	assert.ok(UPTIME_OPTIONAL_NAMES.includes('UPTIME_ENDPOINTS'));
	for (const name of HEARTBEAT_SECRET_NAMES) {
		assert.match(name, /^HEARTBEAT_/);
	}
});

test('preflight cloudflare.config wires geoipR2Bindings (gated)', () => {
	const src = fs.readFileSync(path.join(root, 'workers/preflight/cloudflare.config.ts'), 'utf8');
	assert.match(src, /geoipR2Bindings/);
	assert.match(src, /GEOIP_BUCKET/);
	assert.doesNotMatch(src, /bucket_name:\s*["'][^"']+["']/); // no hard-coded bucket
});

test('workers/.env.example lists GeoIP and HEARTBEAT names without values', () => {
	const src = fs.readFileSync(path.join(root, 'workers/.env.example'), 'utf8');
	assert.match(src, /^GEOIP_BUCKET=$/m);
	assert.match(src, /^HEARTBEAT_OUTREACH_URL=$/m);
	assert.match(src, /^HEARTBEAT_UPTIME_URL=$/m);
	assert.doesNotMatch(src, /hc-ping\.com|sk_live|eyJ/);
});
