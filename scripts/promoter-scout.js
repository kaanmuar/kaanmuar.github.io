#!/usr/bin/env node
'use strict';
/* Worldwide promoter scout (#4151): finds public sites and communities that promote, showcase, review or
   talk about tools, websites, features, businesses and starters — then digs how to contact them.

     node scripts/promoter-scout.js seeds                 print curated seeds
     node scripts/promoter-scout.js enrich [--limit N]    open each new/seed host, find submit + contact paths
     node scripts/promoter-scout.js scout [--langs ..] [--kinds ..] [--per N]
                                                          ask Workers AI for more promoters per kind×lang, then enrich
     node scripts/promoter-scout.js run [--date D] [--dir outreach] [--langs ..]
                                                          scout + enrich + write report (+ optional CSV for Instantly)
     node scripts/promoter-scout.js draft <host>          draft intro email body for one host (Workers AI; Carlos sends)

   Human gate: nothing is emailed automatically. Reports and CSV rows wait for Carlos. Memory is
   scripts/promoter-scout/seen.json (gitignored; Actions keeps it on promoter-scout-data). */
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const DIR = path.join(__dirname, 'promoter-scout');
const SEEDS = path.join(DIR, 'seeds.json');
const KINDS = path.join(DIR, 'kinds.json');
const SEEN = path.join(DIR, 'seen.json');
const REPORTS = path.join(DIR, 'reports');

const UA = 'Mozilla/5.0 (compatible; QA-lab-promoter-scout/1.0; +https://carlosandmunoz.com)';
const HEADER = [
	'host',
	'name',
	'kind',
	'lang',
	'region',
	'cc',
	'submit_url',
	'contact_url',
	'email',
	'profiles',
	'sequence',
	'sender',
	'pitch',
	'status',
	'source',
	'found_at',
	'notes',
];
const REGION_CC = {
	global: 'us',
	eu: 'es',
	latam: 'co',
	co: 'co',
	mx: 'mx',
	br: 'br',
	es: 'es',
	fr: 'fr',
	de: 'de',
	it: 'it',
	ru: 'ru',
	us: 'us',
};
const ASSET_RE = /\.(png|jpe?g|gif|webp|svg|ico|css|js|mjs|map|woff2?|ttf|eot|mp4|webm|pdf)(\?|$)/i;
const SUBMIT_RE =
	/\/(submit|nominate|candidature|einreich|inscri)(\/|$|\?)|submit[-_/]?(a|your|my)?[-_/]?(site|tool|product|startup|project|listing)?|add[-_/]?(your|a|my)[-_/]?(site|tool|product|startup|project)|list[-_/]?(your|a)[-_/]?(product|tool|site)|posts\/new|\/launchpad(\/|$)|\/submit-a-tool|candidat|proponer|suggerisc/i;
const CONTACT_RE =
	/contact|contacto|contato|contatti|kontakt|about|nosotros|press|prensa|imprensa|parten|partner|advertise|publicidad|sponsoring|media.?kit|impressum|mentions/i;
const SKIP_INBOX =
	/^((support|soporte|suporte|helpdesk|newsletter|noreply|no-reply|donotreply|privacy|privacidad|datenschutz|rgpd|gdpr|dpo|abuse|postmaster|webmaster|jobs|careers|empleo|rrhh|hr|unsubscribe)[a-z0-9._-]*)@/i;
const FREE_MAIL =
	/@(gmail|googlemail|hotmail|outlook|live|yahoo|icloud|me|aol|proton(mail)?|gmx|uol|bol|terra)\./i;
const KIND_IDS = () => loadJson(KINDS).kinds.map((k) => k.id);
const kindLabel = (id) => {
	const k = loadJson(KINDS).kinds.find((x) => x.id === id);
	return k ? k.en : id;
};

