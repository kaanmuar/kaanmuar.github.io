const test = require('node:test');
const assert = require('node:assert/strict');

const core = require('../../functions/url-review-core');
const insights = require('../../functions/url-review-insights');
const proof = require('../../functions/url-review-owner-proof');
const reports = require('../../functions/url-review-dmarc-reports');
const consent = require('../../functions/url-review-dmarc-consent');
const storeApi = require('../../functions/url-review-dmarc-store');
const auth = require('../../functions/url-review-auth');
const publish = require('../../functions/url-review-publish');
const { EN, render } = require('../../functions/url-review-findings-en');

// Invented fixtures: example domains and documentation IP ranges (RFC 5737, RFC 3849). No real report is in the repo.
const NOW = Date.parse('2026-11-20T12:00:00Z');
const DAY = 864e5;
const BEGIN = (i) => String(Math.floor((Date.parse('2026-11-01T00:00:00Z') + i * DAY) / 1000));

function record(ip, n, disposition, dkim, spf) {
	return (
		'<record><row><source_ip>' + ip + '</source_ip><count>' + n + '</count><policy_evaluated><disposition>' + disposition +
		'</disposition><dkim>' + dkim + '</dkim><spf>' + spf + '</spf></policy_evaluated></row>' +
		'<identifiers><envelope_to>secret-recipient@mail.example.net</envelope_to><header_from>shop.example.com</header_from></identifiers>' +
		'<auth_results><dkim><domain>shop.example.com</domain><selector>private-selector</selector><result>pass</result></dkim>' +
		'<spf><domain>bounce.example.com</domain><result>pass</result></spf></auth_results></record>'
	);
}

function dmarcXml(dayIndex, records, policy) {
	return (
		'<?xml version="1.0" encoding="UTF-8" ?><feedback><version>1.0</version>' +
		'<report_metadata><org_name>receiver.example.net</org_name><email>noreply-dmarc@receiver.example.net</email>' +
		'<report_id>abc-secret-report-id-123</report_id><date_range><begin>' + BEGIN(dayIndex) + '</begin><end>' + BEGIN(dayIndex + 1) + '</end></date_range></report_metadata>' +
		'<policy_published><domain>shop.example.com</domain><adkim>r</adkim><aspf>r</aspf>' + (policy || '<p>none</p><pct>100</pct>') + '</policy_published>' +
		records.join('') + '</feedback>'
	);
}

// Seven days: the shop's mailer (clean) and, optionally, a second source.
function week(extra, policy) {
	const list = [];
	for (let i = 0; i < 7; i++) {
		const rows = [record('192.0.2.10', 40, 'none', 'pass', 'pass')];
		if (extra) rows.push(record(extra.ip, extra.n, extra.disposition || 'none', extra.dkim, extra.spf));
		list.push(reports.parseDmarcAggregate(dmarcXml(i, rows, policy)));
	}
	return list;
}

