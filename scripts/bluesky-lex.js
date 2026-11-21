'use strict';
/* Bluesky createRecord via @atproto/lex-client Client (#3841).

   Official Node path: pin @atproto/lex-client (MIT, Node >=22), the runtime Client that
   @atproto/lex re-exports. The umbrella @atproto/lex package also ships CLI/codegen tooling
   and is meant as a bundler/dev dependency — do not pull it into this CommonJS queue.

   Login, blob upload and video stay on plain XRPC in open-social-queue.js; this module only
   owns feed post createRecord so the call site stays small beside feat/3590-apply-unlock. */

function load() {
	return require('@atproto/lex-client');
}

function clientFor(service, { did, accessJwt }) {
	const { Client, buildAgent } = load();
	return new Client(
		buildAgent({
			did,
			service: String(service).replace(/\/$/, ''),
			headers: { Authorization: 'Bearer ' + accessJwt },
		}),
		// Tests and some PDS payloads omit commit/cid; skip client-side response schema checks.
		{ validateResponse: false }
	);
}

function asQueueError(error) {
	const status = error && error.status;
	if (status == null) throw error;
	const why = error.message || error.error || 'request failed';
	throw Object.assign(
		new Error('Bluesky com.atproto.repo.createRecord ' + status + ': ' + String(why).slice(0, 300)),
		{ status }
	);
}

/** Create an app.bsky.feed.post (or any $typed record) through Client.createRecord. */
async function createFeedPost({ service, did, accessJwt, record }) {
	const client = clientFor(service, { did, accessJwt });
	try {
		const res = await client.createRecord(record);
		return res.body;
	} catch (error) {
		asQueueError(error);
	}
}

module.exports = { createFeedPost, clientFor, asQueueError };
