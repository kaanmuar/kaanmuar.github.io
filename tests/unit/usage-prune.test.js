const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pruneCsv, pruneSqlite, splitRecords } = require('../../scripts/usage-prune');

const NOW = Date.parse('2026-11-21T12:00:00Z');
const daysAgo = (n) => new Date(NOW - n * 86400000).toISOString();
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'usage-prune-'));

describe('work-log csv prune (#3836)', () => {
	const header = 'start_utc,end_utc,ticket,title,chat_id,notes';
	test('drops rows older than keepDays, keeps header, open and unparseable rows are judged by start only', () => {
		const dir = tmp();
		const f = path.join(dir, 'work-log.csv');
		fs.writeFileSync(
			f,
			[
				header,
				`${daysAgo(400)},${daysAgo(399)},1,old,c,`,
				`${daysAgo(10)},${daysAgo(9)},2,"new, with ""quote""",c,`,
				`${daysAgo(1)},,3,open,c,`,
				`not-a-date,,4,weird,c,`,
			].join('\n') + '\n'
		);
		const r = pruneCsv(f, { keepDays: 365, now: NOW });
		assert.equal(r.removedAge, 1);
		const out = fs.readFileSync(f, 'utf8').trim().split('\n');
		assert.equal(out[0], header);
		assert.equal(out.length, 4);
		assert.match(out[1], /"new, with ""quote"""/);
		assert.ok(out.some((l) => l.includes('weird')));
		assert.deepEqual(fs.readdirSync(dir), ['work-log.csv']);
	});

	test('keeps quoted multi-line records whole', () => {
		const recs = splitRecords(`${header}\n${daysAgo(1)},,1,"two\nlines",c,\n`);
		assert.equal(recs.length, 2);
		assert.match(recs[1], /two\nlines/);
	});

	test('maxBytes drops the oldest rows first and respects the cap', () => {
		const dir = tmp();
		const f = path.join(dir, 'work-log.csv');
		const rows = Array.from({ length: 50 }, (_, i) => `${daysAgo(50 - i)},,${i},t${i},chat,`);
		fs.writeFileSync(f, [header, ...rows].join('\n') + '\n');
		const cap = 700;
		const r = pruneCsv(f, { maxBytes: cap, now: NOW });
		assert.ok(r.removedSize > 0);
		assert.ok(fs.statSync(f).size <= cap);
		const text = fs.readFileSync(f, 'utf8');
		assert.ok(text.includes(',t49,'), 'newest row kept');
		assert.ok(!text.includes(',t0,'), 'oldest row dropped');
	});

	test('dry run and the no-limit case change nothing', () => {
		const dir = tmp();
		const f = path.join(dir, 'work-log.csv');
		const body = `${header}\n${daysAgo(900)},,1,old,c,\n`;
		fs.writeFileSync(f, body);
		const r = pruneCsv(f, { keepDays: 30, now: NOW, dryRun: true });
		assert.equal(r.removedAge, 1);
		assert.equal(fs.readFileSync(f, 'utf8'), body);
		assert.throws(() => pruneCsv(f, {}), /unbounded/);
	});

	test("refuses Cursor's state.vscdb", () => {
		assert.throws(() => pruneCsv('/x/globalStorage/state.vscdb', { keepDays: 1 }), /refusing/);
		assert.throws(() => pruneSqlite('/x/globalStorage/state.vscdb', { keepDays: 1, table: 't', tsColumn: 'c' }), /refusing/);
	});
});

