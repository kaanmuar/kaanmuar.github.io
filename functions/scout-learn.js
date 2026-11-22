'use strict';
/*
 * Shared scout learn loop (#4237). Private to Carlos and the scouts — never public hub/PR
 * copy. Every scout reflects after a run: lessons, odds, exceptions, in-scope knowledge,
 * and (on a cadence) questions with decision options. Authoritative store is Firestore
 * (jarvis_settings/scout-learn-<scout>); CLI may cache under scripts/scout-learn/<scout>.json
 * for the scout itself. Jarvis Learn tab reads jarvisBundle / source().
 * Nothing here edits tool-arsenal.mdc.
 */
const fs = require('fs');
const path = require('path');

const DAY = 86400000;
const DEFAULT_DIR = path.join(__dirname, '..', 'scripts', 'scout-learn');
const SCOUTS = ['tool', 'engagement', 'field-sweep', 'trending'];
const ASK_EVERY_MS = { tool: 7 * DAY, engagement: 2 * DAY, 'field-sweep': 3 * DAY, trending: 3 * DAY };
const MAX = { lessons: 12, knowledge: 40, odds: 8, exceptions: 12, questions: 5, asked: 30 };

const text = (v, n) =>
	String(v === null || v === undefined ? '' : v)
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, n || 240);

const clip = (list, n) => (Array.isArray(list) ? list : []).filter(Boolean).slice(0, n);

const filePath = (scout) => path.join(module.exports.DIR || DEFAULT_DIR, scout + '.json');
const stateDoc = (scout) => 'scout-learn-' + scout;

/** Decision buttons on open questions (Jarvis Learn tab). */
const OPTIONS = {
	tool: [
		{ id: 'ticket', label: 'Ticket it' },
		{ id: 'skip', label: 'Skip' },
		{ id: 'suppress', label: 'known.json' },
		{ id: 'later', label: 'Ask later' },
	],
	engagement: [
		{ id: 'fix', label: 'Fix it' },
		{ id: 'pause', label: 'Keep as-is' },
		{ id: 'ignore', label: 'Ignore' },
		{ id: 'later', label: 'Ask later' },
	],
	'field-sweep': [
		{ id: 'approve', label: 'Approve in hub' },
		{ id: 'dismiss', label: 'Dismiss' },
		{ id: 'expand-sources', label: 'Expand sources' },
		{ id: 'later', label: 'Ask later' },
	],
	trending: [
		{ id: 'wire-ui', label: 'Wire #3814' },
		{ id: 'keep-file', label: 'Keep file-only' },
		{ id: 'drop', label: 'Drop scout' },
		{ id: 'later', label: 'Ask later' },
	],
};

function withOptions(scout, q) {
	const opts = OPTIONS[scout] || OPTIONS.tool;
	return Object.assign({}, q, { options: (q && q.options) || opts, private: true });
}

function emptyState(scout) {
	return {
		scout,
		runs: 0,
		at: '',
		private: true,
		lessons: [],
		knowledge: [],
		exceptions: [],
		odds: [],
		openQuestions: [],
		asked: [],
		askedAt: '',
		lastStats: {},
	};
}

function normalizeScout(name) {
	const s = text(name, 40);
	if (s === 'field') return 'field-sweep';
	return SCOUTS.includes(s) ? s : 'tool';
}

