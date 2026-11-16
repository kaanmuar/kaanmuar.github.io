#!/usr/bin/env node
/**
 * afterFileEdit / afterTabFileEdit — Biome format for JS/TS/JSON (#3552).
 * Scope: any matching ext except media/ and social/. Fail-open.
 * Prettier (Markdown/HTML) is scaffolded but not run here yet (Q9C later).
 */
'use strict';

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const biomeBin = path.join(root, 'node_modules', '@biomejs', 'biome', 'bin', 'biome');

const EXT = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.json']);
const DENY_PREFIXES = [
	'media/',
	'social/',
	'assets/',
	'data/',
	'android/',
	'node_modules/',
	'.worktrees/',
	'coverage/',
	'playwright-report/',
	'test-results/',
];

function relFromRoot(abs) {
	const resolved = path.resolve(abs);
	if (!resolved.startsWith(root + path.sep) && resolved !== root) return null;
	return path.relative(root, resolved).split(path.sep).join('/');
}

function allowed(rel) {
	if (!rel || rel.includes('..')) return false;
	if (DENY_PREFIXES.some((p) => rel === p.slice(0, -1) || rel.startsWith(p))) return false;
	return EXT.has(path.extname(rel).toLowerCase());
}

function main() {
	let raw = '';
	try {
		raw = fs.readFileSync(0, 'utf8');
	} catch {
		process.exit(0);
	}
	if (!raw.trim()) process.exit(0);

	let payload;
	try {
		payload = JSON.parse(raw);
	} catch {
		process.exit(0);
	}

	const filePath = payload.file_path || payload.filePath || '';
	if (!filePath) process.exit(0);

	const rel = relFromRoot(filePath);
	if (!allowed(rel)) process.exit(0);
	if (!fs.existsSync(filePath) || !fs.existsSync(biomeBin)) process.exit(0);

	spawnSync(process.execPath, [biomeBin, 'format', '--write', '--files-ignore-unknown=true', filePath], {
		cwd: root,
		stdio: 'ignore',
		timeout: 20000,
	});
	process.exit(0);
}

main();
