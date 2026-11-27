'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const W = require('../../functions/url-review-watch-mail-idem');
const webhookIdem = require('../../functions/webhook-idempotency');

test('index wires watchMailIdem.sendOnce in mailReportToAsker (#4411)', () => {
	const index = fs.readFileSync(path.join(__dirname, '../../functions/index.js'), 'utf8');
	assert.match(index, /watchMailIdem\.sendOnce/);
	assert.match(index, /watchMailIdem\.isWatchRerun\(record\)/);
	assert.match(index, /mergeMailHeaders\(mail\)/);
});

test('watch rerun mail path: dry-run does not deliver; live send merges headers (#4411)', async () => {
	const record = { id: 'rep-new', watchOf: 'rep-old', email: 'agency@client.com', report: { host: 'x.test' } };
	const stopUrl = 'https://x.test/stop';
	const mail = { subject: 'watch', text: 't', html: '<p>t</p>' };
	let deliver = 0;
	const dry = await W.sendOnce({
		store: webhookIdem.memoryStore(),
		env: {},
		record,
		stopUrl,
		send: async ({ mergeMailHeaders }) => {
			deliver++;
			const merged = mergeMailHeaders(mail);
			assert.equal(merged.headers['List-Unsubscribe'], '<' + stopUrl + '>');
			return true;
		},
	});
	assert.equal(dry.why, 'dry-run');
	assert.equal(deliver, 0);
	const env = { [W.ENV_SEND]: 'on' };
	const live = await W.sendOnce({
		store: webhookIdem.memoryStore(),
		env,
		record,
		stopUrl,
		send: async ({ mergeMailHeaders }) => {
			deliver++;
			return mergeMailHeaders(mail).subject === 'watch';
		},
	});
	assert.equal(live.sent, true);
	assert.equal(deliver, 1);
	assert.equal(W.mailedFromIdem(live), true);
});