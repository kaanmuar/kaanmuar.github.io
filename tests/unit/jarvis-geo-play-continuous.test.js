// Map continuous Play (#3710): fractional weekRows blend between weeks.
const test = require('node:test');
const assert = require('node:assert/strict');

test('weekRows blends sent between neighbouring weeks', async () => {
	const GeoTime = await import('../../js/admin-jarvis-geo-time.js?v=3710');
	const g = {
		countries: [{ cc: 'CO', name: 'Colombia', target: true, langs: [] }],
		time: {
			ranges: {},
			weeks: {
				start: ['2026-10-19', '2026-10-26', '2026-11-02'],
				days: [7, 7, 7],
				c: { CO: { sent: [10, 20, 40], replies: [1, 2, 4] } },
			},
		},
	};
	assert.equal(GeoTime.weekRows(g, 0).find((r) => r.cc === 'CO').sent, 10);
	assert.equal(GeoTime.weekRows(g, 1).find((r) => r.cc === 'CO').sent, 20);
	const mid = GeoTime.weekRows(g, 0.5).find((r) => r.cc === 'CO');
	assert.equal(mid.sent, 15);
	const v = GeoTime.view(g, { span: 0, week: 0.5, shade: 'value' }, 'sent');
	assert.equal(v.mode, 'week');
	assert.equal(v.week, 0.5);
	assert.equal(v.rows.find((r) => r.cc === 'CO').sent, 15);
});

test('PAINT_MS and STEP_MS stay exported for the continuous loop', async () => {
	const GeoTime = await import('../../js/admin-jarvis-geo-time.js?v=3710');
	assert.equal(GeoTime.STEP_MS, 2000);
	assert.equal(GeoTime.PAINT_MS, 80);
});
