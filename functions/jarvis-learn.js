'use strict';
// Jarvis > Learn tab extras (#4242): hub guides and growth locks — not the private scout-learn loop (#4237).
const ORIGIN = 'https://carlosandmunoz.com';
const REPO = 'kaanmuar/kaanmuar.github.io';
const VIDEO_TICKET = 3714;

const clean = (error) => String((error && error.message) || error || 'failed').slice(0, 200);
const text = (v, n) =>
	String(v === null || v === undefined ? '' : v)
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, n || 200);
const block = (rows, extra) => Object.assign({ ok: true, rows: rows || [] }, extra || {});

const GROWTH_LOCKS = [
	{ id: 'soft-gate', topic: 'Soft gate', note: 'POST /review/preview; OAuth unlock for full crawl (#3478).' },
	{ id: 'shared-links', topic: 'Shared links', note: 'Overall + 6 areas + top finding clear; rest frosted (#3477).' },
	{ id: 'auto-live', topic: 'Auto Live', note: '4-slide carousel + LinkedIn PDF via tips-studio (#3476).' },
	{ id: 'geo-llms', topic: 'GEO llms.txt', note: 'Check + fix-kit starter (#3479).' },
	{ id: 'telegram', topic: 'Telegram', note: '@qalab_live is publish-only; drafts stay Jarvis Hub.' },
	{ id: 'scout-learn', topic: 'Scout learn', note: 'Private Firestore; never auto-edit the arsenal (#4237).' },
];

const GUIDES = [
	{ id: 'hub', title: 'QA Lab hub', label: 'QA Lab hub', url: ORIGIN + '/qa-lab.html', kind: 'hub', area: 'hub' },
	{
		id: 'review-guide',
		title: 'QA review guide',
		label: 'QA review guide',
		url: ORIGIN + '/qa-review-guide.html',
		kind: 'guide',
		area: 'guide',
	},
	{
		id: 'review-legal',
		title: 'Legal review page',
		label: 'Legal review page',
		url: ORIGIN + '/qa-review-legal.html',
		kind: 'legal',
		area: 'legal',
	},
];

async function videoStatus(ctx) {
	const stub = {
		ticket: VIDEO_TICKET,
		title: 'Customer + support explainer videos',
		label: 'Explainer videos',
		status: 'open',
		url: 'https://github.com/' + REPO + '/issues/' + VIDEO_TICKET,
		note: 'Tips Studio / whisperX pipeline (#3714).',
	};
	if (!ctx.github) return stub;
	let token;
	try {
		token = await ctx.github('repo');
	} catch (error) {
		return Object.assign(stub, { note: stub.note + ' (' + clean(error) + ')' });
	}
	if (!token) return stub;
	try {
		const res = await ctx.fetch('https://api.github.com/repos/' + REPO + '/issues/' + VIDEO_TICKET, {
			headers: {
				Authorization: 'Bearer ' + token,
				Accept: 'application/vnd.github+json',
				'User-Agent': 'qa-lab-jarvis-learn',
			},
			signal: AbortSignal.timeout(12000),
		});
		const data = await res.json().catch(() => ({}));
		if (!res.ok) return Object.assign(stub, { note: clean(data.message || res.status) });
		return {
			ticket: data.number || VIDEO_TICKET,
			title: text(data.title, 120),
			label: text(data.title, 120),
			status: data.state || 'unknown',
			url: data.html_url || stub.url,
			note: stub.note,
		};
	} catch (error) {
		return Object.assign(stub, { note: clean(error) });
	}
}

async function source(ctx) {
	const needs = [];
	const video = await videoStatus(ctx);
	const videos = [video];
	const locks = GROWTH_LOCKS.map((row) =>
		Object.assign({ shipped: true, label: row.topic, text: row.note, status: 'shipped' }, row)
	);
	const peer = ctx.peer ? await ctx.peer('scout-learn').catch(() => null) : null;
	if (peer && peer.ok === false) needs.push('scout-learn: ' + clean(peer.error || 'unavailable'));

	const kpis = [
		{ label: 'Guides', value: GUIDES.length },
		{ label: 'Growth locks', value: locks.length },
		{ label: 'Video ticket', value: videos[0].status },
		{ label: 'Scout questions', value: peer && peer.waiting != null ? peer.waiting : null },
	];

	return {
		ok: true,
		kpis,
		guides: block(GUIDES),
		locks: block(locks),
		videos: block(
			videos.map((v) =>
				Object.assign({}, v, {
					label: v.title || v.label || '#' + v.ticket,
					status: v.status || 'open',
				})
			)
		),
		links: block([
			{ label: 'Hub', url: ORIGIN + '/qa-lab.html' },
			{ label: 'Review guide', url: ORIGIN + '/qa-review-guide.html' },
			{ label: 'Legal page', url: ORIGIN + '/qa-review-legal.html' },
			{ label: 'Growth locks rule', url: 'https://github.com/' + REPO + '/blob/main/.cursor/rules/qa-lab-growth.mdc' },
		]),
		actions: block([
			{ label: 'Open review guide', url: ORIGIN + '/qa-review-guide.html' },
			{ label: 'Open Scouts', url: ORIGIN + '/admin.html#stats/scouts/1' },
		]),
		scoutLearn: peer
			? {
					ok: peer.ok !== false,
					waiting: peer.waiting,
					scouts: peer.scouts ? peer.scouts.length : 0,
				}
			: null,
		needs,
	};
}

module.exports = { source, GUIDES, GROWTH_LOCKS };
