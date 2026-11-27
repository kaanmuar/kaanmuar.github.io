'use strict';

/* GEO AI citation helpers (#3553): normalize Search-grounded citation chunks, diff baselines, score share of voice,
   and surface a tip when the reviewed brand is missing from grounded answers. Vertex/Gemini wiring lands later;
   groundedCitationCheck accepts injected fetch for tests and production. */

const Gemini = require('./gemini');
const { registrable } = require('./url-review-suffix');
const { say, some } = require('./url-review-findings-en');

function brandKey(host) {
	const key = registrable(host);
	return key || String(host || '').toLowerCase();
}

function clipUrl(url) {
	let out = String(url || '');
	const hash = out.indexOf('#');
	if (hash !== -1) out = out.slice(0, hash);
	if (out.endsWith('?')) out = out.slice(0, -1);
	if (out.endsWith('/') && out.length > 1) out = out.slice(0, -1);
	return out;
}

function normalizeCitationItem(raw) {
	if (raw == null) return null;
	let url = '';
	let title = '';
	if (typeof raw === 'string') {
		url = raw.trim();
	} else if (typeof raw === 'object') {
		url = String(raw.uri || raw.url || raw.href || '').trim();
		title = String(raw.title || raw.name || '').trim();
	} else return null;
	if (!url) return null;
	if (!/^https?:\/\//i.test(url)) {
		if (/^[a-z0-9.-]+\.[a-z]{2,}/i.test(url)) url = 'https://' + url;
		else return null;
	}
	let parsed;
	try {
		parsed = new URL(url);
	} catch {
		return null;
	}
	const host = brandKey(parsed.hostname);
	if (!host) return null;
	return {
		key: host,
		host,
		url: clipUrl(parsed.href),
		title: title.slice(0, 200),
	};
}

function listOf(items) {
	return (items || []).map(normalizeCitationItem).filter(Boolean);
}

function keyed(items) {
	const map = new Map();
	listOf(items).forEach((item) => {
		if (!map.has(item.key)) map.set(item.key, item);
	});
	return map;
}

function aiCitationDiff(baseline, current) {
	const base = keyed(baseline);
	const cur = keyed(current);
	const added = [];
	const removed = [];
	let unchangedCount = 0;
	cur.forEach((item, key) => {
		if (base.has(key)) unchangedCount += 1;
		else added.push(item);
	});
	base.forEach((item, key) => {
		if (!cur.has(key)) removed.push(item);
	});
	return { added, removed, unchangedCount };
}

function citesBrand(items, brandHost) {
	const brand = brandKey(brandHost);
	if (!brand) return false;
	return listOf(items).some((item) => item.key === brand);
}

function scoreShareOfVoice(items, brandHost) {
	const brand = brandKey(brandHost);
	const rows = listOf(items);
	const total = rows.length;
	if (!total || !brand) return { brandCount: 0, total, share: 0, cited: false };
	const brandCount = rows.filter((item) => item.key === brand).length;
	return {
		brandCount,
		total,
		share: Math.round((brandCount / total) * 1000) / 10,
		cited: brandCount > 0,
	};
}

function chunksFromResponse(data) {
	const candidate = (data.candidates || [])[0] || {};
	return ((candidate.groundingMetadata || {}).groundingChunks || [])
		.map((chunk) => chunk && chunk.web)
		.filter(Boolean);
}

function citationPrompt(brandHost, topic) {
	const brand = brandKey(brandHost);
	const subject = String(topic || brand || 'this site').replace(/\s+/g, ' ').trim();
	return (
		'For someone researching "' +
		subject +
		'", which public websites would a grounded AI answer cite as authoritative sources? ' +
		'Name real sites only; cite ' +
		brand +
		' if it belongs in the answer.'
	);
}

// Optional future hook: Search-grounded Gemini on Vertex or AI Studio. deps.generate may replace the default.
async function groundedCitationCheck(input, deps) {
	const { fetch: fetchImpl, generate, env, token, vertexModel, model, key } = deps || {};
	const brandHost = (input && input.brandHost) || (input && input.host);
	const topic = (input && input.topic) || '';
	if (!brandHost) return { ok: false, error: 'no host', citations: [] };
	if (typeof fetchImpl !== 'function') return { ok: false, error: 'fetch not configured', citations: [] };
	const prompt = citationPrompt(brandHost, topic);
	const body = {
		contents: [{ role: 'user', parts: [{ text: prompt }] }],
		tools: [{ googleSearch: {} }],
		generationConfig: { temperature: 0.2, maxOutputTokens: 2048, thinkingConfig: { thinkingLevel: 'low' } },
	};
	let data;
	try {
		if (typeof generate === 'function') {
			const answer = await generate(fetchImpl, env, body, { model, vertexModel, token, key, timeoutMs: 60000 });
			data = answer && answer.data != null ? answer.data : answer;
		} else if (key) {
			data = await Gemini.studio(fetchImpl, key, body, { model, timeoutMs: 60000 });
		} else {
			const tokenValue = typeof token === 'function' ? await token() : token;
			data = await Gemini.vertex(fetchImpl, body, { token: tokenValue, vertexModel, timeoutMs: 60000 });
		}
	} catch (error) {
		return { ok: false, error: String((error && error.message) || error).slice(0, 160), citations: [] };
	}
	const citations = chunksFromResponse(data).map(normalizeCitationItem).filter(Boolean);
	return { ok: true, citations, prompt, raw: data };
}

