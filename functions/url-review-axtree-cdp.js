'use strict';

/* Opt-in CDP Accessibility.getFullAXTree attach for the managed review browser (#3831).
   Playwright and Puppeteer both expose a session with send(method[, params]); this module talks
   only to that shape, then pipes the tree into url-review-axtree reduce/findings.

   Ops enablement (off by default — never pulls a browser into Cloud Functions analyze):
     QA_AXTREE_CDP=1   or   URL_REVIEW_AXTREE_CDP=1
   on the review runner, or pass { enabled: true } / { axtreeCdp: true } into attach().
   Manual offline path stays scripts/axtree-audit.js (--file or Playwright capture). */

const axtree = require('./url-review-axtree');

const ENV_KEYS = ['QA_AXTREE_CDP', 'URL_REVIEW_AXTREE_CDP'];

function truthy(value) {
	if (value === true || value === 1) return true;
	const text = String(value == null ? '' : value)
		.trim()
		.toLowerCase();
	return text === '1' || text === 'true' || text === 'yes' || text === 'on';
}

/** True when env or options opt in. Explicit false on options wins over env. */
function enabled(options) {
	const opts = options || {};
	if (opts.enabled === false || opts.axtreeCdp === false || opts.attach === false) return false;
	if (opts.enabled === true || opts.axtreeCdp === true || opts.attach === true || opts.force === true) return true;
	const env = opts.env || process.env;
	for (let i = 0; i < ENV_KEYS.length; i++) {
		if (truthy(env[ENV_KEYS[i]])) return true;
	}
	return false;
}

async function fetchTree(session) {
	if (!session || typeof session.send !== 'function') {
		throw new Error('CDP session needs a send() method (Playwright or Puppeteer).');
	}
	try {
		await session.send('Accessibility.enable');
	} catch (error) {
		/* some Chromium sessions already have the domain; getFullAXTree still works */
	}
	return session.send('Accessibility.getFullAXTree');
}

/** Open a CDP session from a Playwright page (context.newCDPSession) or Puppeteer page (createCDPSession). */
async function openSession(page) {
	if (!page) throw new Error('Need a page to open a CDP session.');
	if (typeof page.createCDPSession === 'function') return page.createCDPSession();
	const context = typeof page.context === 'function' ? page.context() : page.context;
	if (context && typeof context.newCDPSession === 'function') return context.newCDPSession(page);
	throw new Error('Page has no Playwright/Puppeteer CDP session API.');
}

/**
 * Fetch the live AXTree and reduce it for extras.axtree / insights.
 * @param {object} sessionOrPage CDP session with send(), or a Playwright/Puppeteer page
 * @param {object} [options] enabled/force/env, url, keepTree, reduce (default true)
 * @returns {Promise<{attached:boolean, reason?:string, tree?:object, report?:object, axtree?:object}>}
 */
async function attach(sessionOrPage, options) {
	const opts = options || {};
	if (!enabled(opts)) return { attached: false, reason: 'disabled' };

	let session = sessionOrPage;
	let owned = false;
	if (!sessionOrPage || typeof sessionOrPage.send !== 'function') {
		session = await openSession(sessionOrPage);
		owned = true;
	}

	try {
		const tree = await fetchTree(session);
		const report = opts.reduce === false ? null : axtree.reduce(tree, { url: opts.url || '' });
		const payload = report || tree;
		const out = { attached: true, axtree: payload };
		if (opts.keepTree !== false) out.tree = tree;
		if (report) out.report = report;
		return out;
	} finally {
		if (owned && session && typeof session.detach === 'function') {
			await session.detach().catch(() => {});
		}
	}
}

module.exports = {
	ENV_KEYS,
	enabled,
	fetchTree,
	openSession,
	attach,
};
