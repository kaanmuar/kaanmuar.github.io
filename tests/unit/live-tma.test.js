const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('live.html loads the Mini App SDK from its own origin (#3841)', () => {
	const html = read('live.html');
	const src = (html.match(/<script src="([^"]*tma-sdk[^"]*)"/) || [])[1];
	assert.equal(src, 'assets/vendor/tma-sdk-3.3.0.iife.js');
	assert.ok(fs.existsSync(path.join(ROOT, src)), 'the vendored file exists');
	assert.doesNotMatch(html, /telegram\.org\/js/, 'no Telegram-hosted script');
	const policy = html.match(/Content-Security-Policy"\s+content="([^"]*)"/)[1];
	const scriptSrc = policy.match(/(?:^|;)\s*script-src ([^;]*)/)[1].split(/\s+/);
	assert.deepEqual(scriptSrc, ["'self'", 'https://static.cloudflareinsights.com']);
});

test('the vendored tma.js file keeps its MIT licence header and exposes tmajs.sdk', () => {
	const js = read('assets/vendor/tma-sdk-3.3.0.iife.js');
	assert.match(js.slice(0, 400), /^\/\*! @tma\.js\/sdk 3\.3\.0/);
	assert.match(js.slice(0, 1200), /MIT License[\s\S]*Vladislav Kibenko[\s\S]*Permission is hereby granted/);
	assert.match(js, /this\.tmajs=this\.tmajs\|\|\{\};this\.tmajs\.sdk=function/);
});

test("the Reddit build still drops live.html's Mini App script, which it does not ship", () => {
	const build = read('reddit/live-reports/scripts/build.mjs');
	const drop = build.match(/\/\^\\s\*<script src="assets[^\n]*?\/m/);
	assert.ok(drop, 'build.mjs drops the self-hosted tma.js tag');
	assert.match(read('live.html'), new RegExp(drop[0].slice(1, -2), 'm'));
});
