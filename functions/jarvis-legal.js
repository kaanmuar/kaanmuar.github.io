'use strict';
// Jarvis > Legal tab (#4242): read-only snapshot of legal/clauses.json, signoff, and the weekly watch (#4004).
const legalWatch = require('./legal-watch');

const REPO = 'kaanmuar/kaanmuar.github.io';
const ORIGIN = 'https://carlosandmunoz.com';
const SIGNOFF_URL = 'https://raw.githubusercontent.com/kaanmuar/kaanmuar.github.io/main/legal/signoff.json';
const CHANGE_LIMIT = 30;

const clean = (error) => String((error && error.message) || error || 'failed').slice(0, 200);
const text = (v, n) =>
	String(v === null || v === undefined ? '' : v)
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, n || 200);

const block = (rows, extra) => Object.assign({ ok: true, rows: rows || [] }, extra || {});

async function loadSignoff(fetchImpl) {
	const res = await fetchImpl(SIGNOFF_URL, {
		headers: { 'User-Agent': legalWatch.USER_AGENT },
		signal: AbortSignal.timeout(legalWatch.TIMEOUT_MS || 20000),
	});
	if (!res.ok) throw new Error('legal/signoff.json answered ' + res.status);
	const data = await res.json();
	return data.signoffs || {};
}

function clauseRows(clauses) {
	return (clauses || []).map((c) => ({
		id: c.id,
		label: c.id,
		kind: c.kind || '',
		status: c.status || 'draft',
		jurisdiction: c.jurisdiction || '',
		language: c.language || '',
		lastChecked: c.lastChecked || '',
		counselReviewedOn: c.counselReviewedOn || '',
		citeCount: (c.cites || []).length,
		note: [c.jurisdiction, c.kind, c.lastChecked].filter(Boolean).join(' · '),
	}));
}

function signoffRows(signoffs) {
	return Object.keys(signoffs || {}).map((id) => {
		const row = signoffs[id] || {};
		return {
			id,
			label: id,
			signedOffOn: row.signedOffOn || '',
			signedOffBy: text(row.signedOffBy, 80),
			counselReviewedOn: row.counselReviewedOn || '',
			status: row.counselReviewedOn ? 'signed' : 'pending',
			at: row.signedOffOn || '',
			note: row.signedOffBy || '',
		};
	});
}

function citeRows(clauses) {
	return legalWatch.sources(clauses).map((row) => ({
		url: row.url,
		label: (row.names && row.names[0]) || row.url,
		name: (row.names && row.names[0]) || '',
		names: row.names.slice(0, 6),
		clauses: row.clauses.map((c) => c.id),
		value: row.clauses.length,
		note: row.clauses.map((c) => c.id).slice(0, 4).join(', '),
	}));
}

function jurisdictionRows(clauses) {
	const tally = {};
	(clauses || []).forEach((c) => {
		const key = c.jurisdiction || '?';
		tally[key] = (tally[key] || 0) + 1;
	});
	return Object.keys(tally)
		.sort((a, b) => tally[b] - tally[a] || a.localeCompare(b))
		.map((code) => ({
			id: code,
			label: code,
			code,
			jurisdiction: code,
			count: tally[code],
			value: tally[code],
			clauses: tally[code],
		}));
}

function kpisFrom(clauses, cites, watch, changes, issues) {
	const draft = clauses.filter((c) => c.status !== 'counsel-approved').length;
	const approved = clauses.length - draft;
	return [
		{ label: 'Clauses', value: clauses.length },
		{ label: 'Draft', value: draft },
		{ label: 'Counsel-approved', value: approved },
		{ label: 'Cited URLs', value: cites.length },
		{ label: 'Watch run', value: watch && watch.endedAt ? (watch.ok === false ? 'failed' : 'ok') : 'unknown' },
		{ label: 'Recent changes', value: changes.length },
		{ label: 'Open issues (#4004)', value: issues.length },
	];
}

async function githubIssues(ctx) {
	const needs = [];
	const issues = [];
	if (!ctx.github) {
		needs.push('GitHub: no token hook for legal issues search.');
		return { issues, needs };
	}
	let token;
	try {
		token = await ctx.github('repo');
	} catch (error) {
		needs.push('GitHub: ' + clean(error));
		return { issues, needs };
	}
	if (!token) {
		needs.push('GitHub: repo token missing for #4004 issue search.');
		return { issues, needs };
	}
	const q = 'repo:' + REPO + ' is:issue is:open 4004';
	try {
		const res = await ctx.fetch(
			'https://api.github.com/search/issues?q=' + encodeURIComponent(q) + '&per_page=15',
			{
				headers: {
					Authorization: 'Bearer ' + token,
					Accept: 'application/vnd.github+json',
					'User-Agent': 'qa-lab-jarvis-legal',
				},
				signal: AbortSignal.timeout(12000),
			}
		);
		const data = await res.json().catch(() => ({}));
		if (!res.ok) {
			needs.push('GitHub search: ' + clean(data.message || res.status));
			return { issues, needs };
		}
		(data.items || []).forEach((item) => {
			issues.push({
				number: item.number,
				title: text(item.title, 160),
				label: text(item.title, 160),
				url: item.html_url || '',
				at: item.created_at || '',
				state: item.state || 'open',
				status: item.state || 'open',
			});
		});
	} catch (error) {
		needs.push('GitHub search: ' + clean(error));
	}
	return { issues, needs };
}

