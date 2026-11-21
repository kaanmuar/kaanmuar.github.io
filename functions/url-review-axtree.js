'use strict';

/* Accessibility-tree audit (#3831), written from the Chrome DevTools Protocol reference for
   Accessibility.getFullAXTree, the W3C WCAG 2.2 success criteria, the W3C EARL 1.0 schema and the OASIS SARIF 2.1.0
   specification. koodikiht/axtree-audit (MIT) is the idea (read the browser's own accessibility tree from outside the
   page, so a strict Content-Security-Policy cannot block the audit the way it blocks an injected axe-core); none of its
   code is used.

   Pure and offline: it takes the `nodes` array a CDP session returned and never opens a browser, runs a page or
   requests anything, so it is safe to load in Cloud Functions. The capture lives out of band in
   scripts/axtree-audit.js (Playwright). Attach the raw CDP `{ nodes }` response or a reduce() report on the review as
   `extras.axtree` (or pass `axtree` into insights.analyze); findings() maps problems into Accessibility findings.
   Every walk is iterative and bounded, so a hostile tree cannot make it slow or recurse deeply. */

const { isGeneric } = require('./url-review-link-text');
const { say, some } = require('./url-review-findings-en');
const standards = require('./url-review-a11y-standards');

const MAX_NODES = 60000;
const MAX_PER_RULE = 100;
const TOOL = { name: 'url-review-axtree', uri: 'https://kaanmuar.github.io/url-review.html' };
const WCAG = 'https://www.w3.org/TR/WCAG22/#';

// Rules, each tied to the success criterion it comes from. `level` is SARIF's (error / warning / note).
const RULES = {
	'ax-document-title': {
		title: 'The page has no accessible title',
		help: 'Give the page a <title> that says what it is (WCAG 2.4.2 Page Titled).',
		sc: ['2.4.2'],
		anchor: 'page-titled',
		level: 'error',
		severity: 'serious',
	},
	'ax-link-name': {
		title: 'A link has no accessible name',
		help: 'Give each link text, an image with alt text, or an aria-label (WCAG 2.4.4 Link Purpose, 4.1.2 Name, Role, Value).',
		sc: ['2.4.4', '4.1.2'],
		anchor: 'link-purpose-in-context',
		level: 'error',
		severity: 'serious',
	},
	'ax-link-generic': {
		title: 'A link is named only “read more”, “click here” or similar',
		help: 'Name the link by its destination (WCAG 2.4.4 Link Purpose (In Context), failure F84).',
		sc: ['2.4.4'],
		anchor: 'link-purpose-in-context',
		level: 'warning',
		severity: 'moderate',
	},
	'ax-button-name': {
		title: 'A button has no accessible name',
		help: 'Give each button text or an aria-label that says what it does (WCAG 4.1.2 Name, Role, Value).',
		sc: ['4.1.2'],
		anchor: 'name-role-value',
		level: 'error',
		severity: 'serious',
	},
	'ax-image-name': {
		title: 'An image has no text alternative',
		help: 'Add an alt that says what the image shows, or alt="" when it is decoration (WCAG 1.1.1 Non-text Content).',
		sc: ['1.1.1'],
		anchor: 'non-text-content',
		level: 'error',
		severity: 'serious',
	},
	'ax-field-name': {
		title: 'A form field has no accessible name',
		help: 'Tie each field to a visible <label> or give it an aria-label (WCAG 1.3.1 Info and Relationships, 4.1.2).',
		sc: ['1.3.1', '4.1.2'],
		anchor: 'info-and-relationships',
		level: 'error',
		severity: 'serious',
	},
	'ax-heading-skip': {
		title: 'A heading level is skipped',
		help: 'Keep heading levels in order (an h2 is followed by an h3, not an h4) so the outline makes sense (WCAG 1.3.1, technique G141).',
		sc: ['1.3.1'],
		anchor: 'info-and-relationships',
		level: 'warning',
		severity: 'moderate',
	},
	'ax-heading-h1': {
		title: 'The page has headings but not exactly one level-1 heading',
		help: 'Start the outline with one h1 that names the page (WCAG 1.3.1, 2.4.6 Headings and Labels).',
		sc: ['1.3.1', '2.4.6'],
		anchor: 'headings-and-labels',
		level: 'note',
		severity: 'minor',
	},
	'ax-landmark-main': {
		title: 'The page does not have exactly one main landmark',
		help: 'Wrap the page’s own content in one <main> so keyboard and screen-reader users can skip to it (WCAG 2.4.1 Bypass Blocks).',
		sc: ['2.4.1'],
		anchor: 'bypass-blocks',
		level: 'warning',
		severity: 'moderate',
	},
};

