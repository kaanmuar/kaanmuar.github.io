#!/usr/bin/env node
'use strict';
/*
 * Bounded pruning for the quota / usage stores (#3836): keep the last N days and/or at most N bytes.
 * Clean-room take on the pattern CodexBar, ccusage and tokscale (all MIT) use for their local usage caches;
 * no code copied. Zero dependencies (node:sqlite, Node >= 22.5).
 *
 *   node scripts/usage-prune.js csv [file] [--keep-days 365] [--max-bytes 5242880] [--dry-run]
 *       Work log (cursor-usage/work-log.csv, header + start_utc,end_utc,ticket,...). Drops oldest rows by start_utc.
 *   node scripts/usage-prune.js sqlite <db> --table T --ts-col C [--ts-type iso|epoch-ms|epoch-s]
 *                               [--keep-days N] [--max-bytes N] [--dry-run]
 *       Any SQLite usage/quota cache we own. WAL-safe: BEGIN IMMEDIATE, bounded rounds, checkpoint(TRUNCATE), VACUUM.
 *
 * Never opens Cursor's own state.vscdb (CursorQuota reads it read-only for the access token): refused by name.
 * scripts/ticket.sh log prune wraps the csv mode.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const DAY_MS = 86400000;
const DEFAULT_KEEP_DAYS = 365;
const DEFAULT_CSV_MAX_BYTES = 5 * 1024 * 1024;
const MAX_ROUNDS = 8;
const DEFAULT_LOG = path.join(
	os.homedir(),
	'Library/Application Support/Cursor/AgentStores/cursor_agent_stores/u452212433/files/cursor-usage/work-log.csv'
);
const PROTECTED = /(^|[\\/])state\.vscdb(-wal|-shm)?$/;

function assertLimits(opts) {
	const { keepDays, maxBytes } = opts;
	if (keepDays == null && maxBytes == null) throw new Error('give keepDays and/or maxBytes (refusing an unbounded prune)');
	if (keepDays != null && !(keepDays > 0)) throw new Error('keepDays must be > 0');
	if (maxBytes != null && !(maxBytes > 0)) throw new Error('maxBytes must be > 0');
}

/** Split CSV text into raw record strings (quote-aware: quoted fields may hold newlines). */
function splitRecords(text) {
	const out = [];
	let start = 0;
	let inQuotes = false;
	for (let i = 0; i < text.length; i += 1) {
		const c = text[i];
		if (c === '"') inQuotes = !inQuotes;
		else if (c === '\n' && !inQuotes) {
			out.push(text.slice(start, i));
			start = i + 1;
		}
	}
	if (start < text.length) out.push(text.slice(start));
	return out;
}

function firstField(rec) {
	const m = /^"((?:[^"]|"")*)"|^([^,]*)/.exec(rec);
	return m ? (m[1] != null ? m[1].replace(/""/g, '"') : m[2]) : '';
}

/**
 * Prune a CSV log. First record is the header and is always kept; a row whose first field is not a parseable
 * timestamp is kept (never guess). Written atomically (temp file + rename).
 */
