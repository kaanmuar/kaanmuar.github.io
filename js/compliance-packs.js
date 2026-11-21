/* Jurisdiction compliance pack metadata (#3837).
 *
 * Clean-room checklist IDs for EU EAA / GDPR / AI Act, BR LGPD, and JP APPI.
 * Inspired by the pack idea in jomardyan/Playwright-Law-Suite (MIT); no code or
 * rule text is copied from that repo. This is metadata for suite.html (and any
 * PitchMeIn surface that loads the same module) — not legal advice, not a
 * compliance determination, and not a scanner.
 *
 *   CompliancePacks.list()
 *   CompliancePacks.get('eu-eaa')
 *   CompliancePacks.forJurisdiction('EU')
 *   CompliancePacks.obligationIds()
 *   CompliancePacks.mount(rootEl)   // paints #compliance-packs when present
 */
(function (root, factory) {
	const api = factory();
	if (typeof module === 'object' && module.exports) module.exports = api;
	if (root) root.CompliancePacks = api;
})(typeof window !== 'undefined' ? window : globalThis, () => {
	'use strict';

	const DISCLAIMER =
		'Checklist metadata only. These IDs name obligation themes for planning and tests; they are not legal advice and do not say a product is compliant.';

	const SOURCE_NOTE =
		'Pack shape inspired by jomardyan/Playwright-Law-Suite (MIT). Clean-room metadata; no upstream code.';

	/** @typedef {{ id: string, summary: string }} Obligation */
	/** @typedef {{ id: string, jurisdiction: string, short: string, label: string, instruments: string[], obligations: Obligation[] }} Pack */

	/** @type {Pack[]} */
	const PACKS = [
		{
			id: 'eu-eaa',
			jurisdiction: 'EU',
			short: 'EAA',
			label: 'European Accessibility Act',
			instruments: ['Directive (EU) 2019/882', 'EN 301 549'],
			obligations: [
				{ id: 'eu.eaa.perceivable', summary: 'Perceivable UI for covered consumer services' },
				{ id: 'eu.eaa.operable', summary: 'Operable controls without pointer-only paths' },
				{ id: 'eu.eaa.understandable', summary: 'Understandable labels, errors, and help' },
				{ id: 'eu.eaa.robust', summary: 'Robust markup for assistive tech' },
				{ id: 'eu.eaa.statement', summary: 'Accessibility statement and contact path' },
			],
		},
		{
			id: 'eu-gdpr',
			jurisdiction: 'EU',
			short: 'GDPR',
			label: 'General Data Protection Regulation',
			instruments: ['Regulation (EU) 2016/679'],
			obligations: [
				{ id: 'eu.gdpr.lawful-basis', summary: 'Named lawful basis per processing purpose' },
				{ id: 'eu.gdpr.notice', summary: 'Transparent privacy notice at collection' },
				{ id: 'eu.gdpr.rights', summary: 'Access, erasure, and objection paths' },
				{ id: 'eu.gdpr.minimisation', summary: 'Data minimisation and retention limits' },
				{ id: 'eu.gdpr.transfers', summary: 'Transfer safeguards when data leaves the EEA' },
			],
		},
		{
			id: 'eu-ai-act',
			jurisdiction: 'EU',
			short: 'AI Act',
			label: 'EU AI Act transparency',
			instruments: ['Regulation (EU) 2024/1689 Art. 50'],
			obligations: [
				{ id: 'eu.ai.disclose-ai', summary: 'Disclose when users interact with AI systems' },
				{ id: 'eu.ai.synthetic-label', summary: 'Label synthetic audio, image, or video content' },
				{ id: 'eu.ai.deepfake-mark', summary: 'Mark deepfake or manipulated media clearly' },
				{ id: 'eu.ai.record-use', summary: 'Record intended AI use for covered features' },
			],
		},
		{
			id: 'br-lgpd',
			jurisdiction: 'BR',
			short: 'LGPD',
			label: 'Lei Geral de Proteção de Dados',
			instruments: ['Lei nº 13.709/2018'],
			obligations: [
				{ id: 'br.lgpd.basis', summary: 'Legal basis under Art. 7 / Art. 11' },
				{ id: 'br.lgpd.notice', summary: 'Clear notice of purposes and shared parties' },
				{ id: 'br.lgpd.rights', summary: 'Titular rights request channel' },
				{ id: 'br.lgpd.security', summary: 'Security measures proportional to risk' },
				{ id: 'br.lgpd.incident', summary: 'Incident notice path to ANPD when required' },
			],
		},
		{
			id: 'jp-appi',
			jurisdiction: 'JP',
			short: 'APPI',
			label: 'Act on the Protection of Personal Information',
			instruments: ['個人情報の保護に関する法律'],
			obligations: [
				{ id: 'jp.appi.purpose', summary: 'Specify and limit use purposes' },
				{ id: 'jp.appi.consent-third', summary: 'Consent before third-party provision when required' },
				{ id: 'jp.appi.security', summary: 'Security control measures for personal data' },
				{ id: 'jp.appi.disclosure', summary: 'Disclosure and correction request handling' },
				{ id: 'jp.appi.cross-border', summary: 'Cross-border transfer checks when applicable' },
			],
		},
	];

	function list() {
		return PACKS.slice();
	}

	function get(id) {
		const key = String(id || '').trim();
		return PACKS.find((p) => p.id === key) || null;
	}

	function forJurisdiction(code) {
		const key = String(code || '')
			.trim()
			.toUpperCase();
		return PACKS.filter((p) => p.jurisdiction === key);
	}

	function obligationIds(packId) {
		const packs = packId ? [get(packId)].filter(Boolean) : PACKS;
		return packs.flatMap((p) => p.obligations.map((o) => o.id));
	}

	function assertPackShape(pack, where) {
		const label = where || (pack && pack.id) || 'pack';
		if (!pack || typeof pack !== 'object') throw new Error(label + ': missing pack');
		if (!pack.id || typeof pack.id !== 'string') throw new Error(label + ': id');
		if (!/^[A-Z]{2}$/.test(pack.jurisdiction)) throw new Error(label + ': jurisdiction');
		if (!pack.short || !pack.label) throw new Error(label + ': short/label');
		if (!Array.isArray(pack.instruments) || !pack.instruments.length) throw new Error(label + ': instruments');
		if (!Array.isArray(pack.obligations) || pack.obligations.length < 3) throw new Error(label + ': obligations');
		const seen = new Set();
		pack.obligations.forEach((o, i) => {
			const at = label + '.obligations[' + i + ']';
			if (!o || typeof o.id !== 'string' || !o.id) throw new Error(at + ': id');
			if (!o.summary || typeof o.summary !== 'string') throw new Error(at + ': summary');
			if (seen.has(o.id)) throw new Error(at + ': duplicate id ' + o.id);
			seen.add(o.id);
		});
		return true;
	}

	function assertAll() {
		const ids = new Set();
		const obligationSeen = new Set();
		PACKS.forEach((pack) => {
			assertPackShape(pack);
			if (ids.has(pack.id)) throw new Error('duplicate pack id ' + pack.id);
			ids.add(pack.id);
			pack.obligations.forEach((o) => {
				if (obligationSeen.has(o.id)) throw new Error('duplicate obligation id ' + o.id);
				obligationSeen.add(o.id);
			});
		});
		return { packs: ids.size, obligations: obligationSeen.size };
	}

	function el(tag, attrs, text) {
		const node = document.createElement(tag);
		if (attrs) {
			Object.keys(attrs).forEach((k) => {
				if (attrs[k] != null) node.setAttribute(k, attrs[k]);
			});
		}
		if (text != null) node.textContent = text;
		return node;
	}

	function mount(root) {
		if (typeof document === 'undefined') return null;
		const host =
			typeof root === 'string'
				? document.querySelector(root)
				: root || document.getElementById('compliance-packs');
		if (!host) return null;

		host.replaceChildren();
		host.appendChild(el('p', { class: 'packs-disclaimer' }, DISCLAIMER));
		host.appendChild(el('p', { class: 'packs-source muted' }, SOURCE_NOTE));

		const listEl = el('div', { class: 'packs-list', role: 'list' });
		PACKS.forEach((pack) => {
			const card = el('article', {
				class: 'pack',
				role: 'listitem',
				'data-pack-id': pack.id,
				'aria-labelledby': 'pack-' + pack.id,
			});
			const head = el('header', { class: 'pack-head' });
			head.appendChild(el('p', { class: 'pack-jurisdiction' }, pack.jurisdiction + ' · ' + pack.short));
			head.appendChild(el('h2', { id: 'pack-' + pack.id }, pack.label));
			head.appendChild(el('p', { class: 'pack-instruments muted' }, pack.instruments.join(' · ')));
			card.appendChild(head);

			const ol = el('ol', { class: 'pack-obligations' });
			pack.obligations.forEach((o) => {
				const li = el('li');
				li.appendChild(el('code', { class: 'pack-id' }, o.id));
				li.appendChild(document.createTextNode(' — ' + o.summary));
				ol.appendChild(li);
			});
			card.appendChild(ol);
			listEl.appendChild(card);
		});
		host.appendChild(listEl);
		return host;
	}

	function autoMount() {
		if (typeof document === 'undefined') return;
		const run = () => mount('#compliance-packs');
		if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
		else run();
	}

	if (typeof document !== 'undefined') autoMount();

	return {
		DISCLAIMER,
		SOURCE_NOTE,
		PACKS,
		list,
		get,
		forJurisdiction,
		obligationIds,
		assertPackShape,
		assertAll,
		mount,
	};
});
