'use strict';

/**
 * English Instantly email bodies for every cold_safe URL Review scenario (#4297).
 *
 * How to wire this in Instantly:
 * 1. Export company leads (prospects/week*-companies.csv). Columns scenario_subject, finding_1,
 *    scenario_body_line, scenario_consequence, scenario_cta, and host are already filled per row.
 * 2. In the campaign, add matching custom variables (same names as CSV headers) on import or in Settings.
 * 3. Sequence T step 1 — Subject: paste the template `subject` below, or use {{scenario_subject}} from the CSV.
 * 4. Body: paste the matching `body`; Instantly replaces {{firstName}}, {{host}}, {{finding_1}}, and the scenario_* vars.
 * 5. Keep one variant per scenario_id; branch in Zapier only if you split sequences by scenario_id.
 */

const scenarios = require('./url-review-scenarios');

const COLD_TEMPLATES = [
	{
		scenarioId: 'cold-seo-broken-links',
		subject: 'An internal link on {{host}} still points at a missing page',
		body: `Hi {{firstName}},

We ran a quick pass on {{host}} and one in-site link still resolves to an error instead of a live page. {{scenario_body_line}}

In practice: {{scenario_consequence}}

The scan also noted {{finding_1}}. {{scenario_cta}}

If a redirect or fix is already in flight, no need to reply.`,
	},
	{
		scenarioId: 'cold-a11y-labels',
		subject: 'A form field on {{host}} ships without a tied label',
		body: `Hi {{firstName}},

While reviewing {{host}}, we noticed a form control that assistive tech reads without a proper name. {{scenario_body_line}}

Why it matters: {{scenario_consequence}}

{{finding_1}} surfaced in the same pass. {{scenario_cta}}

We share these as operational QA notes, not audit demands. Happy to hear if this is already on your backlog.`,
	},
	{
		scenarioId: 'cold-pf-lcp',
		subject: 'The hero on {{host}} paints later than visitors expect',
		body: `Hi {{firstName}},

{{host}} came up in a light performance check. The main hero block stayed blank longer than the usual 2.5 s LCP bar. {{scenario_body_line}}

{{scenario_consequence}}

{{finding_1}} was part of the same snapshot. {{scenario_cta}}

We are not selling a performance rebuild here — just flagging one measurable signal. No pressure to reply if you are already tuning this.`,
	},
	{
		scenarioId: 'cold-pf-slow',
		subject: 'One template on {{host}} loads slower than the rest of the site',
		body: `Hi {{firstName}},

{{host}} has a page template that stood out as slower than its siblings in our crawl. {{scenario_body_line}}

{{scenario_consequence}}

We also logged {{finding_1}} in that run. {{scenario_cta}}

This is meant as a friendly heads-up for whoever owns templates or hosting. Tell me if profiling is already underway and I will stand down.`,
	},
	{
		scenarioId: 'cold-a11y-alt',
		subject: 'Images on {{host}} ship without alt text',
		body: `Hi {{firstName}},

On {{host}}, several images loaded without alt text, so screen readers skip their meaning. {{scenario_body_line}}

{{scenario_consequence}}

{{finding_1}} appeared in the report as well. {{scenario_cta}}

We send a short free report link when it helps; this note is only about the alt gap. If alt copy is queued, feel free to ignore this.`,
	},
];

const BY_ID = new Map(COLD_TEMPLATES.map((row) => [row.scenarioId, row]));

function bareHost(host) {
	return String(host || '')
		.toLowerCase()
		.replace(/^https?:\/\//, '')
		.replace(/[/:](?<![/:][^\n\r\u2028\u2029/:]*[/:]).*$/, '')
		.replace(/^www\./, '');
}

/** @returns {{ scenarioId, subject, body } | null} */
function templateFor(scenarioId) {
	const row = BY_ID.get(String(scenarioId || ''));
	return row ? { scenarioId: row.scenarioId, subject: row.subject, body: row.body } : null;
}

/** Every cold_safe Instantly template, in scenario table order. */
function listColdTemplates() {
	const coldIds = scenarios.SCENARIOS.filter((row) => row.tier === 'cold_safe' && !row.vertical).map(
		(row) => row.scenarioId
	);
	return coldIds.map((id) => templateFor(id)).filter(Boolean);
}

/** CSV-style subject from copyHooks.subjectHint with the lead's bare domain. */
function renderSubject(scenario, host) {
	if (!scenario || !scenario.copyHooks || !scenario.copyHooks.subjectHint) return '';
	return String(scenario.copyHooks.subjectHint).replace(/\{host\}/g, bareHost(host));
}

module.exports = {
	COLD_TEMPLATES,
	templateFor,
	listColdTemplates,
	renderSubject,
};