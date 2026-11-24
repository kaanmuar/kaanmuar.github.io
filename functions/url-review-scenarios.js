'use strict';

/**
 * Curated outreach scenarios keyed by URL Review finding ids (#4279, #4280).
 * cold_safe copy stays operational; warm_only and social_generic allow richer hooks.
 */

const FORBIDDEN_COLD =
	/\b(sue|lawsuit|sued|embarrass|humiliation|breach scandal|courtroom|regulators will fine)\b/i;

const SCENARIOS = [
	{
		scenarioId: 'cold-seo-broken-links',
		findingIds: ['seo-broken-links'],
		tier: 'cold_safe',
		consequence:
			'Dead internal links waste crawl budget on 404s and send visitors to pages that no longer load.',
		channelAllow: ['email', 'linkedin', 'leave_behind'],
		mediaKind: 'evidence_card',
		copyHooks: {
			subjectHint: 'An internal link on {host} still points at a missing page',
			bodyLine: 'The scan opened one in-site link and it answered with an error instead of content.',
			cta: 'See the exact path in the free report and fix or redirect it.',
		},
		confidenceMin: 0.5,
	},
	{
		scenarioId: 'cold-a11y-labels',
		findingIds: ['a11y-labels'],
		tier: 'cold_safe',
		consequence:
			'Fields without labels slow keyboard users and can raise form abandonment during audits.',
		channelAllow: ['email', 'linkedin', 'leave_behind'],
		mediaKind: 'evidence_card',
		copyHooks: {
			subjectHint: 'A form field on {host} ships without a tied label',
			bodyLine: 'Screen-reader users hear a blank control name, so the field is harder to complete.',
			cta: 'Open the report for the selector and pair each input with a visible label.',
		},
		confidenceMin: 0.5,
	},
	{
		scenarioId: 'warm-an-consent',
		findingIds: ['an-consent', 'an-reject'],
		tier: 'warm_only',
		consequence:
			'Tags that load before a consent choice skew campaign data and can block modeled conversions until consent mode defaults are fixed.',
		channelAllow: ['email', 'linkedin', 'landing'],
		mediaKind: 'skit',
		copyHooks: {
			subjectHint: 'Measurement on {host} may run before visitors choose cookies',
			bodyLine: 'The review saw tracking snippets in the HTML without a consent gate or Consent Mode v2 defaults.',
			cta: 'Walk through the consent map in the report and test again after defaults load first.',
		},
		confidenceMin: 0.6,
	},
	{
		scenarioId: 'warm-sec-csp',
		findingIds: ['sec-csp'],
		tier: 'warm_only',
		consequence:
			'A missing or loose content security policy leaves less browser enforcement when a script injection slips through.',
		channelAllow: ['email', 'linkedin', 'landing', 'leave_behind'],
		mediaKind: 'evidence_card',
		copyHooks: {
			subjectHint: 'No strict Content-Security-Policy on {host}',
			bodyLine: 'The home page did not send a policy that limits which scripts may run.',
			cta: 'Use the report-only snippet in the fix kit, watch violations, then enforce.',
		},
		confidenceMin: 0.55,
	},
	{
		scenarioId: 'social-geo-llms',
		findingIds: ['geo-llms'],
		tier: 'social_generic',
		consequence:
			'Without llms.txt, answer engines may misquote or skip key pages when they summarize the site.',
		channelAllow: ['linkedin', 'landing'],
		mediaKind: 'static_post',
		copyHooks: {
			subjectHint: '{host} has no llms.txt for AI crawlers',
			bodyLine: 'Publishing a short llms.txt helps assistants point readers at the pages you care about.',
			cta: 'Draft one from the fix kit and host it at /llms.txt.',
		},
		confidenceMin: 0.4,
	},
	{
		scenarioId: 'cold-pf-lcp',
		findingIds: ['pf-lcp'],
		tier: 'cold_safe',
		consequence:
			'A slow largest paint pushes meaningful content down the timeline and drags engagement on mobile connections.',
		channelAllow: ['email', 'linkedin', 'leave_behind'],
		mediaKind: 'evidence_card',
		copyHooks: {
			subjectHint: 'The hero on {host} paints later than visitors expect',
			bodyLine: 'LCP crossed the common 2.5 s bar, so the main block stays blank while scripts and images compete.',
			cta: 'Open the report for the element timing and try preload plus defer on non-critical scripts.',
		},
		confidenceMin: 0.55,
	},
	{
		scenarioId: 'cold-pf-slow',
		findingIds: ['pf-slow'],
		tier: 'cold_safe',
		consequence:
			'Templates that load in slow buckets drag down site-wide speed scores and add friction on repeat visits.',
		channelAllow: ['email', 'linkedin', 'leave_behind'],
		mediaKind: 'evidence_card',
		copyHooks: {
			subjectHint: 'One template on {host} loads slower than the rest of the site',
			bodyLine: 'The scan grouped pages over 1.8 s; that path is an outlier worth profiling first.',
			cta: 'See which URLs are in the slow set and compare them to a fast sibling page in the report.',
		},
		confidenceMin: 0.5,
	},
	{
		scenarioId: 'cold-a11y-alt',
		findingIds: ['a11y-alt'],
		tier: 'cold_safe',
		consequence:
			'Images without alt text hide meaning from screen readers and weaken image search context.',
		channelAllow: ['email', 'linkedin', 'leave_behind'],
		mediaKind: 'evidence_card',
		copyHooks: {
			subjectHint: 'Images on {host} ship without alt text',
			bodyLine: 'Assistive tech cannot describe those graphics, so key visuals read as silent gaps.',
			cta: 'Use the report list to add concise alt on each flagged image.',
		},
		confidenceMin: 0.5,
	},
	{
		scenarioId: 'warm-sec-dmarc',
		findingIds: ['sec-dmarc'],
		tier: 'warm_only',
		consequence:
			'Without DMARC, forged mail from your domain is harder for receivers to block and easier for phishers to imitate.',
		channelAllow: ['email', 'linkedin', 'landing', 'leave_behind'],
		mediaKind: 'evidence_card',
		copyHooks: {
			subjectHint: 'No DMARC record published for {host}',
			bodyLine: 'The domain has no policy telling mailbox providers how to treat spoofed messages.',
			cta: 'Start with p=none plus rua in the fix kit, review reports, then tighten to quarantine or reject.',
		},
		confidenceMin: 0.55,
	},
	{
		scenarioId: 'warm-geo-entity',
		findingIds: ['geo-entity'],
		tier: 'warm_only',
		consequence:
			'An incomplete Organization or Person entity makes AI summaries and rich results less sure who owns the brand.',
		channelAllow: ['email', 'linkedin', 'landing'],
		mediaKind: 'skit',
		copyHooks: {
			subjectHint: 'Structured data on {host} does not fully name the business',
			bodyLine: 'The entity block is missing fields or linked profiles that answer engines expect in sameAs.',
			cta: 'Fill the gaps from the fix-kit draft and re-run the GEO check.',
		},
		confidenceMin: 0.55,
	},
	{
		scenarioId: 'warm-an-privacy',
		findingIds: ['an-privacy'],
		tier: 'warm_only',
		consequence:
			'Tracking or forms without a visible privacy notice leave visitors without a clear data-use explanation.',
		channelAllow: ['email', 'linkedin', 'landing'],
		mediaKind: 'evidence_card',
		copyHooks: {
			subjectHint: 'Visitors on {host} cannot find a privacy notice',
			bodyLine: 'The page loads tags or forms but does not link where personal data is described.',
			cta: 'Publish or link a notice from the footer and mention it in the consent flow.',
		},
		confidenceMin: 0.6,
	},
];

