'use strict';

/* Rule-ID cross-references for the accessibility-tree rules (#3831), for auditors who read EARL / SARIF in their own
   framework. Clean-room: this is a table of public identifiers that each point at an outside catalogue, written by
   hand from the public ACT Rules list (act-rules.github.io, rule IDs and names are CC BY 4.0 data), the public RGAA 4.1
   criteria numbering (DINUM, Etalab open licence), the public eMAG 3.1 recommendation numbering (Brazilian federal
   government) and the markuplint rule names (markuplint.dev docs). None of qualweb (ISC), emag-audit (MIT),
   markuplint (MIT) or assistant-rgaa (MPL-2.0) is installed, imported or copied, and no text, test or code from
   assistant-rgaa is used (its MPL-2.0 covers its files, not the criteria numbers a public standard defines).

   `match` says how close the outside rule is to ours:
     'equivalent'  both flag the same defect on the same kind of node
     'partial'     they overlap but differ in scope (ours is narrower, broader or only one facet of theirs)
   Pure data and pure functions, no I/O, safe to load in Cloud Functions. The WCAG success criteria stay in
   url-review-axtree RULES (`sc`); this module adds the rest. Keys are the RULES ids of url-review-axtree.js. */

const STANDARDS = {
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

const SYSTEMS = Object.keys(STANDARDS);

function ref(id, match) {
	return { id, match: match || 'equivalent' };
}

const MAP = {
	'ax-document-title': {
		act: [ref('2779a5')], // HTML page has non-empty title
		rgaa: [ref('8.5')], // each page has a page title
		emag: [ref('3.3')], // give the page a descriptive and informative title
		markuplint: [ref('require-element', 'partial')], // can require a <title> in <head>
	},
	'ax-link-name': {
		act: [ref('c487ae')], // Link has non-empty accessible name
		rgaa: [ref('6.2')], // each link has a label
		emag: [ref('3.5', 'partial')], // describe links clearly and briefly
		markuplint: [ref('require-accessible-name')],
	},
	'ax-link-generic': {
		act: [ref('5effbb')], // Link in context is descriptive
		rgaa: [ref('6.1')], // each link is explicit
		emag: [ref('3.5')],
		markuplint: [],
	},
	'ax-button-name': {
		act: [ref('97a4e1')], // Button has non-empty accessible name
		rgaa: [ref('11.9', 'partial')], // each button label is relevant
		emag: [],
		markuplint: [ref('require-accessible-name')],
	},
	'ax-image-name': {
		act: [ref('23a2a8')], // Image has non-empty accessible name
		rgaa: [ref('1.1')], // each informative image has a text alternative
		emag: [ref('3.6')], // give images a text alternative
		markuplint: [ref('require-accessible-name')],
	},
	'ax-field-name': {
		act: [ref('e086e5')], // Form field has non-empty accessible name
		rgaa: [ref('11.1')], // each form field has a label
		emag: [ref('6.2')], // associate labels with their fields
		markuplint: [ref('require-accessible-name'), ref('label-has-control', 'partial')],
	},
	'ax-heading-skip': {
		act: [],
		rgaa: [ref('9.1', 'partial')], // information is structured with appropriate headings
		emag: [ref('1.3')], // use heading levels correctly
		markuplint: [ref('no-skipped-heading-level')],
	},
	'ax-heading-h1': {
		act: [ref('047fe0', 'partial')], // Document has heading for non-repeated content
		rgaa: [ref('9.1', 'partial')],
		emag: [ref('1.3', 'partial')],
		markuplint: [ref('require-h1'), ref('no-duplicate-h1', 'partial')],
	},
	'ax-landmark-main': {
		act: [ref('b40fd1', 'partial'), ref('cf77f2', 'partial')], // landmark with non-repeated content; Bypass Blocks
		rgaa: [ref('9.2', 'partial'), ref('12.6', 'partial')], // coherent structure; content areas reachable or avoidable
		emag: [ref('1.5', 'partial')], // give anchors to jump to a block of content
		markuplint: [ref('no-duplicate-visible-main', 'partial')],
	},
};

function link(system, entry) {
	return {
		id: entry.id,
		match: entry.match,
		url: STANDARDS[system].url(entry.id),
	};
}

/* The outside references for one url-review-axtree rule id, as { act, rgaa, emag, markuplint }, each a list of
   { id, match, url }. An unknown rule gets empty lists, never an error, so an exporter can call it on any id. */
function forRule(ruleId) {
	const row = Object.prototype.hasOwnProperty.call(MAP, ruleId) ? MAP[ruleId] : null;
	const out = {};
	SYSTEMS.forEach((system) => {
		out[system] = ((row && row[system]) || []).map((entry) => link(system, entry));
	});
	return out;
}

/* Same lookup from a finding key (a11y-axtree-*), through url-review-axtree FINDING. `findingTable` is passed in
   so this module does not require the axtree module back. */
function forFinding(key, findingTable) {
	const ids = Object.keys(findingTable || {});
	for (let i = 0; i < ids.length; i++) {
		if (findingTable[ids[i]] && findingTable[ids[i]].key === key) return forRule(ids[i]);
	}
	return forRule('');
}

/* Flat tags for SARIF `properties.tags` style use: 'act:2779a5', 'rgaa4.1:8.5', 'emag3.1:3.3', 'markuplint:require-h1'.
   Only `equivalent` and `partial` references appear, each once, in system order. */
function tags(ruleId) {
	const refs = forRule(ruleId);
	const out = [];
	SYSTEMS.forEach((system) => {
		const prefix = system === 'rgaa' || system === 'emag' ? system + STANDARDS[system].version : system;
		refs[system].forEach((entry) => {
			const tag = prefix + ':' + entry.id;
			if (!out.includes(tag)) out.push(tag);
		});
	});
	return out;
}

// A plain object of ids only ({ act: ['2779a5'], ... }), for finding metadata that wants no URLs.
function ids(ruleId) {
	const refs = forRule(ruleId);
	const out = {};
	SYSTEMS.forEach((system) => {
		out[system] = refs[system].map((entry) => entry.id);
	});
	return out;
}

// Every outside URL for a rule, for EARL `dct:references`. Catalogue root pages (RGAA, eMAG) appear once.
function urls(ruleId) {
	const refs = forRule(ruleId);
	const out = [];
	SYSTEMS.forEach((system) => {
		refs[system].forEach((entry) => {
			if (!out.includes(entry.url)) out.push(entry.url);
		});
	});
	return out;
}

/* How many of the given rule ids have at least one reference in each system, for the coverage line in a report or
   a test that stops a new rule from shipping unmapped. */
function coverage(ruleIds) {
	const list = Array.isArray(ruleIds) ? ruleIds : Object.keys(MAP);
	const out = { rules: list.length, unmapped: [] };
	SYSTEMS.forEach((system) => {
		out[system] = 0;
	});
	list.forEach((ruleId) => {
		const refs = forRule(ruleId);
		let any = false;
		SYSTEMS.forEach((system) => {
			if (refs[system].length) {
				out[system]++;
				any = true;
			}
		});
		if (!any) out.unmapped.push(ruleId);
	});
	return out;
}

module.exports = { STANDARDS, SYSTEMS, MAP, forRule, forFinding, tags, ids, urls, coverage };