/** Build lessons / odds / questions from one run's stats. */
function analyze(scout, stats, prior, now) {
	const s = stats || {};
	const at = new Date(now).toISOString();
	const lessons = [];
	const odds = [];
	const exceptions = [];
	const knowledge = [];
	const questions = [];

	if (scout === 'tool') {
		const drift = Number(s.drift) || 0;
		const candidates = Number(s.candidates) || 0;
		const traps = Number(s.traps) || 0;
		const flags = Number(s.flags) || 0;
		if (drift) lessons.push(drift + ' arsenal drift row' + (drift === 1 ? '' : 's') + ' need a human look.');
		if (candidates) lessons.push(candidates + ' new candidate' + (candidates === 1 ? '' : 's') + '; ticket only what fits a corner.');
		if (!drift && !candidates) lessons.push('Arsenal checked clean; no new usable candidates this week.');
		if (traps) lessons.push(traps + ' trap/unknown license hit' + (traps === 1 ? '' : 's') + ' kept out of the usable list.');
		if (flags) lessons.push(flags + ' README flag' + (flags === 1 ? '' : 's') + ' on permissive/attribution hits.');
		odds.push({
			id: 'usable-candidates',
			p: candidates ? Math.min(0.85, 0.35 + candidates * 0.08) : 0.15,
			claim: candidates ? candidates + ' candidates may deserve an arsenal ticket' : 'quiet week; low chance of a new arsenal row',
		});
		if (drift)
			odds.push({
				id: 'drift-real',
				p: Math.min(0.9, 0.5 + drift * 0.1),
				claim: drift + ' drift row' + (drift === 1 ? '' : 's') + ' likely need a row update or known.json suppress',
			});
		(s.corners || []).forEach((c) => {
			if (c && c.usable)
				knowledge.push({
					key: 'tool:corner:' + c.id,
					text: 'Corner ' + c.id + ' (' + text(c.name, 60) + '): ' + c.usable + ' usable, ' + (c.traps || 0) + ' traps',
					at,
				});
		});
		exceptions.push({ id: 'no-auto-arsenal', reason: 'Scout never edits tool-arsenal.mdc; Carlos tickets each row.' });
		if (candidates)
			questions.push({
				id: 'tool:ticket-candidates',
				text: 'Ticket any of this week\'s ' + candidates + ' tool-scout candidates, skip them, or add suppressions to known.json?',
				why: 'new arsenal candidates',
			});
		if (drift)
			questions.push({
				id: 'tool:drift-' + drift,
				text: 'Resolve ' + drift + ' arsenal drift row' + (drift === 1 ? '' : 's') + ': update the row, suppress in known.json, or leave?',
				why: 'arsenal drift',
			});
	} else if (scout === 'engagement') {
		const fresh = Number(s.fresh) || 0;
		const drafted = Number(s.drafted) || 0;
		const readTotal = s.read ? Object.values(s.read).reduce((a, b) => a + Number(b || 0), 0) : 0;
		if (fresh) lessons.push(fresh + ' fresh post' + (fresh === 1 ? '' : 's') + ' ingested.');
		if (drafted) lessons.push(drafted + ' reply draft' + (drafted === 1 ? '' : 's') + ' waiting for review.');
		if (readTotal) lessons.push(readTotal + ' posts read across networks.');
		if (s.paused) lessons.push('Engagement is paused; learning still records the envelope.');
		if (s.aiError) lessons.push('Gemini: ' + text(s.aiError, 120));
		(s.needs || []).slice(0, 4).forEach((need) => lessons.push('Need: ' + text(need, 160)));
		const errN = s.errors ? Object.keys(s.errors).length : 0;
		if (errN) exceptions.push({ id: 'read-errors', reason: errN + ' network read error' + (errN === 1 ? '' : 's') + ' this run.' });
		exceptions.push({ id: 'human-gate-replies', reason: 'Reply drafts stay human-gated; discovery/competitor posts get no AI reply.' });
		odds.push({
			id: 'draft-worth',
			p: drafted ? Math.min(0.8, 0.3 + drafted * 0.05) : 0.2,
			claim: drafted ? drafted + ' drafts may be worth posting after review' : 'no new drafts this run',
		});
		if (fresh)
			knowledge.push({ key: 'engagement:fresh', text: fresh + ' fresh / ' + drafted + ' drafted at ' + at.slice(0, 16), at });
		(s.needs || []).slice(0, 3).forEach((need) =>
			questions.push({ id: 'engagement:need:' + text(need, 40).replace(/\W+/g, '_'), text: text(need, 200), why: 'meta-scout need' })
		);
		if (drafted > 5)
			questions.push({
				id: 'engagement:backlog',
				text: drafted + ' reply drafts waiting — raise the worth bar, pause a network, or clear the queue first?',
				why: 'draft backlog',
			});
	} else if (scout === 'field-sweep') {
		const proposed = Number(s.proposed) || 0;
		const sources = Number(s.sources) || 0;
		const failed = Number(s.failedSources) || 0;
		lessons.push(proposed + ' field proposal' + (proposed === 1 ? '' : 's') + ' ranked for the Social hub.');
		if (failed) lessons.push(failed + ' source' + (failed === 1 ? '' : 's') + ' failed this sweep.');
		odds.push({
			id: 'hub-approve',
			p: proposed ? Math.min(0.75, 0.25 + proposed * 0.02) : 0.1,
			claim: proposed ? 'some of ' + proposed + ' proposals may clear the Social hub gate' : 'no proposals this run',
		});
		exceptions.push({ id: 'discovery-only', reason: 'Field-sweep posts are discovery-only in engagement; approve/dismiss in the Social hub.' });
		knowledge.push({ key: 'field:last', text: proposed + ' proposals from ' + sources + ' sources (' + failed + ' failed)', at });
		if (proposed)
			questions.push({
				id: 'field:approve',
				text: 'Approve any of the ' + proposed + ' field-sweep proposals, dismiss them, or expand scripts/field-sweep/sources.js?',
				why: 'Social hub proposals',
			});
		if (failed)
			questions.push({
				id: 'field:sources',
				text: failed + ' field-sweep source' + (failed === 1 ? '' : 's') + ' failed — fix, replace, or ignore this week?',
				why: 'source health',
			});
	} else if (scout === 'trending') {
		const drafts = Number(s.drafts) || 0;
		const tags = Number(s.tags) || 0;
		lessons.push(drafts + ' trending-tag draft' + (drafts === 1 ? '' : 's') + ' queued (review-only, no auto-post).');
		if (tags) lessons.push(tags + ' distinct tag' + (tags === 1 ? '' : 's') + ' this run.');
		odds.push({
			id: 'trend-fit',
			p: drafts ? Math.min(0.7, 0.3 + drafts * 0.05) : 0.15,
			claim: drafts ? drafts + ' drafts may fit after Jarvis review' : 'no trending drafts',
		});
		exceptions.push({ id: 'no-autopost', reason: 'Trending drafts never set trendSafe or approved; #3814 stays review-only until wired.' });
		knowledge.push({ key: 'trending:last', text: drafts + ' drafts / ' + tags + ' tags', at });
		questions.push({
			id: 'trending:wire-ui',
			text: 'Wire scout-drafts.json into Jarvis Engagement (#3814), keep the review-only file, or drop the trending scout?',
			why: 'trending drafts still orphaned from UI',
		});
	}

	const lastAsk = prior && prior.askedAt ? Date.parse(prior.askedAt) : 0;
	const askDue = !lastAsk || now - lastAsk >= (ASK_EVERY_MS[scout] || 3 * DAY);
	const answeredIds = new Set(((prior && prior.asked) || []).map((q) => q.id));
	const openIds = new Set(((prior && prior.openQuestions) || []).map((q) => q.id));
	const freshQuestions = askDue
		? questions
				.filter((q) => q && q.id && !answeredIds.has(q.id) && !openIds.has(q.id))
				.map((q) => withOptions(scout, Object.assign({ at, scout }, q)))
				.slice(0, MAX.questions)
		: [];

	return {
		lessons: clip(lessons, MAX.lessons),
		odds: clip(odds, MAX.odds),
		exceptions: clip(exceptions, MAX.exceptions),
		knowledge: clip(knowledge, 12),
		openQuestions: freshQuestions,
		askDue,
		at,
		private: true,
	};
}