const FIELD_ROLES = new Set([
	'textbox',
	'searchbox',
	'combobox',
	'listbox',
	'checkbox',
	'radio',
	'switch',
	'slider',
	'spinbutton',
]);

function rawValue(field) {
	if (field == null) return '';
	if (typeof field === 'object') return field.value == null ? '' : field.value;
	return field;
}

function roleOf(node) {
	return String(rawValue(node.role)).toLowerCase();
}

function nameOf(node) {
	return String(rawValue(node.name)).replace(/\s+/g, ' ').trim();
}

function property(node, name) {
	const list = Array.isArray(node.properties) ? node.properties : [];
	for (let i = 0; i < list.length; i++) if (list[i] && list[i].name === name) return rawValue(list[i].value);
	return undefined;
}

function headingLevel(node) {
	const level = Number(property(node, 'level'));
	return Number.isInteger(level) && level >= 1 && level <= 6 ? level : 0;
}

/* The document order of a tree: nodes without a parent are roots, children follow `childIds`. Iterative with an
   explicit stack, so a very deep tree cannot overflow the call stack. */
function ordered(nodes) {
	const byId = new Map();
	nodes.forEach((node) => {
		if (node && node.nodeId != null) byId.set(String(node.nodeId), node);
	});
	const out = [];
	const seen = new Set();
	const stack = [];
	const roots = nodes.filter((node) => node && (node.parentId == null || !byId.has(String(node.parentId))));
	for (let r = roots.length - 1; r >= 0; r--) stack.push(roots[r]);
	while (stack.length && out.length < MAX_NODES) {
		const node = stack.pop();
		const id = String(node.nodeId);
		if (seen.has(id)) continue;
		seen.add(id);
		out.push(node);
		const kids = Array.isArray(node.childIds) ? node.childIds : [];
		for (let k = kids.length - 1; k >= 0; k--) {
			const child = byId.get(String(kids[k]));
			if (child && !seen.has(String(child.nodeId))) stack.push(child);
		}
	}
	return out;
}

/* Reduces a CDP `Accessibility.getFullAXTree` result (the `nodes` array, or the whole `{ nodes }` response) to counts
   and the list of problems. Ignored nodes (aria-hidden, display:none, alt="" images, presentational roles) are not
   in the tree a screen reader reads, so they are skipped. */
function reduce(input, options) {
	const nodes = Array.isArray(input) ? input : input && Array.isArray(input.nodes) ? input.nodes : [];
	const url = (options && options.url) || '';
	const list = ordered(nodes.slice(0, MAX_NODES));
	const roles = {};
	const issues = [];
	const counts = {};
	let ignored = 0;
	let mains = 0;
	let h1s = 0;
	let headings = 0;
	let lastLevel = 0;
	let title = null;

	function add(rule, node, detail) {
		counts[rule] = (counts[rule] || 0) + 1;
		if (counts[rule] > MAX_PER_RULE) return;
		issues.push({
			rule,
			role: roleOf(node),
			name: nameOf(node).slice(0, 80),
			nodeId: String(node.nodeId),
			backendNodeId: node.backendDOMNodeId == null ? null : node.backendDOMNodeId,
			detail: detail || '',
		});
	}

	list.forEach((node) => {
		if (node.ignored) {
			ignored++;
			return;
		}
		const role = roleOf(node);
		if (!role || role === 'none' || role === 'presentation') return;
		roles[role] = (roles[role] || 0) + 1;
		const name = nameOf(node);
		if (role === 'rootwebarea' || role === 'webarea') {
			if (title == null) title = name;
		} else if (role === 'link') {
			if (!name) add('ax-link-name', node);
			else if (isGeneric(name)) add('ax-link-generic', node);
		} else if (role === 'button') {
			if (!name) add('ax-button-name', node);
		} else if (role === 'img' || role === 'image') {
			if (!name) add('ax-image-name', node);
		} else if (FIELD_ROLES.has(role)) {
			if (!name) add('ax-field-name', node);
		} else if (role === 'heading') {
			const level = headingLevel(node);
			headings++;
			if (level === 1) h1s++;
			if (level && lastLevel && level > lastLevel + 1)
				add('ax-heading-skip', node, 'h' + lastLevel + ' then h' + level);
			if (level) lastLevel = level;
		} else if (role === 'main') {
			mains++;
		}
	});

	if (title === '') {
		const root = list.find((node) => !node.ignored && /^(rootwebarea|webarea)$/.test(roleOf(node)));
		if (root) add('ax-document-title', root);
	}
	if (headings && h1s !== 1) {
		const first = list.find((node) => !node.ignored && roleOf(node) === 'heading');
		add('ax-heading-h1', first, h1s ? h1s + ' level-1 headings' : 'no level-1 heading');
	}
	if (list.length && mains !== 1) {
		const root = list.find((node) => !node.ignored) || list[0];
		add('ax-landmark-main', root, mains ? mains + ' main landmarks' : 'no main landmark');
	}

	return {
		url,
		total: list.length,
		ignored,
		roles,
		counts,
		issues,
		truncated: nodes.length > MAX_NODES,
	};
}

