const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const load = () => import('../../workers/edge-og/src/og.js');

const SAMPLE_INDEX = {
	reports: [
		{
			id: 'govuk',
			name: 'GOV.UK',
			host: 'www.gov.uk',
			pages: 20,
			overall: 92,
			grade: 'A',
			areas: { SEO: 86, GEO: 86, Analytics: 97, Security: 94, Accessibility: 100, Performance: 89 },
		},
	],
};

const SAMPLE_FEED = {
	posts: [
		{ id: 'runs-1/govuk-en', report: 'govuk', lang: 'en', image: 'media/social-posts/runs-1/feed/govuk-en.jpg' },
		{ id: 'runs-1/govuk-es', report: 'govuk', lang: 'es', image: 'media/social-posts/runs-1/feed/govuk-es.jpg' },
	],
};

test('live report ?live=<id> produces localized OG/Twitter cards with matching social post image (#3764)', async () => {
	const { metaForLive } = await load();
	const es = metaForLive(new URL('https://carlosandmunoz.com/qa-review-es.html?live=govuk'), SAMPLE_INDEX, SAMPLE_FEED);
	assert.equal(es.title, 'GOV.UK: 92/100 (A) · QA-lab URL Review');
	assert.match(es.description, /www\.gov\.uk obtuvo 92\/100 \(nota A\) en 20 páginas analizadas/);
	assert.equal(es.url, 'https://carlosandmunoz.com/qa-review-es.html?live=govuk');
	assert.equal(es.image, 'https://carlosandmunoz.com/media/social-posts/runs-1/feed/govuk-es.jpg');
	assert.match(es.imageAlt, /GOV\.UK \(www\.gov\.uk\) obtuvo 92\/100/);

	const frFallback = metaForLive(new URL('https://carlosandmunoz.com/qa-review-fr.html?live=govuk'), SAMPLE_INDEX, {
		posts: [],
	});
	assert.equal(frFallback.image, 'https://carlosandmunoz.com/assets/share/qa-review-pitch-fr.jpg?v=20261110-3424');
	assert.match(frFallback.description, /sur 20 pages analysées/);
});

test('private ?report= links, missing ?live=, and unknown ids return null so generic tags stay private (#3764)', async () => {
	const { metaForLive } = await load();
	assert.equal(
		metaForLive(new URL('https://carlosandmunoz.com/qa-review.html?report=abc123'), SAMPLE_INDEX, SAMPLE_FEED),
		null
	);
	assert.equal(metaForLive(new URL('https://carlosandmunoz.com/qa-review.html'), SAMPLE_INDEX, SAMPLE_FEED), null);
	assert.equal(
		metaForLive(new URL('https://carlosandmunoz.com/qa-review.html?live=does-not-exist'), SAMPLE_INDEX, SAMPLE_FEED),
		null
	);
	assert.equal(
		metaForLive(new URL('https://carlosandmunoz.com/qa-review.html?live=<script>'), SAMPLE_INDEX, SAMPLE_FEED),
		null
	);
});

test('live audit fixes: ProfessionalService has address, book/explorer exceed 150 static words, face titles fit <60 chars, and PHISHSTATS_KEY is optional', () => {
	const root = path.join(__dirname, '../..');
	const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
	const serviceJson = JSON.parse(
		indexHtml.match(/<script type="application\/ld\+json" id="service-structured-data">([\s\S]*?)<\/script>/)[1]
	);
	assert.equal(serviceJson.address['@type'], 'PostalAddress');
	assert.equal(serviceJson.address.addressCountry, 'CO');

	for (const file of ['book.html', 'qa-review-explorer.html']) {
		const html = fs.readFileSync(path.join(root, file), 'utf8');
		const main = html
			.match(/<main[\s\S]*?<\/main>/)[0]
			.replace(/<[^>]+>/g, ' ')
			.trim();
		const words = main.split(/\s+/).length;
		assert.ok(words >= 150, `${file} has only ${words} static words`);
	}

	for (const file of ['qalaburlreview.html', 'qaurlreview.html']) {
		const html = fs.readFileSync(path.join(root, file), 'utf8');
		const title = html.match(/<title>([^<]+)<\/title>/)[1];
		assert.ok(title.length <= 60, `${file} title is ${title.length} chars: ${title}`);
	}

	const secrets = require('../../functions/secrets.js');
	assert.ok(
		!secrets.ALL.includes('PHISHSTATS_KEY'),
		'PHISHSTATS_KEY stays optional in .env.example until Secret Manager holds a key (#3291)'
	);
});
