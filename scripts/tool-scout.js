#!/usr/bin/env node
'use strict';
/* Weekly tool scout (#3857), the repeatable version of the #3828 scout. .github/workflows/tool-scout.yml runs it and opens a draft PR.
   Two passes, both read-only against GitHub:
     audit  every owner/repo in .cursor/rules/tool-arsenal.mdc is checked again: gone, archived, license changed or never
            matching what the row says, or quiet for a year
     scout  GitHub search per corner (Carlos's order, #3828: B geo/agency, C internal/secops, D design/social, A cyber) for
            repos the arsenal and the scout's own memory (scripts/tool-scout/seen.json) do not know yet, sorted by license:
            permissive, attribution, isolate (weak copyleft), trap (copyleft, non-commercial, unlicensed)
   Nothing here edits the arsenal or files tickets: Carlos reads the report, and a row changes only with its ticket.

   node scripts/tool-scout.js audit            print the arsenal drift
   node scripts/tool-scout.js scout            print new candidates
   node scripts/tool-scout.js run [--date D]   both, write scripts/tool-scout/reports/D.md and update seen.json
   node scripts/tool-scout.js repo owner/name  fact card for any repo (#4039): license, dates, star velocity, owner, flags
   Needs the gh CLI (GH_TOKEN in Actions). */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const ARSENAL = path.join(ROOT, '.cursor', 'rules', 'tool-arsenal.mdc');
const DIR = path.join(__dirname, 'tool-scout');
const SEEN = path.join(DIR, 'seen.json');
const KNOWN = path.join(DIR, 'known.json');
const DAY = 86400000;
const SCOUT_REPO = 'kaanmuar/kaanmuar.github.io';
const ISSUE_TITLE_LOOKBACK_DAYS = 14;

const PERMISSIVE = new Set(['MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', 'Zlib', 'CC0-1.0', 'PDDL-1.0', 'Unlicense', '0BSD']);
const ATTRIBUTION = new Set(['CC-BY-4.0', 'CC-BY-3.0']);
const ISOLATE = new Set(['MPL-2.0', 'CC-BY-SA-4.0', 'LGPL-3.0', 'LGPL-2.1', 'EPL-2.0']);

// Carlos's order (#3828): B, C, D, A. Each query also gets pushed, stars and archived filters.
const CORNERS = [
	{
		id: 'B',
		name: 'Customer GEO, speed, accessibility and agency',
		queries: ['"llms.txt"', '"generative engine optimization"', '"wcag" audit', '"core web vitals" audit', '"cookie consent" scanner', '"json-ld" validator', '"accessibility" "playwright"', '"hreflang" validator', '"structured data" "schema.org" audit'],
	},
	{
		id: 'C',
		name: 'Internal AppSec, CI, ops and outreach',
		queries: ['"github actions" security audit', '"github actions" "template injection"', '"secret scanner"', '"dmarc" report', '"webhook" idempotency', '"cloudflare workers" retry', '"sbom" scanner', '"dependency" "license" audit', '"cold email" deliverability'],
	},
	{
		id: 'D',
		name: 'Design, media, social and field sweep',
		queries: ['"satori" renderer', '"webgl" shader', '"programmatic video"', '"c2pa"', '"audio watermark"', '"bluesky" bot', '"atproto" sdk', '"design tokens" generator', '"open graph" image generator'],
	},
	{
		id: 'A',
		name: 'Cyber-attack side (passive checks only)',
		queries: ['"content security policy" evaluator', '"security headers" checker', '"typosquatting"', '"threat intelligence" feed', '"epss"', '"subresource integrity"', '"dns" "spf" checker', '"tls" certificate monitor'],
	},
];

const CAPS = { permissive: 12, attribution: 3, isolate: 6, trap: 8, unknown: 5 };

