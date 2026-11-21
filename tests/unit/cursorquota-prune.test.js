const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { listQuotaDbs, resolveDb, pruneOnce } = require('../../scripts/cursorquota-prune');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'cq-prune-'));

describe('cursorquota-prune (#3836)', () => {
	test('listQuotaDbs ignores JSON and state.vscdb, finds *.db', () => {
		const dir = tmp();
		fs.writeFileSync(path.join(dir, 'cache.json'), '{}');
		fs.writeFileSync(path.join(dir, 'events.json'), '{}');
		fs.writeFileSync(path.join(dir, 'state.vscdb'), 'x');
		fs.writeFileSync(path.join(dir, 'usage.db'), 'x');
		fs.writeFileSync(path.join(dir, 'hist.sqlite'), 'x');
		assert.deepEqual(listQuotaDbs(dir), [path.join(dir, 'hist.sqlite'), path.join(dir, 'usage.db')]);
	});

	test('resolveDb prefers --db then CURSOR_QUOTA_DB then first support-dir hit', () => {
		const dir = tmp();
		fs.writeFileSync(path.join(dir, 'usage.db'), 'x');
		assert.equal(resolveDb({ db: '/tmp/explicit.db', supportDir: dir }), '/tmp/explicit.db');
		const prev = process.env.CURSOR_QUOTA_DB;
		process.env.CURSOR_QUOTA_DB = '/tmp/env.db';
		try {
			assert.equal(resolveDb({ supportDir: dir }), '/tmp/env.db');
		} finally {
			if (prev == null) delete process.env.CURSOR_QUOTA_DB;
			else process.env.CURSOR_QUOTA_DB = prev;
		}
		assert.equal(resolveDb({ supportDir: dir }), path.join(dir, 'usage.db'));
		assert.equal(resolveDb({ supportDir: tmp() }), null);
	});

	test('pruneOnce no-ops when support dir has no SQLite', () => {
		const dir = tmp();
		fs.writeFileSync(path.join(dir, 'cache.json'), '{}');
		const r = pruneOnce({ supportDir: dir });
		assert.equal(r.status, 'noop');
		assert.match(r.reason, /no CursorQuota SQLite DB/);
	});

	test('pruneOnce refuses state.vscdb', () => {
		const r = pruneOnce({ db: '/tmp/foo/state.vscdb' });
		assert.equal(r.status, 'error');
		assert.match(r.reason, /refusing/);
	});

	test('pruneOnce no-ops with operator hint when usage-prune.js missing', () => {
		const dir = tmp();
		const db = path.join(dir, 'usage.db');
		fs.writeFileSync(db, 'x');
		const r = pruneOnce({
			db,
			usagePrunePath: path.join(dir, 'no-such-usage-prune.js'),
			table: 'usage',
			tsColumn: 'ts',
		});
		assert.equal(r.status, 'noop');
		assert.match(r.reason, /usage-prune\.js not on this branch/);
		assert.match(r.reason, /PR #4160/);
		assert.equal(r.db, db);
	});

	test('pruneOnce forwards safe defaults to usage-prune when present', () => {
		const dir = tmp();
		const db = path.join(dir, 'usage.db');
		const fake = path.join(dir, 'usage-prune.js');
		fs.writeFileSync(db, 'x');
		fs.writeFileSync(fake, 'ok');
		let seen;
		const r = pruneOnce({
			db,
			usagePrunePath: fake,
			dryRun: true,
			keepDays: 90,
			maxBytes: 1024,
			table: 'events',
			tsColumn: 'at',
			tsType: 'epoch-ms',
			spawnSync: (exe, args) => {
				seen = { exe, args };
				return { status: 0, stdout: 'pruned ok\n', stderr: '' };
			},
		});
		assert.equal(r.status, 'ok');
		assert.equal(r.output, 'pruned ok');
		assert.equal(seen.exe, process.execPath);
		assert.deepEqual(seen.args, [
			fake,
			'sqlite',
			db,
			'--table',
			'events',
			'--ts-col',
			'at',
			'--ts-type',
			'epoch-ms',
			'--keep-days',
			'90',
			'--max-bytes',
			'1024',
			'--dry-run',
		]);
	});
});
