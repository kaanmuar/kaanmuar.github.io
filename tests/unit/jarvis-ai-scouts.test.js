const test = require('node:test');
const assert = require('node:assert/strict');
const ai = require('../../functions/jarvis-ai');
const scouts = require('../../functions/jarvis-scouts');
const learn = require('../../functions/jarvis-learn');

test('ai source returns playbooks and nested panels without peer', async () => {
	const out = await ai.source({ now: Date.parse('2026-11-22T12:00:00Z') });
	assert.equal(out.ok, true);
	assert.equal(out.playbooks.rows.length, ai.PLAYBOOKS.length);
	assert.ok(out.consult);
	assert.ok(out.proposals);
	assert.ok(out.needs.some((n) => /platform/i.test(n)));
});

test('scouts source returns health and actions', async () => {
	const out = await scouts.source({ now: Date.parse('2026-11-22T12:00:00Z') });
	assert.equal(out.ok, true);
	assert.ok(out.health.rows.length >= 3);
	assert.equal(out.actions.rows.length, scouts.RUN_ACTIONS.length);
	assert.ok(out.links.rows.some((l) => /engagement/i.test(l.url)));
});

test('learn guides source keeps growth locks and does not replace scout-learn', async () => {
	const out = await learn.source({ now: Date.parse('2026-11-22T12:00:00Z') });
	assert.equal(out.ok, true);
	assert.equal(out.guides.rows.length, learn.GUIDES.length);
	assert.equal(out.locks.rows.length, learn.GROWTH_LOCKS.length);
	assert.ok(out.links.rows.length >= 3);
});