function pruneCsv(file, opts = {}) {
	assertLimits(opts);
	const now = opts.now != null ? opts.now : Date.now();
	if (PROTECTED.test(file)) throw new Error('refusing to prune ' + file);
	const text = fs.readFileSync(file, 'utf8');
	const bytesBefore = Buffer.byteLength(text);
	const recs = splitRecords(text.replace(/\r\n/g, '\n'));
	const header = recs.length ? [recs[0]] : [];
	const rows = recs.slice(1).map((raw, i) => ({ raw, i, t: Date.parse(firstField(raw)) }));
	let kept = rows;
	let removedAge = 0;
	if (opts.keepDays != null) {
		const cutoff = now - opts.keepDays * DAY_MS;
		kept = rows.filter((r) => Number.isNaN(r.t) || r.t >= cutoff);
		removedAge = rows.length - kept.length;
	}
	let removedSize = 0;
	const size = (list) => Buffer.byteLength(header.concat(list.map((r) => r.raw)).join('\n') + '\n');
	if (opts.maxBytes != null && size(kept) > opts.maxBytes) {
		// Oldest first; rows with no timestamp sort last so they are dropped last.
		const order = kept.slice().sort((a, b) => (Number.isNaN(a.t) ? Infinity : a.t) - (Number.isNaN(b.t) ? Infinity : b.t) || a.i - b.i);
		const drop = new Set();
		let total = size(kept);
		for (const r of order) {
			if (total <= opts.maxBytes) break;
			drop.add(r);
			total -= Buffer.byteLength(r.raw) + 1;
		}
		kept = kept.filter((r) => !drop.has(r));
		removedSize = drop.size;
	}
	const bytesAfter = removedAge + removedSize > 0 ? size(kept) : bytesBefore;
	if (!opts.dryRun && removedAge + removedSize > 0) {
		const tmp = file + '.prune-' + process.pid;
		fs.writeFileSync(tmp, header.concat(kept.map((r) => r.raw)).join('\n') + '\n');
		fs.renameSync(tmp, file);
	}
	return { kind: 'csv', file, rowsBefore: rows.length, rowsAfter: kept.length, removedAge, removedSize, bytesBefore, bytesAfter, dryRun: !!opts.dryRun };
}

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;
function ident(name, what) {
	if (!IDENT.test(name || '')) throw new Error('bad ' + what + ' identifier: ' + name);
	return '"' + name + '"';
}

function fileBytes(p) {
	try {
		return fs.statSync(p).size;
	} catch {
		return 0;
	}
}
/** Disk footprint = main file + WAL. (-shm is a fixed-size index, not usage data.) */
function footprint(db) {
	return fileBytes(db) + fileBytes(db + '-wal');
}

function cutoffValue(type, ms) {
	if (type === 'epoch-ms') return Math.floor(ms);
	if (type === 'epoch-s') return Math.floor(ms / 1000);
	return new Date(ms).toISOString();
}

/**
 * Prune a SQLite table by age and/or on-disk size, safe with concurrent writers/readers in WAL mode:
 * short IMMEDIATE transactions, busy_timeout, then wal_checkpoint(TRUNCATE) and VACUUM so the file really shrinks.
 * ts type: 'iso' (ISO-8601 text, sorts lexically), 'epoch-ms', 'epoch-s'.
 */
