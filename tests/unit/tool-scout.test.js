const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const scout = require('../../scripts/tool-scout');
const ops = require('../../functions/ops-schedule');

const NOW = Date.parse('2026-11-19T12:00:00Z');
const ARSENAL = [
	'# Tool arsenal',
	'## Queued',
	'| `zizmorcore/zizmor` & `step-security/harden-runner` | MIT / Apache-2.0 | #3833 | audit |',
	'| `adobe/trustmark` | MIT / Apache-2.0 | #3824 | marks |',
	'## Rejected, license traps and archived exclusions',
	'- **Archived / deprecated:** `openai/skills`, `fluent-ffmpeg/node-fluent-ffmpeg`',
	'- **Traps:** `DIYgod/RSSHub` (`AGPL-3.0`)',
	'## Not evaluated',
	'- `annonerdrenzy/survivalllm`: repo not found',
].join('\n');

test('licenses fall into permissive, attribution, isolate, trap and unknown', () => {
	assert.equal(scout.classifyLicense('MIT'), 'permissive');
	assert.equal(scout.classifyLicense('CC-BY-4.0'), 'attribution');
	assert.equal(scout.classifyLicense('MPL-2.0'), 'isolate');
	assert.equal(scout.classifyLicense('AGPL-3.0'), 'trap');
	assert.equal(scout.classifyLicense('NOASSERTION'), 'unknown');
	assert.equal(scout.classifyLicense(null), 'unknown');
});

test('repo slugs come from backticks and github.com links, never from file paths', () => {
	assert.deepEqual(scout.slugsIn('`scripts/ticket.sh` and `functions/index.js` and `.cursor/rules/x.mdc`'), []);
	assert.deepEqual(scout.slugsIn('see github.com/nutlope/hallmark. and `mlx-community/Kokoro-82M-bf16`'), ['nutlope/hallmark']);
	assert.deepEqual(scout.slugsIn('`a/b` / `c/d.js`'), ['a/b', 'c/d.js']);
});

test('the audit skips Not evaluated, and flags a wrong license, an unreadable one, a missing repo and a wrong archived claim', () => {
	const repos = {
		'zizmorcore/zizmor': { license: { spdx_id: 'MIT' }, pushed_at: '2026-11-18T00:00:00Z' },
		'step-security/harden-runner': { license: { spdx_id: 'Apache-2.0' }, pushed_at: '2026-11-18T00:00:00Z' },
		'adobe/trustmark': { license: { spdx_id: 'NOASSERTION' }, pushed_at: '2026-11-18T00:00:00Z' },
		'openai/skills': { license: null, archived: false, pushed_at: '2026-10-28T00:00:00Z' },
		'fluent-ffmpeg/node-fluent-ffmpeg': { license: { spdx_id: 'MIT' }, archived: true, pushed_at: '2025-01-01T00:00:00Z' },
		'DIYgod/RSSHub': { license: { spdx_id: 'AGPL-3.0' }, archived: false, pushed_at: '2026-11-19T00:00:00Z' },
	};
	const asked = [];
	const rows = scout.audit(ARSENAL, NOW, (slug) => {
		asked.push(slug);
		return repos[slug] || { notFound: true };
	});
	assert.ok(!asked.includes('annonerdrenzy/survivalllm'));
	const by = (slug) => rows.filter((r) => r.slug === slug).map((r) => r.level);
	assert.deepEqual(by('zizmorcore/zizmor'), []);
	assert.deepEqual(by('adobe/trustmark'), ['UNVERIFIED']);
	assert.deepEqual(by('openai/skills'), ['MISMATCH']);
	assert.deepEqual(by('fluent-ffmpeg/node-fluent-ffmpeg'), []);
	assert.deepEqual(by('DIYgod/RSSHub'), []);
});

test('a LICENSE file that GitHub could not name is read: a grant that matches passes, all rights reserved and a wrong grant do not', () => {
	const MIT = 'MIT License\n\nCopyright (c) 2026 X\n\nPermission is hereby granted, free of charge, to any person obtaining a copy';
	assert.deepEqual(scout.detectLicenses(MIT), ['MIT']);
	assert.deepEqual(scout.detectLicenses('Licening\n Apache License\n Version 2.0, January 2004'), ['Apache-2.0']);
	assert.deepEqual(scout.detectLicenses('Copyright 2023 Adobe\nAll Rights Reserved\n'), ['proprietary']);
	assert.deepEqual(scout.detectLicenses('Copyright 2023 Adobe\nAll Rights Reserved.\n\nMIT License\n\nPermission is hereby granted, free of charge, to any person'), ['MIT']);
	assert.deepEqual(scout.detectLicenses('Creative Commons Legal Code\n\nAttribution 3.0 Unported'), ['CC-BY-3.0']);
	assert.deepEqual(scout.detectLicenses('Attribution-NonCommercial-NoDerivs 3.0 Unported'), ['CC-BY-NC']);
	assert.deepEqual(scout.detectLicenses('Copyright 2026 X. All rights reserved. Licensed under the Apache License, Version 2.0 (the "License");'), ['Apache-2.0']);
	const line = { text: '| `x/y` | MIT |', slugs: ['x/y'], claimed: ['MIT'] };
	const meta = { license: { spdx_id: 'NOASSERTION' }, pushed_at: '2026-11-01T00:00:00Z' };
	const levels = (text) => scout.auditRepo(meta, line, 'listed', NOW, text).map((r) => r.level);
	assert.deepEqual(levels(MIT), []);
	assert.deepEqual(levels('Copyright 2023 Adobe\nAll Rights Reserved\n'), ['LICENSE']);
	assert.deepEqual(levels('Apache License\nVersion 2.0, January 2004'), ['MISMATCH']);
	assert.deepEqual(levels('some custom words'), ['UNVERIFIED']);
	assert.deepEqual(levels(''), ['UNVERIFIED']);
});