// Tools that undo provenance or evade protections work against #3824 (AI labels) and passive-only checks: never suggested.
const DENY = /remov\w*[- ]?(ai[- ]?)?watermarks?|watermarks?[- ]?remov|strip\w*[- ](ai[- ])?watermarks?|anti-attribution|humaniz|bypass|crack(er|ed)?\b|keygen|stealer|keylogger|downloader|jailbreak|evad(e|ing)|obfuscat|malware builder/i;

const NOT_REPOS = new Set(['scripts', 'functions', 'workers', 'assets', 'designs', 'packages', 'js', 'android', 'tests', 'css', 'data', 'media', 'skills', 'mlx-community', 'node_modules', 'docs']);
const SPDX_IN_TEXT = /\b(AGPL-3\.0|GPL-3\.0|GPL-2\.0-or-later|MPL-2\.0|Apache-2\.0|BSD-2-Clause|BSD-3-Clause|MIT|ISC|Zlib|PDDL|CC0-1\.0|CC-BY-SA-4\.0|CC-BY-4\.0|CC-BY-3\.0)\b/g;

const sh = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30000, maxBuffer: 16 * 1024 * 1024 });

/** gh api -> parsed JSON, { notFound } for a 404, { error } otherwise; a rate limit throws so a run stops instead of lying. */
function gh(args, retry = true) {
	try {
		return JSON.parse(sh('gh', ['api', ...args]));
	} catch (e) {
		const msg = String((e.stderr || '') + (e.message || ''));
		if (/rate limit|secondary rate/i.test(msg)) throw new Error('GitHub rate limit: ' + msg.split('\n')[0]);
		if (/404|Not Found/i.test(msg)) return { notFound: true };
		if (retry) return gh(args, false);
		return { error: msg.split('\n')[0] };
	}
}

function classifyLicense(spdx) {
	if (!spdx || spdx === 'NOASSERTION' || spdx === 'NONE') return 'unknown';
	if (PERMISSIVE.has(spdx)) return 'permissive';
	if (ATTRIBUTION.has(spdx)) return 'attribution';
	if (ISOLATE.has(spdx)) return 'isolate';
	return 'trap';
}

const normalise = (t) => (t === 'PDDL' ? 'PDDL-1.0' : t);

/** SPDX ids a LICENSE file's own words state, for the repos GitHub reports as NOASSERTION or none -> [id], or ['proprietary']. */
function detectLicenses(text) {
	const t = String(text || '').slice(0, 20000);
	const found = [];
	if (/Apache License[\s\S]{0,120}Version 2\.0/i.test(t)) found.push('Apache-2.0');
	if (/Permission is hereby granted, free of charge/i.test(t)) found.push('MIT');
	if (/Permission to use, copy, modify, and\/or distribute this software for any\s+purpose with or without fee/i.test(t)) found.push('ISC');
	if (/Redistribution and use in source and binary forms/i.test(t)) found.push(/Neither the name|endorse or promote/i.test(t) ? 'BSD-3-Clause' : 'BSD-2-Clause');
	if (/Creative Commons 0|CC0 1\.0|CC0-1\.0/i.test(t)) found.push('CC0-1.0');
	if (/Attribution-NonCommercial/i.test(t)) found.push('CC-BY-NC');
	else if (/Attribution-ShareAlike 4\.0/i.test(t)) found.push('CC-BY-SA-4.0');
	else if (/Creative Commons[\s\S]{0,300}Attribution 4\.0 International/i.test(t) || /Attribution 4\.0 International/i.test(t)) found.push('CC-BY-4.0');
	else if (/Attribution 3\.0 Unported/i.test(t)) found.push('CC-BY-3.0');
	if (/altered source versions must be plainly marked/i.test(t)) found.push('Zlib');
	if (/Public Domain Dedication and License|\bPDDL\b/i.test(t)) found.push('PDDL-1.0');
	if (/Mozilla Public License[\s\S]{0,40}2\.0/i.test(t)) found.push('MPL-2.0');
	if (/GNU AFFERO GENERAL PUBLIC LICENSE/i.test(t)) found.push('AGPL-3.0');
	if (/GNU GENERAL PUBLIC LICENSE\s+Version 3/i.test(t)) found.push('GPL-3.0');
	if (!found.length && /all rights reserved/i.test(t) && !/licensed under|permission is hereby|you may not use this file except/i.test(t)) found.push('proprietary');
	return found;
}

