// Map play side stats (#3568): playStatsData in js/admin-jarvis-geo-time.js.
const test = require('node:test');
const assert = require('node:assert/strict');

test('playStatsData totals sent and lists movers for a played week', async () => {
	const GeoTime = await import('../../js/admin-jarvis-geo-time.js?v=3568');
	const tv = {
		mode: 'week',
		week: 2,
		label: 'Week of Sep 7 – Sep 13',
		rows: [
			{ cc: 'CO', name: 'Colombia', sent: 10, replies: 2, target: true },
			{ cc: 'BR', name: 'Brazil', sent: 5, replies: 0, target: true },
			{ cc: 'PE', name: 'Peru', sent: 8, replies: 1, target: false },
		],
		delta: { CO: 3, BR: -2, PE: 1 },
	};
	const s = GeoTime.playStatsData(tv, 'sent');
	assert.equal(s.total, 23);
	assert.equal(s.upN, 2);
	assert.equal(s.downN, 1);
	assert.equal(s.up[0].cc, 'CO');
	assert.equal(s.down[0].cc, 'BR');
	assert.equal(
		GeoTime.playStats(tv, 'sent', false, (x) => x),
		''
	);
	assert.match(
		GeoTime.playStats(tv, 'sent', true, (x) => x),
		/jv-geo-play-stats/
	);
});
