const test = require('node:test');
const assert = require('node:assert/strict');
const ai = require('../../functions/jarvis-ai');
const { fakeDb } = require('./fake-firestore');

test('ai (#4242): platform peer, playbooks, gemini proposals', async () => {
	const db = fakeDb({
		jarvis_ai_proposals: [
			{
				id: 'p1',
				key: 'gemini:one',
				title: 'Fix CI',
				source: 'gemini',
				until: '2099-01-01T00:00:00Z',
			},
		],
	});
	const out = await ai.source({
		db,
		now: Date.parse('2026-11-01T00:00:00Z'),
		peer: async (name) =>
			name === 'platform' ? { ok: true, gemini: { requests: 42, errorRate: 1.2 } } : null,
	});
	assert.equal(out.ok, true);
	assert.ok(out.platform && out.platform.gemini.requests === 42);
	assert.equal(out.proposals.rows.length, 1);
	assert.ok(out.playbooks.rows.length >= 4);
	assert.ok(out.consult);
	assert.ok(out.kpis.length >= 3);
});
