const test = require('node:test');
const assert = require('node:assert/strict');
const learn = require('../../functions/jarvis-learn');

test('learn (#4242): guides, locks, videos and needs shape', async () => {
	const out = await learn.source({
		fetch: async () => ({ ok: false, status: 404, json: async () => ({}) }),
		now: Date.now(),
	});
	assert.equal(out.ok, true);
	assert.ok(out.guides.rows.length >= 3);
	assert.ok(out.locks.rows.length >= 4);
	assert.equal(out.videos.rows.length, 1);
	assert.equal(out.videos.rows[0].ticket, 3714);
	assert.ok(Array.isArray(out.kpis));
	assert.ok(Array.isArray(out.needs));
});
