/*
 * Jarvis's Change ledger panel (#3794): the snapshot's `ledger` section (functions/jarvis-ledger.js, written daily by
 * jarvisChangeLedger, #3784), one row per shipped change with what its metric did since it merged. The server's order
 * is kept. The Android app's twin is android/.../ui/Ledger.kt.
 */
export const REPO_URL = 'https://github.com/kaanmuar/kaanmuar.github.io';

// The statuses in the order the summary lists them; "worse" first because it is the one that needs a look.
export const STATUS_ORDER = ['worse', 'better', 'flat', 'held', 'too early', 'too little data', 'manual'];
export const STATUS_LABELS = {
	worse: 'Worse',
	better: 'Better',
	flat: 'Flat',
	held: 'Held',
	'too early': 'Too early',
	'too little data': 'Too little data',
	manual: 'Manual',
};
// The chip class per status, from the existing chip palette.
const TONES = {
	worse: 'c-slow is-worse',
	better: 'c-fast',
	flat: '',
	held: 'c-fast',
	'too early': 'c-draft',
	'too little data': 'c-draft',
	manual: 'c-average',
};

const rowsOf = (ledger) => (ledger && Array.isArray(ledger.results) ? ledger.results : []);
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** The label of a status; an unknown one (unknown metric, bad mergedAt) shows as the server wrote it. */
export const statusLabel = (status) => STATUS_LABELS[status] || String(status || 'unknown');

/** 0 for worse up to the number of known statuses for an unknown one: the prominence of a status. */
export const statusRank = (status) => {
	const at = STATUS_ORDER.indexOf(status);
	return at < 0 ? STATUS_ORDER.length : at;
};

/** Counts by status, in summary order: "1 worse · 3 better". Empty when there are no rows. */
export function summary(ledger) {
	const counts = {};
	rowsOf(ledger).forEach((r) => {
		counts[r.status] = (counts[r.status] || 0) + 1;
	});
	return Object.keys(counts)
		.sort((a, b) => statusRank(a) - statusRank(b))
		.map((s) => counts[s] + ' ' + statusLabel(s).toLowerCase())
		.join(' · ');
}

/** "12.5" for a mean: up to two decimals, no trailing zeros. */
export function mean(v) {
	const n = num(v);
	return n === null ? '' : String(Math.round(n * 100) / 100);
}

/** "+12.5%" or "-3%". */
export function delta(v) {
	const n = num(v);
	if (n === null) return '';
	const r = Math.round(n * 10) / 10;
	return (r > 0 ? '+' : '') + r + '%';
}

/** "12 -> 15 (+25%)", or the side that exists, or ''. */
export function change(r) {
	const b = r && r.before ? mean(r.before.mean) : '';
	const a = r && r.after ? mean(r.after.mean) : '';
	if (!b && !a) return '';
	const d = delta(r.deltaPct);
	return (b || '?') + ' -> ' + (a || '?') + (d ? ' (' + d + ')' : '');
}

const safePr = (pr) => (Number.isInteger(pr) && pr > 0 ? pr : null);
const safeTicket = (t) => (Number.isInteger(t) && t > 0 ? t : null);

function rowHtml(r, esc) {
	const pr = safePr(r.pr);
	const ticket = safeTicket(r.ticket);
	const title = r.title || r.id || '';
	const name = pr ? `<a href="${REPO_URL}/pull/${pr}" target="_blank" rel="noopener">${esc(title)}</a>` : esc(title);
	const metric = r.metric ? r.metric + (r.expect ? ' (expect ' + r.expect + ')' : '') : '';
	const detail = [
		pr ? 'PR #' + pr : '',
		ticket ? 'ticket #' + ticket : '',
		r.mergedAt ? 'merged ' + r.mergedAt : '',
		metric,
	];
	const nums = change(r);
	const note = r.status === 'manual' ? r.check : r.reason || r.check;
	const status = String(r.status || '');
	return `<li class="jv-ledger-row${status === 'worse' ? ' is-worse' : ''}"><div class="jv-ledger-main"><b>${name}</b><small>${detail
		.filter(Boolean)
		.map(esc)
		.join(' · ')}</small>${nums ? `<span class="jv-ledger-nums">${esc(nums)}</span>` : ''}${
		note ? `<small class="jv-ledger-note">${esc(note)}</small>` : ''
	}</div><span class="jv-chip ${TONES[status] || ''}">${esc(statusLabel(status))}</span></li>`;
}

/** The panel body: the build time, the counts, then one row per result; an empty state before the first run. */
export function ledgerHtml(ledger, esc, when) {
	const rows = rowsOf(ledger);
	if (!ledger || !Array.isArray(ledger.results)) return '<p class="jv-empty">No ledger run yet</p>';
	const at = ledger.at && when ? when(ledger.at) : '';
	const sum = summary(ledger);
	const head =
		(at ? `<p class="jv-note">Built ${esc(at)}</p>` : '') +
		(sum ? `<p class="jv-ledger-sum${rows.some((r) => r.status === 'worse') ? ' is-worse' : ''}">${esc(sum)}</p>` : '');
	if (!rows.length) return head + '<p class="jv-empty">The ledger has no changes yet.</p>';
	return head + `<ul class="jv-ledger">${rows.map((r) => rowHtml(r, esc)).join('')}</ul>`;
}
