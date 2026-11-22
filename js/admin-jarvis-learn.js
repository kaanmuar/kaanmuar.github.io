/*
 * Optional Learn-tab panels from snapshot op `learn` (#4242). Scout Firestore UI stays in learnView() (#4237).
 */
const FALLBACK_GUIDES = [
	{ title: 'QA-lab growth locks', url: 'https://github.com/kaanmuar/kaanmuar.github.io/blob/main/.cursor/rules/qa-lab-growth.mdc', area: 'playbook' },
	{ title: 'Scout learn loop', url: 'https://github.com/kaanmuar/kaanmuar.github.io/blob/main/.cursor/rules/scout-learn.mdc', area: 'scouts' },
	{ title: 'Tool arsenal', url: 'https://github.com/kaanmuar/kaanmuar.github.io/blob/main/.cursor/rules/tool-arsenal.mdc', area: 'tools' },
];

const rowsOf = (block) => (block && Array.isArray(block.rows) ? block.rows : Array.isArray(block) ? block : []);

/** Extra panels appended to learnView() when the `learn` snapshot loads. */
export function extraPanels(ctx) {
	const { panel, esc, when, table, e } = ctx;
	const src = e.learn;
	if (!src || src.ok === false) return '';
	const guides = (rowsOf(src.guides).length ? rowsOf(src.guides) : FALLBACK_GUIDES).slice(0, 24);
	const locks = rowsOf(src.locks);
	const videos = rowsOf(src.videos);
	const links = rowsOf(src.links);
	const guidesBody = table(
		[
			['Guide', (g) => `<a href="${esc(g.url || g.href)}" target="_blank" rel="noopener">${esc(g.title || g.label)}</a>`],
			['Area', (g) => esc(g.area || '—')],
			['Updated', (g) => esc(g.at ? when(g.at) : '—')],
		],
		guides,
		'No guides in the learn snapshot.'
	);
	const locksBody = locks.length
		? `<ul class="jv-facts">${locks
				.map((l) => `<li><strong>${esc(l.topic || l.id || '')}</strong> ${esc(l.note || l.text || '')}</li>`)
				.join('')}</ul>`
		: '<p class="jv-empty">No locks row in learn snapshot.</p>';
	const videosBody = videos.length
		? table(
				[
					[
						'Ticket',
						(v) => (v.url ? `<a href="${esc(v.url)}" target="_blank" rel="noopener">#${esc(v.ticket)}</a>` : esc(v.ticket)),
					],
					['Title', (v) => esc(v.title || '')],
					['Status', (v) => esc(v.status || '—')],
				],
				videos,
				'No video tickets.'
			)
		: '';
	const linksBody = links.length
		? `<ul class="jv-facts">${links
				.map((l) => `<li><a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label || l.url)}</a></li>`)
				.join('')}</ul>`
		: '<p class="jv-empty">No guide links.</p>';
	return (
		panel('learn-guides', `Playbook guides · ${guides.length}`, guidesBody, { wide: true, data: guides }) +
		(locks.length ? panel('learn-locks', `Growth locks · ${locks.length}`, locksBody, { wide: true, data: locks }) : '') +
		(videosBody ? panel('learn-videos', 'Explainer videos', videosBody, { data: videos }) : '') +
		panel('learn-links', 'Guide links', linksBody) +
		panel(
			'learn-actions',
			'Guide actions',
			`<div class="jv-actions"><a class="jv-btn" href="qa-review-guide.html" target="_blank" rel="noopener">Open review guide</a><button type="button" class="jv-btn" data-go="scouts">Open Scouts</button></div>`
		)
	);
}
