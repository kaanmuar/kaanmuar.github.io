const test = require('node:test');
const assert = require('node:assert/strict');
const legal = require('../../functions/jarvis-legal');

const CLAUSES = [
	{
		id: 'statute.CO',
		kind: 'statute',
		status: 'counsel-approved',
		jurisdiction: 'CO',
		lastChecked: '2026-11-20',
		cites: [{ name: 'Ley 1581', url: 'https://example.test/co' }],
	},
	{
		id: 'site.privacy',
		kind: 'paragraph',
		status: 'draft',
		jurisdiction: 'international',
		lastChecked: '2026-11-20',
		cites: [],
	},
];

test('clauseRows and kpis count draft vs approved without mutating input', () => {
	const before = JSON.stringify(CLAUSES);
	const rows = legal.clauseRows(CLAUSES);
	assert.equal(rows.length, 2);
	assert.equal(rows[0].status, 'counsel-approved');
	assert.equal(rows[1].status, 'draft');
	const cites = legal.citeRows(CLAUSES);
	assert.equal(cites.length, 1);
	assert.equal(cites[0].url, 'https://example.test/co');
	const kpis = legal.kpisFrom(rows, cites, { endedAt: '2026-11-22', ok: true }, [{ id: 'c1' }], [{ number: 1 }]);
	assert.equal(kpis.find((k) => k.label === 'Clauses').value, 2);
	assert.equal(kpis.find((k) => k.label === 'Draft').value, 1);
	assert.equal(kpis.find((k) => k.label === 'Cited URLs').value, 1);
	assert.equal(JSON.stringify(CLAUSES), before);
});

test('jurisdictionRows tallies packs', () => {
	const rows = legal.jurisdictionRows(CLAUSES);
	assert.deepEqual(
		rows.map((r) => [r.code, r.count]),
		[
			['CO', 1],
			['international', 1],
		]
	);
});

test('source soft-fails without db/github and still returns nested blocks', async () => {
	const fetchImpl = async (url) => {
		if (String(url).includes('clauses.json')) {
			return { ok: true, json: async () => ({ clauses: CLAUSES }) };
		}
		if (String(url).includes('signoff.json')) {
			return {
				ok: true,
				json: async () => ({
					signoffs: {
						'statute.CO': { signedOffOn: '2026-11-19', signedOffBy: 'Carlos', counselReviewedOn: '2026-11-19' },
					},
				}),
			};
		}
		return { ok: false, status: 404, json: async () => ({}) };
	};
	const out = await legal.source({ fetch: fetchImpl, now: Date.parse('2026-11-22T12:00:00Z') });
	assert.equal(out.ok, true);
	assert.ok(out.clauses.rows.length >= 2);
	assert.ok(out.signoff.rows.length >= 1);
	assert.ok(Array.isArray(out.needs));
	assert.ok(out.needs.some((n) => /Firestore|Watch|GitHub/i.test(n)));
});