test('an acknowledged finding is not reported again, and a new one on the same repo still is', () => {
	const repos = { 'zizmorcore/zizmor': { license: { spdx_id: 'GPL-3.0' }, pushed_at: '2026-11-18T00:00:00Z' } };
	const rows = (known) => scout.audit('## Queued\n| `zizmorcore/zizmor` | GPL-3.0 | #1 |', NOW, (slug) => repos[slug], () => '', known).map((r) => r.level);
	assert.deepEqual(rows({}), ['LICENSE']);
	assert.deepEqual(rows({ 'zizmorcore/zizmor|LICENSE': 'pilot, internal' }), []);
	assert.deepEqual(rows({ 'zizmorcore/zizmor|STALE': 'not this one' }), ['LICENSE']);
});

test('a listed repo that is archived, stale, copyleft or off the row license is reported', () => {
	const line = { text: '| `x/y` | MIT |', slugs: ['x/y'], claimed: ['MIT'] };
	const levels = (meta) => scout.auditRepo(meta, line, 'listed', NOW).map((r) => r.level);
	assert.deepEqual(levels({ license: { spdx_id: 'MIT' }, pushed_at: '2026-11-01T00:00:00Z' }), []);
	assert.deepEqual(levels({ license: { spdx_id: 'MIT' }, archived: true, pushed_at: '2026-11-01T00:00:00Z' }), ['ARCHIVED']);
	assert.deepEqual(levels({ license: { spdx_id: 'MIT' }, pushed_at: '2025-01-01T00:00:00Z' }), ['STALE']);
	assert.deepEqual(levels({ license: { spdx_id: 'Apache-2.0' }, pushed_at: '2026-11-01T00:00:00Z' }), ['MISMATCH']);
	assert.deepEqual(scout.auditRepo({ notFound: true }, line, 'listed', NOW).map((r) => r.level), ['MISSING']);
});

test('candidates the arsenal or the scout already knows, forks and archived repos are dropped, and licenses are sorted', () => {
	const known = scout.arsenalSlugs(ARSENAL);
	const hit = (full_name, spdx, extra) => Object.assign({ full_name, license: spdx ? { spdx_id: spdx } : null, stargazers_count: 120, pushed_at: '2026-11-10T00:00:00Z', description: 'd' }, extra);
	const groups = scout.rank(
		[hit('zizmorcore/zizmor', 'MIT'), hit('new/permissive', 'MIT'), hit('new/data', 'CC-BY-4.0'), hit('new/weak', 'MPL-2.0'), hit('new/copyleft', 'AGPL-3.0'), hit('new/nolicense', null), hit('new/fork', 'MIT', { fork: true }), hit('new/old', 'MIT', { archived: true }), hit('new/remover', 'MIT', { description: 'Remove AI watermarks from images' }), hit('new/dl', 'MIT', { description: 'Social media downloader' }), hit('new/wr', 'MIT', { full_name: 'new/watermarks-remover', description: 'strips AI watermarks' }), hit('new/wr2', 'MIT', { description: 'A privacy-first app that strips AI watermarks from content' })],
		known
	);
	assert.deepEqual(groups.permissive.map((c) => c.slug), ['new/permissive']);
	assert.deepEqual(groups.attribution.map((c) => c.slug), ['new/data']);
	assert.deepEqual(groups.isolate.map((c) => c.slug), ['new/weak']);
	assert.deepEqual(groups.trap.map((c) => c.slug), ['new/copyleft']);
	assert.deepEqual(groups.unknown.map((c) => c.slug), ['new/nolicense']);
});

test('the corners run in Carlos\'s order and the report keeps traps out of the usable table', () => {
	assert.deepEqual(scout.CORNERS.map((c) => c.id), ['B', 'C', 'D', 'A']);
	const groups = { permissive: [{ slug: 'new/permissive', license: 'MIT', stars: 10, pushed: '2026-11-10', about: 'a | b', flags: [] }], attribution: [], isolate: [], trap: [{ slug: 'new/copyleft', license: 'AGPL-3.0' }], unknown: [] };
	const md = scout.report('2026-11-19', [{ slug: 'x/y', level: 'MISMATCH', note: 'n' }], [{ corner: scout.CORNERS[0], groups }]);
	assert.match(md, /\| `x\/y` \| MISMATCH \| n \|/);
	assert.match(md, /\| `new\/permissive` \| MIT \(permissive\) \| 10 \|.*under 50 stars/);
	assert.match(md, /Traps and unreadable licenses \(do not bundle\): `new\/copyleft` \(AGPL-3\.0\)/);
	assert.doesNotMatch(md, /\| `new\/copyleft` \|/);
});

