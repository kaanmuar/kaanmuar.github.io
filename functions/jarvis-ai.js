'use strict';
// Jarvis > AI tab (#4242): Gemini platform metrics, proposals, and static playbooks.
const ORIGIN = 'https://carlosandmunoz.com';

const clean = (error) => String((error && error.message) || error || 'failed').slice(0, 200);
const text = (v, n) =>
	String(v === null || v === undefined ? '' : v)
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, n || 200);
const block = (rows, extra) => Object.assign({ ok: true, rows: rows || [] }, extra || {});

const PLAYBOOKS = [
	{
		id: 'url-ambiguity',
		title: 'URL ambiguity',
		label: 'URL ambiguity',
		steps: [
			'Normalize scheme, host and trailing slash before comparing.',
			'Prefer the canonical href the report used, not the paste box.',
			'Flag redirects that land on a different registrable domain.',
		],
	},
	{
		id: 'statute-cite',
		title: 'Statute cite check',
		label: 'Statute cite check',
		steps: [
			'Match clause text to legal/clauses.json cites[].url on file.',
			'Never edit clauses from Jarvis; ticket under #4004 when the watch moves.',
			'Counsel-approved status lives in signoff.json and clauses status.',
		],
	},
	{
		id: 'marketing-reply',
		title: 'Marketing reply tone',
		label: 'Marketing reply tone',
		steps: [
			'Short, specific, no hashtag walls (see social-tags caps).',
			'Discovery and competitor posts stay human-gated; no auto-reply.',
			'UTMs in first comment on LI/IG/FB; strip from body when comment carries them.',
		],
	},
	{
		id: 'scout-triage',
		title: 'Scout triage',
		label: 'Scout triage',
		steps: [
			'Tool scout never edits tool-arsenal.mdc; ticket or known.json suppress.',
			'Engagement drafts wait for Carlos; discovery budget is fixed per run.',
			'Trending drafts file-only until #3814 wires UI.',
		],
	},
];

async function recentGemini(db, now) {
	if (!db) return { proposals: [], countdowns: [] };
	const iso = new Date(now || Date.now()).toISOString();
	const proposals = [];
	const countdowns = [];
	try {
		const snap = await db.collection('jarvis_ai_proposals').where('until', '>', iso).limit(20).get();
		snap.docs.forEach((doc) => {
			const d = doc.data();
			if (!d) return;
			if (d.source === 'gemini' || d.source === 'gemini+rules' || d.source === 'scout-learn') {
				proposals.push({
					key: d.key || doc.id,
					title: text(d.title, 120),
					label: text(d.title, 120),
					source: d.source || 'gemini',
					until: d.until || '',
				});
			}
		});
	} catch (error) {
		/* soft */
	}
	try {
		const snap = await db.collection('jarvis_countdowns').orderBy('createdAt', 'desc').limit(15).get();
		snap.docs.forEach((doc) => {
			const d = doc.data();
			if (d && (d.by === 'gemini' || /gemini/i.test(d.label || ''))) {
				countdowns.push({
					id: doc.id,
					kind: d.kind || '',
					status: d.status || '',
					label: text(d.label, 120),
					by: d.by || '',
					createdAt: d.createdAt || '',
					at: d.createdAt || '',
				});
			}
		});
	} catch (error) {
		/* soft */
	}
	return { proposals, countdowns };
}

async function source(ctx) {
	const needs = [];
	const now = ctx.now || Date.now();
	let platform = null;
	if (ctx.peer) {
		try {
			const peer = await ctx.peer('platform');
			if (peer) platform = { ok: peer.ok !== false, gemini: peer.gemini || null, error: peer.error || null };
			else needs.push('platform: peer unavailable.');
		} catch (error) {
			needs.push('platform: ' + clean(error));
		}
	} else {
		needs.push('platform: no peer hook.');
	}

	const gemini = (platform && platform.gemini) || {};
	const recent = await recentGemini(ctx.db, now);
	const playbookRows = PLAYBOOKS.map((p) =>
		Object.assign({}, p, { note: (p.steps || []).join(' · '), status: 'ready' })
	);

	const kpis = [
		{ label: 'Gemini requests (7d)', value: gemini.requests != null ? gemini.requests : null },
		{ label: 'Gemini error %', value: gemini.errorRate != null ? gemini.errorRate : null },
		{ label: 'Open Gemini proposals', value: recent.proposals.length },
		{ label: 'Playbooks', value: PLAYBOOKS.length },
	];

	return {
		ok: true,
		kpis,
		consult: block([], { note: 'Use the Gemini consult panel; Ask goes through functions/gemini.js.' }),
		platform: platform || { ok: false, rows: [], error: 'platform unavailable' },
		proposals: block(recent.proposals, { open: recent.proposals.length }),
		playbooks: block(playbookRows),
		cost: block([], {
			note: 'Spend mirrors Systems › Google Cloud Gemini KPIs.',
			runs: gemini.requests != null ? gemini.requests : null,
		}),
		recent: block(recent.countdowns),
		links: block([
			{ label: 'Jarvis Ask', url: ORIGIN + '/admin.html#stats/overview/1' },
			{ label: 'Systems / platform', url: ORIGIN + '/admin.html#stats/systems/1' },
		]),
		actions: block([
			{ label: 'Open Systems', url: ORIGIN + '/admin.html#stats/systems/1' },
			{ label: 'Open Legal', url: ORIGIN + '/admin.html#stats/legal/1' },
		]),
		needs,
		at: new Date(now).toISOString(),
	};
}

module.exports = { source, PLAYBOOKS, recentGemini };
