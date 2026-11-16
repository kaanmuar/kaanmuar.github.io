#!/usr/bin/env node
/* Bootstrap / control the finished-report re-run (#3458).

   node scripts/rerun-past.js --from-firestore           count hosts from live url_reviews (no write)
   node scripts/rerun-past.js --from-firestore --write   upsert pending host docs and set status running
   node scripts/rerun-past.js --bootstrap <file.json> [--write]
   node scripts/rerun-past.js --start | --pause | --resume

   Live reviews need PAST_RERUN_LIVE=1 and SWEEP_LIVE=1 on the functions. Uses the signed-in gcloud account. */
'use strict';

const fs = require('fs');
const path = require('path');
const Module = require('module');
const { execSync } = require('child_process');
const past = require('../functions/url-review-rerun-past');

const PROJECT = process.env.GCLOUD_PROJECT || 'carlosm-interactive-cv';
const FN = path.join(__dirname, '..', 'functions');
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const argValue = (name) => {
	const i = args.indexOf(name);
	return i >= 0 ? args[i + 1] : '';
};
const gcloud = (cmd) => execSync('gcloud ' + cmd, { encoding: 'utf8' }).trim();
const fnRequire = Module.createRequire(path.join(FN, 'index.js'));

function db() {
	const { Firestore } = fnRequire('@google-cloud/firestore');
	const { OAuth2Client } = fnRequire('google-auth-library');
	const fresh = () => ({ access_token: gcloud('auth print-access-token'), expiry_date: Date.now() + 45 * 60000 });
	const authClient = new OAuth2Client({ quotaProjectId: PROJECT });
	authClient.refreshHandler = async () => fresh();
	authClient.setCredentials(fresh());
	return new Firestore({ projectId: PROJECT, authClient });
}

function loadRows(file) {
	const raw = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
	return Array.isArray(raw) ? raw : raw.reviews || raw.rows || [];
}

function summarize(hosts) {
	const by = { visitor: 0, rival: 0, sweep: 0 };
	let withMail = 0;
	hosts.forEach((h) => {
		by[h.kind] = (by[h.kind] || 0) + 1;
		if (
			past.mailAddress(h, {
				stops: new Set(),
				contacted: h.kind === 'visitor' ? new Set([h.email]) : new Set(h.contacted ? [h.email] : []),
			})
		)
			withMail += 1;
	});
	return { hosts: hosts.length, by, withMail };
}

async function contactedEmails(store) {
	const set = new Set();
	const [notes, launch, ownerLog] = await Promise.all([
		store
			.collection('url_review_notes')
			.where('status', 'in', ['sent', 'delivered'])
			.select('email')
			.limit(2000)
			.get()
			.catch(() => ({ docs: [] })),
		store
			.collection('url_review_campaigns')
			.doc('launch-2026-12')
			.collection('sends')
			.where('state', '==', 'sent')
			.select()
			.get()
			.catch(() => ({ docs: [] })),
		store
			.collection('url_review_owner_notice_log')
			.select('email')
			.limit(2000)
			.get()
			.catch(() => ({ docs: [] })),
	]);
	notes.docs.forEach((doc) => {
		const e = past.emailOf(doc.get('email'));
		if (e) set.add(e);
	});
	ownerLog.docs.forEach((doc) => {
		const e = past.emailOf(doc.get('email'));
		if (e) set.add(e);
	});
	launch.docs.forEach((doc) => set.add(doc.id));
	return set;
}

async function rowsFromFirestore(store) {
	const snap = await store
		.collection('url_reviews')
		.select(
			'email',
			'status',
			'source',
			'lang',
			'createdAt',
			'test',
			'sweep',
			'rivalsAt',
			'requestedUrl',
			'report.host'
		)
		.get();
	return snap.docs.map((doc) => Object.assign({ id: doc.id }, doc.data()));
}

async function writeHosts(store, hosts) {
	const ref = past.campaignRef(store);
	let written = 0;
	for (const host of hosts) {
		const doc = past.hostRef(store, host.bare);
		const snap = await doc.get();
		if (snap.exists && snap.get('state') && snap.get('state') !== 'pending') continue;
		await doc.set(
			{
				host: host.host,
				bare: host.bare,
				kind: host.kind,
				email: host.email || '',
				lang: host.lang || 'en',
				priorId: host.priorId || '',
				contacted: host.contacted === true,
				state: 'pending',
				at: new Date(host.at || Date.now()).toISOString(),
			},
			{ merge: true }
		);
		written += 1;
	}
	await ref.set(
		{
			status: 'running',
			hosts: hosts.length,
			reviewed: 0,
			mailed: 0,
			skipped: 0,
			ticket: 3458,
			updatedAt: new Date().toISOString(),
		},
		{ merge: true }
	);
	return { written, hosts: hosts.length, status: 'running' };
}

function markContacted(hosts, contacted) {
	return hosts.map((h) => {
		const email = past.emailOf(h.email);
		const known =
			(h.kind === 'visitor' && !!email) || (email && (contacted.has(email) || contacted.has(past.hashOf(email))));
		return Object.assign({}, h, { contacted: !!known });
	});
}

async function main() {
	if (flag('--start') || flag('--pause') || flag('--resume')) {
		const store = db();
		const status = flag('--pause') ? 'paused' : 'running';
		await past.campaignRef(store).set({ status, updatedAt: new Date().toISOString(), ticket: 3458 }, { merge: true });
		console.log(JSON.stringify({ ok: true, status, id: past.ID }));
		return;
	}

	let rows = [];
	let contacted = new Set();
	if (flag('--from-firestore')) {
		const store = db();
		rows = await rowsFromFirestore(store);
		contacted = await contactedEmails(store);
		const hosts = markContacted(past.hostsFromReviews(rows), contacted);
		console.log(JSON.stringify(Object.assign({ rows: rows.length }, summarize(hosts)), null, 2));
		if (!flag('--write')) return;
		console.log(JSON.stringify(await writeHosts(store, hosts)));
		return;
	}

	const file = argValue('--bootstrap') || argValue('--dry-run') || args.find((a) => a.endsWith('.json'));
	if (!file) {
		console.error(
			'Usage: node scripts/rerun-past.js --from-firestore [--write] | --bootstrap <reviews.json> [--write] | --start | --pause | --resume'
		);
		process.exit(1);
	}
	const hosts = markContacted(past.hostsFromReviews(loadRows(file)), contacted);
	console.log(JSON.stringify(summarize(hosts), null, 2));
	if (!flag('--write')) return;
	console.log(JSON.stringify(await writeHosts(db(), hosts)));
}

main().catch((err) => {
	console.error((err && err.stack) || err);
	process.exit(1);
});
