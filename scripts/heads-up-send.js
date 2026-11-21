#!/usr/bin/env node
/* The security heads-up send path (#3997, parent #3992). Rules and the send gate live in
   functions/url-review-heads-up-send.js; the pure gate and copy in functions/url-review-heads-up.js.

   node scripts/heads-up-send.js                         dry run: the drafts the gate would queue now, and the queue (no writes, no mail)
   node scripts/heads-up-send.js --queue --write         files each passing draft in url_review_heads_up/<domain> as "pending" (still no mail)
   node scripts/heads-up-send.js --show <domain>         prints one queued draft in full, for the person who approves it
   node scripts/heads-up-send.js --approve <domain>      Carlos only: records his approval of that one draft, on a terminal,
                                                         signed in to gcloud as the owner
   node scripts/heads-up-send.js --send --confirm heads-up-send
                                                         mails the approved drafts (at most 10 in 7 days, one per domain),
                                                         and only while HEADS_UP_SEND=on is in functions/.env

   HEADS_UP_SEND stays unset until native speakers have reviewed the copy (#3996). Uses the signed-in gcloud account.
   Never run --approve or --send for Carlos. */
const fs = require('fs');
const path = require('path');
const Module = require('module');
const readline = require('readline');
const crypto = require('crypto');
const { execSync } = require('child_process');

const PROJECT = process.env.GCLOUD_PROJECT || 'carlosm-interactive-cv';
const FN = path.join(__dirname, '..', 'functions');
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const value = (name) => {
	const i = argv.indexOf(name);
	return i > -1 ? argv[i + 1] : '';
};
const REVIEW_FN_URL =
	process.env.REVIEW_FN_URL || 'https://us-central1-carlosm-interactive-cv.cloudfunctions.net/reviewUrl';

const env = {};
try {
	fs.readFileSync(path.join(FN, '.env'), 'utf8')
		.split('\n')
		.forEach((line) => {
			const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
			if (m) env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
		});
} catch (error) {
	/* no functions/.env: every flag is off */
}
const gcloud = (args) => execSync('gcloud ' + args, { encoding: 'utf8' }).trim();
const fnRequire = Module.createRequire(path.join(FN, 'index.js'));
const send = require('../functions/url-review-heads-up-send');
const ownerNotice = require('../functions/url-review-owner-notice');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const DAY = 864e5;

function db() {
	const { Firestore } = fnRequire('@google-cloud/firestore');
	const { OAuth2Client } = fnRequire('google-auth-library');
	const fresh = () => ({ access_token: gcloud('auth print-access-token'), expiry_date: Date.now() + 45 * 60000 });
	const authClient = new OAuth2Client({ quotaProjectId: PROJECT });
	authClient.refreshHandler = async () => fresh();
	authClient.setCredentials(fresh());
	return new Firestore({ projectId: PROJECT, authClient });
}

function mailer() {
	const sgMail = fnRequire('@sendgrid/mail');
	const key =
		process.env.SENDGRID_API_KEY ||
		env.SENDGRID_API_KEY ||
		gcloud('secrets versions access latest --secret=SENDGRID_API_KEY --project ' + PROJECT);
	const from = env.SENDGRID_FROM;
	if (!key || !from) throw new Error('SendGrid key or SENDGRID_FROM is missing.');
	sgMail.setApiKey(key);
	return { sgMail, from };
}

const queue = (store) => store.collection(send.COLLECTION);

async function queueRows(store) {
	const snap = await queue(store).get();
	return snap.docs.map((doc) => Object.assign({ domain: doc.id }, doc.data()));
}

// What the pure gate needs for one threat: the site's contacts and language, the opt-outs, and the domain's last notice.
function context(store, stops) {
	const reviews = new Map();
	return async (threat, row) => {
		const id = String(threat.review_id || '');
		if (!reviews.has(id)) {
			reviews.set(id, id ? (await store.collection('url_reviews').doc(id).get()).data() || null : null);
		}
		const report = (reviews.get(id) || {}).report || {};
		const domain = ownerNotice.domainOf(String(threat.host || ''));
		const notice = (await store.collection('url_review_owner_notices').doc(domain).get()).data() || null;
		const sentAt = notice && notice.status === 'sent' ? notice.sentAt || notice.decidedAt || null : null;
		const own = row && row.status === 'sent' ? row.sentAt : null;
		return {
			now: Date.now(),
			found: (report.contacts && report.contacts.found) || [],
			lang: ownerNotice.noticeLang(report),
			stopped: stops,
			lastNoticeAt: own || sentAt || null,
		};
	};
}

async function stopSet(store) {
	const snap = await store.collection('url_review_owner_stops').select().get();
	return new Set(snap.docs.map((doc) => String(doc.id).toLowerCase()));
}

async function freshThreats(store) {
	const since = new Date(Date.now() - 7 * DAY).toISOString();
	const snap = await store.collection('url_review_threats').where('observed_at', '>=', since).limit(1000).get();
	return snap.docs.map((doc) => Object.assign({ id: doc.id }, doc.data()));
}