/** Core six site languages every run; rotate two more from the tail by ISO week (#4151 growth). */
function defaultDiscoverLangs(pack, dateStr) {
	const all = pack.langs || [];
	const core = all.slice(0, 6);
	const tail = all.slice(6);
	if (!tail.length) return core;
	const d = new Date((dateStr || day()) + 'T12:00:00Z');
	const jan1 = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
	const wk = Math.floor((d - jan1) / (7 * 86400000));
	const step = 2;
	const slot = Math.floor(wk % Math.ceil(tail.length / step)) * step;
	const extra = tail.slice(slot, slot + step);
	while (extra.length < step && tail.length) extra.push(tail[extra.length % tail.length]);
	return [...core, ...extra];
}

const CFG = (() => {
	try {
		return JSON.parse(fs.readFileSync(path.join(os.homedir(), '.cursor/preflight/config.json'), 'utf8'));
	} catch {
		return {};
	}
})();
const AI_URL = process.env.PREFLIGHT_URL || CFG.url || 'https://preflight.carlosandmunoz.com';

function loadJson(file, fallback) {
	try {
		return JSON.parse(fs.readFileSync(file, 'utf8'));
	} catch {
		return fallback === undefined ? {} : fallback;
	}
}

function bare(host) {
	return String(host || '')
		.toLowerCase()
		.replace(/^https?:\/\//, '')
		.replace(/^www\./, '')
		.split('/')[0]
		.replace(/:\d+$/, '');
}

/** Decode one layer of common HTML entities. `&amp;` last so `&amp;lt;` stays `&lt;` (CodeQL double-unescape). */
function clip(v, n) {
	return String(v == null ? '' : v)
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#39;|&apos;/g, "'")
		.replace(/&amp;/g, '&')
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, n);
}

function day(d) {
	return (d || new Date()).toISOString().slice(0, 10);
}

function argVal(argv, name, fallback) {
	const i = argv.indexOf(name);
	return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
}

function listArg(argv, name, fallback) {
	const raw = argVal(argv, name, '');
	if (!raw) return fallback;
	return raw
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean);
}

async function page(url) {
	try {
		const res = await fetch(url, {
			headers: { 'user-agent': UA, accept: 'text/html' },
			redirect: 'follow',
			signal: AbortSignal.timeout(10000),
		});
		if (!res.ok || !/html/i.test(res.headers.get('content-type') || '')) return null;
		return { url: res.url, html: (await res.text()).slice(0, 600000) };
	} catch {
		return null;
	}
}