function ruleList() {
	return Object.keys(RULES);
}

// The EARL test case for a rule; `dct:references` lists the ACT / RGAA / eMAG / markuplint pages it maps to (#3831).
function testCase(id) {
	const test = { '@id': 'urn:url-review:' + id, '@type': 'earl:TestCase', 'dct:title': RULES[id].title };
	const refs = standards.urls(id);
	if (refs.length) test['dct:references'] = refs.map((url) => ({ '@id': url }));
	return test;
}

// W3C EARL 1.0 as JSON-LD: one failed assertion per problem and one passed assertion per rule that found nothing.
function earl(report, options) {
	const at = (options && options.date) || new Date().toISOString();
	const url = report.url || 'about:blank';
	const subject = { '@type': ['earl:TestSubject', 'sch:WebPage'], 'dct:source': url };
	const assertor = { '@id': TOOL.uri, '@type': 'earl:Assertor', 'dct:title': TOOL.name };
	const graph = [];
	report.issues.forEach((issue) => {
		graph.push({
			'@type': 'earl:Assertion',
			'earl:assertedBy': assertor,
			'earl:subject': subject,
			'earl:test': testCase(issue.rule),
			'earl:mode': { '@id': 'earl:automatic' },
			'earl:result': {
				'@type': 'earl:TestResult',
				'earl:outcome': { '@id': 'earl:failed' },
				'dct:date': at,
				'dct:description': describe(issue),
				'earl:pointer': {
					'@type': 'ptr:CSSSelector',
					'ptr:expression': issue.backendNodeId == null ? '' : 'cdp:backendDOMNodeId=' + issue.backendNodeId,
				},
			},
		});
	});
	ruleList().forEach((id) => {
		if (report.counts[id]) return;
		graph.push({
			'@type': 'earl:Assertion',
			'earl:assertedBy': assertor,
			'earl:subject': subject,
			'earl:test': testCase(id),
			'earl:mode': { '@id': 'earl:automatic' },
			'earl:result': {
				'@type': 'earl:TestResult',
				'earl:outcome': { '@id': 'earl:passed' },
				'dct:date': at,
			},
		});
	});
	return {
		'@context': {
			earl: 'http://www.w3.org/ns/earl#',
			dct: 'http://purl.org/dc/terms/',
			sch: 'https://schema.org/',
			ptr: 'http://www.w3.org/2009/pointers#',
		},
		'@graph': graph,
	};
}

function describe(issue) {
	const parts = [issue.role ? 'role ' + issue.role : 'node'];
	if (issue.name) parts.push('named “' + issue.name + '”');
	if (issue.detail) parts.push('(' + issue.detail + ')');
	return parts.join(' ');
}

// OASIS SARIF 2.1.0: rules in the tool driver, one result per problem. SARIF lists only what was found.
function sarif(report) {
	const ids = ruleList();
	return {
		$schema: 'https://json.schemastore.org/sarif-2.1.0.json',
		version: '2.1.0',
		runs: [
			{
				tool: {
					driver: {
						name: TOOL.name,
						informationUri: TOOL.uri,
						rules: ids.map((id) => ({
							id,
							name: id,
							shortDescription: { text: RULES[id].title },
							help: { text: RULES[id].help },
							helpUri: WCAG + RULES[id].anchor,
							defaultConfiguration: { level: RULES[id].level },
							properties: {
								tags: RULES[id].sc.map((sc) => 'wcag' + sc.replace(/\./g, '')),
								severity: RULES[id].severity,
								standards: standards.ids(id),
								standardTags: standards.tags(id),
							},
						})),
					},
				},
				results: report.issues.map((issue) => ({
					ruleId: issue.rule,
					ruleIndex: ids.indexOf(issue.rule),
					level: RULES[issue.rule].level,
					message: { text: RULES[issue.rule].title + ': ' + describe(issue) + '.' },
					locations: [
						{
							physicalLocation: { artifactLocation: { uri: report.url || 'about:blank' } },
							logicalLocations: [
								{
									kind: 'element',
									name: issue.role || 'node',
									fullyQualifiedName: 'axnode:' + issue.nodeId,
								},
							],
						},
					],
					properties: { backendDOMNodeId: issue.backendNodeId, accessibleName: issue.name },
				})),
				properties: { nodes: report.total, ignoredNodes: report.ignored },
			},
		],
	};
}

