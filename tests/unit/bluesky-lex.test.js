const test = require('node:test');
const assert = require('node:assert/strict');
const lex = require('../../scripts/bluesky-lex');

const ok = (json, status = 200) =>
	new Response(JSON.stringify(json), { status, headers: { 'Content-Type': 'application/json' } });

test('createFeedPost posts through @atproto/lex-client Client.createRecord (#3841)', async () => {
	const real = global.fetch;
	const calls = [];
	global.fetch = async (url, opts = {}) => {
		calls.push({ url: String(url), method: opts.method || 'GET', body: opts.body });
		return ok({ uri: 'at://did:plc:me/app.bsky.feed.post/abc', cid: 'bafyreihyrpefhacm6kkp4ql6j6udakdit7g3dks6kt3nmljvwqv5ufs3q4' });
	};
	try {
		const out = await lex.createFeedPost({
			service: 'https://bsky.social/',
			did: 'did:plc:me',
			accessJwt: 'tok',
			record: { $type: 'app.bsky.feed.post', text: 'Hello', createdAt: '2026-01-01T00:00:00.000Z', langs: ['en'] },
		});
		assert.equal(out.uri, 'at://did:plc:me/app.bsky.feed.post/abc');
		assert.equal(calls.length, 1);
		assert.match(calls[0].url, /\/xrpc\/com\.atproto\.repo\.createRecord$/);
		assert.equal(calls[0].method, 'POST');
		const body = JSON.parse(calls[0].body);
		assert.equal(body.repo, 'did:plc:me');
		assert.equal(body.collection, 'app.bsky.feed.post');
		assert.equal(body.record.text, 'Hello');
	} finally {
		global.fetch = real;
	}
});

test('createFeedPost maps XRPC failures to queue status errors', async () => {
	const real = global.fetch;
	global.fetch = async () => ok({ error: 'InvalidRecord', message: 'bad video' }, 400);
	try {
		await assert.rejects(
			lex.createFeedPost({
				service: 'https://bsky.social',
				did: 'did:plc:me',
				accessJwt: 'tok',
				record: { $type: 'app.bsky.feed.post', text: 'x', createdAt: '2026-01-01T00:00:00.000Z' },
			}),
			(err) => {
				assert.equal(err.status, 400);
				assert.match(err.message, /Bluesky com\.atproto\.repo\.createRecord 400:.*bad video/);
				return true;
			}
		);
	} finally {
		global.fetch = real;
	}
});