/** The arsenal as lines grouped by section: [{ kind: listed|excluded|skip, title, lines: [{ text, slugs, claimed }] }]. */
function parseArsenal(text) {
	const out = [];
	for (const block of text.split(/^## /m).slice(1)) {
		const [title, ...rest] = block.split('\n');
		const kind = /^Not evaluated/i.test(title) ? 'skip' : /^Rejected|^Archived/i.test(title) ? 'excluded' : 'listed';
		const lines = rest.map((raw) => ({ text: raw, slugs: slugsIn(raw), claimed: [...raw.matchAll(SPDX_IN_TEXT)].map((m) => normalise(m[1])) })).filter((l) => l.slugs.length);
		out.push({ kind, title: title.trim(), lines });
	}
	return out;
}

function slugsIn(line) {
	const found = new Set();
	for (const m of line.matchAll(/`([A-Za-z0-9][\w.-]*\/[A-Za-z0-9][\w.-]*)`/g)) found.add(m[1]);
	for (const m of line.matchAll(/github\.com\/([A-Za-z0-9][\w.-]*\/[A-Za-z0-9][\w.-]*)/g)) found.add(m[1].replace(/[.,;)]+$/, ''));
	return [...found].filter((s) => !NOT_REPOS.has(s.split('/')[0]));
}

