/*
 * Jarvis > AI (#4242): Gemini consult (hero) and platform KPIs. Answers route through Jarvis Ask → functions/gemini.js (Vertex → Studio).
 * Not wired to user-gemini-web (Cursor MCP); production uses functions/gemini.js only.
 */
export const SHORTCUTS = [
	[
		'legal',
		'Legal clause review',
		'Which legal clauses in qa-review-legal still need sign-off before the next publish, and what changed since the last apply?',
	],
	[
		'scout',
		'Scout triage',
		'Which open scout-learn questions should I answer first, and what is each scout waiting on?',
	],
	[
		'growth',
		'Growth-lock check',
		'Against our growth locks (#3475), what must we refuse or build next — soft gate, Slide 3, MCP, white-label PDF?',
	],
	[
		'review',
		'URL review ambiguity',
		'When a URL review is ambiguous or inconclusive, what do we promise in email and what should rescue do?',
	],
];

const rowsOf = (block) => (block && Array.isArray(block.rows) ? block.rows : Array.isArray(block) ? block : []);

/** Hero consult panel: textarea + shortcuts; submit uses the same data-ask / parseCommand path as other Ask fields. */
export function consultPanel({ panel, esc, when, S }) {
	const chips = SHORTCUTS.map(
		([, label, q]) => `<button type="button" class="jv-btn small" data-ai-prefill="${esc(q)}">${esc(label)}</button>`
	).join('');
	const aiBlock = S.ai
		? `<div class="jv-ai"><span class="jv-eyebrow">Gemini · ${S.aiAt ? esc(when(S.aiAt)) : ''}</span><div class="jv-ai-text">${esc(S.ai).replace(/\n/g, '<br>')}</div></div>`
		: '';
	const body = `<p class="jv-note">Ask Jarvis anything about the numbers. Answers use <code>functions/gemini.js</code> (Vertex → Studio). The user-gemini-web MCP is not wired into production.</p>
            <div class="jv-chips">${chips}</div>
            <form class="jv-ask jv-ai-consult" data-ask data-ai-consult>
              <textarea name="q" rows="5" data-keep="ai-consult" placeholder="Ask Jarvis: legal clause risk, scout triage, growth locks, URL review ambiguity…" aria-label="Gemini consult"></textarea>
              <button type="submit" class="jv-btn is-primary">Ask</button>
            </form>
            ${aiBlock}`;
	return panel('ai-consult', 'Gemini consult', body, {
		wide: true,
		tall: true,
		keep: true,
		note: 'Same Ask path as Overview: submit → parseCommand → ask. End with ? when a phrase might look like a command.',
	});
}

/** Gemini KPIs from external.platform.gemini (and ai.platform peer mirror). */
export function platformPanel({ panel, esc, fmt, kpis, bars, waiting, S, C }) {
	const p = (S.external.ai && S.external.ai.platform) || S.external.platform;
	const gemini = (p && p.gemini) || (S.external.platform && S.external.platform.gemini) || {};
	if (!S.external.platform || !S.external.platform.ok)
		return panel('ai-platform', 'Gemini on Google Cloud', waiting('platform', 'Reading Gemini usage from Monitoring…'), {
			wide: true,
		});
	const g = gemini;
	const th = C.thresholds((S.settings || {}).thresholds);
	const failed =
		g.failedMethods && g.failedMethods.length
			? `<p class="jv-note">Failed Gemini calls by method: ${g.failedMethods.map((m) => esc(m.label) + ' ' + fmt(m.value)).join(', ')}.</p>`
			: '';
	const body =
		kpis([
			{ label: 'Requests (7 days)', value: g.requests === undefined ? '—' : g.requests },
			{ label: 'Ok (7 days)', value: g.requests ? g.ok + ' / ' + g.requests : '—' },
			{
				label: 'Error rate',
				value: g.errorRate === undefined ? '—' : g.errorRate + '%',
				alert: g.requests >= 10 && g.errorRate >= th.geminiErrorPct,
			},
		]) +
		(g.byClass && g.byClass.length ? bars(g.byClass, { color: '#ff9be0', empty: 'No response classes.' }) : '') +
		failed;
	return panel('ai-platform', 'Gemini on Google Cloud, last 7 days', body, {
		wide: true,
		data: [g],
		note: 'From snapshot external.platform.gemini (Cloud Monitoring). Same source as Systems › Google Cloud.',
	});
}

function proposalsPanel(ctx) {
	const { panel, esc, when, table, e } = ctx;
	const rows = rowsOf(e.ai && e.ai.proposals);
	const body = rows.length
		? table(
				[
					['Proposal', (r) => esc(r.title || r.label || r.key)],
					['Source', (r) => esc(r.source || 'gemini')],
					['Until', (r) => esc(r.until ? when(r.until) : '—')],
				],
				rows,
				'No Gemini-tagged proposals.'
			)
		: '<p class="jv-empty">No open Gemini proposals in range.</p>';
	return panel('ai-proposals', `Proposals · ${rows.length}`, body, { wide: true, data: rows });
}

