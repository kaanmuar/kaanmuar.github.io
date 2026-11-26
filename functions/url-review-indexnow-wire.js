'use strict';

/* Opt-in customer IndexNow after a successful review (#4379). Thin wire over
   url-review-indexnow-customer.js — pattern from jarvis-index.js push logging. */

const customer = require('./url-review-indexnow-customer');

function cleanKey(value) {
	return String(value || '')
		.trim()
		.replace(/[^a-f0-9]/gi, '')
		.slice(0, 64);
}

function indexNowOpts(hooks) {
	const h = hooks || {};
	if (h.indexNow && typeof h.indexNow === 'object') return h.indexNow;
	if (h.indexNow === true) return { enabled: true, key: h.indexNowKey };
	return h.indexNowKey ? { key: h.indexNowKey } : null;
}

/** True when env or hooks opt in and a customer key is present. Off by default. */
function wireEligible(hooks, env) {
	const h = hooks || {};
	if (h.softPreview === true || h.passive === true) return false;
	const opts = indexNowOpts(h);
	if (opts && opts.enabled === false) return false;
	const key = cleanKey((opts && opts.key) || h.indexNowKey);
	if (!key) return false;
	return customer.enabled({
		env: env || process.env,
		enabled: opts && opts.enabled === true ? true : undefined,
	});
}

function pagesForIndexNow(pages) {
	return (Array.isArray(pages) ? pages : []).map((page) => ({
		url: page && page.url,
		status: page && page.status,
		inspect: page && page.inspect,
	}));
}

function logFor(out) {
	if (!out || !out.enabled) return 'IndexNow: skipped (opt-in off).';
	if (out.reason === 'missing-fetch-origin-or-key') return 'IndexNow: skipped (no customer key on this run).';
	if (out.reason === 'no-indexable-urls')
		return 'IndexNow: no indexable pages to send' + (out.skipped && out.skipped.length ? ' (' + out.skipped.length + ' skipped).' : '.');
	if (out.reason === 'key-verification-failed')
		return 'IndexNow: key file at ' + ((out.key && out.key.url) || 'the site root') + ' did not verify.';
	if (out.ok && (out.indexnow === 200 || out.indexnow === 202))
		return 'IndexNow took ' + (out.submitted || 0) + ' page' + (out.submitted === 1 ? '' : 's') + ' (HTTP ' + out.indexnow + ').';
	if (out.indexnow != null) return 'IndexNow failed: HTTP ' + out.indexnow + '.';
	if (out.error) return 'IndexNow failed: ' + out.error + '.';
	if (out.reason) return 'IndexNow: ' + out.reason.replace(/-/g, ' ') + '.';
	return 'IndexNow: finished.';
}

/**
 * After a successful review crawl, optionally ping IndexNow for the customer's site.
 * @returns {Promise<object|null>} dispatcher result, or null when the gate is closed
 */
async function attachAfterReview(ctx) {
	const hooks = (ctx && ctx.hooks) || {};
	const env = (ctx && ctx.env) || process.env;
	if (!wireEligible(hooks, env)) return null;
	const opts = indexNowOpts(hooks) || {};
	const key = cleanKey(opts.key || hooks.indexNowKey);
	const fetchFn = ctx.fetch || globalThis.fetch;
	if (typeof fetchFn !== 'function') return null;
	const pages = pagesForIndexNow(ctx.pages);
	const out = await customer.runCustomerIndexNow({
		env,
		enabled: true,
		fetch: fetchFn,
		origin: ctx.origin,
		key,
		pages,
		now: ctx.now,
	});
	if (ctx.note) {
		ctx.note(logFor(out));
		if (out.urls && out.urls.length)
			ctx.note('IndexNow URLs submitted: ' + out.urls.slice(0, 12).join(', ') + (out.urls.length > 12 ? '…' : '') + '.');
		if (out.skipped && out.skipped.length) {
			const sample = out.skipped
				.slice(0, 8)
				.map((row) => row.url + ' (' + row.reason + ')')
				.join('; ');
			ctx.note(
				'IndexNow skipped ' +
					out.skipped.length +
					' URL' +
					(out.skipped.length === 1 ? '' : 's') +
					(sample ? ': ' + sample + (out.skipped.length > 8 ? '…' : '') : '') +
					'.'
			);
		}
	}
	return out;
}

module.exports = {
	wireEligible,
	attachAfterReview,
	logFor,
};