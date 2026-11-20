/**
 * Bulk URL reviews (#3737): parse a pasted list or a .txt/.csv (URL only), hard-block bad or
 * duplicate hosts, persist a batch under the account, and track each row through sequential runs.
 * URL syntax matches the review intake (https only); the run itself still goes through core intake.
 */

const BATCH_MAX = 6;
const LISTED_MAX = 40;
const COLLECTION = 'url_review_batches';
const STATES = ['waiting', 'running', 'done', 'failed', 'stopped', 'skipped', 'rescue'];
const ROW_RETRIES = 3;
const HOST_RE = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;

function docId(value) {
	return String(value || '')
		.replace(/[^A-Za-z0-9]/g, '')
		.slice(0, 40);
}

function address(email) {
	return String(email || '')
		.trim()
		.toLowerCase();
}

function ownedBy(row, email) {
	return !!row && address(row.email) === address(email) && !!address(email);
}

// Host key for duplicate checks: matches the review page's siteKey (www. stripped, path dropped).
function hostKey(value) {
	const raw = String(value || '')
		.trim()
		.replace(/^\s*https?:\/\//i, '')
		.replace(/^\/+/, '');
	return raw
		.toLowerCase()
		.split(/[/?#:]/)[0]
		.replace(/\.$/, '')
		.replace(/^www\./, '');
}

function lineUrl(raw) {
	let text = String(raw == null ? '' : raw)
		.replace(/^\uFEFF/, '')
		.trim();
	if (!text || text.charAt(0) === '#') return '';
	// CSV: take the first column; optional header "url".
	if (text.indexOf(',') !== -1 || text.indexOf(';') !== -1) {
		const sep =
			text.indexOf(';') !== -1 && (text.indexOf(',') === -1 || text.indexOf(';') < text.indexOf(',')) ? ';' : ',';
		text = text
			.split(sep)[0]
			.replace(/^["']|["']$/g, '')
			.trim();
	}
	if (!text || /^url$/i.test(text)) return '';
	return text;
}

function publicHttps(raw) {
	const input = String(raw || '').trim();
	const withScheme = input.indexOf('://') === -1 ? 'https://' + input : input;
	let parsed;
	try {
		parsed = new URL(withScheme);
	} catch (error) {
		throw new Error('Enter a valid https URL.');
	}
	if (parsed.protocol !== 'https:') throw new Error('Only https URLs can be reviewed.');
	if (parsed.username || parsed.password) throw new Error('Remove the username and password from the URL.');
	if (parsed.port && parsed.port !== '443') throw new Error('Only the standard https port can be reviewed.');
	const host = parsed.hostname.replace(/\.$/, '').toLowerCase();
	if (
		!host ||
		host === 'localhost' ||
		host.endsWith('.localhost') ||
		host.endsWith('.local') ||
		host.endsWith('.internal')
	) {
		throw new Error('That address is not a public website.');
	}
	if (!HOST_RE.test(host) && !/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) {
		throw new Error('Enter a valid https URL.');
	}
	parsed.hash = '';
	return parsed;
}

function normalizeLine(raw) {
	const text = lineUrl(raw);
	if (!text) return { empty: true };
	if (/\s/.test(text)) return { error: 'space', raw: text };
	try {
		const parsed = publicHttps(text);
		return { url: parsed.toString(), host: parsed.hostname, key: hostKey(parsed.hostname) };
	} catch (error) {
		return {
			error: 'invalid',
			raw: text,
			message: error && error.message ? error.message : 'Enter a valid https URL.',
		};
	}
}

/**
 * Parse pasted text or file contents into a clean URL list, or a hard-block problem.
 * leadUrl: optional current-report URL prepended when the asker opts in (still counts toward BATCH_MAX).
 */
function parseList(text, options) {
	const opts = options || {};
	const lines = String(text == null ? '' : text).split(/\r\n|\n|\r/);
	const fromFile = [];
	const problems = [];
	lines.forEach((line, index) => {
		const row = normalizeLine(line);
		if (row.empty) return;
		if (row.error) {
			problems.push({ line: index + 1, code: row.error, raw: row.raw, message: row.message || '' });
			return;
		}
		fromFile.push(row);
	});
	const leadRaw = opts.leadUrl ? normalizeLine(opts.leadUrl) : null;
	if (opts.leadUrl && leadRaw && leadRaw.error) {
		problems.push({ line: 0, code: leadRaw.error, raw: leadRaw.raw, message: leadRaw.message || '', lead: true });
	}
	const ordered = [];
	if (leadRaw && leadRaw.url) ordered.push(Object.assign({}, leadRaw, { lead: true }));
	fromFile.forEach((row) => ordered.push(row));

	const seen = new Set();
	const urls = [];
	ordered.forEach((row, index) => {
		if (seen.has(row.key)) {
			problems.push({ line: index + 1, code: 'duplicate', raw: row.url, host: row.host });
			return;
		}
		seen.add(row.key);
		urls.push({ url: row.url, host: row.host, key: row.key, lead: index === 0 });
	});

	if (problems.length) {
		return { error: 'fix the list before starting.', code: 'listInvalid', problems, max: BATCH_MAX };
	}
	if (urls.length < 2) {
		return { error: 'Enter at least two https addresses.', code: 'needTwo', max: BATCH_MAX };
	}
	if (urls.length > BATCH_MAX) {
		return {
			error: 'Review up to ' + BATCH_MAX + ' addresses at a time.',
			code: 'tooMany',
			max: BATCH_MAX,
			count: urls.length,
		};
	}
	return { urls, max: BATCH_MAX };
}

function creditProblem(runsLeft, count) {
	const need = Math.max(0, Number(count) || 0);
	const left = Math.max(0, Number(runsLeft) || 0);
	if (need < 2) return { error: 'Enter at least two https addresses.', code: 'needTwo' };
	if (left < need) {
		return {
			error:
				left <= 0
					? 'A pass with enough runs is needed for a bulk review. Add credits, then try again.'
					: 'This batch needs ' + need + ' runs; your pass has ' + left + ' left. Add credits, then try again.',
			code: 'needCredits',
			need,
			left,
		};
	}
	return null;
}

function rowOf(urlRow, index) {
	return {
		index,
		url: urlRow.url,
		host: urlRow.host,
		key: urlRow.key,
		lead: index === 0 || urlRow.lead === true,
		state: 'waiting',
		reviewId: '',
		note: '',
		overall: null,
	};
}

function savedRecord(email, parsed, meta, now) {
	const info = meta || {};
	return {
		email: address(email),
		status: 'running',
		urls: parsed.urls.map((row) => row.url),
		hosts: parsed.urls.map((row) => row.host),
		rows: parsed.urls.map(rowOf),
		frameworks: Array.isArray(info.frameworks) ? info.frameworks.slice(0, 40) : [],
		tools: Array.isArray(info.tools) ? info.tools.slice(0, 40) : [],
		pages: Number(info.pages) || 0,
		depth: Number(info.depth) || 0,
		lang: String(info.lang || 'en').slice(0, 8),
		name: String(info.name || '').slice(0, 80),
		leadFromReport: info.leadFromReport === true,
		leadReportId: String(info.leadReportId || '')
			.replace(/[^A-Za-z0-9]/g, '')
			.slice(0, 40),
		mailedAt: '',
		createdAt: new Date(now || Date.now()).toISOString(),
		updatedAt: new Date(now || Date.now()).toISOString(),
	};
}

function listLine(id, doc) {
	return {
		id: docId(id),
		at: String(doc.createdAt || ''),
		status: doc.status || '',
		hosts: (doc.hosts || []).map(String),
		done: (doc.rows || []).filter((row) => row.state === 'done').length,
		total: (doc.rows || []).length || (doc.urls || []).length,
	};
}

function listOf(docs, email) {
	return (docs || [])
		.filter((doc) => ownedBy(doc, email))
		.map((doc) => listLine(doc.id, doc))
		.sort((a, b) => b.at.localeCompare(a.at))
		.slice(0, LISTED_MAX);
}

function publicRow(row) {
	return {
		index: row.index,
		url: row.url,
		host: row.host,
		lead: !!row.lead,
		state: STATES.indexOf(row.state) === -1 ? 'waiting' : row.state,
		reviewId: String(row.reviewId || ''),
		note: String(row.note || '').slice(0, 240),
		overall: typeof row.overall === 'number' && isFinite(row.overall) ? row.overall : null,
	};
}

function payloadOf(id, doc) {
	const rows = (doc.rows || []).map(publicRow);
	const doneIds = rows.filter((row) => row.state === 'done' && row.reviewId).map((row) => row.reviewId);
	return {
		id: docId(id),
		status: doc.status || '',
		at: doc.createdAt || '',
		updatedAt: doc.updatedAt || '',
		hosts: (doc.hosts || []).map(String),
		rows,
		frameworks: doc.frameworks || [],
		tools: doc.tools || [],
		pages: doc.pages || 0,
		depth: doc.depth || 0,
		leadFromReport: doc.leadFromReport === true,
		canCompare: doneIds.length >= 2,
		doneIds,
	};
}

function applyRow(doc, index, patch, now) {
	const rows = (doc.rows || []).map((row) => Object.assign({}, row));
	if (index < 0 || index >= rows.length) return { error: 'That row is not in this batch.', code: 'badRow' };
	const next = Object.assign({}, rows[index], patch || {});
	if (patch && patch.state && STATES.indexOf(patch.state) === -1) {
		return { error: 'Unknown row state.', code: 'badState' };
	}
	rows[index] = next;
	const waiting = rows.some((row) => row.state === 'waiting' || row.state === 'running');
	const status = waiting ? 'running' : 'done';
	return {
		rows,
		status,
		hosts: rows.map((row) => row.host),
		updatedAt: new Date(now || Date.now()).toISOString(),
	};
}

// Stop: current running → stopped; every waiting → skipped. Already done/failed stay.
function stopBatch(doc, now) {
	const rows = (doc.rows || []).map((row) => {
		if (row.state === 'running') return Object.assign({}, row, { state: 'stopped', note: row.note || 'Stopped.' });
		if (row.state === 'waiting') return Object.assign({}, row, { state: 'skipped', note: 'Not started.' });
		return Object.assign({}, row);
	});
	return {
		rows,
		status: 'stopped',
		hosts: rows.map((row) => row.host),
		updatedAt: new Date(now || Date.now()).toISOString(),
	};
}

function finished(doc) {
	const status = doc && doc.status;
	return status === 'done' || status === 'stopped';
}

// Stuck "running" rows (tab closed mid-run) go back to waiting so the client can retry them.
function resetStuck(doc, now) {
	const rows = (doc.rows || []).map((row) => {
		if (row.state !== 'running') return Object.assign({}, row);
		return Object.assign({}, row, {
			state: 'waiting',
			note: 'Retrying after an interrupted run.',
			tries: Number(row.tries) || 0,
		});
	});
	const waiting = rows.some((row) => row.state === 'waiting' || row.state === 'running');
	return {
		rows,
		status: waiting ? 'running' : doc.status || 'done',
		hosts: rows.map((row) => row.host),
		updatedAt: new Date(now || Date.now()).toISOString(),
	};
}

module.exports = {
	BATCH_MAX,
	LISTED_MAX,
	COLLECTION,
	STATES,
	ROW_RETRIES,
	docId,
	address,
	hostKey,
	lineUrl,
	normalizeLine,
	parseList,
	creditProblem,
	savedRecord,
	listOf,
	payloadOf,
	applyRow,
	stopBatch,
	resetStuck,
	finished,
	publicRow,
};
