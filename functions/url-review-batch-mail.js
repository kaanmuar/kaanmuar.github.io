/**
 * Mail when a bulk URL review batch finishes (#3737): owner desk notice and asker summary.
 */
const reviewBatch = require('./url-review-batch');
const reviewCompare = require('./url-review-compare');

const PAGE = 'https://carlosandmunoz.com/qa-review.html';

function clip(value, max) {
	const text = String(value == null ? '' : value)
		.replace(/\s+/g, ' ')
		.trim();
	if (!text) return '';
	return text.length > max ? text.slice(0, max - 1) + '…' : text;
}

function row(label, value) {
	const text = clip(value, 500);
	return text ? { label, value: text } : null;
}

function keep(rows) {
	return rows.filter(Boolean);
}

function batchUrl(id) {
	const clean = reviewBatch.docId(id);
	return clean ? PAGE + '?batch=' + clean : '';
}

function reportUrl(id) {
	const clean = reviewCompare.cleanId(id);
	return clean ? PAGE + '?report=' + clean : '';
}

function stateLabel(state) {
	if (state === 'done') return 'Ready';
	if (state === 'failed') return 'Did not finish';
	if (state === 'stopped') return 'Stopped';
	if (state === 'skipped') return 'Not started';
	if (state === 'running') return 'Running';
	return 'Waiting';
}

function hostsLine(hosts) {
	const list = (hosts || []).map((host) => clip(host, 80)).filter(Boolean);
	if (!list.length) return 'those sites';
	if (list.length === 1) return list[0];
	if (list.length === 2) return list[0] + ' and ' + list[1];
	return list.slice(0, 3).join(', ') + (list.length > 3 ? ' and ' + (list.length - 3) + ' more' : '');
}

// Owner desk notice (same shape as comparison notices).
function ownerNotice(id, doc, meta) {
	if (!doc || !reviewBatch.finished(doc)) return null;
	const rows = doc.rows || [];
	const hosts = doc.hosts || rows.map((item) => item.host);
	const done = rows.filter((item) => item.state === 'done');
	const failed = rows.filter((item) => item.state === 'failed' || item.state === 'stopped');
	const skipped = rows.filter((item) => item.state === 'skipped');
	const who = clip((meta && meta.name) || '', 80);
	const email = clip((meta && meta.email) || doc.email, 120);
	const intro =
		(who && email ? who + ' (' + email + ')' : who || email || 'Someone') +
		(doc.status === 'stopped' ? ' stopped a bulk review of ' : ' finished a bulk review of ') +
		hostsLine(hosts) +
		'.';
	const out = [
		row('Account', email),
		row('Name', who),
		row('Batch', batchUrl(id)),
		row('Status', doc.status),
		row('Ready', String(done.length) + ' of ' + rows.length),
	];
	rows.forEach((item) => {
		const score = typeof item.overall === 'number' ? ', score ' + item.overall : '';
		out.push(
			row(
				(item.lead ? 'Lead · ' : '') + (item.host || item.url),
				stateLabel(item.state) +
					score +
					(item.reviewId ? ' · ' + reportUrl(item.reviewId) : '') +
					(item.note ? ' · ' + clip(item.note, 120) : '')
			)
		);
	});
	if (failed.length) out.push(row('Did not finish', failed.map((item) => item.host).join(', ')));
	if (skipped.length) out.push(row('Not started', skipped.map((item) => item.host).join(', ')));
	return {
		subject: 'Bulk review ' + (doc.status === 'stopped' ? 'stopped' : 'done') + ': ' + hostsLine(hosts),
		intro,
		rows: keep(out),
		respondUrl: batchUrl(id),
		buttonLabel: 'Open the batch',
	};
}

// Asker email: short status list + link back to the batch on the review page.
function askerMail(id, doc, meta) {
	if (!doc || !reviewBatch.finished(doc)) return null;
	const rows = doc.rows || [];
	const hosts = doc.hosts || rows.map((item) => item.host);
	const link = batchUrl(id);
	const stopped = doc.status === 'stopped';
	const subject = stopped
		? 'Your bulk review stopped: ' + hostsLine(hosts)
		: 'Your bulk review is ready: ' + hostsLine(hosts);
	const lines = rows.map((item) => {
		const score = typeof item.overall === 'number' ? ' · ' + item.overall + '/100' : '';
		const open = item.reviewId ? ' · ' + reportUrl(item.reviewId) : '';
		return '- ' + (item.lead ? 'Lead: ' : '') + (item.host || item.url) + ' · ' + stateLabel(item.state) + score + open;
	});
	const intro = stopped
		? 'The bulk review stopped. Reports already finished stay on your account; the ones still waiting were not started.'
		: 'The bulk review finished. Open each report from the batch on the review page, or save a comparison when two or more are ready.';
	const text = intro + '\n\n' + lines.join('\n') + '\n\nOpen the batch:\n' + link + '\n';
	const html =
		'<p>' +
		intro.replace(/</g, '') +
		'</p><ul>' +
		rows
			.map((item) => {
				const label = (item.lead ? 'Lead: ' : '') + (item.host || item.url);
				const score = typeof item.overall === 'number' ? ' · ' + item.overall + '/100' : '';
				const open = item.reviewId ? ' · <a href="' + reportUrl(item.reviewId) + '">Open report</a>' : '';
				return '<li>' + label.replace(/</g, '') + ' · ' + stateLabel(item.state) + score + open + '</li>';
			})
			.join('') +
		'</ul><p><a href="' +
		link +
		'">Open the batch</a></p>';
	return {
		to: addressOf(meta, doc),
		subject,
		text,
		html,
		lang: String((meta && meta.lang) || doc.lang || 'en').slice(0, 8),
	};
}

function addressOf(meta, doc) {
	return String((meta && meta.email) || (doc && doc.email) || '')
		.trim()
		.toLowerCase();
}

module.exports = { ownerNotice, askerMail, batchUrl };