test.describe('DMARC aggregate parser (#3777)', () => {
	test('keeps per-source-IP-per-day counts, dispositions, pass/fail and failure types', () => {
		const agg = reports.parseDmarcAggregate(
			dmarcXml(0, [
				record('192.0.2.10', 40, 'none', 'pass', 'pass'),
				record('198.51.100.7', 5, 'quarantine', 'fail', 'fail'),
				record('2001:db8::25', 3, 'none', 'pass', 'fail'),
			])
		);
		assert.equal(agg.kind, 'dmarc');
		assert.equal(agg.domain, 'shop.example.com');
		assert.deepEqual(agg.policy, { p: 'none', pct: 100 });
		assert.deepEqual(agg.days['2026-11-01'], {
			messages: 48,
			pass: 43,
			fail: 5,
			disposition: { none: 43, quarantine: 5, reject: 0 },
			failureTypes: { 'dkim-fail': 5, 'spf-fail': 8 },
		});
		assert.deepEqual(agg.sources['2026-11-01|198.51.100.7'], { ip: '198.51.100.7', day: '2026-11-01', messages: 5, pass: 0, fail: 5 });
		assert.equal(agg.sources['2026-11-01|2001:db8::25'].pass, 3);
	});

	test('drops everything message-level: the result holds no subject, address, id or selector', () => {
		const agg = reports.parseDmarcAggregate(dmarcXml(0, [record('192.0.2.10', 4, 'none', 'pass', 'pass')]));
		const dump = JSON.stringify(agg);
		for (const secret of ['secret-recipient', 'mail.example.net', 'private-selector', 'abc-secret-report-id', 'noreply-dmarc', 'receiver.example.net', 'bounce.example.com']) {
			assert.ok(!dump.includes(secret), secret + ' must not survive parsing');
		}
		assert.deepEqual(Object.keys(agg).sort(), ['days', 'domain', 'kind', 'policy', 'sources']);
	});

	test('refuses entities, doctype, junk, oversize and reports with nothing countable', () => {
		const ok = dmarcXml(0, [record('192.0.2.10', 4, 'none', 'pass', 'pass')]);
		assert.ok(reports.parseDmarcAggregate(ok));
		assert.equal(reports.parseDmarcAggregate('<!DOCTYPE feedback [<!ENTITY a "b">]>' + ok), null);
		assert.equal(reports.parseDmarcAggregate('not xml'), null);
		assert.equal(reports.parseDmarcAggregate(''), null);
		assert.equal(reports.parseDmarcAggregate(null), null);
		assert.equal(reports.parseDmarcAggregate(ok + ' '.repeat(5 * 1024 * 1024)), null);
		assert.equal(reports.parseDmarcAggregate(dmarcXml(0, [record('192.0.2.10', 0, 'none', 'pass', 'pass')])), null);
		assert.equal(reports.parseDmarcAggregate(dmarcXml(0, [record('192.0.2.10', 'many', 'none', 'pass', 'pass')])), null);
	});

	test('a bad source IP still counts toward the day but gets no source row', () => {
		const agg = reports.parseDmarcAggregate(dmarcXml(0, [record('not-an-ip', 6, 'none', 'pass', 'pass')]));
		assert.equal(agg.days['2026-11-01'].messages, 6);
		assert.deepEqual(agg.sources, {});
	});

	test('a pathological report is read in linear time', () => {
		const start = Date.now();
		reports.parseDmarcAggregate('<feedback><date_range><begin>1</begin></date_range>' + '<record><row>'.repeat(50000));
		reports.parseDmarcAggregate(dmarcXml(0, []).replace('</feedback>', '<record>'.repeat(100000) + '</feedback>'));
		assert.ok(Date.now() - start < 1500);
	});
});

