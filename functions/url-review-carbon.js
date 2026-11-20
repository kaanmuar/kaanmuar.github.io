'use strict';

/* Page carbon check (#3830): the Sustainable Web Design model v4 applied to bytes the review already measured (the
   browser's cold load, or Lighthouse's total byte weight). Plain code, no dependency and no request: the model is a
   formula and one grid constant. Whether the host runs on green energy needs the Green Web Foundation's lookup, a
   request to a third party, so the review leaves it out. */

const { say } = require('./url-review-findings-en');

// 0.3 kWh per GB across data centres, networks and devices, at the 494 g/kWh global grid average.
// The grid figure is Ember data as the Green Web Foundation's CO2.js ships it (CC-BY-SA-4.0).
const KWH_PER_GB = 0.3;
const GRID_G_PER_KWH = 494;
const RATINGS = [
	['A+', 0.04],
	['A', 0.079],
	['B', 0.145],
	['C', 0.209],
	['D', 0.278],
	['E', 0.359],
];
const VISITS_PER_MONTH = 10000;

function estimate(bytes, source) {
	if (!(bytes > 0)) return null;
	const grams = (bytes / 1e9) * KWH_PER_GB * GRID_G_PER_KWH;
	return {
		bytes: Math.round(bytes),
		grams: Math.round(grams * 1000) / 1000,
		rating: (RATINGS.find(([, max]) => grams <= max) || ['F'])[0],
		source,
	};
}

function sizeLabel(bytes) {
	if (bytes >= 1e6) return Math.round(bytes / 1e5) / 10 + ' MB';
	return Math.max(1, Math.round(bytes / 1000)) + ' kB';
}

// Ratings A+, A and B read as light; C and below carry advice.
function findings(carbon, add) {
	if (!carbon || !(carbon.bytes > 0)) return null;
	const light = ['A+', 'A', 'B'].indexOf(carbon.rating) !== -1;
	const monthlyKg = Math.round(carbon.grams * VISITS_PER_MONTH) / 1000;
	const evidence = say('perf-carbon.evidence', {
		size: sizeLabel(carbon.bytes),
		where: say(carbon.source === 'lighthouse' ? 'perf-carbon.where.lighthouse' : 'perf-carbon.where.browser'),
		kg: monthlyKg,
	});
	// Never a risk: the report says the estimate is "not scored", so a heavy page keeps the advice but no penalty.
	if (light) {
		add(
			'Performance',
			'pass',
			'info',
			'perf-carbon',
			say('perf-carbon.pass.title', { rating: carbon.rating, grams: carbon.grams }),
			evidence,
			'',
			{ effort: 'hours' }
		);
	} else {
		add(
			'Performance',
			'pass',
			'info',
			'perf-carbon',
			say('perf-carbon.title', { rating: carbon.rating, grams: carbon.grams }),
			evidence,
			say('perf-carbon.fix'),
			{ effort: 'hours' }
		);
	}
	return { rating: carbon.rating, grams: carbon.grams, monthlyKg };
}

module.exports = { estimate, findings, sizeLabel, KWH_PER_GB, GRID_G_PER_KWH, VISITS_PER_MONTH };