/** What is wrong with one repo against the arsenal line that names it -> [{ level, note }]; empty when it still checks out. */
function auditRepo(meta, line, kind, now, licenseText) {
	if (meta.notFound) return [{ level: 'MISSING', note: 'the repo no longer answers (renamed, moved or deleted)' }];
	if (meta.error) return [{ level: 'UNCHECKED', note: meta.error }];
	const issues = [];
	const spdx = meta.license && meta.license.spdx_id;
	const cls = classifyLicense(spdx);
	// 'active, not archived' is the opposite claim.
	const claimsArchived = /archived/i.test(line.text.replace(/\b(?:not|never|isn't|un)[ -]+archived/gi, '')) && kind === 'excluded';
	if (meta.archived && kind === 'listed') issues.push({ level: 'ARCHIVED', note: 'archived, but listed as a tool to use' });
	if (!meta.archived && claimsArchived) issues.push({ level: 'MISMATCH', note: 'listed as archived, but the repo is active' });
	if (kind === 'listed') {
		if (cls === 'unknown') issues.push(...fromLicenseFile(spdx, line, licenseText));
		else if (line.claimed.length && !line.claimed.includes(spdx)) issues.push({ level: 'MISMATCH', note: 'the row says ' + [...new Set(line.claimed)].join(' / ') + ', the repo says ' + spdx });
		else if (cls === 'trap') issues.push({ level: 'LICENSE', note: spdx + ' is not safe for paid or customer code' });
		if (meta.pushed_at && now - Date.parse(meta.pushed_at) > 365 * DAY) issues.push({ level: 'STALE', note: 'no push for over a year' });
	}
	if (kind === 'excluded' && !meta.archived && cls === 'permissive' && !claimsArchived && /licen|AGPL|GPL|NC\b|Elastic|Prosperity|Polyform/i.test(line.text)) issues.push({ level: 'INFO', note: 'excluded, but now ' + spdx + ': worth another look' });
	return issues;
}

/** GitHub could not name the license: read what the LICENSE file says, and report only what a person must look at. */
function fromLicenseFile(spdx, line, licenseText) {
	const found = detectLicenses(licenseText);
	const head = String(licenseText || '').split('\n').filter((l) => l.trim()).slice(0, 2).join(' | ').slice(0, 120);
	if (found.includes('proprietary')) return [{ level: 'LICENSE', note: 'the LICENSE file grants no rights (all rights reserved)', head }];
	if (!found.length) return [{ level: 'UNVERIFIED', note: 'GitHub reads ' + (spdx || 'no license') + ' and the LICENSE file is ' + (licenseText ? 'not one we recognise' : 'missing') + '; read it', head }];
	const claimed = line.claimed;
	if (claimed.length && !found.some((f) => claimed.includes(f))) return [{ level: 'MISMATCH', note: 'the row says ' + [...new Set(claimed)].join(' / ') + ', the LICENSE file reads ' + found.join(' + '), head }];
	if (found.every((f) => classifyLicense(f) === 'trap')) return [{ level: 'LICENSE', note: found.join(' + ') + ' is not safe for paid or customer code', head }];
	return [];
}

const licenseText = (slug) => {
	const lic = gh(['repos/' + slug + '/license']);
	return lic.content ? Buffer.from(lic.content, 'base64').toString('utf8') : '';
};

function audit(text, now, fetchRepo, fetchLicense, known) {
	const rows = [];
	const seen = new Set();
	for (const section of parseArsenal(text)) {
		if (section.kind === 'skip') continue;
		for (const line of section.lines) {
			for (const slug of line.slugs) {
				const key = slug.toLowerCase() + '|' + section.kind;
				if (seen.has(key)) continue;
				seen.add(key);
				const meta = fetchRepo(slug);
				const unreadable = section.kind === 'listed' && !meta.notFound && !meta.error && classifyLicense(meta.license && meta.license.spdx_id) === 'unknown';
				const text = unreadable && fetchLicense ? fetchLicense(slug) : '';
				for (const i of auditRepo(meta, line, section.kind, now, text)) {
					if (known && known[slug + '|' + i.level]) continue;
					rows.push({ slug, section: section.title, ...i });
				}
			}
		}
	}
	return rows;
}

function arsenalSlugs(text) {
	return new Set(parseArsenal(text).flatMap((s) => s.lines.flatMap((l) => l.slugs.map((x) => x.toLowerCase()))));
}

/** Search hits -> candidates the arsenal and seen.json do not know, grouped by license class. */
function rank(items, known) {
	const groups = { permissive: [], attribution: [], isolate: [], trap: [], unknown: [] };
	for (const r of items) {
		const slug = r.full_name;
		if (!slug || known.has(slug.toLowerCase()) || r.fork || r.archived) continue;
		if (DENY.test(slug + ' ' + (r.description || ''))) continue;
		groups[classifyLicense(r.license && r.license.spdx_id)].push({
			slug,
			license: (r.license && r.license.spdx_id) || 'none',
			stars: r.stargazers_count,
			pushed: String(r.pushed_at || '').slice(0, 10),
			about: String(r.description || '').replace(/\s+/g, ' ').slice(0, 110),
		});
	}
	return groups;
}

// A README line that states the project's status (a heading or a sentence that starts with it), not a passing mention (#3901).
const STATUS = /^(status:\s*)?(this (project|repo|repository|package|tool|library) (is|has been|was) )?(now )?(deprecated|unmaintained|no longer maintained|archived)\b/i;
function isStatusLine(raw) {
	const line = raw.trim().replace(/^[#>*_`\s]+/, '').replace(/^[^A-Za-z]+/, '').replace(/[*_`]+/g, '');
	return line.length <= 140 && STATUS.test(line);
}

function readmeFlags(slug) {
	const r = gh(['repos/' + slug + '/readme']);
	if (!r.content) return [];
	const md = Buffer.from(r.content, 'base64').toString('utf8');
	const flags = [];
	if (md.split('\n').some(isStatusLine)) flags.push('README mentions deprecated/unmaintained');
	if (/agpl|\bgpl\b|non-?commercial|source-available|commercial license/i.test(md)) flags.push('README mentions a copyleft or commercial license');
	if (/star us|please star|give.*star/i.test(md)) flags.push('asks for stars');
	return flags;
}

/** Slug appears in a repo issue title (open or closed) updated on or after since -> boolean; null when search failed. */
function slugInRecentIssueTitles(slug, since, cache, searchIssues) {
	const key = slug.toLowerCase();
	if (cache.has(key)) return cache.get(key);
	const q = `repo:${SCOUT_REPO} ${slug} in:title updated:>=${since}`;
	const res = searchIssues(['search/issues', '-f', `q=${q}`, '-f', 'per_page=10']);
	let outcome;
	if (res.error || res.notFound) outcome = { blocked: false, failed: true };
	else {
		const re = new RegExp(slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
		outcome = { blocked: (res.items || []).some((i) => re.test(i.title || '')), failed: false };
	}
	cache.set(key, outcome);
	return outcome;
}

/** After ranking: drop arsenal rows added since the search pass and slugs already in a ticket title (#4075). */
function filterRankedCandidates(found, arsenalText, now, searchIssues = gh) {
	const arsenal = arsenalSlugs(arsenalText);
	const since = new Date(now - ISSUE_TITLE_LOOKBACK_DAYS * DAY).toISOString().slice(0, 10);
	const cache = new Map();
	for (const { groups } of found) {
		for (const g of Object.keys(groups)) {
			groups[g] = groups[g].filter((c) => {
				if (arsenal.has(c.slug.toLowerCase())) return false;
				const hit = slugInRecentIssueTitles(c.slug, since, cache, searchIssues);
				if (hit.failed) {
					c.flags = (c.flags || []).concat('issue-title check failed; kept candidate');
					return true;
				}
				return !hit.blocked;
			});
		}
	}
	return found;
}

function scout(text, seen, now, searchIssues = gh) {
	const known = arsenalSlugs(text);
	for (const slug of Object.keys(seen)) known.add(slug.toLowerCase());
	const since = new Date(now - 30 * DAY).toISOString().slice(0, 10);
	const out = [];
	for (const corner of CORNERS) {
		const hits = new Map();
		for (const q of corner.queries) {
			const res = gh(['-X', 'GET', 'search/repositories', '-f', `q=${q} in:name,description,topics pushed:>=${since} stars:>=10 archived:false`, '-f', 'sort=stars', '-f', 'order=desc', '-f', 'per_page=10']);
			for (const item of res.items || []) hits.set(item.full_name, item);
		}
		const groups = rank([...hits.values()], known);
		// What does not fit this week stays out of seen.json, so it can come back when the list is shorter.
		for (const [g, cap] of Object.entries(CAPS)) groups[g] = groups[g].sort((a, b) => b.stars - a.stars).slice(0, cap);
		for (const c of groups.permissive.concat(groups.attribution)) c.flags = readmeFlags(c.slug);
		for (const g of Object.keys(groups)) groups[g].forEach((c) => known.add(c.slug.toLowerCase()));
		out.push({ corner, groups });
	}
	return filterRankedCandidates(out, text, now, searchIssues);
}

const cell = (s) => String(s).replace(/\|/g, '/');

function report(date, drift, found) {
	const lines = [`# Tool scout ${date} (#3857)`, '', 'Read-only findings. Nothing here changes `.cursor/rules/tool-arsenal.mdc` or the board: tell Carlos which to ticket, and a row changes only with its ticket (`scrum-board.mdc`, `tool-arsenal.mdc`).', ''];
	lines.push('## Arsenal drift', '');
	const real = drift.filter((d) => d.level !== 'INFO');
	if (!drift.length) lines.push('Every listed repo still checks out.');
	else {
		lines.push('| Repo | Level | Note |', '|---|---|---|');
		for (const d of real.concat(drift.filter((x) => x.level === 'INFO'))) lines.push(`| \`${d.slug}\` | ${d.level} | ${cell(d.note)}${d.head ? ' (LICENSE: ' + cell(d.head) + ')' : ''} |`);
	}
	for (const { corner, groups } of found) {
		lines.push('', `## Corner ${corner.id}: ${corner.name}`, '');
		const usable = groups.permissive.concat(groups.attribution, groups.isolate);
		if (!usable.length) lines.push('No new permissive repos this week.');
		else {
			lines.push('| Repo | License | Stars | Pushed | Fit and flags |', '|---|---|---|---|---|');
			for (const c of usable) {
				const how = groups.attribution.includes(c) ? 'attribution' : groups.isolate.includes(c) ? 'isolate at file level' : 'permissive';
				const low = c.stars < 50 ? 'under 50 stars' : '';
				lines.push(`| \`${c.slug}\` | ${c.license} (${how}) | ${c.stars} | ${c.pushed} | ${cell(c.about)}${[low].concat(c.flags || []).filter(Boolean).map((f) => '; ' + f).join('')} |`);
			}
		}
		const traps = groups.trap.concat(groups.unknown);
		if (traps.length) lines.push('', 'Traps and unreadable licenses (do not bundle): ' + traps.map((c) => `\`${c.slug}\` (${c.license})`).join(', '));
	}
	return lines.join('\n') + '\n';
}

const readSeen = () => readJson(SEEN);

function readJson(file) {
	try {
		return JSON.parse(fs.readFileSync(file, 'utf8'));
	} catch {
		return {};
	}
}

const auditNow = (text) => audit(text, Date.now(), (slug) => gh(['repos/' + slug]), licenseText, readJson(KNOWN));

function run(date) {
	const Learn = require('../functions/scout-learn');
	const text = fs.readFileSync(ARSENAL, 'utf8');
	const now = Date.now();
	const drift = auditNow(text);
	const seen = readSeen();
	const found = scout(text, seen, now);
	for (const { corner, groups } of found) for (const g of Object.keys(groups)) for (const c of groups[g]) seen[c.slug] = { first: date, corner: corner.id, license: c.license };
	fs.mkdirSync(path.join(DIR, 'reports'), { recursive: true });
	const fresh = found.reduce((n, f) => n + f.groups.permissive.length + f.groups.attribution.length + f.groups.isolate.length, 0);
	const real = drift.filter((d) => d.level !== 'INFO').length;
	const traps = found.reduce((n, f) => n + f.groups.trap.length + f.groups.unknown.length, 0);
	const flags = found.reduce(
		(n, f) => n + f.groups.permissive.concat(f.groups.attribution).reduce((a, c) => a + ((c.flags && c.flags.length) || 0), 0),
		0
	);
	const corners = found.map(({ corner, groups }) => ({
		id: corner.id,
		name: corner.name,
		usable: groups.permissive.length + groups.attribution.length + groups.isolate.length,
		traps: groups.trap.length + groups.unknown.length,
	}));
	const learned = Learn.learnFile('tool', { drift: real, candidates: fresh, traps, flags, corners }, now);
	const body = report(date, drift, found) + '\n' + learned.markdown;
	fs.writeFileSync(path.join(DIR, 'reports', date + '.md'), body);
	fs.writeFileSync(SEEN, JSON.stringify(seen, null, '\t') + '\n');
	if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `findings=${fresh + real > 0}\ndrift=${real}\ncandidates=${fresh}\n`);
	return { drift: real, candidates: fresh, body, learn: learned.slice };
}

/** One fact card for any repo (#4039). It states facts and flags only; the verdict is a person's or an agent's. */
function repoCard(slug, meta, owner, flags, inArsenal, now) {
	if (meta.notFound) return { slug, lines: ['not found: renamed, moved, deleted or private'], flags: [] };
	if (meta.error) return { slug, lines: ['unchecked: ' + meta.error], flags: [] };
	const spdx = meta.license && meta.license.spdx_id;
	const cls = classifyLicense(spdx);
	const days = Math.max(1, (now - Date.parse(meta.created_at)) / DAY);
	const perDay = meta.stargazers_count / days;
	const out = [];
	if (perDay > 500) out.push('star velocity above 500/day: check provenance before trusting popularity');
	if (owner && owner.created_at && now - Date.parse(owner.created_at) < 180 * DAY) out.push('owner account younger than six months');
	if (meta.pushed_at && now - Date.parse(meta.pushed_at) > 365 * DAY) out.push('no push for over a year');
	if (meta.archived) out.push('archived');
	if (cls === 'trap') out.push(spdx + ' is not safe for paid or customer code');
	if (cls === 'unknown') out.push('license not named by GitHub: read the LICENSE file');
	return {
		slug,
		lines: [
			'license: ' + (spdx || 'none') + ' (' + cls + ')',
			'created ' + String(meta.created_at).slice(0, 10) + ', last push ' + String(meta.pushed_at || '').slice(0, 10),
			'stars ' + meta.stargazers_count + ' (' + perDay.toFixed(1) + ' a day), forks ' + meta.forks_count + ', open issues ' + meta.open_issues_count,
			'owner ' + (owner && owner.login || '?') + ', account created ' + String(owner && owner.created_at || '?').slice(0, 10) + ', ' + (owner && owner.public_repos != null ? owner.public_repos : '?') + ' repos, ' + (owner && owner.followers != null ? owner.followers : '?') + ' followers',
			'in the arsenal: ' + (inArsenal ? 'yes' : 'no'),
		],
		flags: [...out, ...flags],
	};
}

function main() {
	const [mode, ...args] = process.argv.slice(2);
	const text = () => fs.readFileSync(ARSENAL, 'utf8');
	if (mode === 'audit') {
		const rows = auditNow(text());
		return console.log(rows.length ? rows.map((r) => `${r.level}\t${r.slug}\t${r.note}${r.head ? '  [' + r.head + ']' : ''}`).join('\n') : 'Every listed repo checks out.');
	}
	if (mode === 'scout') return console.log(report('now', [], scout(text(), readSeen(), Date.now())));
	if (mode === 'repo') {
		const slug = args[0] || '';
		if (!/^[\w.-]+\/[\w.-]+$/.test(slug)) {
			console.error('usage: node scripts/tool-scout.js repo owner/name');
			process.exit(2);
		}
		const meta = gh(['repos/' + slug]);
		const owner = meta.notFound || meta.error ? null : gh(['users/' + slug.split('/')[0]]);
		const flags = meta.notFound || meta.error ? [] : readmeFlags(slug);
		const card = repoCard(slug, meta, owner && !owner.notFound ? owner : null, flags, arsenalSlugs(text()).has(slug.toLowerCase()), Date.now());
		return console.log([card.slug, ...card.lines.map((l) => '  ' + l), ...card.flags.map((f) => '  FLAG ' + f)].join('\n'));
	}
	if (mode === 'run') {
		const i = args.indexOf('--date');
		const date = i >= 0 ? args[i + 1] : new Date().toISOString().slice(0, 10);
		const r = run(date);
		return console.log(`Tool scout ${date}: ${r.drift} drift rows, ${r.candidates} new candidates.`);
	}
	console.error('usage: node scripts/tool-scout.js audit|scout|run [--date YYYY-MM-DD]|repo owner/name');
	process.exit(2);
}

if (require.main === module) main();

module.exports = { repoCard, isStatusLine, classifyLicense, detectLicenses, parseArsenal, slugsIn, auditRepo, audit, arsenalSlugs, slugInRecentIssueTitles, filterRankedCandidates, rank, report, CORNERS };
