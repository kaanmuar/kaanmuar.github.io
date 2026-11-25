'use strict';

/**
 * Outcome packs for growth outreach and report surfacing (#4296).
 * Maps URL Review finding areas and curated scenarios to commerce / marketing /
 * engagement / security buckets with fix-kit CTAs.
 */

const scenarios = require('./url-review-scenarios');

const SCENARIO_IDS = new Set(scenarios.SCENARIOS.map((row) => row.scenarioId));

const OUTCOMES = [
	{
		outcomeId: 'commerce',
		label: 'Commerce and speed',
		findingAreas: ['Performance', 'SEO'],
		scenarioIds: ['cold-seo-broken-links', 'cold-pf-lcp', 'cold-pf-slow', 'cold-b2b-pf-cls'],
		primaryCta: {
			text: 'Fix slow templates and broken shop links',
			actionType: 'fix_package',
			targetSlug: 'performance',
		},
	},
	{
		outcomeId: 'marketing',
		label: 'Discovery and AI summaries',
		findingAreas: ['SEO', 'GEO'],
		scenarioIds: [
			'social-geo-llms',
			'warm-geo-entity',
			'cold-saas-seo-title-missing',
			'social-saas-geo-llms',
			'warm-b2b-geo-entity',
		],
		primaryCta: {
			text: 'Ship meta, schema, and llms.txt',
			actionType: 'fix_package',
			targetSlug: 'seo-meta',
		},
	},
	{
		outcomeId: 'engagement',
		label: 'Forms and inclusive UX',
		findingAreas: ['Accessibility'],
		scenarioIds: ['cold-a11y-labels', 'cold-a11y-alt', 'cold-legal-a11y-labels', 'cold-b2b-a11y-labels'],
		primaryCta: {
			text: 'Fix labels and image alt text',
			actionType: 'fix_package',
			targetSlug: 'accessibility',
		},
	},
	{
		outcomeId: 'security',
		label: 'Trust, mail, and consent',
		findingAreas: ['Security', 'Analytics'],
		scenarioIds: [
			'warm-sec-csp',
			'warm-sec-dmarc',
			'warm-an-consent',
			'warm-an-privacy',
			'warm-saas-an-consent',
			'warm-legal-an-privacy',
			'warm-legal-sec-hsts',
		],
		primaryCta: {
			text: 'Harden headers and email authentication',
			actionType: 'fix_package',
			targetSlug: 'security-headers',
		},
	},
];

const BY_SCENARIO = new Map();
for (const pack of OUTCOMES) {
	for (const scenarioId of pack.scenarioIds) {
		BY_SCENARIO.set(scenarioId, pack);
	}
}

function assertScenarioIds() {
	for (const pack of OUTCOMES) {
		for (const scenarioId of pack.scenarioIds) {
			if (!SCENARIO_IDS.has(scenarioId)) {
				throw new Error('outcome ' + pack.outcomeId + ' references unknown scenario ' + scenarioId);
			}
		}
	}
}
assertScenarioIds();

function normalizeFindings(findings) {
	const list = Array.isArray(findings) ? findings : [];
	return list.filter((item) => item && typeof item === 'object' && item.area);
}

function findingsInAreas(findings, areas) {
	const areaSet = new Set(areas);
	return normalizeFindings(findings).filter((item) => areaSet.has(item.area));
}

function countVerdicts(rows) {
	const counts = { open: 0, pass: 0, risk: 0, fail: 0 };
	for (const item of rows) {
		if (item.verdict === 'pass') counts.pass += 1;
		else if (item.verdict === 'fail') {
			counts.fail += 1;
			counts.open += 1;
		} else if (item.verdict === 'risk') {
			counts.risk += 1;
			counts.open += 1;
		}
	}
	return counts;
}

function packMatchesFindings(pack, findings) {
	const rows = findingsInAreas(findings, pack.findingAreas);
	if (rows.some((item) => item.verdict === 'fail' || item.verdict === 'risk')) return true;
	const keys = new Set(
		normalizeFindings(findings)
			.map((item) => (typeof item.key === 'string' ? item.key : typeof item.id === 'string' ? item.id : ''))
			.filter(Boolean)
	);
	for (const scenarioId of pack.scenarioIds) {
		const scenario = scenarios.SCENARIOS.find((row) => row.scenarioId === scenarioId);
		if (scenario && scenario.findingIds.some((id) => keys.has(id))) return true;
	}
	return false;
}

function outcomesForFindings(findings) {
	return OUTCOMES.filter((pack) => packMatchesFindings(pack, findings));
}

function outcomeForScenario(scenarioId) {
	return BY_SCENARIO.get(scenarioId) || null;
}

function build(ctx) {
	const ctxSafe = ctx || {};
	const findings = ctxSafe.findings;
	return OUTCOMES.map((pack) => {
		const rows = findingsInAreas(findings, pack.findingAreas);
		const counts = countVerdicts(rows);
		return {
			outcomeId: pack.outcomeId,
			label: pack.label,
			open: counts.open,
			pass: counts.pass,
			risk: counts.risk,
			fail: counts.fail,
			primaryCta: {
				text: pack.primaryCta.text,
				actionType: pack.primaryCta.actionType,
				targetSlug: pack.primaryCta.targetSlug,
			},
		};
	});
}

module.exports = {
	OUTCOMES,
	outcomesForFindings,
	outcomeForScenario,
	build,
};