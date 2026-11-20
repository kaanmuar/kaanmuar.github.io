'use strict';

/* Passive cyber hardening checks (#3842). Everything here reads what the review already fetched: the
   Content-Security-Policy header and meta tag, the script and stylesheet tags in the HTML. Nothing is sent.
   - CSP bypass patterns, written from the rule set of google/csp-evaluator (Apache-2.0): shared script hosts,
     data:/blob: sources, 'unsafe-hashes', weak nonces, plain-http sources.
   - Script addresses against the retire.js v6 "backdoored" list (RetireJS, Apache-2.0), bundled in
     assets/retire-backdoored.json (scripts/retire-update.js refreshes it).
   - Subresource Integrity quality on cross-origin scripts and stylesheets: weak or missing hash algorithm,
     integrity without crossorigin (the browser then refuses the file), stylesheets with no hash. */

const { say, some } = require('./url-review-findings-en');

let BACKDOORED = { entries: [], fetched: '' };
try {
	BACKDOORED = require('./assets/retire-backdoored.json');
} catch (error) {
	/* the list is optional: without it the backdoored check stays silent */
}

// Hosts where a script from the allowlist can be turned into code the attacker chose: JSONP endpoints and
// hosted AngularJS builds (ajax.googleapis.com, cdnjs, jsdelivr, unpkg) and hosts anyone can upload files to.
const BYPASS_HOSTS = [
	'ajax.googleapis.com',
	'cdnjs.cloudflare.com',
	'cdn.jsdelivr.net',
	'unpkg.com',
	'code.angularjs.org',
	'ajax.aspnetcdn.com',
	'accounts.google.com',
	'www.google.com',
	'maps.googleapis.com',
	'googleapis.com',
	'raw.githack.com',
	'rawcdn.githack.com',
	'cdn.rawgit.com',
	'github.io',
	'githubusercontent.com',
	'amazonaws.com',
	'herokuapp.com',
	'appspot.com',
	'firebaseapp.com',
	'web.app',
	'netlify.app',
	'vercel.app',
	'pages.dev',
	'workers.dev',
	'glitch.me',
	'repl.co',
];

const NONCE_OK = /^[A-Za-z0-9+/_-]{8,}={0,2}$/;
const STRONG_SRI = /^sha(256|384|512)-/i;

function parsePolicy(value) {
	const map = {};
	String(value || '')
		.split(';')
		.forEach((part) => {
			const bits = part.trim().split(/\s+/).filter(Boolean);
			if (!bits.length) return;
			const name = bits[0].toLowerCase();
			if (!map[name]) map[name] = bits.slice(1);
		});
	return map;
}

