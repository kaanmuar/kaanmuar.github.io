'use strict';
// Jarvis > Scouts tab (#4242): meta engagement scout, tool scout, trending drafts.
const ORIGIN = 'https://carlosandmunoz.com';
const REPO = 'kaanmuar/kaanmuar.github.io';

const clean = (error) => String((error && error.message) || error || 'failed').slice(0, 200);
const block = (rows, extra) => Object.assign({ ok: true, rows: rows || [] }, extra || {});

const RUN_ACTIONS = [
	{
		id: 'engagementScout',
		job: 'engagementScout',
		label: 'Run the scout now',
		op: 'run-job',
		key: 'scouts:engagement',
		note: 'Meta engagement scout (#3613): cloud + Mac + Reddit envelope.',
	},
	{
		id: 'tool-scout',
		job: 'tool-scout.yml',
		label: 'Tool scout (weekly)',
		note: 'Opens a draft PR tool-scout/<date>; not a live Jarvis button on Workers.',
		url: 'https://github.com/' + REPO + '/actions/workflows/tool-scout.yml',
	},
];

async function metaFromDb(db) {
	if (!db) return null;
	try {
		const snap = await db.collection('engagement_meta_runs').orderBy('at', 'desc').limit(1).get();
		return snap.docs[0] ? Object.assign({ id: snap.docs[0].id }, snap.docs[0].data()) : null;
	} catch (error) {
		return { error: clean(error) };
	}
}

async function recentMetaRuns(db, limit) {
	if (!db) return [];
	try {
		const snap = await db.collection('engagement_meta_runs').orderBy('at', 'desc').limit(limit || 6).get();
		return snap.docs.map((d) => {
			const row = d.data();
			return {
				at: row.at || d.id,
				label: row.at || d.id,
				ms: row.ms,
				needs: Array.isArray(row.needs) ? row.needs.length : 0,
				passes: row.passes ? Object.keys(row.passes).length : 0,
				note: (row.passes ? Object.keys(row.passes).join(', ') : '') || '',
			};
		});
	} catch (error) {
		return [];
	}
}

async function trendingStub(db, needs) {
	const link = {
		label: 'scout-trending-drafts.js',
		url: 'https://github.com/' + REPO + '/blob/main/scripts/scout-trending-drafts.js',
		purpose: 'Weekly hashtag drafts for Jarvis review (#3814); file-first, no auto-publish.',
	};
	if (!db) {
		needs.push('trending: no db; using static stub.');
		return { ok: true, drafts: 0, latest: '', link, rows: [] };
	}
	try {
		const snap = await db.collection('jarvis_settings').doc('scout-drafts').get();
		const data = snap.exists ? snap.data() : null;
		const drafts = data && Array.isArray(data.drafts) ? data.drafts : [];
		return {
			ok: true,
			drafts: drafts.length,
			latest: (data && data.at) || '',
			at: (data && data.at) || '',
			link,
			rows: drafts
				.filter((d) => d && typeof d === 'object')
				.slice(0, 20)
				.map((d, i) => ({
					id: d.id || String(i),
					label: d.title || d.hook || d.id || 'draft ' + (i + 1),
					note: d.network || d.tag || '',
					status: d.status || 'pending',
					url: d.url || '',
				})),
		};
	} catch (error) {
		needs.push('trending: ' + clean(error));
		return { ok: false, drafts: null, latest: '', link, rows: [], error: clean(error) };
	}
}

async function source(ctx) {
	const needs = [];
	const now = ctx.now || Date.now();

	let meta = null;
	let engagement = null;
	if (ctx.peer) {
		try {
			engagement = await ctx.peer('engagement');
			if (engagement && engagement.metaScout) meta = engagement.metaScout;
		} catch (error) {
			needs.push('engagement: ' + clean(error));
		}
	}
	if (!meta) meta = await metaFromDb(ctx.db);
	if (!meta) needs.push('Meta scout: no engagement_meta_runs yet.');

	let tools = null;
	if (ctx.peer) {
		try {
			const gw = await ctx.peer('github-work');
			tools = gw && gw.scout ? gw.scout : null;
			if (gw && !gw.scout) needs.push('Tool scout: github-work has no scout part.');
		} catch (error) {
			needs.push('github-work: ' + clean(error));
		}
	} else {
		needs.push('github-work: no peer hook.');
	}

	const trending = await trendingStub(ctx.db, needs);
	const runs = await recentMetaRuns(ctx.db, 8);
	const candidateList = tools && Array.isArray(tools.candidates) ? tools.candidates : [];
	const toolRows = candidateList.length
		? candidateList
				.filter((c) => c && typeof c === 'object')
				.slice(0, 20)
				.map((c) => ({
					label: c.name || c.repo || c.id,
					note: c.why || c.note || '',
					url: c.url || '',
					status: c.status || 'new',
				}))
		: tools && tools.run
			? [{ label: 'Latest tool-scout run', note: tools.run.pr || tools.run.at || '', url: tools.run.url || '' }]
			: [];

	const healthRows = [
		{
			scout: 'engagement',
			label: 'Engagement meta',
			at: (meta && (meta.at || meta.endedAt)) || '',
			ok: !(meta && meta.error),
			status: meta && meta.error ? 'stale' : 'ok',
		},
		{
			scout: 'tool',
			label: 'Tool scout',
			at: (tools && tools.run && tools.run.at) || '',
			ok: !!tools,
			status: tools ? 'ok' : 'stale',
		},
		{
			scout: 'trending',
			label: 'Trending drafts',
			at: trending.latest || '',
			ok: trending.ok !== false,
			status: trending.ok === false ? 'stale' : 'ok',
		},
	];

	const kpis = [
		{ label: 'Meta runs (shown)', value: runs.length },
		{ label: 'Tool PR', value: tools && tools.run ? tools.run.pr : null },
		{ label: 'Trending drafts', value: trending.drafts },
		{ label: 'Scout actions', value: RUN_ACTIONS.length },
	];

	return {
		ok: true,
		kpis,
		health: block(healthRows),
		engagement: block(runs, {
			runs: runs.length,
			drafts: engagement && engagement.waiting ? engagement.waiting.length : 0,
			at: meta && (meta.at || meta.endedAt),
			stale: meta && meta.error ? 'true' : 'false',
		}),
		meta,
		tools: block(toolRows, tools || {}),
		trending: block(trending.rows || [], {
			ok: trending.ok !== false,
			drafts: trending.drafts,
			at: trending.latest,
			latest: trending.latest,
			link: trending.link || null,
			summary: trending.link && trending.link.purpose,
		}),
		handoff: block([]),
		digest: block(runs, { summary: runs.length ? 'Latest meta scout runs.' : 'No digest yet.' }),
		runs,
		handoffs: [],
		actions: block(RUN_ACTIONS),
		links: block([
			{ label: 'Engagement tab', url: ORIGIN + '/admin.html#stats/engagement/1' },
			{ label: 'Learn tab', url: ORIGIN + '/admin.html#stats/learn/1' },
			{ label: 'Tool scout parent', url: 'https://github.com/' + REPO + '/issues/3828' },
			{ label: 'Trending #3814', url: 'https://github.com/' + REPO + '/issues/3814' },
		]),
		needs,
		at: new Date(now).toISOString(),
	};
}

module.exports = { source, RUN_ACTIONS, trendingStub };