test.describe('TLS-RPT parser (#3777)', () => {
	const tls = (over) =>
		JSON.stringify(
			Object.assign(
				{
					'organization-name': 'Receiver Example',
					'date-range': { 'start-datetime': '2026-11-03T00:00:00Z', 'end-datetime': '2026-11-03T23:59:59Z' },
					'contact-info': 'tlsrpt@receiver.example.net',
					'report-id': 'secret-tls-report-id',
					policies: [
						{
							policy: { 'policy-type': 'sts', 'policy-string': ['version: STSv1'], 'policy-domain': 'shop.example.com', 'mx-host': ['mx.shop.example.com'] },
							summary: { 'total-successful-session-count': 480, 'total-failure-session-count': 20 },
							'failure-details': [
								{ 'result-type': 'certificate-expired', 'sending-mta-ip': '203.0.113.9', 'receiving-mx-hostname': 'mx.shop.example.com', 'receiving-ip': '192.0.2.99', 'failed-session-count': 15 },
								{ 'result-type': 'starttls-not-supported', 'sending-mta-ip': '203.0.113.9', 'failed-session-count': 5 },
							],
						},
					],
				},
				over
			)
		);

	test('keeps session totals, failure types and per-sending-IP-per-day failures only', () => {
		const agg = reports.parseTlsRpt(tls());
		assert.equal(agg.kind, 'tlsrpt');
		assert.equal(agg.domain, 'shop.example.com');
		assert.deepEqual(agg.days['2026-11-03'], {
			messages: 500,
			pass: 480,
			fail: 20,
			disposition: { none: 0, quarantine: 0, reject: 0 },
			failureTypes: { 'certificate-expired': 15, 'starttls-not-supported': 5 },
		});
		assert.deepEqual(agg.sources['2026-11-03|203.0.113.9'], { ip: '203.0.113.9', day: '2026-11-03', messages: 20, pass: 0, fail: 20 });
		const dump = JSON.stringify(agg);
		for (const secret of ['secret-tls-report-id', 'tlsrpt@receiver', 'mx.shop.example.com', '192.0.2.99', 'Receiver Example']) assert.ok(!dump.includes(secret), secret);
	});

	test('accepts a parsed object, refuses junk and an unknown result type becomes "other"', () => {
		assert.ok(reports.parseTlsRpt(JSON.parse(tls())));
		assert.equal(reports.parseTlsRpt('{nope'), null);
		assert.equal(reports.parseTlsRpt('{"policies": []}'), null);
		assert.equal(reports.parseTlsRpt(null), null);
		const odd = JSON.parse(tls());
		odd.policies[0]['failure-details'][0]['result-type'] = 'Some Free Text <script>';
		assert.equal(reports.parseTlsRpt(odd).days['2026-11-03'].failureTypes.other, 15);
	});

	test('the tls verdict needs 100 sessions and fails below 99% success', () => {
		assert.equal(reports.tlsVerdict(reports.parseTlsRpt(tls({ policies: [{ policy: { 'policy-domain': 'shop.example.com' }, summary: { 'total-successful-session-count': 30, 'total-failure-session-count': 1 } }] }))).verdict, 'not-enough-data');
		assert.equal(reports.tlsVerdict(reports.parseTlsRpt(tls())).verdict, 'failing');
		assert.equal(reports.tlsVerdict(reports.parseTlsRpt(tls({ policies: [{ policy: { 'policy-domain': 'shop.example.com' }, summary: { 'total-successful-session-count': 999, 'total-failure-session-count': 1 } }] }))).verdict, 'ok');
	});
});

test.describe('safe to tighten? verdict (#3777)', () => {
	const verdict = (list) => reports.tightenVerdict(reports.merge(list, 'dmarc'));

	test('a clean week from one source is safe', () => {
		const v = verdict(week());
		assert.deepEqual([v.verdict, v.messages, v.days, v.passRate], ['safe', 280, 7, 1]);
	});

	test('less than 200 messages or 7 days is not enough data', () => {
		assert.equal(verdict(week().slice(0, 6)).verdict, 'not-enough-data');
		const thin = [];
		for (let i = 0; i < 7; i++) thin.push(reports.parseDmarcAggregate(dmarcXml(i, [record('192.0.2.10', 10, 'none', 'pass', 'pass')])));
		assert.equal(verdict(thin).verdict, 'not-enough-data');
		assert.equal(reports.tightenVerdict(reports.merge([], 'dmarc')).verdict, 'not-enough-data');
	});

	test('a significant source that fails blocks "safe" and is named with its counts', () => {
		const v = verdict(week({ ip: '198.51.100.7', n: 10, dkim: 'fail', spf: 'fail' })); // 70 failing of 350 = 80%
		assert.equal(v.verdict, 'not-yet');
		assert.deepEqual(v.failing, [{ ip: '198.51.100.7', messages: 70, fail: 70, passRate: 0 }]);
	});

	test('a tiny failing source stays under the line: 98% overall with no significant failing source is safe', () => {
		const list = week();
		list.push(reports.parseDmarcAggregate(dmarcXml(7, [record('192.0.2.10', 280, 'none', 'pass', 'pass'), record('198.51.100.8', 5, 'none', 'fail', 'fail')])));
		const v = verdict(list); // 5 of 565 fail: 99.1% overall, the failing source is 0.9% (< max(10, 1%))
		assert.equal(v.verdict, 'safe');
		assert.deepEqual(v.failing, []);
	});

	test('overall below 98% is not yet even when no single source stands out', () => {
		const list = [];
		for (let i = 0; i < 7; i++) {
			const rows = [record('192.0.2.10', 100, 'none', 'pass', 'pass')];
			for (let s = 0; s < 8; s++) rows.push(record('198.51.100.' + (20 + s), 3, 'none', 'fail', 'fail')); // 8 sources of 3/day: each under the floor
			list.push(reports.parseDmarcAggregate(dmarcXml(i, rows)));
		}
		const v = verdict(list); // 24 of 124 per day fail: 80.6% pass
		assert.equal(v.verdict, 'not-yet');
		assert.ok(v.passRate < 0.98);
	});

	test('already at p=reject and pct=100 reads "at-reject"; pass through either DKIM or SPF counts as aligned', () => {
		const v = verdict(week({ ip: '198.51.100.9', n: 5, dkim: 'pass', spf: 'fail' }, '<p>reject</p><pct>100</pct>'));
		assert.equal(v.verdict, 'at-reject');
		assert.equal(v.passRate, 1);
		assert.equal(verdict(week(null, '<p>reject</p><pct>50</pct>')).verdict, 'safe');
	});

	test('merging is order-independent and sums per day and per source', () => {
		const list = week({ ip: '198.51.100.7', n: 2, dkim: 'fail', spf: 'fail' });
		const a = reports.merge(list, 'dmarc');
		const b = reports.merge(list.slice().reverse(), 'dmarc');
		assert.deepEqual(a.days, b.days);
		assert.deepEqual(a.sources, b.sources);
		const twice = reports.merge([list[0], list[0]], 'dmarc');
		assert.equal(twice.days['2026-11-01'].messages, 2 * list[0].days['2026-11-01'].messages);
		assert.equal(reports.merge(list, 'tlsrpt').policy.p, '');
	});
});