function pruneSqlite(dbPath, opts = {}) {
	assertLimits(opts);
	if (PROTECTED.test(dbPath)) throw new Error("refusing to prune Cursor's own " + path.basename(dbPath));
	if (!fs.existsSync(dbPath)) throw new Error('no such database: ' + dbPath);
	const { DatabaseSync } = require('node:sqlite');
	const table = ident(opts.table, 'table');
	const col = ident(opts.tsColumn, 'ts column');
	const tsType = opts.tsType || 'iso';
	const now = opts.now != null ? opts.now : Date.now();
	const db = new DatabaseSync(dbPath);
	try {
		db.exec('PRAGMA busy_timeout = ' + (Number.isInteger(opts.busyMs) ? opts.busyMs : 5000));
		const count = () => db.prepare('SELECT COUNT(*) AS n FROM ' + table).get().n;
		const rowsBefore = count();
		const bytesBefore = footprint(dbPath);
		let removedAge = 0;
		let removedSize = 0;
		if (opts.dryRun) {
			if (opts.keepDays != null) {
				removedAge = db
					.prepare('SELECT COUNT(*) AS n FROM ' + table + ' WHERE ' + col + ' < ?')
					.get(cutoffValue(tsType, now - opts.keepDays * DAY_MS)).n;
			}
			return { kind: 'sqlite', file: dbPath, rowsBefore, rowsAfter: rowsBefore - removedAge, removedAge, removedSize: 0, bytesBefore, bytesAfter: bytesBefore, dryRun: true };
		}
		db.exec('PRAGMA journal_mode = WAL');
		// A busy reader/writer can block checkpoint/VACUUM: the rows are already deleted, so skip and retry next run.
		let shrinkSkipped = false;
		const shrink = () => {
			try {
				db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
				db.exec('VACUUM');
				db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
			} catch (e) {
				if (!/locked|busy/i.test(e.message)) throw e;
				shrinkSkipped = true;
			}
		};
		if (opts.keepDays != null) {
			db.exec('BEGIN IMMEDIATE');
			try {
				removedAge = Number(
					db.prepare('DELETE FROM ' + table + ' WHERE ' + col + ' < ?').run(cutoffValue(tsType, now - opts.keepDays * DAY_MS)).changes
				);
				db.exec('COMMIT');
			} catch (e) {
				db.exec('ROLLBACK');
				throw e;
			}
			if (removedAge > 0) shrink();
		}
		if (opts.maxBytes != null) {
			// Bounded: at most MAX_ROUNDS shrink passes, always keeping the newest row.
			for (let round = 0; round < MAX_ROUNDS; round += 1) {
				if (shrinkSkipped) break;
				const size = footprint(dbPath);
				const rows = count();
				if (size <= opts.maxBytes || rows <= 1) break;
				const drop = Math.min(rows - 1, Math.max(1, Math.ceil(rows * (1 - opts.maxBytes / size) * 1.1)));
				db.exec('BEGIN IMMEDIATE');
				try {
					removedSize += Number(
						db
							.prepare('DELETE FROM ' + table + ' WHERE rowid IN (SELECT rowid FROM ' + table + ' ORDER BY ' + col + ' ASC, rowid ASC LIMIT ?)')
							.run(drop).changes
					);
					db.exec('COMMIT');
				} catch (e) {
					db.exec('ROLLBACK');
					throw e;
				}
				shrink();
			}
		}
		return { kind: 'sqlite', file: dbPath, rowsBefore, rowsAfter: count(), removedAge, removedSize, bytesBefore, bytesAfter: footprint(dbPath), dryRun: false, shrinkSkipped };
	} finally {
		db.close();
	}
}

function parseArgs(argv) {
	const o = { _: [] };
	for (let i = 0; i < argv.length; i += 1) {
		const a = argv[i];
		if (a === '--dry-run') o.dryRun = true;
		else if (a === '--keep-days') o.keepDays = Number(argv[++i]);
		else if (a === '--max-bytes') o.maxBytes = Number(argv[++i]);
		else if (a === '--table') o.table = argv[++i];
		else if (a === '--ts-col') o.tsColumn = argv[++i];
		else if (a === '--ts-type') o.tsType = argv[++i];
		else if (a.startsWith('--')) throw new Error('unknown flag ' + a);
		else o._.push(a);
	}
	return o;
}

function main(argv) {
	const [mode, ...rest] = argv;
	const o = parseArgs(rest);
	let res;
	if (mode === 'csv') {
		if (o.keepDays == null && o.maxBytes == null) {
			o.keepDays = DEFAULT_KEEP_DAYS;
			o.maxBytes = DEFAULT_CSV_MAX_BYTES;
		}
		res = pruneCsv(o._[0] || DEFAULT_LOG, o);
	} else if (mode === 'sqlite') {
		if (!o._[0]) throw new Error('sqlite mode needs a db path');
		res = pruneSqlite(o._[0], o);
	} else {
		throw new Error('usage: usage-prune.js csv [file] | sqlite <db> --table T --ts-col C  [--keep-days N] [--max-bytes N] [--dry-run]');
	}
	const verb = res.dryRun ? 'would prune' : 'pruned';
	console.log(
		`${verb} ${res.kind} ${path.basename(res.file)}: ${res.rowsBefore} -> ${res.rowsAfter} rows ` +
			`(age ${res.removedAge}, size ${res.removedSize}), ${res.bytesBefore} -> ${res.bytesAfter} bytes`
	);
	return res;
}

if (require.main === module) {
	try {
		main(process.argv.slice(2));
	} catch (e) {
		console.error('usage-prune: ' + e.message);
		process.exit(1);
	}
}

module.exports = { pruneCsv, pruneSqlite, splitRecords, DEFAULT_KEEP_DAYS, DEFAULT_CSV_MAX_BYTES };
