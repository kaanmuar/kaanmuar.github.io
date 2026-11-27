const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('../../functions/telegram-handles');

test('parseTelegramLink keeps public @usernames and drops joinchat / +invite / reserved paths', () => {
	assert.deepEqual(H.parseTelegramLink('https://t.me/SomeBrand_HQ'), {
		handle: 'somebrand_hq',
		url: 'https://t.me/somebrand_hq',
		kind: 'chat',
	});
	assert.deepEqual(H.parseTelegramLink('https://telegram.me/SomeBrand_HQ/12'), {
		handle: 'somebrand_hq',
		url: 'https://t.me/somebrand_hq',
		kind: 'channel',
	});
	assert.equal(H.parseTelegramLink('https://t.me/+AbCdEf'), null);
	assert.equal(H.parseTelegramLink('https://t.me/joinchat/AAAA'), null);
	assert.equal(H.parseTelegramLink('https://t.me/share/url?url=x'), null);
	assert.equal(H.parseTelegramLink('https://x.com/foo'), null);
});

test('fromSocialLinks de-dupes and caps; fromReport reads card.telegram or observed.socialLinks', () => {
	assert.deepEqual(
		H.fromSocialLinks([
			'https://t.me/AlphaOne',
			'https://t.me/alphaone',
			'https://instagram.com/nope',
			'https://t.me/BetaTwo',
		]).map((t) => t.handle),
		['alphaone', 'betatwo']
	);
	assert.deepEqual(
		H.fromReport({ telegram: [{ handle: 'GammaThree', url: 'https://t.me/gammathree' }] }).map((t) => t.handle),
		['gammathree']
	);
	assert.deepEqual(
		H.fromReport({ observed: { socialLinks: ['https://t.me/DeltaFour'] } }).map((t) => t.handle),
		['deltafour']
	);
});