async function source(ctx) {
	const needs = [];
	const linkRows = [
		{ label: 'Legal page', url: ORIGIN + '/qa-review-legal.html' },
		{ label: 'clauses.json (main)', url: legalWatch.CLAUSES_URL },
		{ label: 'Parent #4004', url: 'https://github.com/' + REPO + '/issues/4004' },
	];
	const actionRows = [
		{ label: 'Open legal page', url: ORIGIN + '/qa-review-legal.html' },
		{ label: 'Run legal watch', op: 'run-job', job: 'legalWatch', key: 'legal:watch' },
	];

	let clauses = [];
	let signoffs = {};
	try {
		clauses = await legalWatch.loadClauses(ctx.fetch);
	} catch (error) {
		needs.push('Clauses: ' + clean(error));
	}
	try {
		signoffs = await loadSignoff(ctx.fetch);
	} catch (error) {
		needs.push('Signoff: ' + clean(error));
	}

	const clauseList = clauseRows(clauses);
	const cites = clauses.length ? citeRows(clauses) : [];
	const signRows = signoffRows(signoffs);
	const juris = jurisdictionRows(clauses);

	let watch = null;
	let changeRows = [];
	if (ctx.db) {
		try {
			const watchSnap = await ctx.db.collection('ops_runs').doc('legalWatch').get();
			if (watchSnap.exists) {
				const d = watchSnap.data();
				watch = {
					ok: d.ok !== false,
					startedAt: d.startedAt || '',
					endedAt: d.endedAt || '',
					at: d.endedAt || d.startedAt || '',
					note: text(d.note || d.error || '', 200),
					tally: d.tally || null,
					changes: Number(d.changes) || 0,
					checked: d.tally && d.tally.checked != null ? d.tally.checked : null,
					tracked: d.tally && d.tally.urls != null ? d.tally.urls : cites.length,
					failed: d.tally && d.tally.failed != null ? d.tally.failed : 0,
					baseline: d.tally && d.tally.baseline != null ? d.tally.baseline : null,
					urls: cites.length,
				};
			}
		} catch (error) {
			needs.push('Watch status: ' + clean(error));
		}
		try {
			const chSnap = await ctx.db
				.collection('legal_watch_changes')
				.orderBy('detectedAt', 'desc')
				.limit(CHANGE_LIMIT)
				.get();
			changeRows = chSnap.docs.map((doc) => {
				const d = doc.data();
				return {
					id: doc.id,
					label: d.url || doc.id,
					url: d.url || '',
					at: d.detectedAt || '',
					detectedAt: d.detectedAt || '',
					issue: d.issue || null,
					issueUrl: d.issueUrl || '',
					issueN: d.issue || null,
					clauseCount: Array.isArray(d.clauses) ? d.clauses.length : 0,
					clauses: Array.isArray(d.clauses) ? d.clauses.map((c) => (c && c.id) || c).filter(Boolean) : [],
					note: Array.isArray(d.clauses)
						? d.clauses
								.map((c) => (c && c.id) || c)
								.filter(Boolean)
								.slice(0, 4)
								.join(', ')
						: '',
				};
			});
		} catch (error) {
			needs.push('legal_watch_changes: ' + clean(error));
		}
	} else {
		needs.push('Firestore: db missing; watch status and changes unavailable.');
	}

	const gh = await githubIssues(ctx);
	needs.push(...gh.needs);

	const draft = clauseList.filter((c) => c.status !== 'counsel-approved').length;
	const kpis = kpisFrom(clauseList, cites, watch, changeRows, gh.issues);

	return {
		ok: !!(clauseList.length || signRows.length),
		kpis,
		clauses: block(clauseList, { at: '' }),
		signoff: block(signRows, {
			signed: signRows.filter((r) => r.status === 'signed').length,
			pending: signRows.filter((r) => r.status !== 'signed').length,
		}),
		signoffs: signRows,
		watch: watch
			? block(watch.rows || [], Object.assign({}, watch, { ok: watch.ok !== false }))
			: { ok: false, rows: [], error: 'Watch has not run yet.' },
		changes: block(changeRows),
		cites: block(cites, { byHost: cites.map((r) => ({ label: r.label, value: r.value || 0 })) }),
		issues: block(gh.issues, { open: gh.issues.length }),
		jurisdictions: block(juris),
		links: block(linkRows),
		actions: block(actionRows),
		needs,
		draft,
		at: new Date(ctx.now || Date.now()).toISOString(),
	};
}

module.exports = { source, SIGNOFF_URL, clauseRows, citeRows, kpisFrom, jurisdictionRows };