async function plan(store) {
	const [threats, stops, rows] = await Promise.all([freshThreats(store), stopSet(store), queueRows(store)]);
	const ctxOf = context(store, stops);
	const ctxs = new Map();
	for (const threat of threats) ctxs.set(threat.id, await ctxOf(threat, null));
	const taken = rows.map((row) => row.domain);
	return { rows, drafts: send.candidates(threats, (threat) => ctxs.get(threat.id), taken), threats };
}

async function dryRun() {
	const store = db();
	const { rows, drafts } = await plan(store);
	const by = (status) => rows.filter((row) => row.status === status).length;
	console.log(
		'DRY RUN: ' +
			drafts.length +
			' new drafts would be queued. Queue: ' +
			by('pending') +
			' pending, ' +
			by('approved') +
			' approved, ' +
			by('sent') +
			' sent (' +
			send.sentThisWeek(rows, Date.now()) +
			' of ' +
			send.WEEK_CAP +
			' used in the last 7 days).'
	);
	drafts.forEach((row) => console.log('  ' + row.domain + ' -> ' + row.to + ' [' + row.lang + '] ' + row.kind));
	console.log('Send flag ' + send.FLAG + ': ' + (send.enabled(env) ? 'on' : 'off'));
}

async function fileQueue() {
	if (!flag('--write')) return dryRun();
	const store = db();
	const { drafts } = await plan(store);
	for (const row of drafts) {
		try {
			await queue(store).doc(row.domain).create(row);
			console.log('Queued ' + row.domain);
		} catch (error) {
			console.log('Skipped ' + row.domain + ': ' + (error.message || error));
		}
	}
}

async function show() {
	const domain = value('--show');
	const row = (await queue(db()).doc(domain).get()).data();
	if (!row) throw new Error('No queued draft for ' + domain + '.');
	console.log(
		'status ' + row.status + ' | to ' + row.to + ' | ' + row.lang + '\nSubject: ' + row.subject + '\n\n' + row.text
	);
}

async function approve() {
	const domain = value('--approve');
	const store = db();
	const ref = queue(store).doc(domain);
	const row = (await ref.get()).data();
	if (!row) throw new Error('No queued draft for ' + domain + '.');
	const account = gcloud('config get-value account').toLowerCase();
	const result = send.approval(row, account, Date.now());
	if (!result.ok) throw new Error('Cannot approve: ' + send.REASONS[result.why]);
	if (!process.stdin.isTTY) throw new Error('Approve on a terminal: the approval asks for a typed confirmation.');
	console.log('To ' + row.to + ' (' + row.lang + ')\nSubject: ' + row.subject + '\n\n' + row.text + '\n');
	const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
	const typed = await new Promise((resolve) =>
		rl.question('Type "I approve the heads-up to ' + domain + '" to approve: ', resolve)
	);
	rl.close();
	if (typed.trim() !== 'I approve the heads-up to ' + domain) throw new Error('Not approved.');
	await ref.set(result.patch, { merge: true });
	console.log(
		'Approved ' + domain + '. Nothing is sent until HEADS_UP_SEND=on and --send --confirm ' + send.CONFIRM + '.'
	);
}

async function sendAll() {
	if (!send.enabled(env)) {
		throw new Error('Held: ' + send.REASONS['env-off'] + ' Nothing was sent.');
	}
	const store = db();
	const { sgMail, from } = mailer();
	const rows = await queueRows(store);
	const stops = await stopSet(store);
	const ctxOf = context(store, stops);
	const threats = new Map();
	const tally = await send.sendApproved({
		env,
		confirm: value('--confirm'),
		now: Date.now(),
		rows,
		from,
		threatFor: async (row) => {
			const snap = await store
				.collection('url_review_threats')
				.doc(row.threatId || '-')
				.get();
			const threat = snap.exists ? Object.assign({ id: snap.id }, snap.data()) : null;
			threats.set(row.domain, threat);
			return threat;
		},
		contextFor: async (row) => (threats.get(row.domain) ? ctxOf(threats.get(row.domain), row) : {}),
		mintLink: async (row) => {
			const token = crypto.randomBytes(16).toString('hex');
			await store.collection('url_review_owner_links').doc(token).set(send.linkRow(row, Date.now()));
			return {
				stop: REVIEW_FN_URL + '/owner?t=' + token + '&do=stop',
				replyTo: 'reply+' + token + '@' + env.OWNER_REPLY_DOMAIN,
			};
		},
		send: (msg) => sgMail.send(msg),
		record: (row, patch) => queue(store).doc(row.domain).set(patch, { merge: true }),
		pause: () => sleep(send.PAUSE_MS),
	});
	console.log(JSON.stringify(tally));
}

const job = flag('--approve')
	? approve
	: flag('--send')
		? sendAll
		: flag('--show')
			? show
			: flag('--queue')
				? fileQueue
				: dryRun;
job().then(
	() => process.exit(0),
	(error) => {
		console.error(error.message || error);
		process.exit(1);
	}
);
