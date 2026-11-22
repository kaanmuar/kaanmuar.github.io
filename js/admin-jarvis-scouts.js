/*
 * Jarvis Scouts tab (#4242): scout health, engagement meta, tool/trending scouts, handoff questions (#4237) and digest.
 * Reads scout-learn + scouts snapshot ops. Twin: android/.../ui/Scouts.kt.
 */
const SCOUT_LABEL = {
	tool: 'Tool scout',
	engagement: 'Engagement',
	'field-sweep': 'Field sweep',
	trending: 'Trending',
};
const CADENCE = { tool: 7, engagement: 2, 'field-sweep': 3, trending: 3 };
const rowsOf = (block) => (block && Array.isArray(block.rows) ? block.rows : Array.isArray(block) ? block : []);

export function view(ctx) {
	const { panel, esc, fmt, when, waiting, briefPanel, goalsPanel, kpis, table, bars, needList, e, S, COLORS } = ctx;
	const scoutsSnap = e.scouts;
	const learn = e['scout-learn'];
	const engagement = e.engagement && e.engagement.ok ? e.engagement : null;
	const health = e.health && e.health.ok ? e.health : null;

	const scouts = (scoutsSnap && scoutsSnap.ok && scoutsSnap.scouts) || (learn && learn.scouts) || [];
	const open = (learn && learn.openQuestions) || [];
	const asked = (learn && learn.asked) || [];
	const cadence = (learn && learn.cadence) || CADENCE;
	const board = (learn && learn.board) || {};
	const tot = board.totals || {};

	const qCard = (q) => {
		const opts = (q.options || [])
			.map(
				(o) =>
					`<button type="button" class="jv-btn${o.id === 'later' ? '' : ' is-primary'}" data-learn-decide="${esc(o.id)}" data-id="${esc(q.id)}"${S.pending['learn:' + q.id] ? ' disabled' : ''}>${esc(o.label)}</button>`
			)
			.join('');
		return `<li class="jv-learn-q"><strong>${esc(SCOUT_LABEL[q.scout] || q.scout || '')}</strong><p>${esc(q.text)}</p><p class="jv-note">${esc(q.why || '')}${q.at ? ' · ' + esc(when(q.at)) : ''}</p><div class="jv-prop-acts">${opts}</div></li>`;
	};

	const scoutBody = (s) => {
		const days = Math.round((cadence[s.scout] || CADENCE[s.scout] * 86400000 || 0) / 86400000) || CADENCE[s.scout] || 0;
		const lessons = (s.lessons || []).map((l) => `<li>${esc(typeof l === 'string' ? l : l.text || '')}</li>`).join('');
		const odds = (s.odds || [])
			.map((o) => `<li><span class="jv-chip">${Math.round((o.p || 0) * 100)}%</span> ${esc(o.claim || o.id || '')}</li>`)
			.join('');
		return `<p class="jv-note">Private · ask every ${fmt(days)} day${days === 1 ? '' : 's'} · updated ${esc(when(s.at) || '—')}</p>
            ${lessons ? `<h4>Lessons</h4><ul>${lessons}</ul>` : ''}
            ${odds ? `<h4>Odds</h4><ul>${odds}</ul>` : ''}
            ${!lessons && !odds ? '<p class="jv-empty">No lessons yet for this scout.</p>' : ''}`;
	};

	const byScout = Object.fromEntries(scouts.map((s) => [s.scout, s]));

	const head = kpis([
		{ label: 'Open asks', value: tot.open != null ? tot.open : learn && (learn.waiting || open.length), alert: open.length > 0 },
		{ label: 'Scouts', value: tot.scouts != null ? tot.scouts : scouts.length },
		{ label: 'Learn runs', value: tot.runs || 0 },
		{ label: 'Engagement waiting', value: engagement ? engagement.waiting && engagement.waiting.length : '—', alert: engagement && engagement.waiting && engagement.waiting.length > 0 },
		{ label: 'Scout jobs ok', value: health && health.jobs ? health.jobs.filter((j) => j.ok).length + '/' + health.jobs.length : '—' },
		{ label: 'Updated', value: learn && learn.at ? when(learn.at) : scoutsSnap && scoutsSnap.at ? when(scoutsSnap.at) : '—' },
	]);

	const healthRows = rowsOf(scoutsSnap && scoutsSnap.health);
	const healthBody =
		scoutsSnap && scoutsSnap.ok && healthRows.length
			? table(
					[
						['Scout', (r) => esc(SCOUT_LABEL[r.scout] || r.scout || r.label)],
						['Last run', (r) => esc(when(r.at))],
						['Status', (r) => `<span class="jv-chip ${r.ok === false ? 'c-slow' : 'c-fast'}">${esc(r.ok === false ? 'stale' : 'ok')}</span>`],
					],
					healthRows,
					'No scout health rows.'
				)
			: health && health.jobs
				? table(
						[
							['Job', (j) => esc(j.name)],
							['OK', (j) => `<span class="jv-chip ${j.ok ? 'c-fast' : 'c-slow'}">${j.ok ? 'yes' : 'no'}</span>`],
							['Last', (j) => esc(j.lastAttempt ? when(j.lastAttempt) : '—')],
						],
						health.jobs.filter((j) => /scout|engagement|tool|trend|sweep/i.test(j.name)).slice(0, 12),
						'No scout jobs in health snapshot.'
					)
				: waiting('scouts', 'Reading scout health…');

	const engagementBody = engagement
		? kpis([
				{ label: 'Paused', value: engagement.paused ? 'yes' : 'no', alert: engagement.paused },
				{ label: 'Live', value: engagement.live ? 'yes' : 'dry run' },
				{ label: 'Waiting replies', value: (engagement.waiting || []).length, alert: (engagement.waiting || []).length > 0 },
				{ label: 'Last scout', value: engagement.runs && engagement.runs.length ? when(engagement.runs[0].at) : '—' },
			]) + `<div class="jv-actions"><button type="button" class="jv-btn" data-go="engagement">Open Engagement</button><button type="button" class="jv-btn" data-run="engagementScout">Run engagement scout</button></div>`
		: waiting('engagement', 'Reading engagement scout…');

	const toolsBody = byScout.tool
		? scoutBody(byScout.tool)
		: waiting('scout-learn', 'Reading tool scout lessons…');

	const trendingBody = byScout.trending
		? scoutBody(byScout.trending)
		: `<p class="jv-empty">Trending scout has not learned yet (#3814 drafts).</p>`;

	const handoffBody = open.length
		? `<ul class="jv-learn-qs">${open.map(qCard).join('')}</ul>`
		: '<p class="jv-empty">No open questions. Scouts ask on their cadence when something needs a decision.</p>';

	const digestBody = asked.length
		? table(
				[
					['When', (x) => esc(when(x.at))],
					['Scout', (x) => esc(SCOUT_LABEL[x.scout] || x.scout || '')],
					['Decision', (x) => esc(x.note || x.option || x.status || '')],
					['Question', (x) => esc(x.text || x.id || '')],
				],
				asked.slice(0, 12),
				'No decisions yet.'
			)
		: board.study && board.study.length
			? `<ul class="jv-learn-study">${board.study.map((line) => `<li>${esc(line)}</li>`).join('')}</ul>`
			: '<p class="jv-empty">Digest fills after scouts run and you answer handoff questions.</p>';

	const linksBody = `<ul class="jv-facts">
        <li><button type="button" class="jv-link" data-go="engagement">Engagement tab</button></li>
        <li><button type="button" class="jv-link" data-go="github">GitHub · tool scout</button></li>
        <li><a href="https://github.com/kaanmuar/kaanmuar.github.io/blob/main/.cursor/rules/scout-learn.mdc" target="_blank" rel="noopener">scout-learn rule</a></li>
        <li><a href="https://github.com/kaanmuar/kaanmuar.github.io/blob/main/.cursor/rules/tool-arsenal.mdc" target="_blank" rel="noopener">tool arsenal</a></li>
    </ul>`;

	const actionsBody = `<div class="jv-actions">
        <button type="button" class="jv-btn" data-run="engagementScout">Run engagement scout</button>
        <button type="button" class="jv-btn" data-run="toolScout">Run tool scout</button>
        <button type="button" class="jv-btn" data-go="learn">Playbook locks</button>
        <button type="button" class="jv-btn" data-act="export-csv">Export this tab (CSV)</button>
    </div>
    <p class="jv-note">Learning is private to you and the scouts — never public hub posts or tool-scout draft PR bodies. Cadence: tool 7d · engagement 2d · field-sweep & trending 3d.</p>`;

	if (!learn && !scoutsSnap) {
		return (
			head +
			`<div class="jv-grid">${briefPanel('scouts')}${goalsPanel('scouts')}
            ${panel('scouts-health', 'Scout health', healthBody, { wide: true })}
            ${panel('scouts-wait', 'Scouts', waiting('scout-learn', 'Reading scout learning…'), { wide: true })}
        </div>`
		);
	}

	return (
		head +
		needList(learn || scoutsSnap) +
		`<div class="jv-grid">${briefPanel('scouts')}${goalsPanel('scouts')}
        ${panel('scouts-health', 'Scout health', healthBody, { wide: true, data: healthRows })}
        ${panel('scouts-engagement', 'Engagement scout', engagementBody, { wide: true })}
        ${panel(
			'scouts-tools',
			(SCOUT_LABEL.tool || 'tool') + (byScout.tool && byScout.tool.runs ? ' · ' + fmt(byScout.tool.runs) + ' runs' : ''),
			toolsBody,
			{ wide: true, data: byScout.tool ? [byScout.tool] : [] }
		)}
        ${panel(
			'scouts-trending',
			(SCOUT_LABEL.trending || 'trending') + (byScout.trending && byScout.trending.runs ? ' · ' + fmt(byScout.trending.runs) + ' runs' : ''),
			trendingBody,
			{ wide: true, data: byScout.trending ? [byScout.trending] : [] }
		)}
        ${panel('scouts-handoff', `Handoff${open.length ? ' · ' + open.length : ''}`, handoffBody, { wide: true, data: open })}
        ${panel('scouts-digest', 'Digest', digestBody, { wide: true, data: asked })}
        ${panel('scouts-links', 'Links', linksBody)}
        ${panel('scouts-actions', 'Actions', actionsBody)}
    </div>`
	);
}