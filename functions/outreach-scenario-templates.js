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

/** Sequence T company leads: Instantly custom vars filled by company-prospects.js (#4299). */
const INSTANTLY_LEAD_VARS = [
	'firstName',
	'host',
	'finding_1',
	'scenario_id',
	'scenario_subject',
	'scenario_body_line',
	'scenario_consequence',
	'scenario_cta',
	'scenario_card_url',
];

const INSTANTLY_SEQUENCE = 'T';
const PLACEHOLDER_RE = /\{\{([a-zA-Z0-9_]+)\}\}/g;

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
	const coldIds = scenarios.SCENARIOS.filter((row) => row.tier === 'cold_safe').map((row) => row.scenarioId);
	return coldIds.map((id) => templateFor(id)).filter(Boolean);
}

/** CSV-style subject from copyHooks.subjectHint with the lead's bare domain. */
function renderSubject(scenario, host) {
	if (!scenario || !scenario.copyHooks || !scenario.copyHooks.subjectHint) return '';
	return String(scenario.copyHooks.subjectHint).replace(/\{host\}/g, bareHost(host));
}

/** Distinct {{var}} names in an Instantly subject/body. */
function placeholdersIn(text) {
	const out = new Set();
	for (const m of String(text || '').matchAll(PLACEHOLDER_RE)) out.add(m[1]);
	return [...out].sort();
}

/** Placeholders that are not on the sequence T lead allowlist (empty when safe). */
function unknownPlaceholders(text) {
	const allow = new Set(INSTANTLY_LEAD_VARS);
	return placeholdersIn(text).filter((name) => !allow.has(name));
}

/** Markdown paste pack for Instantly sequence T step 1 (#4321). */
function formatMarkdownPastePack() {
	const lines = [
		'# Instantly paste — sequence T, cold_safe scenarios (#4321)',
		'',
		'Ops checklist (no API key required):',
		'1. In Instantly, open the live **sequence T** campaign used by `outreach-weekly.js companies`.',
		'2. Lead import: use `week*-companies.csv` from the private outreach folder. Custom variables must match:',
		'   `' + INSTANTLY_LEAD_VARS.join('`, `') + '`.',
		'3. For step 1, either paste each variant below **or** set Subject = `{{scenario_subject}}` and Body = the shared',
		'   body for that `scenario_id` (one email step with per-lead subject from CSV is fine).',
		'4. Keep **one variant per scenario_id**; do not paste warm_only or social_generic copy.',
		'5. After paste, send yourself a test lead row and confirm every `{{…}}` resolves.',
		'',
		'Regenerate this file: `node scripts/instantly-scenario-paste.js --out <path>`',
		'',
	];
	for (const row of listColdTemplates()) {
		lines.push('## ' + row.scenarioId, '', '**Subject**', '```', row.subject, '```', '', '**Body**', '```', row.body, '```', '');
	}
	return lines.join('\n');
}

/** JSON export for QA or diffing against Instantly. */
function formatJsonPastePack() {
	return {
		sequence: INSTANTLY_SEQUENCE,
		tier: 'cold_safe',
		leadVars: INSTANTLY_LEAD_VARS.slice(),
		templates: listColdTemplates(),
	};
}

module.exports = {
	COLD_TEMPLATES,
	INSTANTLY_LEAD_VARS,
	INSTANTLY_SEQUENCE,
	templateFor,
	listColdTemplates,
	renderSubject,
	placeholdersIn,
	unknownPlaceholders,
	formatMarkdownPastePack,
	formatJsonPastePack,
};