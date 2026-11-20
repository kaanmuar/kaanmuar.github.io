const test = require('node:test');
const assert = require('node:assert/strict');
const gate = require('../../scripts/hub-gate');
const { inputsFor } = require('../../scripts/buffer-queue');

const at = { batch: 'auto-2026-10-23', slug: '01-u-grupoexito-com-co' };
const hub = gate.SITE + '/social/auto-2026-10-23/01-u-grupoexito-com-co.html';
const xSize = (text) =>
	[...text.replace(/(?:https?:\/\/)?(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/\S*)?/gi, 'x'.repeat(23))].length;
const X =
	'grupoexito.com.co: 68. The gap: button names.\n\nGive every button text or an aria-label, so a screen reader can announce it.\n\n' +
	'carlosandmunoz.com/qa-review?live=u-grupoexito-com-co&utm_source=x&utm_medium=social&utm_campaign=requested-reviews&utm_content=u-grupoexito-com-co\n#QAlab';

test('a caption ends with its hub post, tagged for the network and the batch', () => {
	const out = gate.withHubLink('Give every page a title.', Object.assign({ network: 'linkedin' }, at));
	assert.equal(
		out,
		'Give every page a title.\n\n' + hub + '?utm_source=linkedin&utm_medium=social&utm_campaign=auto-2026-10-23'
	);
});

test('a caption that already links its hub post, or has no text, is left as it is', () => {
	const linked = 'See it: ' + hub + '?utm_source=x';
	assert.equal(gate.withHubLink(linked, Object.assign({ network: 'x' }, at)), linked);
	assert.equal(
		gate.withHubLink(
			'Also at carlosandmunoz.com/social/auto-2026-10-23/01-u-grupoexito-com-co.html',
			Object.assign({ network: 'x' }, at)
		),
		'Also at carlosandmunoz.com/social/auto-2026-10-23/01-u-grupoexito-com-co.html'
	);
	const short = 'Picks: carlosandmunoz.com/social/auto-2026-10-23/01-u-grupoexito-com-co?utm_source=x';
	assert.equal(gate.withHubLink(short, Object.assign({ network: 'x' }, at)), short);
	assert.notEqual(
		gate.withHubLink(
			'carlosandmunoz.com/social/auto-2026-10-23/01-u-grupoexito-com-co-2',
			Object.assign({ network: 'x' }, at)
		),
		'carlosandmunoz.com/social/auto-2026-10-23/01-u-grupoexito-com-co-2'
	);
	assert.equal(gate.withHubLink('', Object.assign({ network: 'x' }, at)), '');
	assert.equal(gate.withHubLink(undefined, Object.assign({ network: 'x' }, at)), undefined);
});

test('on X every link counts as 23 characters, so a full 279-character caption still takes the hub link whole', () => {
	assert.equal(X.length, 279);
	const out = gate.withHubLink(X, Object.assign({ network: 'x' }, at));
	assert.ok(out.startsWith(X + '\n\n' + hub + '?utm_source=x&'));
	assert.ok(xSize(out) <= 280, String(xSize(out)));
});

test('past the limit a caption loses whole words from its end, never part of a link', () => {
	const out = gate.withHubLink(X, Object.assign({ network: 'bluesky' }, at));
	assert.ok([...out].length <= 300, String([...out].length));
	assert.ok(out.endsWith('\n\n' + hub + '?utm_source=bluesky&utm_medium=social&utm_campaign=auto-2026-10-23'));
	assert.match(out, /^grupoexito\.com\.co: 68\. The gap: button names\./);
	assert.doesNotMatch(out, /qa-review\?live/);
	assert.match(out, /…\n\n/);
	const long = gate.withHubLink(
		('word '.repeat(80) + 'https://carlosandmunoz.com/qa-review.html').trim(),
		Object.assign({ network: 'x' }, at)
	);
	assert.ok(xSize(long) <= 280);
	assert.doesNotMatch(long, /https:\/\/carlosandmunoz\.com\/qa-review\.html/);
});

test("buffer-queue tags each channel's caption with its own network and leaves the story card alone", () => {
	const cap = {
		linkedin: 'In.',
		x: 'On X.',
		instagram: 'Ig.',
		facebook: 'Fb.',
		tiktok: 'Tt.',
		youtube: 'Yt.',
		youtubeTitle: 'T',
		title: 'Story',
		alt: 'a',
	};
	const posts = (service) =>
		inputsFor({ id: 'c', service }, at.slug, cap, 'https://site/media', 'https://clips', {}, at.batch);
	const text = (service) => posts(service).map(({ slot, input }) => [slot, input.text]);
	const source = (t) =>
		(t.match(/utm_source=([a-z]+)&utm_medium=social&utm_campaign=auto-2026-10-23(?:&utm_content=[^\s]+)?$/) || [])[1];
	const fcSource = (service) => {
		const input = posts(service)[0].input;
		const meta =
			(input.metadata && (input.metadata.linkedin || input.metadata.facebook || input.metadata.instagram)) || {};
		return source(meta.firstComment || '');
	};
	assert.equal(source(text('twitter')[0][1]), 'x');
	// LI/IG/FB: UTMs live in firstComment (#3551); body stays without utm_source.
	['linkedin', 'facebook'].forEach((service) => {
		assert.equal(source(text(service)[0][1]), undefined, service + ' body');
		assert.equal(fcSource(service), service, service + ' firstComment');
	});
	['tiktok', 'youtube'].forEach((service) => assert.equal(source(text(service)[0][1]), service, service));
	['threads', 'bluesky', 'mastodon'].forEach((service) =>
		assert.deepEqual(text(service), [], service + ' is posted by open-social-queue.js')
	);
	const ig = posts('instagram');
	assert.equal(source(ig[0].input.text), undefined);
	assert.equal(source(ig[0].input.metadata.instagram.firstComment), 'instagram');
	assert.deepEqual([ig[1].slot, ig[1].input.text], ['instagram-story', 'Story']);
});
