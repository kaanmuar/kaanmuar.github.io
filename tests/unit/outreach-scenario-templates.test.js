'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const scenarios = require('../../functions/url-review-scenarios');
const templates = require('../../functions/outreach-scenario-templates');

const PLACEHOLDERS = [
	'{{host}}',
	'{{finding_1}}',
	'{{scenario_body_line}}',
	'{{scenario_consequence}}',
	'{{scenario_cta}}',
	'{{firstName}}',
];

const SCENARIO_CUSTOM = ['scenario_body_line', 'scenario_consequence', 'scenario_cta'];

function wordCount(text) {
	return String(text)
		.trim()
		.split(/\s+/)
		.filter(Boolean).length;
}

test('every cold_safe scenario has an Instantly template with required placeholders', () => {
	const coldIds = scenarios.SCENARIOS.filter((row) => row.tier === 'cold_safe' && !row.vertical).map(
		(row) => row.scenarioId
	);
	assert.deepEqual(
		templates.listColdTemplates().map((row) => row.scenarioId).sort(),
		coldIds.slice().sort()
	);
	for (const row of templates.listColdTemplates()) {
		const blob = row.subject + ' ' + row.body;
		for (const ph of PLACEHOLDERS) {
			assert.ok(blob.includes(ph), row.scenarioId + ' missing ' + ph);
		}
		assert.ok(wordCount(row.body) >= 45 && wordCount(row.body) <= 80, row.scenarioId + ' word count');
		assert.ok(!scenarios.FORBIDDEN_COLD.test(blob), row.scenarioId);
	}
	assert.equal(templates.templateFor('warm-sec-csp'), null);
});

test('templates use only Instantly-safe placeholders', () => {
	for (const row of templates.listColdTemplates()) {
		const blob = row.subject + '\n' + row.body;
		assert.deepEqual(templates.unknownPlaceholders(blob), [], row.scenarioId);
		assert.ok(!/\{[a-z_]+\}/.test(blob.replace(/\{\{[a-zA-Z0-9_]+\}\}/g, '')), row.scenarioId + ' single-brace');
		for (const name of SCENARIO_CUSTOM) {
			assert.ok(blob.includes('{{' + name + '}}'), row.scenarioId + ' missing scenario var ' + name);
		}
	}
	assert.deepEqual(templates.INSTANTLY_LEAD_VARS.slice().sort(), [
		'finding_1',
		'firstName',
		'host',
		'scenario_body_line',
		'scenario_card_url',
		'scenario_consequence',
		'scenario_cta',
		'scenario_id',
		'scenario_subject',
	]);
});

test('paste pack documents sequence T and every cold template', () => {
	const md = templates.formatMarkdownPastePack();
	assert.match(md, /sequence T/);
	assert.match(md, /Regenerate this file/);
	for (const row of templates.listColdTemplates()) {
		assert.match(md, new RegExp('## ' + row.scenarioId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
	}
	const pack = templates.formatJsonPastePack();
	assert.equal(pack.sequence, templates.INSTANTLY_SEQUENCE);
	assert.equal(pack.tier, 'cold_safe');
	assert.equal(pack.templates.length, templates.listColdTemplates().length);
});

test('renderSubject fills subjectHint with the bare host', () => {
	const row = scenarios.scenarioForFinding('a11y-labels');
	assert.equal(
		templates.renderSubject(row, 'https://www.Hotel.example/path'),
		'A form field on hotel.example ships without a tied label'
	);
	assert.equal(
		templates.renderSubject(row, 'www.Cafe-Brava.com.co'),
		'A form field on cafe-brava.com.co ships without a tied label'
	);
	assert.equal(templates.renderSubject(null, 'x.com'), '');
});