/* Finding keys stay under a11y-axtree-* so they never collide with axe-core's ax-* findings. When the same gap was
   already reported (HTML pass or axe), the tree finding is skipped. */
const FINDING = {
	'ax-document-title': { key: 'a11y-axtree-title', overlap: [] },
	'ax-link-name': { key: 'a11y-axtree-link-name', overlap: ['ax-link-name', 'a11y-focus-noname'] },
	'ax-link-generic': { key: 'a11y-axtree-link-generic', overlap: ['a11y-linktext'] },
	'ax-button-name': { key: 'a11y-axtree-button-name', overlap: ['ax-button-name', 'a11y-focus-noname'] },
	'ax-image-name': { key: 'a11y-axtree-image-name', overlap: ['ax-image-alt', 'a11y-alt'] },
	'ax-field-name': { key: 'a11y-axtree-field-name', overlap: ['ax-label', 'a11y-labels'] },
	'ax-heading-skip': { key: 'a11y-axtree-heading-skip', overlap: ['ax-heading-order'] },
	'ax-heading-h1': { key: 'a11y-axtree-heading-h1', overlap: ['ax-page-has-heading-one', 'a11y-h1'] },
	'ax-landmark-main': { key: 'a11y-axtree-landmark-main', overlap: ['ax-landmark-one-main', 'a11y-main'] },
};

const LEVEL = {
	error: { verdict: 'fail', severity: 'low' },
	warning: { verdict: 'risk', severity: 'low' },
	note: { verdict: 'risk', severity: 'low' },
};

/* Accepts a reduce() report, a raw CDP `{ nodes }` / nodes array, or `{ tree|nodes, url }`. Missing or empty input
   stays silent: the tree is optional and out of band. */
function normalize(input, options) {
	if (input == null) return null;
	if (typeof input !== 'object') return null;
	if (Array.isArray(input.issues) && input.counts && typeof input.total === 'number') return input;
	if (input.report && Array.isArray(input.report.issues) && input.report.counts) return input.report;
	const url = (options && options.url) || input.url || '';
	if (Array.isArray(input)) return reduce(input, { url });
	if (Array.isArray(input.nodes) || Array.isArray(input.tree)) {
		return reduce(Array.isArray(input.nodes) ? input : { nodes: input.tree }, { url });
	}
	return null;
}

function example(issue) {
	const role = issue.role || 'node';
	if (issue.name && issue.detail)
		return say('a11y-axtree.example.named.detail', { role, name: issue.name, detail: issue.detail });
	if (issue.name) return say('a11y-axtree.example.named', { role, name: issue.name });
	if (issue.detail) return say('a11y-axtree.example.detail', { role, detail: issue.detail });
	return say('a11y-axtree.example', { role });
}

function alreadyReported(ctx, keys) {
	const list = (ctx && ctx.findings) || [];
	for (let i = 0; i < keys.length; i++) {
		const key = keys[i];
		for (let j = 0; j < list.length; j++) {
			if (list[j].key === key && list[j].verdict !== 'pass') return true;
		}
	}
	return false;
}

function findings(input, add, ctx) {
	const report = normalize(input);
	if (!report || !(report.total > 0)) return null;
	const hit = ruleList().filter((id) => report.counts[id] > 0);
	if (!hit.length) {
		add(
			'Accessibility',
			'pass',
			'info',
			'a11y-axtree',
			say('a11y-axtree.pass.title'),
			say('a11y-axtree.pass.evidence', { n: report.total }),
			'',
			{ effort: 'hours' }
		);
		return report;
	}
	hit.forEach((ruleId) => {
		const meta = FINDING[ruleId];
		const rule = RULES[ruleId];
		if (!meta || !rule) return;
		if (alreadyReported(ctx, meta.overlap)) return;
		const level = LEVEL[rule.level] || LEVEL.warning;
		const samples = report.issues.filter((issue) => issue.rule === ruleId).slice(0, 3).map(example);
		add(
			'Accessibility',
			level.verdict,
			level.severity,
			meta.key,
			say(meta.key + '.title'),
			say(meta.key + '.evidence', { n: report.counts[ruleId], examples: some(samples, 3) }),
			say(meta.key + '.fix'),
			{ effort: 'hours', count: report.counts[ruleId] }
		);
	});
	return report;
}

module.exports = {
	reduce,
	earl,
	sarif,
	findings,
	normalize,
	RULES,
	FINDING,
	ruleList,
	ordered,
	MAX_NODES,
	MAX_PER_RULE,
};