test.describe('consent record (#3777)', () => {
	const ask = { email: 'owner@shop.example.com', host: 'www.shop.example.com', accept: true, noticeVersion: consent.NOTICE_VERSION };

	test('turning on needs the owner proof, accept=true and the current notice version', () => {
		const row = consent.consentRecord(ask, 'site', NOW);
		assert.deepEqual([row.email, row.host, row.on, row.noticeVersion, row.at], ['owner@shop.example.com', 'shop.example.com', true, consent.NOTICE_VERSION, '2026-11-20T12:00:00.000Z']);
		assert.equal(row.expireAt.getTime(), NOW + consent.CONSENT_MS);
		assert.equal(consent.consentRecord(ask, '', NOW), null, 'no proof, no consent');
		assert.equal(consent.consentRecord(Object.assign({}, ask, { accept: 'yes' }), 'site', NOW).on, false, 'only a boolean true is a yes');
		assert.equal(consent.consentRecord(Object.assign({}, ask, { noticeVersion: '2020-01-01' }), 'site', NOW), null, 'a stale notice is not a yes');
		assert.equal(consent.consentRecord(Object.assign({}, ask, { host: 'not a host' }), 'site', NOW), null);
	});

	test('an owner can always turn it off, with or without a proof', () => {
		const off = consent.consentRecord({ email: ask.email, host: ask.host, accept: false }, '', NOW);
		assert.equal(off.on, false);
		assert.equal(consent.consentOn(off, 'site', NOW), false);
	});

	test('consent holds only while on, current, unexpired and the proof stands', () => {
		const row = consent.consentRecord(ask, 'site', NOW);
		assert.equal(consent.consentOn(row, 'site', NOW + DAY), true);
		assert.equal(consent.consentOn(row, '', NOW + DAY), false, 'proof lapsed');
		assert.equal(consent.consentOn(row, 'site', NOW + consent.CONSENT_MS + 1), false, 'expired');
		assert.equal(consent.consentOn(Object.assign({}, row, { noticeVersion: 'older' }), 'site', NOW), false);
		assert.equal(consent.consentOn(null, 'site', NOW), false);
		assert.equal(consent.docId(ask.email, 'www.shop.example.com'), consent.docId(ask.email, 'shop.example.com'));
		assert.notEqual(consent.docId(ask.email, ask.host), proof.docId('site', ask.email, ask.host));
	});

	test('the notice says what is kept, what is not, and how to withdraw', () => {
		const text = consent.NOTICE.lines.join(' ');
		assert.equal(consent.NOTICE.version, consent.NOTICE_VERSION);
		assert.match(text, /does not keep message-level data/);
		assert.match(text, /turn this off at any time/);
		assert.match(text, /not shared/);
	});
});