function playbooksPanel(ctx) {
	const { panel, esc, e } = ctx;
	const rows = rowsOf(e.ai && e.ai.playbooks);
	const body = rows.length
		? `<ul class="jv-facts">${rows
				.map(
					(p) =>
						`<li><strong>${esc(p.title || p.label || p.id)}</strong><p class="jv-note">${esc(
							(p.steps || []).join(' · ') || p.note || ''
						)}</p></li>`
				)
				.join('')}</ul>`
		: '<p class="jv-empty">No playbooks on file.</p>';
	return panel('ai-playbooks', 'Consult playbooks', body, { wide: true, data: rows });
}

function recentPanel(ctx) {
	const { panel, esc, when, table, e } = ctx;
	const rows = rowsOf(e.ai && e.ai.recent);
	const body = rows.length
		? table(
				[
					['When', (r) => esc(when(r.createdAt || r.at))],
					['Label', (r) => esc(r.label || r.title || r.id)],
					['By', (r) => esc(r.by || r.source || 'gemini')],
				],
				rows,
				'No recent Gemini countdowns.'
			)
		: '<p class="jv-empty">No recent Gemini-tagged countdowns.</p>';
	return panel('ai-recent', 'Recent Gemini work', body, { data: rows });
}

function costPanel(ctx) {
	const { panel, esc, fmt, waiting, S, e } = ctx;
	const g = (S.external.platform && S.external.platform.gemini) || {};
	const cost = e.ai && e.ai.cost;
	if (!S.external.platform || !S.external.platform.ok)
		return panel('ai-cost', 'Consult cost guard', waiting('platform', 'Reading spend…'));
	const body = `<p class="jv-note">Infra KPIs stay on Systems › Google Cloud. This tab only mirrors Gemini request volume (${esc(
		fmt(g.requests)
	)} / 7d${g.errorRate != null ? ', error ' + esc(g.errorRate) + '%' : ''}).${cost && cost.note ? ' ' + esc(cost.note) : ''}</p>
        <div class="jv-actions"><button type="button" class="jv-btn" data-go="systems">Open Systems</button></div>`;
	return panel('ai-cost', 'Consult cost guard', body);
}

function linksPanel(ctx) {
	const { panel } = ctx;
	return panel(
		'ai-links',
		'Links',
		`<ul class="jv-facts">
        <li><button type="button" class="jv-link" data-go="overview">Overview Ask</button></li>
        <li><button type="button" class="jv-link" data-go="systems">Systems · platform</button></li>
        <li><button type="button" class="jv-link" data-go="legal">Legal tab</button></li>
        <li><button type="button" class="jv-link" data-go="scouts">Scouts tab</button></li>
    </ul>`
	);
}

function actionsPanel(ctx) {
	const { panel } = ctx;
	return panel(
		'ai-actions',
		'Actions',
		`<div class="jv-actions">
        <button type="button" class="jv-btn is-primary" data-go="ai">Focus consult</button>
        <button type="button" class="jv-btn" data-act="ai-brief">Gemini briefing</button>
        <button type="button" class="jv-btn" data-go="systems">Platform KPIs</button>
    </div>
    <p class="jv-note">Consult submit uses the shared Ask form (data-ask). Briefing reuses the overview Gemini action.</p>`
	);
}

export function view(ctx) {
	const { briefPanel, goalsPanel, needList, e, kpis } = ctx;
	const src = e.ai;
	const head = src && src.kpis && src.kpis.length ? kpis(src.kpis) : '';
	return (
		head +
		(src ? needList(src) : '') +
		`<div class="jv-grid">${briefPanel('ai')}${goalsPanel('ai')}
        ${consultPanel(ctx)}
        ${platformPanel(ctx)}
        ${proposalsPanel(ctx)}
        ${playbooksPanel(ctx)}
        ${costPanel(ctx)}
        ${recentPanel(ctx)}
        ${linksPanel(ctx)}
        ${actionsPanel(ctx)}
    </div>`
	);
}

/** Prefill shortcut chips into the consult textarea (submit still goes through data-ask). */
export function bind(root) {
	root.addEventListener('click', (e) => {
		const btn = e.target.closest('[data-ai-prefill]');
		if (!btn || !root.contains(btn)) return;
		const viewEl = root.querySelector('[data-view="ai"]');
		if (!viewEl || !viewEl.contains(btn)) return;
		const field = viewEl.querySelector('form[data-ai-consult] [name="q"]');
		const q = btn.getAttribute('data-ai-prefill') || '';
		if (field && q) {
			field.value = q;
			field.focus();
		}
	});
}