describe('sqlite prune (#3836)', () => {
	const { DatabaseSync } = require('node:sqlite');
	function seed(type, n, payload = 'x'.repeat(2000)) {
		const dir = tmp();
		const file = path.join(dir, 'usage.db');
		const db = new DatabaseSync(file);
		db.exec('PRAGMA journal_mode = WAL');
		db.exec('CREATE TABLE snapshots (id INTEGER PRIMARY KEY, ts ' + (type === 'iso' ? 'TEXT' : 'INTEGER') + ', blob TEXT)');
		const ins = db.prepare('INSERT INTO snapshots (ts, blob) VALUES (?, ?)');
		for (let i = 0; i < n; i += 1) {
			const ms = NOW - (n - i) * 86400000;
			ins.run(type === 'iso' ? new Date(ms).toISOString() : type === 'epoch-s' ? Math.floor(ms / 1000) : ms, payload);
		}
		db.close();
		return file;
	}
	const rows = (file) => {
		const db = new DatabaseSync(file);
		const n = db.prepare('SELECT COUNT(*) AS n FROM snapshots').get().n;
		db.close();
		return n;
	};

	for (const type of ['iso', 'epoch-ms', 'epoch-s']) {
		test(`keepDays prunes by ${type} timestamps and truncates the WAL`, () => {
			const file = seed(type, 60);
			const r = pruneSqlite(file, { table: 'snapshots', tsColumn: 'ts', tsType: type, keepDays: 30, now: NOW });
			assert.equal(r.removedAge, 30);
			assert.equal(rows(file), 30);
			assert.equal(fs.existsSync(file + '-wal') ? fs.statSync(file + '-wal').size : 0, 0);
			assert.ok(r.bytesAfter < r.bytesBefore);
		});
	}

	test('maxBytes bounds the on-disk size and keeps the newest rows', () => {
		const file = seed('iso', 200);
		const before = fs.statSync(file).size;
		const cap = Math.floor(before / 4);
		const r = pruneSqlite(file, { table: 'snapshots', tsColumn: 'ts', maxBytes: cap, now: NOW });
		assert.ok(r.removedSize > 0);
		assert.ok(r.bytesAfter <= cap, `${r.bytesAfter} <= ${cap}`);
		const db = new DatabaseSync(file);
		const newest = db.prepare('SELECT MAX(ts) AS m FROM snapshots').get().m;
		db.close();
		assert.equal(newest, new Date(NOW - 86400000).toISOString());
	});

	test('a cap smaller than one row still keeps the newest row', () => {
		const file = seed('iso', 20);
		pruneSqlite(file, { table: 'snapshots', tsColumn: 'ts', maxBytes: 1, now: NOW });
		assert.equal(rows(file), 1);
	});

	test('does not block or corrupt a concurrent WAL reader', () => {
		const file = seed('iso', 40);
		const reader = new DatabaseSync(file);
		reader.exec('PRAGMA busy_timeout = 2000');
		reader.exec('BEGIN');
		const seen = reader.prepare('SELECT COUNT(*) AS n FROM snapshots').get().n;
		pruneSqlite(file, { table: 'snapshots', tsColumn: 'ts', keepDays: 10, now: NOW, busyMs: 100 });
		assert.equal(reader.prepare('SELECT COUNT(*) AS n FROM snapshots').get().n, seen, 'reader keeps its snapshot');
		reader.exec('COMMIT');
		assert.equal(reader.prepare('SELECT COUNT(*) AS n FROM snapshots').get().n, 10);
		assert.equal(reader.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
		reader.close();
	});

	test('dry run deletes nothing; bad identifiers and missing db are rejected', () => {
		const file = seed('iso', 20);
		const r = pruneSqlite(file, { table: 'snapshots', tsColumn: 'ts', keepDays: 5, now: NOW, dryRun: true });
		assert.equal(r.removedAge, 15);
		assert.equal(rows(file), 20);
		assert.throws(() => pruneSqlite(file, { table: 'snapshots; DROP TABLE x', tsColumn: 'ts', keepDays: 5 }), /bad table/);
		assert.throws(() => pruneSqlite(file, { table: 'snapshots', tsColumn: 'ts' }), /unbounded/);
		assert.throws(() => pruneSqlite(path.join(tmp(), 'nope.db'), { table: 't', tsColumn: 'c', keepDays: 1 }), /no such database/);
	});
});