test.describe('the review shows owner data only with consent and data (#3777)', () => {
	const URL_ = 'https://shop.example.com/';
	const HTML = '<!doctype html><html lang="en"><head><title>Example shop for garden tools</title></head><body><main><h1>Garden tools</h1></main></body></html>';
	const row = consent.consentRecord({ email: 'owner@shop.example.com', host: 'shop.example.com', accept: true, noticeVersion: consent.NOTICE_VERSION }, 'site', NOW);

	function review(ownerReports) {
		const dns = {
			domain: 'shop.example.com',
			spf: 'v=spf1 include:_spf.google.com ~all',
			dmarc: 'v=DMARC1; p=quarantine; rua=mailto:dmarc@shop.example.com',
			mx: ['mx.shop.example.com'],
			nullMx: false,
			caa: ['letsencrypt.org'],
			mtaSts: '',
			tlsRpt: '',
			bimi: '',
			unread: [],
			mailAuth: { spfRecords: 1, lookups: 2, complete: true, all: '~', dmarcRecords: 1 },
			ownerReports,
		};
		const page = { url: URL_, path: '/', status: 200, ms: 120, depth: 0, inspect: core.analyzeHtml(HTML, { 'content-type': 'text/html' }, URL_) };
		return insights.analyze({ pages: [page], extras: { dns } });
	}
	const data = (key) => review(consent.ownerReportView(row, 'site', week(key), [], NOW)).findings.filter((item) => /^sec-(dmarc|tlsrpt)-data$/.test(item.key));
	const text = (item) => render(EN, item.evidence);

	test('no consent, or consent without data, keeps the public-policy-only review', () => {
		const off = consent.consentRecord({ email: 'owner@shop.example.com', host: 'shop.example.com', accept: false }, '', NOW);
		assert.equal(consent.ownerReportView(off, 'site', week(), [], NOW), null);
		assert.equal(consent.ownerReportView(row, 'site', [], [], NOW), null);
		assert.equal(consent.ownerReportView(row, '', week(), [], NOW), null);
		assert.equal(consent.ownerReportView(null, 'site', week(), [], NOW), null);
		assert.deepEqual(review(null).findings.filter((item) => /-data$/.test(item.key)), []);
		assert.deepEqual(review(consent.ownerReportView(row, 'site', [], [], NOW)).findings.filter((item) => /-data$/.test(item.key)), []);
	});

	test('with consent and enough data, a clean week reads as safe to tighten', () => {
		const [item] = data(null);
		assert.deepEqual([item.verdict, item.severity], ['pass', 'info']);
		assert.match(text(item), /280 messages from shop\.example\.com over 7 days: 100\.0% passed DMARC/);
	});

	test('a failing legitimate-looking sender is named and the review says not yet', () => {
		const [item] = data({ ip: '198.51.100.7', n: 10, dkim: 'fail', spf: 'fail' });
		assert.deepEqual([item.verdict, item.severity], ['risk', 'medium']);
		assert.match(text(item), /198\.51\.100\.7 \(70 of 70 failed\)/);
		assert.match(render(EN, item.fix), /Tighten only once the pass rate holds at 98%/);
	});

	test('too little data adds nothing, and a failing TLS-RPT adds its own finding', () => {
		assert.deepEqual(review(consent.ownerReportView(row, 'site', week().slice(0, 3), [], NOW)).findings.filter((item) => /-data$/.test(item.key)), []);
		const tls = reports.parseTlsRpt({
			'date-range': { 'start-datetime': '2026-11-03T00:00:00Z' },
			policies: [{ policy: { 'policy-domain': 'shop.example.com' }, summary: { 'total-successful-session-count': 90, 'total-failure-session-count': 10 } }],
		});
		const found = review(consent.ownerReportView(row, 'site', [], [tls], NOW)).findings.filter((item) => /-data$/.test(item.key));
		assert.deepEqual(found.map((item) => item.key), ['sec-tlsrpt-data']);
		assert.match(text(found[0]), /10 of 100 reported sessions to shop\.example\.com failed \(10\.0%\)/);
	});
});