function mergeKnowledge(prior, next) {
	const map = new Map();
	clip(prior, MAX.knowledge).forEach((k) => k && k.key && map.set(k.key, k));
	clip(next, MAX.knowledge).forEach((k) => k && k.key && map.set(k.key, k));
	return Array.from(map.values())
		.sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')))
		.slice(0, MAX.knowledge);
}

function mergeQuestions(priorOpen, fresh, askedIds) {
	const answered = new Set(askedIds || []);
	const map = new Map();
	clip(priorOpen, MAX.questions * 4).forEach((q) => {
		if (q && q.id && !answered.has(q.id)) map.set(q.id, q);
	});
	clip(fresh, MAX.questions).forEach((q) => {
		if (q && q.id && !answered.has(q.id)) map.set(q.id, q);
	});
	return Array.from(map.values()).slice(0, MAX.questions * 4);
}

function applyAnalysis(prior, analysis, stats, scout) {
	const askedIds = (prior.asked || []).map((q) => q.id);
	const open = mergeQuestions(prior.openQuestions, analysis.openQuestions, askedIds).map((q) =>
		withOptions(scout, q)
	);
	return {
		scout,
		runs: (prior.runs || 0) + 1,
		at: analysis.at,
		private: true,
		lessons: clip((analysis.lessons || []).concat(prior.lessons || []), MAX.lessons),
		knowledge: mergeKnowledge(prior.knowledge, analysis.knowledge),
		exceptions: clip((analysis.exceptions || []).concat(prior.exceptions || []), MAX.exceptions),
		odds: clip(analysis.odds || [], MAX.odds),
		openQuestions: open,
		asked: prior.asked || [],
		askedAt: analysis.askDue && (analysis.openQuestions || []).length ? analysis.at : prior.askedAt || '',
		lastStats: stats || {},
	};
}

function jarvisSlice(state) {
	const s = state || emptyState('tool');
	const scout = s.scout || 'tool';
	return {
		scout,
		runs: s.runs || 0,
		at: s.at || '',
		private: true,
		cadenceMs: ASK_EVERY_MS[scout] || 3 * DAY,
		lessons: clip(s.lessons, 6),
		openQuestions: clip(s.openQuestions, MAX.questions).map((q) => withOptions(scout, q)),
		odds: clip(s.odds, 5),
		exceptions: clip(s.exceptions, 5),
		knowledge: clip(s.knowledge, 8),
		asked: clip(s.asked, 8),
		waiting: (s.openQuestions || []).length,
	};
}

