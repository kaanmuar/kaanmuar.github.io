#!/usr/bin/env node
/* Update per-clip status in data/live-reports-social-batch.json (#4459).

     node scripts/live-reports-social-status.js --rendered --batch auto-2026-11-27
     node scripts/live-reports-social-status.js --posted --batch auto-2026-11-27
     node scripts/live-reports-social-status.js --rendered u-example-com   # one id, batch from file */

const { transitionBatchFile } = require('./live-reports-social-queue');

function args() {
	const out = { ids: [] };
	const argv = process.argv.slice(2);
	for (let i = 0; i < argv.length; i += 1) {
		const raw = argv[i];
		if (raw === '--') {
			out.ids = out.ids.concat(argv.slice(i + 1));
			break;
		}
		if (!raw.startsWith('--')) {
			out.ids.push(raw);
			continue;
		}
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
	const toStatus = opts.rendered ? 'rendered' : opts.posted ? 'posted' : null;
	if (!toStatus) {
		console.error('Pass --rendered or --posted');
		process.exit(1);
	}
	const result = transitionBatchFile(toStatus, {
		batch: typeof opts.batch === 'string' ? opts.batch : undefined,
		ids: opts.ids.length ? opts.ids : undefined,
	});
	console.log(
		['status=' + toStatus, 'changed=' + result.changed, 'pending=' + result.counts.pending]
			.concat(['rendered=' + result.counts.rendered, 'posted=' + result.counts.posted])
			.join(' ')
	);
	if (process.env.GITHUB_OUTPUT) {
		const fs = require('fs');
		fs.appendFileSync(
			process.env.GITHUB_OUTPUT,
			'changed=' + result.changed + '\npending=' + result.counts.pending + '\n'
		);
	}
}

if (require.main === module) main();