test.describe('p=reject safety wording uses sec-dmarc-data (#3777)', () => {
	const REJECT = '<p>reject</p><pct>100</pct>';
	const row = consent.consentRecord({ email: 'owner@shop.example.com', host: 'shop.example.com', accept: true, noticeVersion: consent.NOTICE_VERSION }, 'site', NOW);
	const view = (list) => consent.ownerReportView(row, 'site', list, [], NOW).dmarc;
	const review = (list) => {
		const dns = {
			domain: 'shop.example.com',
			spf: 'v=spf1 include:_spf.google.com ~all',
			dmarc: 'v=DMARC1; p=reject; rua=mailto:dmarc@shop.example.com',
			mx: ['mx.shop.example.com'],
			caa: ['letsencrypt.org'],
			unread: [],
			mailAuth: { spfRecords: 1, lookups: 2, complete: true, all: '~', dmarcRecords: 1 },
			ownerReports: consent.ownerReportView(row, 'site', list, [], NOW),
		};
		const url = 'https://shop.example.com/';
		const html = '<!doctype html><html lang="en"><head><title>Example shop for garden tools</title></head><body><main><h1>Garden tools</h1></main></body></html>';
		const page = { url, path: '/', status: 200, ms: 120, depth: 0, inspect: core.analyzeHtml(html, { 'content-type': 'text/html' }, url) };
		return insights.analyze({ pages: [page], extras: { dns } }).findings.filter((item) => item.key === 'sec-dmarc-data');
	};

	test('verdict: reject with clean mail is at-reject, reject with a failing sender is at-reject-check, never "safe"', () => {
		assert.equal(view(week(null, REJECT)).verdict, 'at-reject');
		const dirty = view(week({ ip: '198.51.100.7', n: 10, dkim: 'fail', spf: 'fail', disposition: 'reject' }, REJECT));
		assert.equal(dirty.verdict, 'at-reject-check');
		assert.equal(dirty.failing[0].ip, '198.51.100.7');
		assert.equal(view(week(null, '<p>none</p><pct>100</pct>')).verdict, 'safe');
		assert.equal(view(week(null, '<p>reject</p><pct>50</pct>')).verdict, 'safe');
	});

	test('wording: clean reject says working; a failing sender at reject asks the owner to check and is not a pass', () => {
		const [ok] = review(week(null, REJECT));
		assert.deepEqual([ok.verdict, ok.severity], ['pass', 'info']);
		assert.match(render(EN, ok.title), /reject policy is working/);
		const [check] = review(week({ ip: '198.51.100.7', n: 10, dkim: 'fail', spf: 'fail', disposition: 'reject' }, REJECT));
		assert.deepEqual([check.verdict, check.severity], ['risk', 'low']);
		assert.doesNotMatch(render(EN, check.title), /working/);
		assert.match(render(EN, check.evidence), /being rejected: 198\.51\.100\.7 \(70 of 70 failed\)/);
		assert.match(render(EN, check.fix), /one of your own senders/);
	});

	test('wording: a low pass rate with no single big failing sender still reads as check, with the rate', () => {
		const list = [];
		for (let i = 0; i < 7; i++) {
			const rows = [record('192.0.2.10', 40, 'none', 'pass', 'pass')];
			for (let n = 1; n <= 12; n++) rows.push(record('203.0.113.' + n, 1, 'reject', 'fail', 'fail'));
			list.push(reports.parseDmarcAggregate(dmarcXml(i, rows, REJECT)));
		}
		const [item] = review(list);
		assert.equal(item.verdict, 'risk');
		assert.match(render(EN, item.evidence), /p=reject in force, below the 98%/);
	});

	test('every language ships the new keys (English until native review)', () => {
		const source = require('fs').readFileSync(require('path').join(__dirname, '../../js/qa-review-findings-copy.js'), 'utf8');
		assert.equal((source.match(/"sec-dmarc-data\.atRejectCheck\.fix"/g) || []).length, 5);
	});
});

