'use strict';

/**
 * Audit → outcomes smoke harness (#4398 / epic #4360).
 * Chains mock audit report → fix-diff enqueue → desk transition → watch delta → GSC helpers.
 * In-memory Firestore only — no mail, OAuth, or deploy.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const core = require('../../functions/url-review-core');
const insights = require('../../functions/url-review-insights');
const wire = require('../../functions/url-review-fix-diff-wire');
const fixDiffDesk = require('../../functions/url-review-fix-diff-desk');
const watchDelta = require('../../functions/url-review-watch-delta');
const gsc = require('../../functions/url-review-gsc-outcomes');

const FIXTURES = path.join(__dirname, '../fixtures/fix-diff-wire');
const NOW = Date.parse('2026-11-26T18:00:00Z');
const ORIGIN = 'https://shop.example.com/';

const GSC_FIXTURE = {
	ok: true,
	current: [
		{ page: '/', clicks: 5, impressions: 120, position: 14 },
		{ page: '/pricing', clicks: 40, impressions: 200, position: 6 },
	],
	prior: [
		{ page: '/', clicks: 50, impressions: 120, position: 5 },
		{ page: '/pricing', clicks: 42, impressions: 200, position: 6 },
	],
	queryPages: [
		{ query: 'widgets', page: '/', clicks: 12, impressions: 90, position: 4 },
		{ query: 'widgets', page: '/blog/widgets', clicks: 3, impressions: 80, position: 9 },
	],
};

function loadFixture(name) {
	return JSON.parse(fs.readFileSync(path.join(FIXTURES, name), 'utf8'));
}

function page(route) {
	const url = ORIGIN.replace(/\/$/, '') + route;
	const html =
		'<!doctype html><html lang="en"><head><title>Shop</title><link rel="canonical" href="' +
		url +
		'"></head><body><main><h1>Shop</h1></main></body></html>';
	return {
		url,
		path: route,
		status: 200,
		depth: 0,
		ms: 80,
		inspect: core.analyzeHtml(html, { 'content-type': 'text/html' }, url),
	};
}

function memoryDb() {
	const data = { [fixDiffDesk.COLLECTION]: new Map() };
	let n = 0;
	const docRef = (name, id) => ({
		id,
		get: async () => ({ exists: data[name].has(id), data: () => data[name].get(id) }),
		update: async (patch) => data[name].set(id, Object.assign({}, data[name].get(id), patch)),
	});
	const docsOf = (name) => [...data[name].entries()].map(([id, value]) => ({ id, data: () => value }));
	return {
		data,
		collection: (name) => ({
			doc: (id) => docRef(name, id),
			add: async (value) => {
				const id = 'pack' + ++n;
				data[name].set(id, value);
				return docRef(name, id);
			},
			orderBy: () => ({
				limit: () => ({ get: async () => ({ docs: docsOf(name) }) }),
			}),
		}),
	};
}

function buildAuditReport() {
	const geoFixture = loadFixture('report-geo-llms.json');
	const analyzed = insights.analyze({
		pages: [page('/'), page('/pricing')],
		robotsText: '',
		extras: { gsc: GSC_FIXTURE },
	});
	const gscKeys = analyzed.findings.filter((row) => /^seo-gsc-/.test(row.key)).map((row) => row.key);
	assert.deepEqual(gscKeys.sort(), ['seo-gsc-cannibal', 'seo-gsc-decay']);

	const geoFinding = geoFixture.insights.findings.find((row) => row.key === 'geo-llms');
	const findings = analyzed.findings
		.filter((row) => !/^geo-llms$/.test(row.key))
		.concat([
			Object.assign({}, geoFinding, {
				title: geoFinding.title || 'llms.txt',
				evidence: geoFinding.evidence || '',
				fix: geoFinding.fix || '',
			}),
		]);

	return {
		id: geoFixture.id,
		status: 'complete',
		host: geoFixture.host,
		finalUrl: geoFixture.finalUrl,
		insights: {
			findings,
			score: analyzed.score,
			fixkit: geoFixture.insights.fixkit,
			extras: { gsc: GSC_FIXTURE, llms: geoFixture.insights.extras.llms },
			outcomes: analyzed.outcomes,
		},
	};
}

test('smoke: mock audit carries GSC and GEO findings (#4398)', () => {
	const report = buildAuditReport();
	const keys = report.insights.findings.map((row) => row.key);
	assert.ok(keys.includes('seo-gsc-decay'));
	assert.ok(keys.includes('seo-gsc-cannibal'));
	assert.ok(keys.includes('geo-llms'));
	const openGsc = report.insights.findings.filter((row) => /^seo-gsc-/.test(row.key) && row.verdict !== 'pass');
	assert.equal(openGsc.length, 2);
});

test('smoke: audit → fix-diff enqueue → pending desk row (#4398)', async () => {
	const report = buildAuditReport();
	const db = memoryDb();
	const lines = [];
	const out = await wire.enqueueFromReport(db, report, {
		env: { URL_REVIEW_FIX_DIFF_ENQUEUE: '1' },
		nowMs: NOW,
		note: (text) => lines.push(text),
	});
	assert.equal(out.ok, true);
	assert.equal(out.enqueued.length, 1);
	assert.equal(out.enqueued[0].findingId, 'geo-llms');
	assert.equal(out.enqueued[0].kind, 'git');
	assert.ok(lines.some((line) => /queued 1 pack/.test(line)));

	const rows = await fixDiffDesk.deskRows(db);
	assert.equal(rows.length, 1);
	const row = rows[0];
	assert.equal(row.status, 'pending');
	assert.equal(row.kind, 'git');
	assert.equal(row.findingId, 'geo-llms');
	assert.equal(row.host, 'shop.example.com');
	assert.match(row.patch, /finding geo-llms/);
	assert.equal(typeof row.createdAt, 'string');
	assert.equal(row.decidedAt, '');
	const raw = db.data[fixDiffDesk.COLLECTION].get(row.id);
	assert.equal(raw.status, 'pending');
	assert.deepEqual(fixDiffDesk.summarize(rows).byStatus, { pending: 1, approved: 0, rejected: 0 });
});

test('smoke: desk pending → approved Firestore-like transition (#4398)', async () => {
	const report = buildAuditReport();
	const db = memoryDb();
	const out = await wire.enqueueFromReport(db, report, {
		env: { URL_REVIEW_FIX_DIFF_ENQUEUE: '1' },
		nowMs: NOW,
	});
	const packId = out.enqueued[0].id;
	const ref = db.collection(fixDiffDesk.COLLECTION).doc(packId);
	const before = (await ref.get()).data();
	const patch = fixDiffDesk.decisionPatch(before, { decision: 'approve', note: 'ship llms.txt' }, 'ops@example.com', NOW + 60000);
	assert.equal(patch.error, undefined);
	assert.equal(patch.status, 'approved');
	await ref.update(patch);
	const after = (await ref.get()).data();
	assert.equal(after.status, 'approved');
	assert.equal(after.decidedBy, 'ops@example.com');
	assert.equal(after.note, 'ship llms.txt');
	assert.ok(after.decidedAt > before.createdAt);
	const rejectAgain = fixDiffDesk.decisionPatch(after, { decision: 'reject' }, 'ops@example.com', NOW + 120000);
	assert.equal(rejectAgain.error, 'Only pending packs can be rejected.');
});

test('smoke: watch delta payload from before/after snapshots (#4398)', () => {
	const priorSnap = {
		overall: 58,
		areas: { SEO: 70, GEO: 72, Security: 46 },
	};
	const report = buildAuditReport();
	const laterSnap = {
		insights: {
			score: {
				overall: report.insights.score.overall,
				areas: Object.fromEntries(
					Object.entries(report.insights.score.areas).map(([name, row]) => [name, { score: row.score, grade: row.grade }])
				),
			},
		},
	};
	const diff = watchDelta.diffSnapshots(priorSnap, laterSnap);
	assert.equal(typeof diff.before, 'number');
	assert.equal(typeof diff.now, 'number');
	assert.equal(typeof diff.overall, 'number');
	assert.ok(Object.keys(diff.areas).length >= 1);
	const md = watchDelta.formatDeltaMarkdown(diff);
	const text = watchDelta.formatDeltaText(diff);
	assert.match(md, /\*\*Overall:\*\*/);
	assert.doesNotMatch(text, /\*\*/);
	assert.ok(md.length > text.length);
});

test('smoke: GSC helpers emit stable decay/cannibal payloads (#4398)', () => {
	const decay = gsc.gscDecayFindings({
		current: GSC_FIXTURE.current,
		prior: GSC_FIXTURE.prior,
		minImpressions: 50,
	});
	assert.equal(decay.length, 1);
	assert.equal(decay[0].path, '/');
	assert.ok(decay[0].reasons.some((row) => row.kind === 'clicks'));

	const cannibal = gsc.cannibalizationFindings(GSC_FIXTURE.queryPages, { minImpressions: 50 });
	assert.equal(cannibal.length, 1);
	assert.equal(cannibal[0].query, 'widgets');
	assert.deepEqual(cannibal[0].rivals, ['/blog/widgets']);
});