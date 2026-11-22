/*
 * Jarvis Legal tab (#4242): qa-review-legal.html, clauses/signoff JSON and legalWatch (#4004).
 * Snapshot op `legal` (functions/jarvis-legal.js — Android parity). Twin: android/.../ui/Legal.kt.
 */
const LEGAL_PAGE = 'https://carlosandmunoz.com/qa-review-legal.html';
const CLAUSES_REPO = 'https://github.com/kaanmuar/kaanmuar.github.io/blob/main/legal/clauses.json';
const SIGNOFF_REPO = 'https://github.com/kaanmuar/kaanmuar.github.io/blob/main/legal/signoff.json';

const chip = (ok, text, esc) =>
	`<span class="jv-chip ${ok ? 'c-fast' : ok === false ? 'c-slow' : 'c-average'}">${esc(text)}</span>`;
const rowsOf = (block) => (block && Array.isArray(block.rows) ? block.rows : Array.isArray(block) ? block : []);

export function view(ctx) {
	const { panel, esc, fmt, when, waiting, briefPanel, goalsPanel, kpis, table, bars, needList, e, COLORS } = ctx;
	const src = e.legal;

	if (!src || src.ok === false) {
		return (
			`<div class="jv-grid">${briefPanel('legal')}${goalsPanel('legal')}${panel(
				'legal-wait',
				'Legal',
				waiting('legal', 'Reading clauses, signoffs and the legal watch…'),
				{
					wide: true,
					note: 'Sources: legal/clauses.json, legal/signoff.json, Firestore legal_watch (#4004). The watch never edits the page.',
				}
			)}</div>`
		);
	}

	const clauses = rowsOf(src.clauses);
	const sign = rowsOf(src.signoff || src.signoffs);
	const watch = src.watch || {};
	const changes = rowsOf(src.changes);
	const cites = rowsOf(src.cites);
	const issues = rowsOf(src.issues);
	const juris = rowsOf(src.jurisdictions);
	const draft = clauses.filter((c) => c.status !== 'counsel-approved').length;
	const approved = clauses.length - draft;

	const head = kpis(src.kpis && src.kpis.length
		? src.kpis
		: [
				{ label: 'Clauses', value: clauses.length },
				{ label: 'Counsel approved', value: approved, alert: draft > 0 },
				{ label: 'Draft', value: draft, alert: draft > 0 },
				{ label: 'Cited URLs', value: cites.length },
				{ label: 'Open issues', value: issues.length, alert: issues.length > 0 },
				{ label: 'Updated', value: src.at ? when(src.at) : '—' },
			]);

	const clausesBody = clauses.length
		? table(
				[
					['Clause', (c) => esc(c.id || c.label || '')],
					['Jurisdiction', (c) => esc(c.jurisdiction || '—')],
					['Status', (c) => chip(c.status === 'counsel-approved', c.status || 'draft', esc)],
					['Checked', (c) => esc(c.lastChecked || '—')],
					['Cites', (c) => fmt(c.citeCount != null ? c.citeCount : (c.cites || []).length)],
				],
				clauses.slice(0, 40),
				'No clauses in the snapshot.'
			)
		: '<p class="jv-empty">Clause list not in this snapshot yet.</p>';

	const signBody = sign.length
		? table(
				[
					['Clause', (r) => esc(r.id || r.label)],
					['Signed', (r) => esc(r.signedOffOn || '—')],
					['By', (r) => esc(r.signedOffBy || '—')],
					['Counsel', (r) => esc(r.counselReviewedOn || '—')],
				],
				sign.slice(0, 40),
				'No signoffs on file.'
			)
		: '<p class="jv-empty">Signoff registry not loaded.</p>';

	const watchBody =
		watch && (watch.at || watch.endedAt || watch.ok != null)
			? kpis([
					{ label: 'Tracked URLs', value: watch.tracked != null ? watch.tracked : watch.urls || '—' },
					{ label: 'Checked', value: watch.checked != null ? watch.checked : '—' },
					{ label: 'Changes filed', value: watch.changes != null ? watch.changes : '—' },
					{ label: 'Fetch failures', value: watch.failed || 0, alert: watch.failed > 0 },
					{ label: 'Last run', value: watch.at || watch.endedAt ? when(watch.at || watch.endedAt) : '—' },
				]) + (watch.note ? `<p class="jv-note">${esc(watch.note)}</p>` : '')
			: waiting('legal', 'Reading legal watch state…');

	const changesBody = changes.length
		? table(
				[
					['When', (r) => esc(when(r.at || r.detectedAt))],
					['URL', (r) => `<span class="jv-note">${esc(String(r.url || r.label || '').slice(0, 72))}</span>`],
					['Clauses', (r) => esc((r.clauses || []).join(', ') || r.note || '—')],
					[
						'Issue',
						(r) =>
							r.issueUrl || r.url
								? `<a href="${esc(r.issueUrl || r.url)}" target="_blank" rel="noopener">${esc(r.issueN || r.issue || 'open')}</a>`
								: '—',
					],
				],
				changes.slice(0, 15),
				'No cited-page changes in range.'
			)
		: '<p class="jv-empty">No changes detected since the last baselines.</p>';

	const citesBody = cites.length
		? bars(
				cites.map((r) => ({ label: r.label || r.name || r.url, value: r.value || r.clauses?.length || 0 })),
				{ color: COLORS.cyan, empty: 'No cite hosts yet.' }
			) +
			table(
				[
					['Statute / cite', (r) => esc(r.label || r.name || r.url)],
					['Clauses', (r) => fmt(r.value != null ? r.value : (r.clauses || []).length)],
					['URL', (r) => (r.url ? `<a href="${esc(r.url)}" target="_blank" rel="noopener">open</a>` : '—')],
				],
				cites.slice(0, 20)
			)
		: '<p class="jv-empty">Cite index not in snapshot.</p>';

	const issuesBody = issues.length
		? table(
				[
					[
						'Issue',
						(r) =>
							r.url
								? `<a href="${esc(r.url)}" target="_blank" rel="noopener">#${esc(r.number)} ${esc(r.title || r.label || '')}</a>`
								: esc(r.title || r.number),
					],
					['State', (r) => chip(r.state === 'open' || r.status === 'open', r.state || r.status || 'open', esc)],
					['Opened', (r) => esc(when(r.at))],
				],
				issues,
				'No open legal issues.'
			)
		: '<p class="jv-empty">No GitHub issues from legalWatch in range.</p>';

	const jurisBody = juris.length
		? bars(
				juris.map((r) => ({ label: r.code || r.jurisdiction || r.label, value: r.clauses || r.count || r.value || 0 })),
				{ color: COLORS.violet, empty: 'No jurisdictions.' }
			)
		: '<p class="jv-empty">Jurisdiction breakdown not loaded.</p>';

	const linksBody = `<ul class="jv-facts">
        <li><a href="${LEGAL_PAGE}" target="_blank" rel="noopener">qa-review-legal.html</a> · live page</li>
        <li><a href="${CLAUSES_REPO}" target="_blank" rel="noopener">legal/clauses.json</a></li>
        <li><a href="${SIGNOFF_REPO}" target="_blank" rel="noopener">legal/signoff.json</a></li>
        <li><a href="https://github.com/kaanmuar/kaanmuar.github.io/issues/4004" target="_blank" rel="noopener">#4004 legal watch</a></li>
    </ul>`;

	const actionsBody = `<div class="jv-actions">
        <a class="jv-btn" href="${LEGAL_PAGE}" target="_blank" rel="noopener">Open legal page</a>
        <a class="jv-btn" href="${CLAUSES_REPO}" target="_blank" rel="noopener">Open clauses</a>
        <button type="button" class="jv-btn" data-run="legalWatch">Run legal watch</button>
        <button type="button" class="jv-btn" data-act="export-csv">Export this tab (CSV)</button>
    </div>
    <p class="jv-note">legalWatch runs Mondays 10:00 Bogotá; Jarvis files one issue when a cited statute page changes. It never edits clauses.json or the HTML.</p>`;

	return (
		head +
		needList(src) +
		`<div class="jv-grid">${briefPanel('legal')}${goalsPanel('legal')}
        ${panel('legal-clauses', `Clauses · ${clauses.length}`, clausesBody, { wide: true, data: clauses })}
        ${panel('legal-signoff', 'Signoffs', signBody, { wide: true, data: sign })}
        ${panel('legal-watch', 'Legal watch', watchBody, { wide: true, data: watch ? [watch] : [] })}
        ${panel('legal-changes', 'Detected changes', changesBody, { data: changes })}
        ${panel('legal-cites', 'Cited statutes', citesBody, { wide: true, data: cites })}
        ${panel('legal-issues', 'GitHub issues', issuesBody, { data: issues })}
        ${panel('legal-jurisdictions', 'Jurisdictions', jurisBody, { data: juris })}
        ${panel('legal-links', 'Links', linksBody)}
        ${panel('legal-actions', 'Actions', actionsBody)}
    </div>`
	);
}