test('the weekly workflow and its Jarvis schedule row agree, and the report is a human-gated draft PR', () => {
	const flow = fs.readFileSync(path.join(__dirname, '../../.github/workflows/tool-scout.yml'), 'utf8');
	const row = ops.JOBS.find((j) => j.job === 'tool-scout.yml');
	assert.ok(row, 'ops-schedule lists tool-scout.yml');
	assert.equal(row.host, 'github');
	assert.ok(flow.includes(`cron: '${row.cron}'`), 'the workflow cron is the schedule row cron');
	assert.match(flow, /gh pr create --draft/);
	assert.doesNotMatch(flow, /gh pr merge|--auto/);
});

test('an excluded row that says "not archived" is not read as an archived claim (#3880)', () => {
	const meta = { archived: false, license: { spdx_id: 'NOASSERTION' }, pushed_at: '2026-11-16T00:00:00Z' };
	const levels = (text) => scout.auditRepo(meta, { text, claimed: [] }, 'excluded', NOW).map((r) => r.level);
	assert.deepEqual(levels('`openai/skills` (active, not archived), no license at the repo root'), []);
	assert.deepEqual(levels('`old/tool` is archived'), ['MISMATCH']);
});

test('the scout keeps its memory on the tool-scout-data branch, not in the draft PR (#3891)', () => {
	const flow = fs.readFileSync(path.join(__dirname, '../../.github/workflows/tool-scout.yml'), 'utf8');
	assert.match(flow, /git fetch -q --depth=1 origin tool-scout-data/, 'restores the memory before the run');
	assert.match(flow, /refs\/heads\/tool-scout-data/, 'saves the memory by pushing the data branch');
	assert.ok(!/git add -f[^\n]*seen\.json/.test(flow), 'seen.json never rides on the PR branch');
	assert.ok(flow.indexOf('Open a draft PR') < flow.indexOf("Save the scout's memory"), 'memory is saved only after the PR is opened');
});

test('the README status check reads a status line, not a passing mention (#3901)', () => {
	const flag = (line) => scout.isStatusLine(line);
	assert.equal(flag('# Deprecated'), true);
	assert.equal(flag('⚠️ **Deprecated**: use v2 instead'), true);
	assert.equal(flag('This project is no longer maintained.'), true);
	assert.equal(flag('Status: unmaintained'), true);
	assert.equal(flag('We replaced our deprecated API last year.'), false);
	assert.equal(flag('Unlike unmaintained forks, this one ships every week.'), false);
	assert.equal(flag('Migrating from the deprecated `foo` package? See the guide.'), false);
});

test('repoCard states facts and flags, never a verdict (#4039)', () => {
	const now = Date.parse('2026-11-20T12:00:00Z');
	const meta = { created_at: '2026-11-19T00:00:00Z', pushed_at: '2026-11-19T06:00:00Z', stargazers_count: 3000, forks_count: 10, open_issues_count: 2, archived: false, license: { spdx_id: 'MIT' } };
	const owner = { login: 'someone', created_at: '2026-10-01T00:00:00Z', public_repos: 4, followers: 12 };
	const card = scout.repoCard('someone/tool', meta, owner, ['README asks for stars'], false, now);
	assert.equal(card.slug, 'someone/tool');
	assert.ok(card.lines.some((l) => l.startsWith('license: MIT (permissive)')));
	assert.ok(card.lines.some((l) => l.includes('in the arsenal: no')));
	assert.ok(card.flags.some((f) => /500\/day/.test(f)), 'fast star growth is flagged');
	assert.ok(card.flags.some((f) => /six months/.test(f)), 'a young owner account is flagged');
	assert.ok(card.flags.includes('README asks for stars'));
	assert.ok(!card.flags.some((f) => /recommend|adopt|reject|verdict/i.test(f)), 'no verdict words');
});

test('repoCard reports a missing repo and a copyleft license plainly', () => {
	const now = Date.parse('2026-11-20T12:00:00Z');
	assert.match(scout.repoCard('no/such', { notFound: true }, null, [], false, now).lines[0], /not found/);
	const meta = { created_at: '2020-01-01T00:00:00Z', pushed_at: '2020-02-01T00:00:00Z', stargazers_count: 10, forks_count: 0, open_issues_count: 0, archived: true, license: { spdx_id: 'AGPL-3.0' } };
	const card = scout.repoCard('a/b', meta, null, [], true, now);
	assert.ok(card.flags.some((f) => /archived/.test(f)));
	assert.ok(card.flags.some((f) => /AGPL-3\.0 is not safe/.test(f)));
	assert.ok(card.lines.some((l) => l.includes('in the arsenal: yes')));
});
