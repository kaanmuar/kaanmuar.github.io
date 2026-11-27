'use strict';

/**
 * Wire continuous-watch score deltas into report mail and PDF (#4390 / #4360).
 * Pure attach helpers plus prior lookup id — no send policy.
 */

const fusion = require('./url-review-fusion');
const customerMail = require('./url-review-customer-mail');
const { diffSnapshots, AREAS, formatDeltaText, signDelta } = require('./url-review-watch-delta');

const { TEXT } = fusion;
const { esc } = customerMail;

const TITLE = {
	en: 'Since last watch',
	es: 'Desde la última vigilancia',
	pt: 'Desde a última vigilância',
	de: 'Seit der letzten Überwachung',
	fr: 'Depuis la dernière surveillance',
	it: "Dall'ultimo monitoraggio",
};

function titleFor(lang) {
	const code = customerMail.langOf(lang);
	return TITLE[code] || TITLE.en;
}

function priorIdOf(record) {
	if (!record) return '';
	return String(record.watchOf || '').trim();
}

function snapOf(record) {
	if (!record) return null;
	return record.report && typeof record.report === 'object' ? record.report : record;
}

function leadColor(value) {
	return value == null || value === 0 ? TEXT.muted : value > 0 ? TEXT.pass : TEXT.fail;
}

function dash(value) {
	return value == null ? '–' : String(value);
}

function deltaRows(diff) {
	const rows = [];
	if (diff.before != null || diff.now != null) {
		rows.push({
			label: 'Overall',
			before: diff.before,
			now: diff.now,
			move: diff.overall,
		});
	}
	AREAS.forEach((name) => {
		const row = (diff.areas || {})[name];
		if (!row) return;
		rows.push({
			label: name,
			before: row.before,
			now: row.now,
			move: row.delta,
		});
	});
	return rows;
}

function deltaTableHtml(diff, title, variant) {
	const rows = deltaRows(diff);
	if (!rows.length) return '';
	const font = variant === 'pdf' ? '' : 'font-family:Arial,Helvetica,sans-serif;';
	const th = (text, align) =>
		'<th style="' +
		font +
		'padding:0 0 6px 10px;font-size:11px;letter-spacing:0.04em;text-align:' +
		(align || 'right') +
		';color:' +
		TEXT.muted +
		';font-weight:bold;">' +
		esc(text) +
		'</th>';
	const td = (text, color, bold) =>
		'<td style="' +
		font +
		'padding:6px 0 6px 10px;border-top:1px solid ' +
		fusion.LINE +
		';font-size:' +
		(variant === 'pdf' ? '13px' : '14px') +
		';text-align:right;color:' +
		color +
		';' +
		(bold ? 'font-weight:bold;' : '') +
		'">' +
		esc(text) +
		'</td>';
	const body = rows
		.map(
			(row) =>
				'<tr><td style="' +
				font +
				'padding:6px 0;border-top:1px solid ' +
				fusion.LINE +
				';font-size:13px;color:' +
				TEXT.body +
				';">' +
				esc(row.label) +
				'</td>' +
				td(dash(row.before), row.before == null ? TEXT.muted : TEXT.body, false) +
				td(dash(row.now), row.now == null ? TEXT.muted : TEXT.body, true) +
				td(signDelta(row.move) || '–', leadColor(row.move), true) +
				'</tr>'
		)
		.join('');
	if (variant === 'pdf') {
		return (
			'<h2>' +
			esc(title) +
			'</h2><table class="cmp"><thead><tr><th></th>' +
			th('Before') +
			th('Now') +
			th('Change') +
			'</tr></thead><tbody>' +
			body +
			'</tbody></table>'
		);
	}
	return (
		'<p style="margin:0 0 8px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:22px;color:' +
		TEXT.body +
		';font-weight:bold;">' +
		esc(title) +
		'</p><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;"><thead><tr><th></th>' +
		th('Before') +
		th('Now') +
		th('Change') +
		'</tr></thead><tbody>' +
		body +
		'</tbody></table>'
	);
}

/**
 * Build mail/PDF delta sections from two url_reviews-shaped rows.
 * @returns {{ text: string, mailHtml: string, pdfHtml: string }|null}
 */
function attachSections(priorRecord, currentRecord, lang) {
	if (!priorRecord || !currentRecord) return null;
	const delta = diffSnapshots(snapOf(priorRecord), snapOf(currentRecord));
	const title = titleFor(lang);
	const text = formatDeltaText(delta, { title });
	if (!text) return null;
	const mailHtml = deltaTableHtml(delta, title, 'mail');
	const pdfHtml = deltaTableHtml(delta, title, 'pdf');
	if (!mailHtml && !text) return null;
	return { text, mailHtml, pdfHtml };
}

/**
 * Options fragment for customerMail.reportMail / reportPdf when a prior snapshot exists.
 */
function mailPayloadAttach(priorRecord, currentRecord, lang) {
	const watchDelta = attachSections(priorRecord, currentRecord, lang);
	return watchDelta ? { watchDelta } : {};
}

module.exports = {
	priorIdOf,
	attachSections,
	mailPayloadAttach,
	titleFor,
	snapOf,
};