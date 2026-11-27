#!/usr/bin/env node
/* Restore a retained Live Reports social batch into previews/auto-live-reports/batch.json (#1853).

     node scripts/live-reports-restore-batch.js --batch auto-2026-11-20
     node scripts/live-reports-restore-batch.js --batch auto-2026-11-20 --keep-status
*/

const { restoreRetainedBatch } = require('./live-reports-social-queue');

function args() {
	const out = {};
	const argv = process.argv.slice(2);
	for (let i = 0; i < argv.length; i += 1) {
		const raw = argv[i];
		if (!raw.startsWith('--')) continue;
		const key = raw.slice(2);
		const next = argv[i + 1];
		if (next === undefined || next.startsWith('--')) out[key] = true;
		else {
			out[key] = next;
			i += 1;
		}
	}
	return out;
}

function main() {
	const opts = args();
	const batch = typeof opts.batch === 'string' ? opts.batch : '';
	if (!batch) {
		console.error('Pass --batch auto-YYYY-MM-DD');
		process.exit(1);
	}
	const result = restoreRetainedBatch(batch, { keepStatus: !!opts['keep-status'] });
	console.log('restored ' + result.posts + ' posts from ' + result.path);
}

if (require.main === module) main();