const test = require('node:test');
const assert = require('node:assert/strict');
const fixDiffDesk = require('../../functions/url-review-fix-diff-desk');

const NOW = Date.parse('2026-11-26T12:00:00Z');

function response() {
	const out = { statusCode: 200, body: null };
	return {
		status(code) {
			out.statusCode = code;
			return this;
		},
		json(payload) {
			out.body = payload;
			return this;
		},
		out,
	};
}

function memoryDb(seed) {
	const data = { [fixDiffDesk.COLLECTION]: new Map() };
	Object.keys(seed || {}).forEach((name) =>
		Object.keys(seed[name]).forEach((id) => data[name].set(id, seed[name][id]))
	);
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
			orderBy: () => ({ limit: () => ({ get: async () => ({ docs: docsOf(name) }) }) }),
		}),
	};
}

test('recordFromBody builds git patch preview and cms draft rows', () => {
	const git = fixDiffDesk.recordFromBody(
		{
			kind: 'git',
			findingId: 'F-sec-hsts',
			path: 'nginx/site.conf',
			before: 'listen 443;',
			after: 'listen 443;\nadd_header Strict-Transport-Security max-age=31536000;',
			host: 'shop.example.com',
			reportId: 'abc123',
		},
		NOW
	);
	assert.equal(git.error, undefined);
	assert.match(git.patch, /finding F-sec-hsts/);
	const cms = fixDiffDesk.recordFromBody(
		{ kind: 'cms', title: 'Fix meta', bodyHtml: '<p>x</p>', findingId: 'F-seo' },
		NOW
	);
	assert.equal(cms.cmsPayload.status, 'draft');
});

test('deskDecide approves or rejects pending packs only', async () => {
	const pending = fixDiffDesk.recordFromBody(
		{ kind: 'git', findingId: 'F-01', path: 'x.txt', before: 'a', after: 'b' },
		NOW
	);
	const db = memoryDb({ [fixDiffDesk.COLLECTION]: { p1: pending } });
	const ok = response();
	await fixDiffDesk.deskDecide({ body: { id: 'p1', decision: 'approve', note: 'looks good' } }, ok, 'carlos@x', {
		db,
		nowMs: NOW + 1000,
	});
	assert.equal(ok.out.statusCode, 200);
	assert.equal(ok.out.body.pack.status, 'approved');
	assert.equal(ok.out.body.pack.note, 'looks good');
	assert.equal(ok.out.body.outcomes.state, 'off');
	assert.ok(ok.out.body.verify);
	const again = response();
	await fixDiffDesk.deskDecide({ body: { id: 'p1', decision: 'reject' } }, again, 'carlos@x', { db, nowMs: NOW + 2000 });
	assert.equal(again.out.statusCode, 400);
	const missing = response();
	await fixDiffDesk.deskDecide({ body: { id: 'nope', decision: 'approve' } }, missing, 'carlos@x', { db, nowMs: NOW });
	assert.equal(missing.out.statusCode, 404);
});

test('enqueue stores a row for the desk list', async () => {
	const db = memoryDb();
	const out = await fixDiffDesk.enqueue(
		db,
		{ kind: 'cms', title: 'T', bodyHtml: '<p>1</p>', findingId: 'F-02', host: 'example.com' },
		NOW
	);
	assert.equal(out.ok, true);
	const rows = await fixDiffDesk.deskRows(db);
	assert.equal(rows.length, 1);
	assert.equal(rows[0].cmsPayload.status, 'draft');
});