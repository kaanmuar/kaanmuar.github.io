const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const legal = require('../../scripts/build-legal-html');

const html = fs.readFileSync(path.join(__dirname, '..', '..', 'qa-review-legal.html'), 'utf8');

test('the disclaimers in the HTML are the ones the page script paints', () => {
	assert.equal(legal.build(html), html, 'run node scripts/build-legal-html.js');
});

test('each notice carries its heading and text without scripts', () => {
	const notices = Object.fromEntries(legal.painted(html));
	assert.match(notices['local-notice'], /^<h2>Local law\. The operator's domicile<\/h2><p>The operator/);
	assert.match(notices['origin-notice'], /Ley Estatutaria 1581 de 2012/);
	assert.match(notices['site-notice'], /The address did not name a country\./);
	const words = Object.values(notices).join(' ').split(/\s+/).length;
	assert.ok(words > 1000, words + ' words');
	Object.entries(notices).forEach(([id, inner]) =>
		assert.ok(html.includes('id="' + id + '">' + inner + '</article>'), id + ' is in the HTML')
	);
});

test('legal/clauses.json renders the whole page, script and notices, from a page stripped of both', () => {
	const at = html.indexOf('function paint(');
	const start = html.lastIndexOf('<script>', at) + '<script>'.length;
	const blank = (html.slice(0, start) + 'function paint(){}' + html.slice(html.indexOf('</script>', at)))
		.replace(/(<article class="sheet" id="[a-z-]+-notice">)[\s\S]*?(<\/article>)/g, '$1$2')
		.replace(/ 'sha256-[A-Za-z0-9+/=]+'/g, '');
	assert.ok(!blank.includes('Ley Estatutaria 1581 de 2012'));
	assert.equal(legal.build(blank), html);
});

test('a clause edited in legal/clauses.json is what the page then shows', () => {
	const source = legal.source();
	const clauses = source.clauses.map((clause) =>
		clause.id === 'national.personal-data.2' ? { ...clause, text: 'Edited clause.' } : clause
	);
	const page = legal.build(html, { ...source, clauses });
	assert.match(Object.fromEntries(legal.painted(page))['origin-notice'], /<li>Edited clause\.<\/li>/);
	assert.ok(!page.includes('Decreto 1377 de 2013 is compiled'));
	assert.throws(() => legal.build(html, { ...source, clauses: clauses.slice(1) }), /lacks/);
});

test('every clause carries its id, language, jurisdiction, status, lastChecked date, and on-file citations', () => {
	const { clauses } = legal.source();
	const date = /^\d{4}-\d{2}-\d{2}$/;
	const real = (day) => date.test(day) && new Date(day + 'T00:00:00Z').toISOString().slice(0, 10) === day;
	const statutes = new Map(
		clauses.filter((clause) => clause.kind === 'statute').map((clause) => [clause.text, clause.cites[0].url])
	);
	const seenCites = new Map();
	assert.equal(new Set(clauses.map((clause) => clause.id)).size, clauses.length, 'clause ids are unique');
	clauses.forEach((clause) => {
		const where = clause.id + ': ';
		assert.ok(clause.text && clause.language && clause.jurisdiction, where + 'text, language, and jurisdiction');
		assert.ok(['draft', 'counsel-approved'].includes(clause.status), where + 'status ' + clause.status);
		assert.ok(real(clause.lastChecked), where + 'lastChecked ' + clause.lastChecked);
		if (clause.status === 'counsel-approved') assert.ok(real(clause.counselReviewedOn), where + 'counselReviewedOn');
		else assert.equal(clause.counselReviewedOn, null, where + 'a draft has no counsel review date');
		assert.ok(Array.isArray(clause.cites), where + 'cites');
		clause.cites.forEach((cite) => {
			assert.ok(cite.name, where + 'cite name');
			assert.match(cite.url, /^https:\/\//, where + cite.name);
			assert.ok('urlVerified' in cite, where + cite.name + ' has urlVerified');
			assert.ok(real(cite.urlVerified), where + cite.name + ' urlVerified ' + cite.urlVerified);
			if (statutes.has(cite.name)) {
				assert.equal(statutes.get(cite.name), cite.url, where + cite.name + ' matches its statute record');
			}
			if (seenCites.has(cite.name)) {
				assert.equal(seenCites.get(cite.name), cite.url, where + cite.name + ' uses one canonical URL');
			} else {
				seenCites.set(cite.name, cite.url);
			}
		});
	});
	assert.equal(statutes.size, 18);
});

test("every root page's hreflang alternates are separate files, and the cluster includes the page's canonical", () => {
	const root = path.join(__dirname, '..', '..');
	const site = 'https://carlosandmunoz.com/';
	const off = [];
	fs.readdirSync(root)
		.filter((name) => name.endsWith('.html'))
		.forEach((name) => {
			const page = fs.readFileSync(path.join(root, name), 'utf8');
			const hrefs = [...page.matchAll(/<link rel="alternate" hreflang="[^"]+" href="([^"]+)"/g)].map(
				(match) => match[1]
			);
			if (!hrefs.length) return;
			const canonical = (page.match(/<link rel="canonical" href="([^"]+)"/) || [])[1];
			if (!hrefs.includes(canonical)) off.push(name + ' canonical ' + canonical + ' is not in its hreflang cluster');
			hrefs.forEach((href) => {
				const file = href.startsWith(site) ? href.slice(site.length) || 'index.html' : null;
				if (!file || /[?#]/.test(file) || !fs.existsSync(path.join(root, file))) off.push(name + ' lists ' + href);
			});
		});
	assert.deepEqual(off, []);
	const sitemap = fs.readFileSync(path.join(root, 'sitemap.xml'), 'utf8');
	assert.ok(!sitemap.includes('?lang='), 'sitemap.xml lists a ?lang= alternate');
	assert.ok(sitemap.includes('https://carlosandmunoz.com/llms.txt'), 'sitemap lists /llms.txt for answer engines');
	assert.ok(sitemap.includes('https://carlosandmunoz.com/llms-full.txt'), 'sitemap lists /llms-full.txt');
	const home = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
	assert.match(home, /rel="describedby"[^>]*href="https:\/\/carlosandmunoz\.com\/llms\.txt"/);
});
