const test = require('node:test');
const assert = require('node:assert/strict');
const clip = require('../../scripts/social-clip');
const hub = require('../../scripts/build-social-hub');

test('release URLs name the batch release and slug', () => {
	assert.equal(
		clip.releaseUrl('auto-2026-11-04', '01-u-selia-co'),
		'https://github.com/kaanmuar/kaanmuar.github.io/releases/download/auto-2026-11-04/01-u-selia-co.mp4'
	);
});

test('ofPost adds a clip when clipLang is set or the mp4 is tracked', () => {
	const files = new Set(['media/social-posts/tips-2026-10/clip/01-hsts.mp4']);
	assert.deepEqual(clip.ofPost({ batch: 'auto-2026-11-04', slug: '01-a', clipLang: 'pt' }, files), {
		url: clip.releaseUrl('auto-2026-11-04', '01-a'),
		lang: 'pt',
	});
	assert.deepEqual(clip.ofPost({ batch: 'tips-2026-10', slug: '01-hsts', clipLang: null }, files), {
		url: clip.releaseUrl('tips-2026-10', '01-hsts'),
		lang: 'en',
	});
	assert.equal(clip.ofPost({ batch: 'auto-2026-11-04', slug: '01-a', clipLang: null }, new Set()), null);
});

test('fromBatch takes voiced.json over captions.lang', () => {
	assert.deepEqual(clip.fromBatch('b', '01-a', { lang: 'en' }, { '01-a': { lang: 'es' } }), {
		url: clip.releaseUrl('b', '01-a'),
		lang: 'es',
	});
	assert.equal(clip.fromBatch('b', '01-a', {}, {}), null);
});

test('mediaLang prefers the clip language for video composers', () => {
	const voiced = { url: clip.releaseUrl('b', 'a'), lang: 'de' };
	assert.equal(clip.mediaLang(voiced, 'en'), 'de');
	assert.equal(clip.mediaLang(null, 'en'), 'en');
});

test('batchPosts attach clip metadata for Live Report batches', () => {
	const files = new Set([
		'media/social-posts/auto-2026-11-04/captions.json',
		'media/social-posts/auto-2026-11-04/feed/01-u-selia-co.jpg',
	]);
	const posts = hub.batchPosts(files, new Set(['u-selia-co']));
	assert.equal(posts.length, 1);
	assert.deepEqual(posts[0].clip, { url: clip.releaseUrl('auto-2026-11-04', '01-u-selia-co'), lang: 'en' });
	const feed = JSON.parse(hub.feedJson(posts, '2026-11-16')).posts[0];
	assert.deepEqual(feed.clip, posts[0].clip);
});
