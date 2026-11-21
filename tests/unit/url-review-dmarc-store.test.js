/**
 * DMARC consent store, withdraw deletes counts, and mail-inbound ingest gates on consent (#3777).
 *
 *   npm run test:review
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const zlib = require('zlib');
const { zipSync, strToU8 } = require(require.resolve('fflate', { paths: [path.join(__dirname, '../../functions')] }));

const auth = require('../../functions/url-review-auth');
const proof = require('../../functions/url-review-owner-proof');
const consent = require('../../functions/url-review-dmarc-consent');
const reports = require('../../functions/url-review-dmarc-reports');
const storeApi = require('../../functions/url-review-dmarc-store');
const inbound = require('../../functions/url-review-dmarc-inbound');

const NOW = Date.parse('2026-11-20T12:00:00Z');
const EMAIL = 'owner@shop.example.com';
const HOST = 'shop.example.com';
const DAY = 864e5;

function dmarcXml() {
	const begin = String(Math.floor(Date.parse('2026-11-01T00:00:00Z') / 1000));
	return (
		'<?xml version="1.0"?><feedback><report_metadata><org_name>receiver.example.net</org_name>' +
		'<email>noreply@receiver.example.net</email><report_id>secret-id</report_id>' +
		'<date_range><begin>' +
		begin +
		'</begin><end>' +
		begin +
		'</end></date_range></report_metadata>' +
		'<policy_published><domain>shop.example.com</domain><p>none</p><pct>100</pct></policy_published>' +
		'<record><row><source_ip>192.0.2.10</source_ip><count>12</count>' +
		'<policy_evaluated><disposition>none</disposition><dkim>pass</dkim><spf>pass</spf></policy_evaluated></row>' +
		'<identifiers><header_from>shop.example.com</header_from></identifiers></record></feedback>'
	);
}

function tlsJson() {
	return JSON.stringify({
		'organization-name': 'Receiver Example',
		'date-range': { 'start-datetime': '2026-11-03T00:00:00Z' },
		policies: [
			{
				policy: { 'policy-domain': 'shop.example.com' },
				summary: { 'total-successful-session-count': 40, 'total-failure-session-count': 2 },
			},
		],
	});
}

function siteProof(email, host) {
	return proof.siteRecord({ email, host, how: 'dns' }, NOW);
}

test.describe('consent store (#3777)', () => {
	test('setConsent on needs proof + current notice; withdraw deletes counts', async () => {
		const store = auth.memoryStore();
		const proofs = [siteProof(EMAIL, HOST)];
		const denied = await storeApi.setConsent(
			store,
			{ email: EMAIL, host: HOST, accept: true, noticeVersion: consent.NOTICE_VERSION },
			[],
			NOW
		);
		assert.equal(denied.ok, false);
		assert.equal(denied.status, 403);

		const on = await storeApi.setConsent(
			store,
			{ email: EMAIL, host: HOST, accept: true, noticeVersion: consent.NOTICE_VERSION },
			proofs,
			NOW
		);
		assert.equal(on.ok, true);
		assert.equal(on.consent.on, true);
		assert.equal(on.proofKind, 'site');

		const agg = reports.parseDmarcAggregate(dmarcXml());
		await storeApi.saveAggregate(store, EMAIL, HOST, agg, NOW);
		const before = await storeApi.loadAggregates(store, EMAIL, HOST);
		assert.equal(before.dmarc[0].days['2026-11-01'].messages, 12);

		const off = await storeApi.setConsent(
			store,
			{ email: EMAIL, host: HOST, accept: false },
			proofs,
			NOW + DAY
		);
		assert.equal(off.ok, true);
		assert.equal(off.consent.on, false);
		assert.equal(off.deleted, 1);
		const after = await storeApi.loadAggregates(store, EMAIL, HOST);
		assert.deepEqual(after.dmarc, []);
		assert.equal(await store.get(consent.COLLECTION, consent.docId(EMAIL, HOST)).then((r) => r.on), false);
	});

	test('counts merge and never keep message-level fields from the fixture', async () => {
		const store = auth.memoryStore();
		const first = reports.parseDmarcAggregate(dmarcXml());
		await storeApi.saveAggregate(store, EMAIL, HOST, first, NOW);
		await storeApi.saveAggregate(store, EMAIL, HOST, first, NOW + DAY);
		const { dmarc } = await storeApi.loadAggregates(store, EMAIL, HOST);
		assert.equal(dmarc[0].days['2026-11-01'].messages, 24);
		const dump = JSON.stringify(dmarc[0]);
		assert.ok(!dump.includes('secret-id'));
		assert.ok(!dump.includes('noreply@'));
		assert.ok(!dump.includes('receiver.example.net'));
	});
});

test.describe('mail-inbound report ingest (#3777)', () => {
	test('parses gzip and zip fixtures and counts only with consent + proof', async () => {
		const store = auth.memoryStore();
		const xml = dmarcXml();
		const gz = zlib.gzipSync(Buffer.from(xml));
		const zip = Buffer.from(zipSync({ 'google.com!shop.example.com!1!2.xml': strToU8(xml) }));
		assert.equal(inbound.looksLikeReport({ subject: 'Report Domain: shop.example.com', text: '' }), true);
		assert.equal(inbound.looksLikeReport({ subject: 'Hello', attachments: [{ filename: 'a.xml.gz', content: gz.toString('base64') }] }), true);

		const noConsent = await inbound.ingest(
			{ subject: 'DMARC Aggregate Report', attachments: [{ filename: 'r.xml.gz', content: gz.toString('base64') }] },
			{ store, proofsFor: async () => [siteProof(EMAIL, HOST)], now: NOW }
		);
		assert.equal(noConsent.outcome, 'no-consent');

		await storeApi.setConsent(
			store,
			{ email: EMAIL, host: HOST, accept: true, noticeVersion: consent.NOTICE_VERSION },
			[siteProof(EMAIL, HOST)],
			NOW
		);
		const counted = await inbound.ingest(
			{ subject: 'Report Domain: shop.example.com', attachments: [{ filename: 'r.zip', content: zip.toString('base64') }] },
			{ store, proofsFor: async () => [siteProof(EMAIL, HOST)], now: NOW }
		);
		assert.equal(counted.outcome, 'counted');
		assert.deepEqual(counted.kinds, ['dmarc']);
		assert.equal(counted.domain, HOST);
		const loaded = await storeApi.loadAggregates(store, EMAIL, HOST);
		assert.equal(loaded.dmarc[0].sources['2026-11-01|192.0.2.10'].messages, 12);

		const tls = await inbound.ingest(
			{
				subject: 'TLS-RPT for shop.example.com',
				text: tlsJson(),
			},
			{ store, proofsFor: async () => [siteProof(EMAIL, HOST)], now: NOW }
		);
		assert.equal(tls.outcome, 'counted');
		assert.ok(tls.kinds.includes('tlsrpt'));
		const both = await storeApi.loadAggregates(store, EMAIL, HOST);
		assert.equal(both.tls[0].days['2026-11-03'].messages, 42);

		const dump = JSON.stringify(both);
		assert.ok(!dump.includes('Receiver Example'));
		assert.ok(!dump.includes('secret-id'));
	});

	test('not a report leaves the store alone', async () => {
		const store = auth.memoryStore();
		const out = await inbound.ingest(
			{ subject: 'Your TikTok verification code', text: 'code 123456' },
			{ store, proofsFor: async () => [], now: NOW }
		);
		assert.equal(out.outcome, 'not-report');
	});
});