/** Private note for the scout / Carlos only — never append to public PR reports. */
function reportMarkdown(state) {
	const slice = jarvisSlice(state);
	const lines = ['## Learn (#4237, private)', '', '_For Carlos and the scouts only. Not for public posts or draft PR bodies._', ''];
	(slice.lessons || []).forEach((l) => lines.push('- ' + l));
	if ((slice.odds || []).length) {
		lines.push('', '### Odds', '');
		lines.push('| Finding | p | Claim |', '|---|---|---|');
		slice.odds.forEach((o) =>
			lines.push('| `' + text(o.id, 40) + '` | ' + o.p + ' | ' + text(o.claim, 120).replace(/\|/g, '/') + ' |')
		);
	}
	if ((slice.openQuestions || []).length) {
		lines.push('', '### Questions for Carlos', '');
		slice.openQuestions.forEach((q) => {
			const opts = (q.options || []).map((o) => o.label).join(' / ');
			lines.push('- **' + text(q.text, 200) + '** _(' + text(q.why, 100) + ')_' + (opts ? ' → ' + opts : ''));
		});
	} else {
		lines.push('', '_No new questions this run (or ask cadence not due)._');
	}
	return lines.join('\n') + '\n';
}

function readFile(scout) {
	try {
		return Object.assign(emptyState(scout), JSON.parse(fs.readFileSync(filePath(scout), 'utf8')));
	} catch (_) {
		return emptyState(scout);
	}
}

function writeFile(scout, state) {
	fs.mkdirSync(module.exports.DIR || DEFAULT_DIR, { recursive: true });
	fs.writeFileSync(filePath(scout), JSON.stringify(state, null, '\t') + '\n');
	return state;
}

/**
 * CLI cache only (private). Authoritative store is Firestore via learnDb / upsertState.
 */
function learnFile(scoutName, stats, nowMs) {
	const scout = normalizeScout(scoutName);
	const now = Number(nowMs) || Date.now();
	const prior = readFile(scout);
	const analysis = analyze(scout, stats, prior, now);
	const state = applyAnalysis(prior, analysis, stats, scout);
	writeFile(scout, state);
	return {
		slice: jarvisSlice(state),
		markdown: reportMarkdown(state),
		asked: analysis.openQuestions || [],
		state,
		private: true,
	};
}

/** Best-effort push of the local learn cache into Firestore so the Learn tab stays live. */
async function syncFile(scoutName, db) {
	const scout = normalizeScout(scoutName);
	const state = readFile(scout);
	if (!state.runs && !(state.openQuestions || []).length) return null;
	let store = db;
	if (!store) {
		try {
			const Module = require('module');
			const fnRequire = Module.createRequire(path.join(__dirname, 'index.js'));
			const { Firestore } = fnRequire('@google-cloud/firestore');
			const projectId = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || 'carlosm-interactive-cv';
			store = new Firestore({ projectId });
		} catch (_) {
			return null;
		}
	}
	try {
		return await upsertState(store, state);
	} catch (_) {
		return null;
	}
}

async function loadDb(db, scoutName) {
	const scout = normalizeScout(scoutName);
	if (!db) return emptyState(scout);
	const snap = await db.collection('jarvis_settings').doc(stateDoc(scout)).get();
	return snap.exists ? Object.assign(emptyState(scout), snap.data()) : emptyState(scout);
}

/** Write a full state doc (e.g. sync CLI/tool-scout-data into Firestore). */
async function upsertState(db, state) {
	if (!db || !state || !state.scout) return null;
	const scout = normalizeScout(state.scout);
	const row = Object.assign(emptyState(scout), state, { scout, private: true });
	await db.collection('jarvis_settings').doc(stateDoc(scout)).set(row, { merge: true });
	return row;
}

/**
 * Cloud path: update jarvis_settings/scout-learn-<scout> (authoritative).
 */
async function learnDb(db, scoutName, stats, nowMs) {
	const scout = normalizeScout(scoutName);
	const now = Number(nowMs) || Date.now();
	const prior = await loadDb(db, scout);
	const analysis = analyze(scout, stats, prior, now);
	const state = applyAnalysis(prior, analysis, stats, scout);
	await db.collection('jarvis_settings').doc(stateDoc(scout)).set(state);
	await db
		.collection('scout_learn_runs')
		.doc(scout + '-' + state.at.replace(/[:.]/g, '-'))
		.set({
			scout,
			at: state.at,
			private: true,
			lessons: analysis.lessons,
			odds: analysis.odds,
			questions: analysis.openQuestions,
			askDue: analysis.askDue,
		})
		.catch(() => null);
	return { slice: jarvisSlice(state), state, asked: analysis.openQuestions || [], private: true };
}

