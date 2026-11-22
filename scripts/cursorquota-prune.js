#!/usr/bin/env node
'use strict';
/*
 * Operator hook for CursorQuota SQLite pruning (#3836).
 *
 * CursorQuota (kaanmuar/cursor-quota, outside this monorepo) stores JSON under
 *   ~/Library/Application Support/CursorQuota/  (cache.json, events.json, …)
 * and only opens Cursor's own state.vscdb read-only for the access token — never prune that.
 * Today it has no SQLite store of its own. When a future *.db / *.sqlite appears under the
 * support dir (or CURSOR_QUOTA_DB), this wrapper invokes scripts/usage-prune.js (PR #4160)
 * with safe defaults. Missing DB or missing usage-prune.js → no-op exit 0.
 *
 * Operator:
 *   node scripts/cursorquota-prune.js [--dry-run] [--keep-days 365] [--max-bytes 5242880]
 *     [--db PATH] [--table T] [--ts-col C] [--ts-type iso|epoch-ms|epoch-s]
 *
 * Env overrides (same names): CURSOR_QUOTA_DB, CURSOR_QUOTA_PRUNE_TABLE (default usage),
 * CURSOR_QUOTA_PRUNE_TS_COL (default ts), CURSOR_QUOTA_PRUNE_TS_TYPE (default iso),
 * CURSOR_QUOTA_SUPPORT (default ~/Library/Application Support/CursorQuota).
 *
 * Direct call once a DB exists and usage-prune.js is on the branch:
 *   node scripts/usage-prune.js sqlite "$HOME/Library/Application Support/CursorQuota/usage.db" \
 *     --table usage --ts-col ts --ts-type iso --keep-days 365 --max-bytes 5242880
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const DAY_DEFAULT = 365;
const BYTES_DEFAULT = 5 * 1024 * 1024;
const PROTECTED = /(^|[\\/])state\.vscdb(-wal|-shm)?$/i;
const DB_NAME = /\.(db|sqlite|sqlite3)$/i;

function defaultSupportDir() {
	return (
		process.env.CURSOR_QUOTA_SUPPORT ||
		path.join(os.homedir(), 'Library/Application Support/CursorQuota')
	);
}

/** List candidate DBs under the support dir (never state.vscdb). */
function listQuotaDbs(supportDir) {
	let names;
	try {
		names = fs.readdirSync(supportDir);
	} catch {
		return [];
	}
	return names
		.filter((n) => DB_NAME.test(n) && !PROTECTED.test(n))
		.map((n) => path.join(supportDir, n))
		.filter((p) => {
			try {
				return fs.statSync(p).isFile();
			} catch {
				return false;
			}
		})
		.sort();
}

function resolveDb(opts) {
	if (opts.db) return opts.db;
	if (process.env.CURSOR_QUOTA_DB) return process.env.CURSOR_QUOTA_DB;
	const found = listQuotaDbs(opts.supportDir || defaultSupportDir());
	return found[0] || null;
}

function parseArgs(argv) {
	const o = {
		keepDays: DAY_DEFAULT,
		maxBytes: BYTES_DEFAULT,
		table: process.env.CURSOR_QUOTA_PRUNE_TABLE || 'usage',
		tsColumn: process.env.CURSOR_QUOTA_PRUNE_TS_COL || 'ts',
		tsType: process.env.CURSOR_QUOTA_PRUNE_TS_TYPE || 'iso',
		supportDir: defaultSupportDir(),
		dryRun: false,
		db: null,
	};
	for (let i = 0; i < argv.length; i += 1) {
		const a = argv[i];
		if (a === '--dry-run') o.dryRun = true;
		else if (a === '--keep-days') o.keepDays = Number(argv[++i]);
		else if (a === '--max-bytes') o.maxBytes = Number(argv[++i]);
		else if (a === '--db') o.db = argv[++i];
		else if (a === '--table') o.table = argv[++i];
		else if (a === '--ts-col') o.tsColumn = argv[++i];
		else if (a === '--ts-type') o.tsType = argv[++i];
		else if (a === '--support-dir') o.supportDir = argv[++i];
		else if (a === '--help' || a === '-h') o.help = true;
		else throw new Error('unknown flag ' + a);
	}
	return o;
}

function usagePrunePath() {
	return path.join(__dirname, 'usage-prune.js');
}

/**
 * Run prune for one DB. Returns { status: 'noop'|'ok'|'error', ... }.
 * Exported for tests.
 */
function pruneOnce(opts = {}) {
	const db = resolveDb(opts);
	if (!db) {
		return {
			status: 'noop',
			reason: 'no CursorQuota SQLite DB under ' + (opts.supportDir || defaultSupportDir()),
		};
	}
	if (PROTECTED.test(db)) {
		return { status: 'error', reason: "refusing to prune Cursor's " + path.basename(db) };
	}
	if (!fs.existsSync(db)) {
		return { status: 'noop', reason: 'no such database: ' + db };
	}
	const pruneJs = opts.usagePrunePath || usagePrunePath();
	if (!fs.existsSync(pruneJs)) {
		return {
			status: 'noop',
			reason:
				'usage-prune.js not on this branch yet (see PR #4160); when present, run: node scripts/usage-prune.js sqlite ' +
				JSON.stringify(db) +
				' --table ' +
				(opts.table || 'usage') +
				' --ts-col ' +
				(opts.tsColumn || 'ts') +
				' --ts-type ' +
				(opts.tsType || 'iso') +
				' --keep-days ' +
				(opts.keepDays != null ? opts.keepDays : DAY_DEFAULT) +
				' --max-bytes ' +
				(opts.maxBytes != null ? opts.maxBytes : BYTES_DEFAULT),
			db,
		};
	}
	const args = [
		pruneJs,
		'sqlite',
		db,
		'--table',
		opts.table || 'usage',
		'--ts-col',
		opts.tsColumn || 'ts',
		'--ts-type',
		opts.tsType || 'iso',
		'--keep-days',
		String(opts.keepDays != null ? opts.keepDays : DAY_DEFAULT),
		'--max-bytes',
		String(opts.maxBytes != null ? opts.maxBytes : BYTES_DEFAULT),
	];
	if (opts.dryRun) args.push('--dry-run');
	const run = opts.spawnSync || spawnSync;
	const res = run(process.execPath, args, { encoding: 'utf8' });
	if (res.status !== 0) {
		return {
			status: 'error',
			reason: (res.stderr || res.stdout || 'usage-prune failed').trim(),
			db,
			code: res.status,
		};
	}
	return { status: 'ok', db, output: (res.stdout || '').trim() };
}

function main(argv) {
	const o = parseArgs(argv);
	if (o.help) {
		console.log(
			'node scripts/cursorquota-prune.js [--dry-run] [--db PATH] [--table T] [--ts-col C] [--keep-days N] [--max-bytes N]'
		);
		return 0;
	}
	const r = pruneOnce(o);
	if (r.status === 'noop') {
		console.log('cursorquota-prune: ' + r.reason);
		return 0;
	}
	if (r.status === 'error') {
		console.error('cursorquota-prune: ' + r.reason);
		return 1;
	}
	if (r.output) console.log(r.output);
	return 0;
}

if (require.main === module) {
	try {
		process.exit(main(process.argv.slice(2)));
	} catch (e) {
		console.error('cursorquota-prune: ' + e.message);
		process.exit(1);
	}
}

module.exports = {
	listQuotaDbs,
	resolveDb,
	pruneOnce,
	defaultSupportDir,
	DAY_DEFAULT,
	BYTES_DEFAULT,
};