const BY_FINDING = new Map();
for (const scenario of SCENARIOS) {
	for (const findingId of scenario.findingIds) {
		const list = BY_FINDING.get(findingId) || [];
		list.push(scenario);
		BY_FINDING.set(findingId, list);
	}
}

function assertColdCopySafe() {
	for (const scenario of SCENARIOS) {
		if (scenario.tier !== 'cold_safe') continue;
		const text = [scenario.consequence, ...Object.values(scenario.copyHooks)].join(' ');
		if (FORBIDDEN_COLD.test(text)) {
			throw new Error('cold_safe scenario ' + scenario.scenarioId + ' uses forbidden outreach copy');
		}
	}
}
assertColdCopySafe();

function normalizeFindings(findings, maxConfidenceMissing) {
	const list = Array.isArray(findings) ? findings : [];
	const out = [];
	for (const item of list) {
		if (typeof item === 'string') {
			out.push({ id: item, confidence: 1 });
			continue;
		}
		if (!item || (typeof item !== 'object')) continue;
		// Review insights use `key`; outreach helpers may pass `id`.
		const id = typeof item.id === 'string' && item.id ? item.id : typeof item.key === 'string' ? item.key : '';
		if (!id) continue;
		const hasConfidence = item.confidence !== undefined && item.confidence !== null;
		if (maxConfidenceMissing && !hasConfidence) continue;
		out.push({
			id,
			confidence: hasConfidence ? Number(item.confidence) : 1,
		});
	}
	return out;
}

function scenarioForFinding(findingId) {
	const matches = BY_FINDING.get(findingId);
	if (!matches || !matches.length) return null;
	const ranked = matches.slice().sort((a, b) => {
		const len = a.findingIds.length - b.findingIds.length;
		if (len !== 0) return len;
		return SCENARIOS.indexOf(a) - SCENARIOS.indexOf(b);
	});
	return ranked[0];
}

function scenariosForOffer(findings, options) {
	const opts = options || {};
	const channel = opts.channel;
	const maxConfidenceMissing = opts.maxConfidenceMissing === true;
	const normalized = normalizeFindings(findings, maxConfidenceMissing);
	const confidenceById = new Map(normalized.map((row) => [row.id, row.confidence]));

	return SCENARIOS.filter((scenario) => {
		const matchedIds = scenario.findingIds.filter((id) => confidenceById.has(id));
		if (!matchedIds.length) return false;
		const confident = matchedIds.some((id) => confidenceById.get(id) >= scenario.confidenceMin);
		if (!confident) return false;
		if (channel && !scenario.channelAllow.includes(channel)) return false;
		return true;
	});
}

function pickColdScenario(findings) {
	const list = scenariosForOffer(findings, { channel: 'email' }).filter((item) => item.tier === 'cold_safe');
	return list.length ? list[0] : null;
}

module.exports = {
	SCENARIOS,
	FORBIDDEN_COLD,
	scenarioForFinding,
	scenariosForOffer,
	pickColdScenario,
};