'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const customerMail = require('../../functions/url-review-customer-mail');
const {
	priorIdOf,
	attachSections,
	mailPayloadAttach,
} = require('../../functions/url-review-watch-mail-delta');

const prior = {
	report: {
		insights: {
			score: {
				overall: 62,
				areas: { SEO: { score: 75 }, Security: { score: 46 } },
			},
		},
	},
};
const current = {
	watchOf: 'prior-1',
	lang: 'en',
	report: {
		insights: {
			score: {
				overall: 64,
				areas: { SEO: { score: 62 }, Security: { score: 53 } },
			},
		},
	},
};

test('priorIdOf reads watchOf (#4390)', () => {
	assert.equal(priorIdOf(current), 'prior-1');
	assert.equal(priorIdOf({}), '');
});

test('attachSections builds mail, text, and pdf fragments (#4390)', () => {
	const out = attachSections(prior, current, 'en');
	assert.ok(out);
	assert.match(out.text, /Overall: 62 → 64/);
	assert.match(out.text, /SEO: 75 → 62/);
	assert.doesNotMatch(out.text, /\*\*/);
	assert.match(out.mailHtml, /Since last watch/);
	assert.match(out.mailHtml, /\+2/);
	assert.match(out.pdfHtml, /<h2>/);
});

test('attachSections returns null without a prior snapshot (#4390)', () => {
	assert.equal(attachSections(null, current, 'en'), null);
});

test('mailPayloadAttach merges into reportMail without changing send fields (#4390)', () => {
	const payload = mailPayloadAttach(prior, current, 'en');
	assert.ok(payload.watchDelta);
	const mail = customerMail.reportMail(
		Object.assign({ id: 'r2', email: 'a@example.com', host: 'example.com', status: 'complete', paid: true }, current),
		payload
	);
	assert.match(mail.html, /Since last watch/);
	assert.match(mail.text, /Overall: 62 → 64/);
});

test('reportPdf carries watch delta block (#4390)', () => {
	const payload = mailPayloadAttach(prior, current, 'en');
	const page = customerMail.reportPdf(
		Object.assign({ id: 'r2', email: 'a@example.com', host: 'example.com', status: 'complete', paid: true }, current),
		payload
	);
	assert.match(page.html, /watch-delta/);
	assert.match(page.html, /Since last watch/);
});