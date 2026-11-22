'use strict';

/* Clean-room ACT-Rules / eMAG checklist IDs for axe-core findings (#3831).
 *
 * Inspired by the international-pack idea behind qualweb (ISC) and emag-audit (MIT): map our axe rule ids to public
 * ACT Rules (act-rules.github.io, CC BY 4.0 identifiers) and eMAG 3.1 recommendation numbers. No qualweb, emag-audit,
 * markuplint, or assistant-rgaa package is installed, imported, or copied.
 *
 * axtree rules already ship their own map in url-review-a11y-standards.js; overlapping axe ids reuse that table via
 * ALIAS so EARL/SARIF and ax-* visitor findings stay consistent. Axe-only rules (contrast, lang, …) live here.
 *
 *   ActMap.forAxe('link-name')     // { act, rgaa, emag, markuplint } with { id, match, url }
 *   ActMap.ids('link-name')        // { act: ['c487ae'], … }
 *   ActMap.tags('ax-link-name')    // ['act:c487ae', …]
 *   ActMap.enrich(ruleId)          // { standards, standardTags } for finding / case opts
 *   ActMap.list() / ActMap.coverage()
 */

const standards = require('./url-review-a11y-standards');

const CATALOGUE = {
	act: {
		name: 'W3C ACT Rules',
		version: 'act-rules.github.io',
		url: (id) => 'https://act-rules.github.io/rules/' + id,
	},
	rgaa: {
		name: 'RGAA',
		version: '4.1',
		url: () => 'https://accessibilite.numerique.gouv.fr/methode/criteres-et-tests/',
	},
	emag: {
		name: 'eMAG',
		version: '3.1',
		url: () => 'https://emag.governoeletronico.gov.br/',
	},
	markuplint: {
		name: 'markuplint',
		version: 'rules',
		url: (id) => 'https://markuplint.dev/docs/rules/' + id,
	},
};

const SYSTEMS = Object.keys(CATALOGUE);

/** axe-core rule id → url-review-a11y-standards / axtree rule id when the defect is the same. */
const ALIAS = {
	'document-title': 'ax-document-title',
	'link-name': 'ax-link-name',
	'button-name': 'ax-button-name',
	'image-alt': 'ax-image-name',
	'role-img-alt': 'ax-image-name',
	label: 'ax-field-name',
	'select-name': 'ax-field-name',
	'heading-order': 'ax-heading-skip',
	'page-has-heading-one': 'ax-heading-h1',
	'landmark-one-main': 'ax-landmark-main',
	bypass: 'ax-landmark-main',
};

function ref(id, match) {
	return { id, match: match || 'equivalent' };
}

/* Axe-only rows (not already covered by axtree MAP). Keys are bare axe-core rule ids. */
const AXE_ONLY = {
	'color-contrast': {
		act: [ref('afw4f7')], // Text has minimum contrast
		rgaa: [ref('3.2')], // contrast of text and UI components
		emag: [ref('4.1', 'partial')], // ensure sufficient contrast (public eMAG numbering; auditor may refine)
		markuplint: [],
	},
	'html-has-lang': {
		act: [ref('b5c3f8')], // HTML page has lang attribute
		rgaa: [ref('8.1')], // each page has a default language
		emag: [ref('3.1')], // identify the main language of the page
		markuplint: [],
	},
	'html-lang-valid': {
		// No separate ACT id asserted here; lang presence is b5c3f8 via html-has-lang.
		act: [ref('b5c3f8', 'partial')],
		rgaa: [ref('8.1', 'partial')],
		emag: [ref('3.1', 'partial')],
		markuplint: [],
	},
	'frame-title': {
		// ACT iframe-name rules vary by catalogue revision; RGAA/eMAG numbering is stable for auditors.
		act: [],
		rgaa: [ref('2.1')], // each iframe has a relevant title
		emag: [ref('1.2', 'partial')],
		markuplint: [],
	},
};

function empty() {
	const out = {};
	SYSTEMS.forEach((system) => {
		out[system] = [];
	});
	return out;
}

function link(system, entry) {
	return {
		id: entry.id,
		match: entry.match,
		url: CATALOGUE[system].url(entry.id),
	};
}

function normalizeId(ruleId) {
	const raw = String(ruleId == null ? '' : ruleId).trim();
	if (!raw) return '';
	return raw.indexOf('ax-') === 0 ? raw.slice(3) : raw;
}

function rowFor(axeId) {
	if (Object.prototype.hasOwnProperty.call(AXE_ONLY, axeId)) return AXE_ONLY[axeId];
	const alias = ALIAS[axeId];
	if (alias && Object.prototype.hasOwnProperty.call(standards.MAP, alias)) {
		return standards.MAP[alias];
	}
	return null;
}

/** Outside references for one axe-core rule id (or `ax-*` finding key). Unknown → empty lists. */
function forAxe(ruleId) {
	const axeId = normalizeId(ruleId);
	const row = rowFor(axeId);
	if (!row) return empty();
	const out = {};
	SYSTEMS.forEach((system) => {
		out[system] = ((row && row[system]) || []).map((entry) => link(system, entry));
	});
	return out;
}

function ids(ruleId) {
	const refs = forAxe(ruleId);
	const out = {};
	SYSTEMS.forEach((system) => {
		out[system] = refs[system].map((entry) => entry.id);
	});
	return out;
}

function tags(ruleId) {
	const refs = forAxe(ruleId);
	const out = [];
	SYSTEMS.forEach((system) => {
		const prefix = system === 'rgaa' || system === 'emag' ? system + CATALOGUE[system].version : system;
		refs[system].forEach((entry) => {
			const tag = prefix + ':' + entry.id;
			if (!out.includes(tag)) out.push(tag);
		});
	});
	return out;
}

/** Finding / case opts fragment: `{ standards, standardTags }` (omitted when unmapped). */
function enrich(ruleId) {
	const standardsIds = ids(ruleId);
	const standardTags = tags(ruleId);
	const any = SYSTEMS.some((system) => standardsIds[system].length);
	if (!any) return {};
	return { standards: standardsIds, standardTags };
}

function list() {
	return [...new Set([...Object.keys(ALIAS), ...Object.keys(AXE_ONLY)])].sort();
}

function coverage(ruleIds) {
	const keys = Array.isArray(ruleIds) ? ruleIds : list();
	const out = { rules: keys.length, unmapped: [] };
	SYSTEMS.forEach((system) => {
		out[system] = 0;
	});
	keys.forEach((ruleId) => {
		const refs = forAxe(ruleId);
		let any = false;
		SYSTEMS.forEach((system) => {
			if (refs[system].length) {
				out[system]++;
				any = true;
			}
		});
		if (!any) out.unmapped.push(normalizeId(ruleId) || ruleId);
	});
	return out;
}

module.exports = {
	CATALOGUE,
	SYSTEMS,
	ALIAS,
	AXE_ONLY,
	forAxe,
	ids,
	tags,
	enrich,
	list,
	coverage,
	normalizeId,
};
