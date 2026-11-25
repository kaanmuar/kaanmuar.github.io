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