function visible(html) {
	return String(html || '')
		.replace(/<script\b[\s\S]*?<\/script[^>]*>|<style\b[\s\S]*?<\/style[^>]*>/gi, ' ')
		.replace(/<[^>]+>/g, ' ')
		.replace(/&nbsp;|&amp;/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

function hrefs(html, base) {
	const out = [];
	for (const m of String(html || '').matchAll(/href=["']([^"'#]+)["']/gi)) {
		try {
			out.push(new URL(m[1], base).href);
		} catch {
			/* ignore */
		}
	}
	return out;
}

function emailsIn(html, host) {
	const site = bare(host);
	const text = String(html || '')
		.replace(/&#64;|&#x40;|\s\[at\]\s|\(at\)/gi, '@')
		.replace(/%40/g, '@');
	const found = new Set();
	for (const m of text.matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g)) {
		const email = m[0].toLowerCase().replace(/\.$/, '');
		const domain = email.split('@')[1];
		if (/\.(png|jpe?g|gif|webp|svg|css|js)$/.test(email) || SKIP_INBOX.test(email) || FREE_MAIL.test(email)) continue;
		if (!(domain === site || domain.endsWith('.' + site) || site.endsWith('.' + domain))) continue;
		found.add(email);
	}
	return [...found];
}

function profilesIn(html, base) {
	const nets = [];
	const want = /(twitter\.com|x\.com|linkedin\.com|facebook\.com|instagram\.com|youtube\.com\/(@|channel|c\/)|bsky\.app\/profile|threads\.net)/i;
	for (const u of hrefs(html, base)) {
		if (!want.test(u)) continue;
		if (/\/(share|intent|sharer|status\/)\b/i.test(u)) continue;
		if (/img\.youtube|youtu\.be\//i.test(u)) continue;
		nets.push(u.split('?')[0]);
	}
	return [...new Set(nets)].slice(0, 6);
}

/** Prefer a path that names the intent; fall back to about/press pages for contact. */
function bestLink(urls, re, soft) {
	const clean = urls.filter((u) => !ASSET_RE.test(u) && !/\/_next\/|\/static\/media\//i.test(u));
	return clean.find((u) => re.test(u)) || (soft && clean.find((u) => soft.test(u))) || '';
}

/** Pick the best same-host submit and contact URLs from a page. */
function pickLinks(html, base, host) {
	const site = bare(host);
	const same = hrefs(html, base).filter((u) => {
		try {
			return bare(new URL(u).host) === site;
		} catch {
			return false;
		}
	});
	const submit = bestLink(same, SUBMIT_RE);
	const contact = bestLink(
		same,
		/contact|contacto|contato|contatti|kontakt|press|prensa|imprensa|advertise|publicidad|sponsoring|media.?kit|impressum|mentions|parten|partner/i,
		/about|nosotros|chi-siamo|qui-sommes|ueber-uns|uber-uns|equipo|team/i
	);
	return { submit, contact };
}

/** Keep a curated submit URL when the page scrape found noise. */
function preferSubmit(seed, found) {
	if (seed && !ASSET_RE.test(seed)) return seed;
	if (found && !ASSET_RE.test(found) && SUBMIT_RE.test(found)) return found;
	return seed || found || '';
}

async function ai(system, prompt, { json = true, max = 900 } = {}) {
	const token = process.env.PREFLIGHT_TOKEN || CFG.token;
	if (!token) throw Object.assign(new Error('PREFLIGHT_TOKEN is not set.'), { fatal: true });
	for (let tries = 1; ; tries += 1) {
		const res = await fetch(AI_URL + '/complete', {
			method: 'POST',
			headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
			body: JSON.stringify({ system, prompt, json, max_tokens: max }),
			signal: AbortSignal.timeout(120000),
		}).catch(() => ({ ok: false, status: 0 }));
		if (res.ok) {
			const out = await res.json();
			return json ? out.json || {} : String(out.text || '');
		}
		if (res.status === 429) throw Object.assign(new Error('Workers AI refused (429).'), { fatal: true });
		if (tries >= 3) throw new Error('Workers AI failed (' + res.status + ').');
		await new Promise((r) => setTimeout(r, tries * 4000));
	}
}

function seedRows() {
	const data = loadJson(SEEDS, { seeds: [] });
	const seen = new Set();
	return (data.seeds || [])
		.map((s) => ({
			host: bare(s.host),
			name: clip(s.name || s.host, 80),
			kind: clip(s.kind, 20),
			lang: clip(s.lang || 'en', 8),
			region: clip(s.region || 'global', 20),
			submit_url: clip(s.submit || '', 300),
			contact_url: '',
			email: '',
			profiles: '',
			pitch: '',
			status: 'seed',
			source: 'seed',
			found_at: '',
			notes: '',
		}))
		.filter((s) => {
			if (!s.host || seen.has(s.host)) return false;
			seen.add(s.host);
			return true;
		});
}

/** Open a host: keep it if it loads; fill submit, contact, email, profiles, title. */
async function enrichOne(row) {
	const host = bare(row.host);
	const home = (await page('https://' + host + '/')) || (await page('https://www.' + host + '/'));
	if (!home) return Object.assign({}, row, { status: 'dead', notes: clip((row.notes ? row.notes + '; ' : '') + 'home did not load', 200) });
	const title = clip((home.html.match(/<title[^>]*>([^<]*)/i) || [])[1] || row.name, 80);
	const links = pickLinks(home.html, home.url, host);
	let submit = preferSubmit(row.submit_url, links.submit);
	let contact = row.contact_url || links.contact;
	const emails = new Map();
	emailsIn(home.html, host).forEach((e) => emails.set(e, home.url));
	const profiles = profilesIn(home.html, home.url);
	for (const u of [contact, submit].filter(Boolean).slice(0, 2)) {
		const p = await page(u);
		if (!p) continue;
		emailsIn(p.html, host).forEach((e) => {
			if (!emails.has(e)) emails.set(e, p.url);
		});
		const more = pickLinks(p.html, p.url, host);
		submit = preferSubmit(submit, more.submit);
		if (!contact && more.contact) contact = more.contact;
		profiles.push(...profilesIn(p.html, p.url));
	}
	const email = [...emails.keys()][0] || '';
	const region = row.region || 'global';
	return {
		host,
		name: title || row.name,
		kind: row.kind,
		lang: row.lang,
		region,
		cc: REGION_CC[region] || REGION_CC[row.lang] || 'us',
		submit_url: clip(submit, 300),
		contact_url: clip(contact, 300),
		email,
		profiles: [...new Set(profiles)].slice(0, 6).join(' '),
		sequence: 'L',
		sender: 'brand',
		pitch: row.pitch || 'intro',
		status: email || submit || contact ? 'reachable' : 'no_contact',
		source: row.source || 'seed',
		found_at: row.found_at || day(),
		notes: row.notes || '',
	};
}

async function discover(langs, kinds, per, skip, dateStr) {
	const pack = loadJson(KINDS);
	const kindList = (kinds.length ? kinds : pack.kinds.map((k) => k.id))
		.map((id) => pack.kinds.find((k) => k.id === id))
		.filter(Boolean);
	const langList = langs.length ? langs : defaultDiscoverLangs(pack, dateStr || day());
	const found = [];
	for (const lang of langList) {
		const hint = pack.langHints[lang] || lang;
		for (const kind of kindList) {
			const named = await ai(
				'You list real public websites that help people discover tools, websites, startups or digital products. Answer only with JSON. Never invent domains.',
				`List up to ${per} real ${kind.ask} used by ${hint} audiences. Prefer sites whose own language or market matches "${lang}". Include the official domain (no social networks as the main host, no app stores), a short name, and whether they accept submissions. JSON: {"sites":[{"name":"...","host":"example.com","accepts_submissions":true,"notes":"one short clause"}]}`,
				{ max: 1000 }
			);
			for (const s of named.sites || []) {
				const host = bare(s.host);
				if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(host) || skip.has(host)) continue;
				skip.add(host);
				found.push({
					host,
					name: clip(s.name || host, 80),
					kind: kind.id,
					lang,
					region: lang,
					submit_url: '',
					contact_url: '',
					email: '',
					profiles: '',
					pitch: '',
					status: 'candidate',
					source: 'ai:' + kind.id + ':' + lang,
					found_at: day(),
					notes: clip(s.notes || '', 160),
				});
			}
		}
	}
	return found;
}

function isPromoter(facts) {
	const blob = (facts.title + ' ' + facts.description + ' ' + facts.text).toLowerCase();
	return /directory|directories|gallery|galleries|award|nominate|submit (your|a)|launch|showcase|inspiration|alternatives?|startup|saas|tools? (of|for)|newsletter|round.?up|indie|maker|founder|podcast|interview|accelerator|incubator|demo day|portfolio companies|pitch us|media kit/.test(
		blob
	);
}

async function judgeBatch(rows) {
	const facts = [];
	for (const r of rows) {
		const home = (await page('https://' + r.host + '/')) || (await page('https://www.' + r.host + '/'));
		if (!home) {
			facts.push(null);
			continue;
		}
		facts.push({
			host: r.host,
			title: clip((home.html.match(/<title[^>]*>([^<]*)/i) || [])[1], 120),
			description: clip((home.html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)/i) || [])[1], 200),
			text: visible(home.html).slice(0, 900),
		});
	}
	const kept = [];
	for (let i = 0; i < rows.length; i += 1) {
		const f = facts[i];
		if (!f || !isPromoter(f)) continue;
		kept.push(Object.assign({}, rows[i], { name: f.title || rows[i].name }));
	}
	return kept;
}

function toCsv(header, rows) {
	const esc = (v) => {
		const s = String(v == null ? '' : v);
		return /["\n,]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
	};
	return [header.join(',')].concat(rows.map((r) => header.map((h) => esc(r[h])).join(','))).join('\n') + '\n';
}

function report(date, rows, discovered, meta = {}) {
	const byKind = {};
	const byLang = {};
	for (const r of rows) {
		(byKind[r.kind] || (byKind[r.kind] = [])).push(r);
		(byLang[r.lang] || (byLang[r.lang] = { total: 0, reachable: 0 })).total += 1;
		if (r.status === 'reachable') byLang[r.lang].reachable += 1;
	}
	const reachable = rows.filter((r) => r.status === 'reachable');
	const aiFresh = rows.filter((r) => String(r.source || '').startsWith('ai:'));
	const scoutLangs = meta.scoutLangs || [];
	const lines = [
		`# Promoter scout ${date} (#4151)`,
		'',
		'Public sites and communities that promote, showcase, review or talk about tools, sites, startups and features — with the contact path we found. **Nothing is sent automatically:** Carlos picks who to introduce ourselves to.',
		'',
		`- Candidates enriched: ${rows.length} (${reachable.length} with email, submit or contact page)`,
		`- Fresh from AI this run: ${discovered}`,
		`- Languages in report: ${[...new Set(rows.map((r) => r.lang))].sort().join(', ') || '—'}`,
		scoutLangs.length ? `- AI discovery langs this run: ${scoutLangs.join(', ')}` : '',
		'',
		'## How to use',
		'',
		'1. Prefer rows with `submit_url` (list/launch us) and/or `email` / `contact_url` (introduce QA-lab URL Review).',
		'2. Draft: `node scripts/promoter-scout.js draft <host>` then send yourself. Instantly sequence **L** (brand sender) is in `collateral/emails.md` / `emails-promoters.md`; rows go to `prospects/promoters.csv`.',
		'3. Mark a host done by keeping it in `seen.json` (Actions memory branch); do not re-spam.',
		'',
	];
	const langKeys = Object.keys(byLang).sort();
	if (langKeys.length) {
		lines.push('## By language', '', '| Lang | Rows | Reachable |', '|---|---|---|');
		for (const lang of langKeys) {
			const s = byLang[lang];
			lines.push(`| ${lang} | ${s.total} | ${s.reachable} |`);
		}
		lines.push('');
	}
	if (aiFresh.length) {
		lines.push('## New from AI this run', '', '| Host | Kind | Lang | Notes |', '|---|---|---|---|');
		for (const r of aiFresh.slice(0, 40)) {
			lines.push(`| \`${r.host}\` | ${r.kind} | ${r.lang} | ${clip(r.notes || r.source, 80)} |`);
		}
		if (aiFresh.length > 40) lines.push('', `_…and ${aiFresh.length - 40} more in the kind tables below._`);
		lines.push('');
	}
	for (const kind of KIND_IDS()) {
		const list = byKind[kind] || [];
		if (!list.length) continue;
		lines.push(`## ${kind} — ${kindLabel(kind)}`, '', '| Host | Name | Lang | Submit | Contact | Email | Status |', '|---|---|---|---|---|---|---|');
		for (const r of list) {
			lines.push(
				`| \`${r.host}\` | ${clip(r.name, 40)} | ${r.lang} | ${r.submit_url ? '[submit](' + r.submit_url + ')' : '—'} | ${r.contact_url ? '[contact](' + r.contact_url + ')' : '—'} | ${r.email || '—'} | ${r.status} |`
			);
		}
		lines.push('');
	}
	return lines.join('\n');
}

async function enrichMany(rows, limit) {
	const out = [];
	const todo = rows.slice(0, limit);
	const PARALLEL = 4;
	let i = 0;
	const worker = async () => {
		while (i < todo.length) {
			const idx = i;
			i += 1;
			out[idx] = await enrichOne(todo[idx]);
		}
	};
	await Promise.all(Array.from({ length: Math.min(PARALLEL, todo.length || 1) }, worker));
	return out.filter(Boolean);
}

function mergeSeen(seen, rows, date) {
	for (const r of rows) {
		seen[r.host] = {
			first: seen[r.host] && seen[r.host].first ? seen[r.host].first : date,
			kind: r.kind,
			lang: r.lang,
			status: r.status,
			at: date,
		};
	}
	return seen;
}

async function run(opts) {
	const date = opts.date || day();
	const seen = loadJson(SEEN, {});
	const skip = new Set(Object.keys(seen));
	const seeds = seedRows().filter((s) => opts.reseeds || !skip.has(s.host));
	for (const s of seeds) skip.add(s.host);

	const pack = loadJson(KINDS);
	const scoutLangs = opts.langs.length ? opts.langs : defaultDiscoverLangs(pack, date);

	let discovered = [];
	if (!opts.seedsOnly) {
		discovered = await discover(scoutLangs, opts.kinds, opts.per, skip, date);
		discovered = await judgeBatch(discovered);
	}

	const fresh = seeds.concat(discovered);
	const enriched = await enrichMany(fresh, opts.limit);
	fs.mkdirSync(REPORTS, { recursive: true });
	fs.writeFileSync(SEEN, JSON.stringify(mergeSeen(seen, enriched, date), null, '\t') + '\n');

	let allRows = enriched;
	if (opts.dir) {
		const file = path.join(opts.dir, 'prospects', 'promoters.csv');
		fs.mkdirSync(path.dirname(file), { recursive: true });
		const prior = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
		const known = new Set();
		if (prior) {
			for (const line of prior.split(/\r?\n/).slice(1)) {
				const host = bare(line.split(',')[0]);
				if (host) known.add(host);
			}
		}
		const add = enriched.filter((r) => r.status !== 'dead' && !known.has(r.host));
		const csv = toCsv(
			HEADER,
			add.map((r) =>
				Object.assign(
					{
						pitch: r.pitch || 'intro',
						sequence: r.sequence || 'L',
						sender: r.sender || 'brand',
						cc: r.cc || REGION_CC[r.region] || 'us',
					},
					r
				)
			)
		);
		if (!prior) fs.writeFileSync(file, csv);
		else if (add.length) fs.appendFileSync(file, csv.split('\n').slice(1).join('\n'));
		allRows = rowsFromCsv(file);
	}

	const body = report(date, allRows, discovered.length, { scoutLangs: opts.seedsOnly ? [] : scoutLangs });
	fs.writeFileSync(path.join(REPORTS, date + '.md'), body);

	const reachable = allRows.filter((r) => r.status === 'reachable').length;
	if (process.env.GITHUB_OUTPUT) {
		fs.appendFileSync(
			process.env.GITHUB_OUTPUT,
			`findings=${allRows.length > 0}\ncandidates=${allRows.length}\nreachable=${reachable}\n`
		);
	}
	return { candidates: allRows.length, reachable, discovered: discovered.length, body, rows: allRows };
}

/** Rebuild promoter rows from the outreach CSV (quoted fields). */
function rowsFromCsv(file) {
	if (!fs.existsSync(file)) return [];
	const text = fs.readFileSync(file, 'utf8');
	const lines = text.split(/\r?\n/).filter(Boolean);
	if (lines.length < 2) return [];
	const header = parseCsvLine(lines[0]);
	return lines.slice(1).map((line) => {
		const cols = parseCsvLine(line);
		const row = {};
		header.forEach((h, i) => {
			row[h] = cols[i] || '';
		});
		return row;
	});
}

function parseCsvLine(line) {
	const out = [];
	let cur = '';
	let q = false;
	for (let i = 0; i < line.length; i += 1) {
		const ch = line[i];
		if (q) {
			if (ch === '"' && line[i + 1] === '"') {
				cur += '"';
				i += 1;
			} else if (ch === '"') q = false;
			else cur += ch;
		} else if (ch === '"') q = true;
		else if (ch === ',') {
			out.push(cur);
			cur = '';
		} else cur += ch;
	}
	out.push(cur);
	return out;
}

async function draftIntro(host) {
	const row = seedRows().find((s) => s.host === bare(host)) || { host: bare(host), name: bare(host), kind: 'directory', lang: 'en' };
	const enriched = await enrichOne(row);
	const text = await ai(
		'You write short, respectful outreach for QA-lab URL Review (carlosandmunoz.com / qalabreview.com): a public URL review that finds real issues on a site. No hype, no fake flattery. Answer with plain text only.',
		`Draft a short email (subject + body) in ${enriched.lang || 'en'} to introduce QA-lab URL Review to ${enriched.name} (${enriched.host}), a ${enriched.kind} that helps people discover sites/tools/startups. We want them to know we exist and are interested in getting to know each other (listing, feature, or partnership — whatever fits them). Mention we can share a Live Report of a public review. Sign as Carlos. Do not invent prices.`,
		{ json: false, max: 500 }
	);
	return { enriched, text };
}

async function main() {
	const [mode, ...argv] = process.argv.slice(2);
	const langs = listArg(argv, '--langs', []);
	const kinds = listArg(argv, '--kinds', []);
	const per = Math.max(1, Math.min(12, Number(argVal(argv, '--per', '5')) || 5));
	const limit = Math.max(1, Number(argVal(argv, '--limit', '80')) || 80);
	const date = argVal(argv, '--date', day());
	const dir = argVal(argv, '--dir', '');

	if (mode === 'seeds') {
		const rows = seedRows();
		console.log(rows.length + ' seeds');
		for (const r of rows) console.log([r.kind, r.lang, r.host, r.name].join('\t'));
		return;
	}
	if (mode === 'enrich') {
		const rows = await enrichMany(seedRows(), limit);
		console.log(toCsv(HEADER, rows));
		return;
	}
	if (mode === 'scout') {
		const skip = new Set(Object.keys(loadJson(SEEN, {})));
		seedRows().forEach((s) => skip.add(s.host));
		const found = await discover(langs, kinds, per, skip);
		const kept = await judgeBatch(found);
		console.log(kept.length + ' candidates after filter');
		for (const r of kept) console.log([r.kind, r.lang, r.host, r.name].join('\t'));
		return;
	}
	if (mode === 'run') {
		const out = await run({
			date,
			langs,
			kinds,
			per,
			limit,
			dir,
			seedsOnly: argv.includes('--seeds-only'),
			reseeds: argv.includes('--reseeds'),
		});
		console.log(`Promoter scout ${date}: ${out.candidates} candidates, ${out.reachable} reachable, ${out.discovered} from AI.`);
		return;
	}
	if (mode === 'draft') {
		const host = argv[0];
		if (!host) throw new Error('Usage: node scripts/promoter-scout.js draft <host>');
		const { enriched, text } = await draftIntro(host);
		console.log(JSON.stringify(enriched, null, 2));
		console.log('\n---\n' + text);
		return;
	}
	if (mode === 'report') {
		if (!dir) throw new Error('Usage: node scripts/promoter-scout.js report --dir <outreach> [--date D]');
		const file = path.join(dir, 'prospects', 'promoters.csv');
		const rows = rowsFromCsv(file);
		const body = report(date, rows, 0);
		fs.mkdirSync(REPORTS, { recursive: true });
		fs.writeFileSync(path.join(REPORTS, date + '.md'), body);
		console.log(`Wrote report for ${rows.length} rows -> scripts/promoter-scout/reports/${date}.md`);
		return;
	}
	console.error(
		'Usage: node scripts/promoter-scout.js <seeds|enrich|scout|run|draft|report> [--date D] [--dir outreach] [--langs en,es] [--kinds gallery,directory] [--per 5] [--limit 80] [--seeds-only] [--reseeds]'
	);
	process.exit(2);
}

if (require.main === module) {
	main().catch((e) => {
		console.error(e.message || e);
		process.exit(e.fatal ? 1 : 1);
	});
}

module.exports = {
	bare,
	clip,
	seedRows,
	pickLinks,
	emailsIn,
	profilesIn,
	isPromoter,
	defaultDiscoverLangs,
	kindLabel,
	report,
	toCsv,
	HEADER,
	SUBMIT_RE,
	CONTACT_RE,
	ASSET_RE,
	preferSubmit,
	enrichOne,
	run,
	rowsFromCsv,
	parseCsvLine,
};