async function jarvisBundle(db, nowMs) {
	const now = Number(nowMs) || Date.now();
	const scouts = [];
	for (const scout of SCOUTS) {
		const state = await loadDb(db, scout);
		if (state.runs > 0 || (state.openQuestions || []).length) scouts.push(jarvisSlice(state));
	}
	const openQuestions = scouts.flatMap((s) => (s.openQuestions || []).map((q) => Object.assign({ scout: s.scout }, q))).slice(0, 12);
	return {
		ok: true,
		private: true,
		at: new Date(now).toISOString(),
		scouts,
		openQuestions,
		waiting: openQuestions.length,
		asked: scouts.flatMap((s) => s.asked || []).slice(0, 12),
		cadence: ASK_EVERY_MS,
	};
}

/** Jarvis external source for the Learn tab (live, short TTL). */
async function source(ctx) {
	const db = ctx && ctx.db;
	const now = (ctx && ctx.now) || Date.now();
	const bundle = await jarvisBundle(db, now);
	return Object.assign({ needs: [] }, bundle);
}

/** Push open learn questions into jarvis_ai_proposals so Jarvis proposals can show them. */
async function publishAiProposals(db, slice, nowMs) {
	if (!db || !slice) return 0;
	const now = Number(nowMs) || Date.now();
	const questions = clip(slice.openQuestions, MAX.questions);
	let n = 0;
	for (const q of questions) {
		const key = 'scout:' + text(q.id, 100);
		await db
			.collection('jarvis_ai_proposals')
			.doc(key.replace(/[^\w:.-]/g, '_'))
			.set({
				key,
				title: text(q.text, 120),
				why: text(q.why || 'scout learn', 200),
				scout: slice.scout || q.scout || '',
				at: new Date(now).toISOString(),
				until: new Date(now + 7 * DAY).toISOString(),
				source: 'scout-learn',
			});
		n += 1;
	}
	return n;
}

async function answer(db, { id, status, note, option }, by, nowMs) {
	const qid = text(id, 120);
	if (!qid) throw new Error('Which scout question?');
	const scoutHint = String(qid).split(':')[0];
	const scout = normalizeScout(scoutHint === 'field' ? 'field-sweep' : scoutHint);
	const prior = await loadDb(db, scout);
	const found = (prior.openQuestions || []).find((q) => q.id === qid);
	if (option === 'later') {
		return { id: qid, status: 'later', text: found ? found.text : qid, deferred: true };
	}
	const openQuestions = (prior.openQuestions || []).filter((q) => q.id !== qid);
	const optLabel =
		option && found && Array.isArray(found.options)
			? ((found.options.find((o) => o.id === option) || {}).label || option)
			: '';
	const row = {
		id: qid,
		status: status === 'dismissed' || option === 'skip' || option === 'ignore' || option === 'dismiss' || option === 'drop' ? 'dismissed' : 'answered',
		note: text(note || optLabel || option || '', 240),
		option: text(option, 40),
		text: found ? found.text : qid,
		at: new Date(Number(nowMs) || Date.now()).toISOString(),
		by: text(by, 120),
		scout,
	};
	const lessons =
		row.status === 'answered' && row.note
			? clip([{ id: 'ans-' + qid, text: 'Carlos: ' + row.note, at: row.at, hits: 1 }].concat(prior.lessons || []).map((l) => (typeof l === 'string' ? l : l.text)).filter(Boolean), MAX.lessons)
			: prior.lessons;
	const state = Object.assign({}, prior, {
		openQuestions,
		asked: clip([row].concat(prior.asked || []), MAX.asked),
		lessons,
		at: row.at,
		private: true,
	});
	await db.collection('jarvis_settings').doc(stateDoc(scout)).set(state);
	return row;
}

module.exports = {
	SCOUTS,
	ASK_EVERY_MS,
	OPTIONS,
	DIR: DEFAULT_DIR,
	emptyState,
	normalizeScout,
	analyze,
	jarvisSlice,
	reportMarkdown,
	learnFile,
	learnDb,
	syncFile,
	loadDb,
	upsertState,
	jarvisBundle,
	source,
	publishAiProposals,
	answer,
	withOptions,
	filePath,
	mergeKnowledge,
	mergeQuestions,
};