function findings(input, add) {
	const brandHost = (input && input.brandHost) || (input && input.host);
	const citations = (input && input.citations) || [];
	if (!brandHost || (input && input.skip)) return null;
	const rows = listOf(citations);
	if (!rows.length) return null;
	const voice = scoreShareOfVoice(rows, brandHost);
	const topic = String((input && input.topic) || brandKey(brandHost)).replace(/\s+/g, ' ').trim();
	if (voice.cited) {
		add(
			'GEO',
			'pass',
			'info',
			'geo-citation',
			say('geo-citation.pass.title', { host: brandKey(brandHost) }),
			say('geo-citation.pass.evidence', {
				share: voice.share,
				total: voice.total,
				topic,
				host: brandKey(brandHost),
			}),
			'',
			{ cases: ['GEO-10'], effort: 'hours' }
		);
		return { cited: true, share: voice.share, total: voice.total };
	}
	add(
		'GEO',
		'risk',
		'low',
		'geo-citation-miss',
		say('geo-citation.miss.title', { host: brandKey(brandHost), topic }),
		say('geo-citation.miss.evidence', {
			host: brandKey(brandHost),
			total: voice.total,
			peers: some(
				rows.filter((row) => row.key !== brandKey(brandHost)).map((row) => row.host),
				4
			),
		}),
		say('geo-citation.miss.fix'),
		{ cases: ['GEO-10'], effort: 'hours' }
	);
	return { cited: false, share: 0, total: voice.total };
}

const CITATION_CAP = 20;

function topicFromInspect(inspect, hostname) {
	const clip = (s, n) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);
	return clip((inspect && (inspect.description || inspect.title || inspect.h1)) || brandKey(hostname), 120);
}

function trimGeoCitationPayload(raw, brandHost, topic, via) {
	const host = brandKey(brandHost);
	const base = { topic, brandHost: host, citations: [] };
	if (!raw) return Object.assign({ ok: false, skipped: 'not-run' }, base);
	if (raw.skipped) return Object.assign({ ok: false, skipped: raw.skipped }, base);
	const citations = (raw.citations || []).slice(0, CITATION_CAP).map(({ host: h, url, title }) => ({
		host: h,
		url,
		title,
	}));
	if (!raw.ok) return Object.assign({ ok: false, error: raw.error || 'check failed' }, base, { citations });
	const voice = citations.length ? scoreShareOfVoice(citations, host) : { share: 0, cited: false };
	return {
		ok: true,
		via: via || raw.via,
		topic,
		brandHost: host,
		citations,
		share: voice.share,
		cited: voice.cited,
		prompt: raw.prompt ? String(raw.prompt).slice(0, 500) : undefined,
	};
}

// gatherExtras hook: gates match rescue groundedCall (Vertex/quota); inject generate + geminiReady in unit tests.
async function geoCitationExtra(ctx) {
	const {
		url,
		inspect,
		softPreview,
		passive,
		env,
		halt,
		fetch: fetchImpl,
		generate,
		geminiReady,
	} = ctx || {};
	let brandHost = '';
	try {
		brandHost = registrable(new URL(url).hostname);
	} catch {
		return trimGeoCitationPayload({ ok: false, error: 'bad url' }, '', '', undefined);
	}
	const empty = () => trimGeoCitationPayload({ ok: false, skipped: 'not-run' }, brandHost, '', undefined);
	if (softPreview) return trimGeoCitationPayload({ ok: false, skipped: 'soft-preview' }, brandHost, '', undefined);
	if (passive) return trimGeoCitationPayload({ ok: false, skipped: 'passive' }, brandHost, '', undefined);
	if (typeof halt === 'function' && halt()) return trimGeoCitationPayload({ ok: false, skipped: 'stopped' }, brandHost, '', undefined);
	if (!inspect) return trimGeoCitationPayload({ ok: false, skipped: 'no-inspect' }, brandHost, '', undefined);
	const ready = typeof geminiReady === 'boolean' ? geminiReady : Gemini.ready(env || process.env);
	if (!ready) return trimGeoCitationPayload({ ok: false, skipped: 'no-gemini' }, brandHost, '', undefined);
	if (typeof fetchImpl !== 'function') return empty();
	const topic = topicFromInspect(inspect, brandHost);
	const runEnv = env || process.env;
	let via;
	const captureVia = (answer) => {
		if (answer && answer.via) via = answer.via;
		return answer;
	};
	const gen =
		typeof generate === 'function'
			? (...args) => Promise.resolve(generate(...args)).then(captureVia)
			: (f, e, body, opts) => Gemini.generate(f, e, body, opts).then(captureVia);
	const raw = await groundedCitationCheck({ brandHost, topic }, { fetch: fetchImpl, generate: gen, env: runEnv });
	if (!via && raw.ok && typeof generate !== 'function') via = Gemini.vertexReady(runEnv) ? 'vertex' : 'studio';
	return trimGeoCitationPayload(raw, brandHost, topic, via);
}

module.exports = {
	normalizeCitationItem,
	aiCitationDiff,
	scoreShareOfVoice,
	citesBrand,
	groundedCitationCheck,
	citationPrompt,
	findings,
	chunksFromResponse,
	topicFromInspect,
	trimGeoCitationPayload,
	geoCitationExtra,
};