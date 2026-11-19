/* Bulk URL reviews on the review page (#3737): mode accordion, paste/file, lead highlight, batch panel. */
(function () {
	'use strict';

	const BATCH_MAX = 6;
	const HOST_RE = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;
	const BATCH_KEY = 'qa-review-batch';

	function bc() {
		return window.QAReviewBatchCopy || { t: (k) => k, paint: () => {}, max: BATCH_MAX };
	}

	function esc(value) {
		return String(value == null ? '' : value)
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;');
	}

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
		const parsed = new URL(withScheme);
		if (parsed.protocol !== 'https:') throw new Error('https');
		if (parsed.username || parsed.password) throw new Error('auth');
		if (parsed.port && parsed.port !== '443') throw new Error('port');
		const host = parsed.hostname.replace(/\.$/, '').toLowerCase();
		if (!host || host === 'localhost' || /\.localhost$|\.local$|\.internal$/.test(host)) throw new Error('private');
		if (!HOST_RE.test(host) && !/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) throw new Error('host');
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
			return { error: 'invalid', raw: text };
		}
	}

	function parseList(text, options) {
		const opts = options || {};
		const lines = String(text == null ? '' : text).split(/\r\n|\n|\r/);
		const fromFile = [];
		const problems = [];
		lines.forEach((line, index) => {
			const row = normalizeLine(line);
			if (row.empty) return;
			if (row.error) {
				problems.push({ line: index + 1, code: row.error, raw: row.raw, host: row.host || '' });
				return;
			}
			fromFile.push(row);
		});
		const leadRaw = opts.leadUrl ? normalizeLine(opts.leadUrl) : null;
		if (opts.leadUrl && leadRaw && leadRaw.error) {
			problems.push({ line: 0, code: leadRaw.error, raw: leadRaw.raw, lead: true });
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
		if (problems.length) return { error: true, code: 'listInvalid', problems, max: BATCH_MAX };
		if (urls.length < 2) return { error: true, code: 'needTwo', max: BATCH_MAX };
		if (urls.length > BATCH_MAX) return { error: true, code: 'tooMany', max: BATCH_MAX, count: urls.length };
		return { urls, max: BATCH_MAX };
	}

	function problemText(row) {
		if (row.code === 'space') return bc().t('space', { n: row.line, url: row.raw });
		if (row.code === 'duplicate') return bc().t('duplicate', { n: row.line, host: row.host || row.raw });
		if (row.code === 'invalid') return bc().t('invalid', { n: row.line || '', url: row.raw });
		return bc().t('fixList');
	}

	function mode() {
		const many = document.getElementById('url-mode-many');
		return many && !many.hidden ? 'many' : 'one';
	}

	function setMode(next) {
		const one = document.getElementById('url-mode-one');
		const many = document.getElementById('url-mode-many');
		const url = document.getElementById('url');
		if (!one || !many) return;
		const bulk = next === 'many';
		one.hidden = bulk;
		many.hidden = !bulk;
		document.querySelectorAll('[data-url-mode]').forEach((btn) => {
			const on = btn.getAttribute('data-url-mode') === (bulk ? 'many' : 'one');
			btn.setAttribute('aria-pressed', on ? 'true' : 'false');
			btn.classList.toggle('is-on', on);
		});
		if (url) {
			if (bulk) url.removeAttribute('required');
			else url.setAttribute('required', '');
		}
		refreshPreview();
	}

	function leadUrl() {
		const box = document.getElementById('batch-lead-report');
		if (!box || !box.checked) return '';
		const report = window.QAReviewBatch && window.QAReviewBatch.currentReport && window.QAReviewBatch.currentReport();
		if (!report || !report.host) return '';
		return report.finalUrl || 'https://' + report.host + '/';
	}

	function refreshPreview() {
		const error = document.getElementById('batch-error');
		const list = document.getElementById('batch-preview');
		const leadNote = document.getElementById('batch-lead-note');
		const leadBox = document.getElementById('batch-lead-report');
		if (!error || !list) return;
		const report = window.QAReviewBatch && window.QAReviewBatch.currentReport && window.QAReviewBatch.currentReport();
		if (leadBox) {
			leadBox.disabled = !report || !report.host;
			if (leadNote) leadNote.textContent = leadBox.disabled ? bc().t('leadReportOff') : '';
		}
		if (mode() !== 'many') {
			error.textContent = '';
			list.innerHTML = '';
			return;
		}
		const text = (document.getElementById('batch-text') || {}).value || '';
		const parsed = parseList(text, { leadUrl: leadUrl() });
		if (parsed.error) {
			error.textContent =
				(parsed.problems || []).map(problemText).join(' ') || bc().t(parsed.code || 'fixList', { max: BATCH_MAX });
			list.innerHTML = '';
			return;
		}
		error.textContent = '';
		list.innerHTML = parsed.urls
			.map(
				(row) =>
					'<li class="' +
					(row.lead ? 'is-lead' : '') +
					'"><span class="batch-host" translate="no">' +
					esc(row.host) +
					'</span>' +
					(row.lead ? '<span class="batch-lead-tag">' + esc(bc().t('leadBadge')) + '</span>' : '') +
					'<span class="batch-url" translate="no">' +
					esc(row.url) +
					'</span></li>'
			)
			.join('');
	}

	function paintPanel(batch) {
		const panel = document.getElementById('batch-panel');
		if (!panel || !batch) return;
		panel.hidden = false;
		const rows = batch.rows || [];
		const ready = rows.filter((row) => row.state === 'done').length;
		const failed = rows.filter((row) => row.state === 'failed' || row.state === 'stopped').length;
		const title = document.getElementById('batch-panel-title');
		if (title) title.textContent = bc().t('panelTitle');
		const status = document.getElementById('batch-panel-status');
		if (status) {
			if (batch.status === 'running') {
				const current = rows.find((row) => row.state === 'running') || rows.find((row) => row.state === 'waiting');
				const n = rows.filter(
					(row) => row.state === 'done' || row.state === 'failed' || row.state === 'stopped' || row.state === 'running'
				).length;
				status.textContent = bc().t('running', {
					n: Math.max(1, n),
					total: rows.length,
					host: (current && current.host) || '',
				});
			} else if (batch.status === 'stopped') status.textContent = bc().t('stopped', { ready }) + ' ' + bc().t('mailed');
			else if (failed) status.textContent = bc().t('done', { ready, failed }) + ' ' + bc().t('mailed');
			else status.textContent = bc().t('doneAll', { n: ready }) + ' ' + bc().t('mailed');
		}
		const ol = document.getElementById('batch-panel-rows');
		if (ol) {
			ol.innerHTML = rows
				.map((row) => {
					const link = row.reviewId
						? '<a class="batch-open" href="?report=' +
							encodeURIComponent(row.reviewId) +
							'">' +
							esc(bc().t('openReport')) +
							'</a>'
						: '';
					const score = typeof row.overall === 'number' ? '<span class="batch-score">' + row.overall + '</span>' : '';
					return (
						'<li data-state="' +
						esc(row.state) +
						'" class="' +
						(row.lead ? 'is-lead' : '') +
						'">' +
						'<span class="batch-host" translate="no">' +
						esc(row.host) +
						'</span>' +
						(row.lead ? '<span class="batch-lead-tag">' + esc(bc().t('leadBadge')) + '</span>' : '') +
						'<span class="batch-state">' +
						esc(bc().t('rowState.' + row.state) || row.state) +
						'</span>' +
						score +
						link +
						'</li>'
					);
				})
				.join('');
		}
		const compareBtn = document.getElementById('batch-save-compare');
		if (compareBtn) {
			compareBtn.hidden = !(batch.canCompare || (batch.doneIds && batch.doneIds.length >= 2));
			compareBtn.disabled = compareBtn.hidden;
		}
		const stopBtn = document.getElementById('batch-stop');
		if (stopBtn) stopBtn.hidden = batch.status !== 'running';
	}

	// Shown the moment Start is pressed, before the server has saved the batch (#3932): one row per address, all waiting.
	function paintStarting(urls) {
		const rows = (urls || []).map((row, index) => ({
			index,
			url: row.url,
			host: row.host,
			lead: !!row.lead,
			state: 'waiting',
		}));
		paintPanel({ status: 'running', rows });
		const status = document.getElementById('batch-panel-status');
		if (status) status.textContent = bc().t('starting');
		const stopBtn = document.getElementById('batch-stop');
		if (stopBtn) stopBtn.hidden = true;
	}

	function remember(batch) {
		try {
			if (batch && batch.id) sessionStorage.setItem(BATCH_KEY, JSON.stringify({ id: batch.id }));
			else sessionStorage.removeItem(BATCH_KEY);
		} catch (error) {
			/* ignore */
		}
	}

	function rememberedId() {
		try {
			const raw = sessionStorage.getItem(BATCH_KEY);
			const parsed = raw ? JSON.parse(raw) : null;
			return parsed && parsed.id ? String(parsed.id) : '';
		} catch (error) {
			return '';
		}
	}

	function wire() {
		if (!document.getElementById('url-mode')) return;
		bc().paint();
		document.querySelectorAll('[data-url-mode]').forEach((btn) => {
			btn.addEventListener('click', () => setMode(btn.getAttribute('data-url-mode')));
		});
		const text = document.getElementById('batch-text');
		if (text) text.addEventListener('input', refreshPreview);
		const lead = document.getElementById('batch-lead-report');
		if (lead) lead.addEventListener('change', refreshPreview);
		const file = document.getElementById('batch-file');
		if (file) {
			file.addEventListener('change', () => {
				const picked = file.files && file.files[0];
				if (!picked) return;
				const reader = new FileReader();
				reader.onload = () => {
					if (text) text.value = String(reader.result || '');
					refreshPreview();
				};
				reader.readAsText(picked);
			});
		}
		setMode('one');
	}

	if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
	else wire();

	window.QAReviewBatch = {
		BATCH_MAX,
		BATCH_KEY,
		mode,
		setMode,
		parseList,
		problemText,
		refreshPreview,
		paintPanel,
		paintStarting,
		remember,
		rememberedId,
		leadUrl,
		listText: () => (document.getElementById('batch-text') || {}).value || '',
		leadFromReport: () => !!(document.getElementById('batch-lead-report') || {}).checked,
		currentReport: null,
	};
})();
