const test = require('node:test');
const assert = require('node:assert/strict');
const api = require('../../functions/telegram-api');

const json = (status, body, headers = {}) =>
	new Response(JSON.stringify(body), {
		status,
		headers: Object.assign({ 'content-type': 'application/json' }, headers),
	});

const rig = (queue) => {
	const calls = [];
	const waits = [];
	const left = [...queue];
	return {
		calls,
		waits,
		opts: {
			fetchImpl: async (url, init) => {
				calls.push({
					url: String(url),
					method: (init && init.method) || 'GET',
					body: init && init.body,
				});
				const next = left.length > 1 ? left.shift() : left[0];
				if (next instanceof Error) throw next;
				return typeof next === 'function' ? next() : next;
			},
			sleep: async (ms) => waits.push(ms),
			random: () => 0.5,
		},
	};
};

test('skipWhy names TELEGRAM_BOT_TOKEN when missing, empty when set', () => {
	assert.match(api.skipWhy({}), /TELEGRAM_BOT_TOKEN missing/);
	assert.equal(api.skipWhy({ TELEGRAM_BOT_TOKEN: 'x' }), '');
	assert.equal(api.ready({}), false);
	assert.equal(api.ready({ TELEGRAM_BOT_TOKEN: 'x' }), true);
});

test('createApi returns result and POSTs JSON without echoing the token in errors', async () => {
	const r = rig([json(200, { ok: true, result: { id: 1, username: 'qalab_live_bot' } })]);
	const call = api.createApi('123:SECRET', { ...r.opts, retries: 1 });
	const me = await call('getMe', {});
	assert.equal(me.username, 'qalab_live_bot');
	assert.equal(r.calls.length, 1);
	assert.equal(r.calls[0].method, 'POST');
	assert.ok(r.calls[0].url.includes('/bot123:SECRET/getMe'));
	assert.equal(r.calls[0].body, '{}');
});

test('createApi retries HTTP 503 then returns result', async () => {
	const r = rig([
		json(503, { ok: false, description: 'busy' }),
		json(200, { ok: true, result: 42 }),
	]);
	const call = api.createApi('tok', { ...r.opts, retries: 3, baseMs: 100 });
	assert.equal(await call('getChatMemberCount', { chat_id: '@qalab_live' }), 42);
	assert.equal(r.calls.length, 2);
	assert.ok(r.waits.length >= 1);
	assert.ok(JSON.parse(r.calls[0].body).chat_id === '@qalab_live');
});

test('HTTP 429 honors Retry-After before succeeding', async () => {
	const r = rig([
		() => json(429, { ok: false, description: 'rate', error_code: 429 }, { 'retry-after': '2' }),
		() => json(200, { ok: true, result: true }),
	]);
	const call = api.createApi('tok', { ...r.opts, retries: 2, maxRetryAfterMs: 5000 });
	assert.equal(await call('setMessageReaction', { chat_id: 1, message_id: 2 }), true);
	assert.deepEqual(r.waits, [2000]);
});

test('Bot API flood wait (HTTP 200 + retry_after) is retried', async () => {
	const r = rig([
		json(200, {
			ok: false,
			error_code: 429,
			description: 'Too Many Requests: retry after 3',
			parameters: { retry_after: 3 },
		}),
		json(200, { ok: true, result: { message_id: 9 } }),
	]);
	const call = api.createApi('tok', { ...r.opts, retries: 2, maxRetryAfterMs: 10000 });
	const out = await call('sendMessage', { chat_id: 1, text: 'hi' });
	assert.equal(out.message_id, 9);
	assert.equal(r.calls.length, 2);
	assert.deepEqual(r.waits, [3000]);
});

test('4xx Bot API error is not retried and keeps a clear surface without the token', async () => {
	const r = rig([
		json(400, { ok: false, error_code: 400, description: 'Bad Request: chat not found' }),
	]);
	const call = api.createApi('123:SECRET', { ...r.opts, retries: 5 });
	await assert.rejects(
		() => call('getChat', { chat_id: '@missing' }),
		(error) =>
			error instanceof api.TelegramApiError &&
			/Telegram 400: Bad Request: chat not found/.test(error.message) &&
			!error.message.includes('SECRET') &&
			error.method === 'getChat'
	);
	assert.equal(r.calls.length, 1);
	assert.equal(r.waits.length, 0);
});

test('missing token fails at once', async () => {
	const r = rig([json(200, { ok: true, result: 1 })]);
	const call = api.createApi('', { ...r.opts });
	await assert.rejects(() => call('getMe'), /TELEGRAM_BOT_TOKEN/);
	assert.equal(r.calls.length, 0);
});
