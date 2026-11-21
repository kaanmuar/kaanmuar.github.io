'use strict';
/* Auth-results reader for the outreach inbound path (#3837). Reads Authentication-Results and
   ARC-Authentication-Results that the MX already wrote (ImprovMX) and returns SPF / DKIM / DMARC / ARC
   outcomes without verifying signatures again, without DNS, and without keeping message bodies.

   Shape: { spf, dkim, dmarc, arc, passed } where each of spf/dmarc/arc is null or
   { result, domain }, dkim is an array of { result, domain }, and passed lists domains that passed
   SPF (smtp.mailfrom) or DKIM (header.d / header.i). label() is a short, body-free string for logs
   and webhook replies ("spf=pass dkim=pass", "spf=fail", or "").

   Own code from RFC 8601. postalsys/mailauth LICENSE.txt is MIT (Postal Systems OÜ; confirmed at
   commit 2d9747c on master — GitHub's badge shows NOASSERTION). mailauth was consulted only for the
   method list; nothing is copied or depended on. */

const MAX = 20000;
const RESULT = /^(pass|fail|softfail|neutral|none|temperror|permerror|policy)$/i;
const METHOD = /^(spf|dkim|dmarc|arc)$/i;
const HOST = /^[a-z0-9.-]+$/i;

const lower = (value) => String(value == null ? '' : value).toLowerCase();

/** Header map (lower-case name -> joined value) from a headers object or raw block. */
function headerMap(headers) {
	if (typeof headers === 'string') {
		const out = {};
		let name = '';
		for (const line of String(headers).slice(0, MAX).split(/\r?\n/)) {
			if (/^[ \t]/.test(line) && name) {
				out[name] += ' ' + line.trim();
				continue;
			}
			const at = line.indexOf(':');
			if (at < 1 || /\s/.test(line.slice(0, at))) {
				name = '';
				continue;
			}
			name = line.slice(0, at).toLowerCase();
			out[name] = (out[name] ? out[name] + '\n' : '') + line.slice(at + 1).trim();
		}
		return out;
	}
	const out = {};
	for (const key of Object.keys(headers || {})) {
		const v = headers[key];
		out[key.toLowerCase()] = (Array.isArray(v) ? v : [v]).map((one) => String(one == null ? '' : one)).join('\n');
	}
	return out;
}

/** Domain after `at`: an address's host (local@domain) or a bare hostname. Linear; no backtracking. */
function hostAt(s, at) {
	let i = at;
	while (i < s.length && /[\s<"]/.test(s[i])) i++;
	let end = i;
	while (end < s.length && /[a-z0-9.@_-]/i.test(s[end])) end++;
	const token = s.slice(i, end).toLowerCase();
	const atSign = token.lastIndexOf('@');
	const host = atSign >= 0 ? token.slice(atSign + 1) : token;
	return HOST.test(host) && host.includes('.') ? host.replace(/\.$/, '') : '';
}

/**
 * Split one Authentication-Results value into method clauses without regex backtracking.
 * Returns [{ method, result, rest }] for known methods with a known result word.
 */
function clauses(value) {
	const s = String(value || '').slice(0, MAX);
	const out = [];
	let i = 0;
	while (i < s.length) {
		while (i < s.length && /[\s;]/.test(s[i])) i++;
		const start = i;
		while (i < s.length && /[a-z0-9_-]/i.test(s[i])) i++;
		const method = s.slice(start, i).toLowerCase();
		if (!METHOD.test(method) || s[i] !== '=') {
			// Unknown token or bare word: if it had '=', skip its value to the next break; else advance one.
			if (s[i] === '=') {
				i += 1;
				while (i < s.length && s[i] !== ';' && !/\s/.test(s[i])) i++;
			} else if (i === start) i += 1;
			continue;
		}
		i += 1;
		const r0 = i;
		while (i < s.length && /[a-z]/i.test(s[i])) i++;
		const result = s.slice(r0, i).toLowerCase();
		const semi = s.indexOf(';', i);
		const end = semi < 0 ? s.length : semi;
		const rest = s.slice(i, end);
		i = end + (semi < 0 ? 0 : 1);
		if (RESULT.test(result)) out.push({ method, result, rest });
	}
	return out;
}

function domainFromRest(method, rest) {
	const s = String(rest || '');
	const keys =
		method === 'spf'
			? ['smtp.mailfrom=', 'envelope-from=', 'header.from=']
			: method === 'dkim'
				? ['header.d=', 'header.i=']
				: method === 'dmarc'
					? ['header.from=']
					: [];
	for (const key of keys) {
		const at = s.toLowerCase().indexOf(key);
		if (at < 0) continue;
		const host = hostAt(s, at + key.length);
		if (host) return host;
	}
	return '';
}

/**
 * Classify auth results from a headers object, a raw header block, or { headers }.
 * @returns {{spf:{result:string,domain:string}|null, dkim:Array<{result:string,domain:string}>, dmarc:{result:string,domain:string}|null, arc:{result:string,domain:string}|null, passed:string[]}}
 */
function classify(input) {
	const headers =
		input && typeof input === 'object' && !Array.isArray(input) && input.headers != null
			? headerMap(input.headers)
			: headerMap(input);
	const blocks = [headers['authentication-results'] || '', headers['arc-authentication-results'] || ''].filter(Boolean);
	let spf = null;
	const dkim = [];
	let dmarc = null;
	let arc = null;
	const passed = new Set();

	for (const block of blocks) {
		for (const line of block.split('\n')) {
			for (const c of clauses(line)) {
				const domain = domainFromRest(c.method, c.rest);
				const row = { result: c.result, domain };
				if (c.method === 'spf') {
					if (!spf) spf = row;
					if (c.result === 'pass' && domain) passed.add(domain);
				} else if (c.method === 'dkim') {
					dkim.push(row);
					if (c.result === 'pass' && domain) passed.add(domain);
				} else if (c.method === 'dmarc') {
					if (!dmarc) dmarc = row;
				} else if (c.method === 'arc') {
					if (!arc) arc = row;
				}
			}
		}
	}
	return { spf, dkim, dmarc, arc, passed: [...passed] };
}

/** Short body-free label: "spf=pass dkim=pass", "spf=fail", or "". */
function label(result) {
	const r = result || {};
	const parts = [];
	if (r.spf && r.spf.result) parts.push('spf=' + r.spf.result);
	const dkimPass = (r.dkim || []).some((d) => d.result === 'pass');
	const dkimAny = (r.dkim || [])[0];
	if (dkimPass) parts.push('dkim=pass');
	else if (dkimAny && dkimAny.result) parts.push('dkim=' + dkimAny.result);
	if (r.dmarc && r.dmarc.result) parts.push('dmarc=' + r.dmarc.result);
	if (r.arc && r.arc.result) parts.push('arc=' + r.arc.result);
	return parts.join(' ');
}

module.exports = { classify, label, clauses };