test.describe('the live review loads owner data through the store (#3777)', () => {
	const EMAIL = 'owner@shop.example.com';
	const HOST = 'shop.example.com';
	const siteRows = [proof.siteRecord({ email: EMAIL, host: HOST, how: 'dns' })];

	async function seeded(on) {
		const store = auth.memoryStore();
		await storeApi.setConsent(store, { email: EMAIL, host: HOST, accept: on, noticeVersion: consent.NOTICE_VERSION }, siteRows, NOW);
		for (const agg of week()) await storeApi.saveAggregate(store, EMAIL, HOST, agg, NOW);
		return store;
	}

	test('consent + proof + data gives verdicts only, no stored counts', async () => {
		const store = await seeded(true);
		const view = await storeApi.ownerReportsFor(store, EMAIL, HOST, 'site', NOW);
		assert.equal(view.dmarc.verdict, 'safe');
		assert.equal(view.tls, null);
		assert.equal(view.dmarc.messages, 280);
		const dump = JSON.stringify(view);
		assert.equal(dump.indexOf('"days":{'), -1);
		assert.equal(dump.indexOf('"sources"'), -1);
	});

	test('no consent, withdrawn consent, a weak proof, or another host gives null', async () => {
		assert.equal(await storeApi.ownerReportsFor(await seeded(false), EMAIL, HOST, 'site', NOW), null);
		const on = await seeded(true);
		assert.equal(await storeApi.ownerReportsFor(on, EMAIL, HOST, 'own', NOW), null);
		assert.equal(await storeApi.ownerReportsFor(on, EMAIL, HOST, '', NOW), null);
		assert.equal(await storeApi.ownerReportsFor(on, EMAIL, 'other.example.com', 'site', NOW), null);
		assert.equal(await storeApi.ownerReportsFor(on, 'someone@else.example.com', HOST, 'site', NOW), null);
		await storeApi.setConsent(on, { email: EMAIL, host: HOST, accept: false }, siteRows, NOW);
		assert.equal(await storeApi.ownerReportsFor(on, EMAIL, HOST, 'site', NOW), null);
	});

	test('a store failure falls back to the public-policy-only review', async () => {
		const broken = { get: async () => { throw new Error('down'); } };
		assert.equal(await storeApi.ownerReportsFor(broken, EMAIL, HOST, 'site', NOW), null);
	});

	test('owner data stays out of unpaid previews and the public Live Reports feed', () => {
		const finding = { key: 'sec-dmarc-data', area: 'Security', verdict: 'risk', severity: 'medium', rank: 1, title: 'Your DMARC reports show legitimate mail could fail if you tighten the policy', evidence: '198.51.100.7 (70 of 70 failed)', fix: 'Fix alignment' };
		const report = {
			id: 'r1', status: 'complete', host: 'shop.example.com', finalUrl: 'https://shop.example.com/', limits: { pagesRead: 1, maxPages: 5 },
			pages: [{ url: 'https://shop.example.com/', path: '/', status: 200 }], cases: [],
			insights: { score: { overall: 80, grade: 'B', areas: { Security: { score: 70 } } }, findings: [finding, Object.assign({}, finding, { key: 'sec-tlsrpt-data' }), Object.assign({}, finding, { key: 'sec-hsts', title: 'HSTS missing' })] },
		};
		const keys = (r) => r.insights.findings.map((item) => item.key);
		assert.deepEqual(keys(core.previewReport(report)), ['sec-hsts']);
		assert.deepEqual(keys(publish.publicReport(report)), ['sec-hsts']);
	});
});