function sourceHost(token) {
	const text = String(token || '').replace(/^[a-z][a-z0-9+.-]*:\/\//i, '');
	if (!/^(\*\.)?[a-z0-9-]+(\.[a-z0-9-]+)+/i.test(text)) return '';
	return text.split(/[/:?#]/)[0].toLowerCase();
}

// The bypass host a source allows, or "": exact host, a subdomain of a listed host, or a wildcard above one.
function bypassHostOf(token) {
	const host = sourceHost(token);
	if (!host) return '';
	const wild = host.indexOf('*.') === 0;
	const base = wild ? host.slice(2) : host;
	return (
		BYPASS_HOSTS.find(
			(listed) => base === listed || base.endsWith('.' + listed) || (wild && listed.endsWith('.' + base))
		) || ''
	);
}

/* One policy string in, a list of { id, detail } out. ids: host, dataScheme, unsafeHashes, weakNonce, plainHttp. */
function evaluateCsp(value) {
	const policy = parsePolicy(value);
	const sources = policy['script-src-elem'] || policy['script-src'] || policy['default-src'] || null;
	if (!sources) return [];
	const issues = [];
	const push = (id, detail) => {
		if (!issues.some((item) => item.id === id && item.detail === detail)) issues.push({ id, detail: detail || '' });
	};
	const lower = sources.map((token) => token.toLowerCase());
	const trusted =
		lower.some((token) => /^'(nonce-|sha(256|384|512)-)/.test(token)) && lower.indexOf("'strict-dynamic'") !== -1;
	if (lower.indexOf("'unsafe-hashes'") !== -1) push('unsafeHashes');
	lower.forEach((token) => {
		if (/^(data|blob|filesystem):$/.test(token)) push('dataScheme', token);
		if (token === 'http:' || /^http:\/\//.test(token)) push('plainHttp', token);
	});
	sources.forEach((token) => {
		const nonce = token.match(/^'nonce-([^']*)'$/i);
		if (nonce && !NONCE_OK.test(nonce[1])) push('weakNonce', nonce[1].length < 8 ? String(nonce[1].length) : '');
	});
	// With a nonce or hash and 'strict-dynamic', browsers ignore host allowlists, so the hosts cannot be abused.
	if (!trusted) {
		sources.forEach((token) => {
			const host = bypassHostOf(token);
			if (host)
				push(
					'host',
					token
						.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '')
						.split(/[/?#]/)[0]
						.toLowerCase()
				);
		});
	}
	return issues;
}

function evaluatePolicies(values) {
	const out = [];
	(values || []).filter(Boolean).forEach((value) => {
		evaluateCsp(value).forEach((issue) => {
			if (!out.some((item) => item.id === issue.id && item.detail === issue.detail)) out.push(issue);
		});
	});
	return out;
}

// Script addresses that match a known-backdoored pattern: [{ url, name, severity, summary }].
function findBackdoored(urls, list) {
	const entries = (list || BACKDOORED).entries || [];
	const compiled = entries.map((entry) => ({
		entry,
		patterns: (entry.extractors || [])
			.map((source) => {
				try {
					return new RegExp(source, 'i');
				} catch (error) {
					return null;
				}
			})
			.filter(Boolean),
	}));
	const out = [];
	(urls || []).forEach((raw) => {
		const url = String(raw || '');
		const hit = compiled.find((item) => item.patterns.some((pattern) => pattern.test(url)));
		if (hit && !out.some((row) => row.url === url))
			out.push({ url, name: hit.entry.name, severity: hit.entry.severity || 'high', summary: hit.entry.summary || '' });
	});
	return out;
}

const NO_STYLE_SRI =
	/(^|\.)(fonts\.googleapis\.com|fonts\.gstatic\.com|use\.typekit\.net|use\.fontawesome\.com|kit\.fontawesome\.com|p\.typekit\.net)$/i;

/* tags: [{ kind: "script" | "style", host, integrity, hasCrossorigin }] for cross-origin tags only.
   Returns host lists for each problem. */
function auditSri(tags) {
	const weak = [];
	const noCors = [];
	const styleMissing = [];
	const add = (list, host) => {
		if (host && list.indexOf(host) === -1 && list.length < 20) list.push(host);
	};
	(tags || []).forEach((tag) => {
		const integrity = String(tag.integrity || '').trim();
		if (!integrity) {
			if (tag.kind === 'style' && !NO_STYLE_SRI.test(tag.host || '')) add(styleMissing, tag.host);
			return;
		}
		const hashes = integrity.split(/\s+/);
		if (!hashes.some((hash) => STRONG_SRI.test(hash))) add(weak, tag.host);
		if (!tag.hasCrossorigin) add(noCors, tag.host);
	});
	return { weak, noCors, styleMissing };
}

function mergeSri(rows) {
	const out = { weak: [], noCors: [], styleMissing: [] };
	(rows || []).forEach((row) => {
		['weak', 'noCors', 'styleMissing'].forEach((key) => {
			((row && row[key]) || []).forEach((host) => {
				if (out[key].indexOf(host) === -1) out[key].push(host);
			});
		});
	});
	return out;
}

function cspBypassFindings(values, add) {
	const issues = evaluatePolicies(values);
	if (!issues.length) return issues;
	const hosts = issues.filter((item) => item.id === 'host').map((item) => item.detail);
	const labels = issues
		.map((item) => {
			if (item.id === 'host') return null;
			if (item.id === 'dataScheme') return say('sec-csp-bypass.issue.dataScheme', { scheme: item.detail });
			if (item.id === 'plainHttp') return say('sec-csp-bypass.issue.plainHttp', { source: item.detail });
			if (item.id === 'weakNonce') return say('sec-csp-bypass.issue.weakNonce');
			return say('sec-csp-bypass.issue.' + item.id);
		})
		.filter(Boolean);
	if (hosts.length) labels.unshift(say('sec-csp-bypass.issue.host', { list: some(hosts, 4) }));
	const severe = issues.some((item) => item.id === 'host' || item.id === 'dataScheme');
	add(
		'Security',
		'risk',
		severe ? 'medium' : 'low',
		'sec-csp-bypass',
		say('sec-csp-bypass.title', { n: labels.length }),
		say('sec-csp-bypass.evidence', { list: { items: labels, sep: '; ' } }),
		say('sec-csp-bypass.fix'),
		{ count: labels.length, effort: 'hours', cases: ['SEC-03'] }
	);
	return issues;
}

function backdooredFindings(urls, add) {
	const hits = findBackdoored(urls);
	if (!hits.length) return hits;
	const hosts = [];
	hits.forEach((hit) => {
		let host = hit.url;
		try {
			host = new URL(hit.url, 'https://invalid.test/').hostname || hit.url;
		} catch (error) {
			/* keep the raw address */
		}
		if (hosts.indexOf(host) === -1) hosts.push(host);
	});
	add(
		'Security',
		'fail',
		'high',
		'sec-backdoored',
		say('sec-backdoored.title', { n: hosts.length }),
		say('sec-backdoored.evidence', { list: some(hosts, 4), name: hits[0].name }),
		say('sec-backdoored.fix'),
		{ count: hosts.length, effort: 'minutes', cases: ['SEC-10'] }
	);
	return hits;
}

function sriFindings(audit, add) {
	const labels = [];
	if (audit.noCors.length) labels.push(say('sec-sri-gaps.issue.noCors', { list: some(audit.noCors, 3) }));
	if (audit.weak.length) labels.push(say('sec-sri-gaps.issue.weak', { list: some(audit.weak, 3) }));
	if (audit.styleMissing.length) labels.push(say('sec-sri-gaps.issue.styles', { list: some(audit.styleMissing, 3) }));
	if (!labels.length) return audit;
	const severe = audit.noCors.length || audit.weak.length;
	add(
		'Security',
		'risk',
		severe ? 'medium' : 'low',
		'sec-sri-gaps',
		say('sec-sri-gaps.title', { n: audit.noCors.length + audit.weak.length + audit.styleMissing.length }),
		say('sec-sri-gaps.evidence', { list: { items: labels, sep: '; ' } }),
		say('sec-sri-gaps.fix'),
		{ count: labels.length, effort: 'minutes', cases: ['SEC-14'] }
	);
	return audit;
}

/* input: { csp: [header value, meta value], read: pages with inspect.scriptUrls and inspect.sri.audit } */
function findings(input, add) {
	const read = input.read || [];
	const csp = cspBypassFindings(input.csp || [], add);
	const urls = [];
	read.forEach((page) =>
		((page.inspect && page.inspect.scriptUrls) || []).forEach((url) => {
			if (urls.indexOf(url) === -1) urls.push(url);
		})
	);
	const backdoored = backdooredFindings(urls, add);
	const sri = sriFindings(
		mergeSri(read.map((page) => page.inspect && page.inspect.sri && page.inspect.sri.audit)),
		add
	);
	return { csp, backdoored, sri };
}

module.exports = {
	BYPASS_HOSTS,
	parsePolicy,
	evaluateCsp,
	evaluatePolicies,
	findBackdoored,
	auditSri,
	mergeSri,
	cspBypassFindings,
	backdooredFindings,
	sriFindings,
	findings,
};
