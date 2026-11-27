const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const wire = require('../../functions/url-review-fix-diff-wire');
const fixDiffDesk = require('../../functions/url-review-fix-diff-desk');

const FIXTURES = path.join(__dirname, '../fixtures/fix-diff-wire');
const NOW = Date.parse('2026-11-26T15:00:00Z');

function load(name) {
	return JSON.parse(fs.readFileSync(path.join(FIXTURES, name), 'utf8'));
}

function memoryDb() {
	const data = { [fixDiffDesk.COLLECTION]: new Map() };
	let n = 0;
	const docRef = (name, id) => ({
		id,
		get: async () => ({ exists: data[name].has(id), data: () => data[name].get(id) }),
		update: async (patch) => data[name].set(id, Object.assign({}, data[name].get(id), patch)),
	});
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
				limit: () => ({
					get: async () => ({
						docs: [...data[name].entries()].map(([id, value]) => ({ id, data: () => value })),
					}),
				}),
			}),
		}),
	};
}

test('wireEligible is off without URL_REVIEW_FIX_DIFF_ENQUEUE and without hooks.enabled', () => {
	assert.equal(wire.wireEligible({}, {}), false);
	assert.equal(wire.wireEligible({ fixDiffEnqueue: { keys: ['geo-llms'] } }, {}), false);
	assert.equal(wire.wireEligible({ fixDiffEnqueue: { enabled: true } }, { URL_REVIEW_FIX_DIFF_ENQUEUE: '0' }), false);
	assert.equal(wire.wireEligible({ passive: true, fixDiffEnqueue: { enabled: true } }, { URL_REVIEW_FIX_DIFF_ENQUEUE: '1' }), false);
});

test('wireEligible opens when env or hooks opt in', () => {
	assert.equal(wire.wireEligible({}, { URL_REVIEW_FIX_DIFF_ENQUEUE: '1' }), true);
	assert.equal(wire.wireEligible({ fixDiffEnqueue: { enabled: true } }, {}), true);
	assert.equal(wire.ENV_KEY, 'URL_REVIEW_FIX_DIFF_ENQUEUE');
});

test('packBodiesFromReport builds git llms.txt pack from fixture', () => {
	const report = load('report-geo-llms.json');
	const bodies = wire.packBodiesFromReport(report, {});
	assert.equal(bodies.length, 1);
	assert.equal(bodies[0].kind, 'git');
	assert.equal(bodies[0].path, 'llms.txt');
	assert.match(bodies[0].after, /^# Shop Example/);
	const row = fixDiffDesk.recordFromBody(bodies[0], NOW);
	assert.equal(row.error, undefined);
	assert.match(row.patch, /finding geo-llms/);
});

test('packBodiesFromReport builds CMS draft for title-missing fixture', () => {
	const report = load('report-title-missing.json');
	const bodies = wire.packBodiesFromReport(report, {});
	assert.equal(bodies.length, 1);
	assert.equal(bodies[0].kind, 'cms');
	assert.match(bodies[0].bodyHtml, /\/about/);
	const row = fixDiffDesk.recordFromBody(bodies[0], NOW);
	assert.equal(row.cmsPayload.status, 'draft');
});

test('packBodiesFromReport respects custom keys on hooks', () => {
	const report = load('report-title-missing.json');
	const none = wire.packBodiesFromReport(report, { fixDiffEnqueue: { keys: ['geo-llms'] } });
	assert.equal(none.length, 0);
	const one = wire.packBodiesFromReport(report, { fixDiffEnqueue: { keys: ['seo-title-missing'] } });
	assert.equal(one.length, 1);
});

test('enqueueFromReport returns null when the gate is closed', async () => {
	const report = load('report-geo-llms.json');
	const out = await wire.enqueueFromReport(memoryDb(), report, { hooks: {}, env: {} });
	assert.equal(out, null);
});

test('enqueueFromReport stores desk rows when opted in', async () => {
	const db = memoryDb();
	const report = load('report-geo-llms.json');
	const lines = [];
	const out = await wire.enqueueFromReport(db, report, {
		env: { URL_REVIEW_FIX_DIFF_ENQUEUE: '1' },
		nowMs: NOW,
		note: (text) => lines.push(text),
	});
	assert.equal(out.ok, true);
	assert.equal(out.enqueued.length, 1);
	assert.ok(lines.some((line) => /queued 1 pack/.test(line)));
	const rows = await fixDiffDesk.deskRows(db);
	assert.equal(rows.length, 1);
	assert.equal(rows[0].status, 'pending');
});