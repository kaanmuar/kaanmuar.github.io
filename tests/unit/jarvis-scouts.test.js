const test = require('node:test');
const assert = require('node:assert/strict');
const scouts = require('../../functions/jarvis-scouts');
const { fakeDb } = require('./fake-firestore');

test('scouts (#4242): meta, tools peer, actions metadata', async () => {
	const db = fakeDb({
		engagement_meta_runs: [
			{ id: '2026-11-20T12:00:00Z', at: '2026-11-20T12:00:00Z', ms: 1200, needs: [], passes: { cloud: {} } },
		],
		jarvis_settings: [{ id: 'scout-drafts', at: '2026-11-19', drafts: [{ id: 'd1' }] }],
	});
	const out = await scouts.source({
		db,
		now: Date.parse('2026-11-21T00:00:00Z'),
		peer: async (name) => {
			if (name === 'github-work') return { ok: true, scout: { run: { pr: 99 }, tickets: { open: 2 } } };
			if (name === 'engagement') return { ok: true, metaScout: { at: '2026-11-20T12:00:00Z' } };
			return null;
		},
	});
	assert.equal(out.ok, true);
	assert.ok(out.meta);
	assert.ok(out.tools && out.tools.run && out.tools.run.pr === 99);
	assert.ok(out.trending && out.trending.link);
	assert.equal(out.actions.rows.length, 2);
	assert.ok(out.actions.rows.some((a) => a.id === 'engagementScout'));
	assert.ok(Array.isArray(out.runs));
	assert.ok(Array.isArray(out.needs));
});
