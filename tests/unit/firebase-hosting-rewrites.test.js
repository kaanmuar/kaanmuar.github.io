'use strict';
// Config-shape: Firebase Hosting rewrites expose Fediverse discovery (#3841).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const firebase = JSON.parse(
	fs.readFileSync(path.join(__dirname, '../../firebase.json'), 'utf8')
);

function rewriteMap(cfg) {
	const list = (cfg.hosting && cfg.hosting.rewrites) || [];
	const out = new Map();
	for (const row of list) {
		assert.equal(typeof row.source, 'string');
		assert.equal(typeof row.function, 'string');
		out.set(row.source, row.function);
	}
	return out;
}

test('hosting rewrites webfinger and actor paths to Cloud Functions', () => {
	const map = rewriteMap(firebase);
	assert.equal(map.get('/.well-known/webfinger'), 'webfinger');
	assert.equal(map.get('/users/**'), 'socialActor');
	assert.equal(map.get('/desk'), 'reviewUrl');
	assert.equal(map.get('/desk/**'), 'reviewUrl');
});

test('fediverse discovery rewrites stay ahead of catch-alls and name known exports', () => {
	const list = firebase.hosting.rewrites;
	const sources = list.map((r) => r.source);
	assert.ok(sources.indexOf('/.well-known/webfinger') >= 0);
	assert.ok(sources.indexOf('/users/**') >= 0);
	for (const row of list) {
		assert.match(row.function, /^(reviewUrl|webfinger|socialActor)$/);
	}
});
