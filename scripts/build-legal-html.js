/**
 * Renders qa-review-legal.html from its one clause source (#4004). legal/clauses.json holds every clause, heading,
 * and statute of the notices; legal/notices-script.tmpl is the page's notices script with a {{clause-id}} slot where
 * each one goes. The builder writes that script into the page, then writes the default English disclaimers the script
 * paints into the HTML, so readers that do not run scripts see the text. The page's own script paints the same blocks
 * on load and repaints on a country change.
 *
 *   node scripts/build-legal-html.js          rewrites qa-review-legal.html
 *   node scripts/build-legal-html.js --check  exits 1 when the HTML no longer matches its clauses
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const csp = require('./build-csp-hashes');

const FILE = path.join(__dirname, '..', 'qa-review-legal.html');
const CLAUSES = path.join(__dirname, '..', 'legal', 'clauses.json');
const TEMPLATE = path.join(__dirname, '..', 'legal', 'notices-script.tmpl');
const NOTICES = ['local-notice', 'origin-notice', 'site-notice'];
// {{id}} or {{id name=expression ...}}: each {name} in the clause's text becomes that expression of the script.
const SLOT = /\{\{([\w.-]+)((?: \w+=[^\s}]+)*)\}\}/g;

function source() {
	return { clauses: JSON.parse(fs.readFileSync(CLAUSES, 'utf8')).clauses, template: fs.readFileSync(TEMPLATE, 'utf8') };
}

/** The script expression for one clause: a string, a concatenation around its {name} slots, or a statute row. */
function literal(clause, args) {
	const row = clause.kind === 'statute' ? [clause.text, clause.cites[0].url, clause.authority, clause.authorityUrl] : [];
	if (row.concat(clause.text).some((text) => /<\/script/i.test(text))) {
		throw new Error(clause.id + ' would close the page script.');
	}
	if (row.length) return '[' + row.map((text) => JSON.stringify(text)).join(', ') + ']';
	return clause.text
		.split(/\{(\w+)\}/)
		.map((part, i) => {
			if (i % 2 === 0) return part && JSON.stringify(part);
			if (!args[part]) throw new Error(clause.id + ' uses {' + part + '}, which its template slot does not fill.');
			return args[part];
		})
		.filter(Boolean)
		.join(' + ');
}

/** The notices script: the template with every slot filled from the clauses. */
function script({ clauses, template }) {
	const byId = new Map(clauses.map((clause) => [clause.id, clause]));
	const used = new Set();
	const out = template.replace(SLOT, (all, id, rest) => {
		if (!byId.has(id)) throw new Error('legal/notices-script.tmpl names ' + id + ', which legal/clauses.json lacks.');
		used.add(id);
		const args = Object.fromEntries(
			rest
				.split(' ')
				.filter(Boolean)
				.map((pair) => pair.split('='))
		);
		return literal(byId.get(id), args);
	});
	const unused = clauses.filter((clause) => !used.has(clause.id)).map((clause) => clause.id);
	if (unused.length) throw new Error('legal/notices-script.tmpl has no slot for ' + unused.join(', '));
	return out;
}

function scriptRange(html) {
	const at = html.indexOf('function paint(');
	const start = html.lastIndexOf('<script>', at);
	const end = html.indexOf('</script>', at);
	if (at === -1 || start === -1 || end === -1) throw new Error('The disclaimers script was not found.');
	return [start + '<script>'.length, end];
}

function painted(html) {
	const [start, end] = scriptRange(html);
	const nodes = {};
	const node = (id) =>
		nodes[id] || (nodes[id] = { id, innerHTML: '', value: '', appendChild() {}, addEventListener() {} });
	const context = {
		document: {
			getElementById: node,
			createElement: () => node('option-' + Object.keys(nodes).length),
			addEventListener() {},
		},
		location: { search: '', href: 'https://carlosandmunoz.com/qa-review-legal.html' },
		history: { replaceState() {} },
		URL,
		URLSearchParams,
	};
	context.window = context;
	vm.runInNewContext(html.slice(start, end), context);
	return NOTICES.map((id) => [id, nodes[id].innerHTML]);
}

function build(html, clauses = source()) {
	const [start, end] = scriptRange(html);
	const page = html.slice(0, start) + script(clauses) + html.slice(end);
	const out = painted(page).reduce((out, [id, inner]) => {
		const re = new RegExp('(<article class="sheet" id="' + id + '">)[\\s\\S]*?(</article>)');
		if (!re.test(out)) throw new Error('No article #' + id + ' in the page.');
		return out.replace(re, (all, open, close) => open + inner + close);
	}, page);
	return csp.apply(out);
}

if (require.main === module) {
	const html = fs.readFileSync(FILE, 'utf8');
	const next = build(html);
	if (process.argv.includes('--check')) {
		if (next !== html) {
			console.error('qa-review-legal.html is out of date with legal/clauses.json. Run node scripts/build-legal-html.js');
			process.exit(1);
		}
		console.log('qa-review-legal.html matches legal/clauses.json.');
	} else {
		fs.writeFileSync(FILE, next);
		console.log('qa-review-legal.html: ' + NOTICES.length + ' notices written from legal/clauses.json.');
	}
}

module.exports = { build, painted, script, source };
