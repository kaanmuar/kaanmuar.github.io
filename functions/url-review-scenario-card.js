'use strict';
/* Deterministic outreach evidence card — title, evidence, ops consequence (#4281). No generative imagery. */

const clip = (text, max) => {
	const s = String(text || '')
		.replace(/\s+/g, ' ')
		.trim();
	return s.length <= max ? s : s.slice(0, max - 1) + '…';
};

const esc = (text) =>
	String(text == null ? '' : text).replace(
		/[&<>'"]/g,
		(ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[ch]
	);

const wrap = (text, width) => {
	const words = String(text || '').split(/\s+/).filter(Boolean);
	const lines = [];
	let line = '';
	words.forEach((w) => {
		const next = line ? line + ' ' + w : w;
		if (next.length > width) {
			if (line) lines.push(line);
			line = w.length > width ? w.slice(0, width) : w;
		} else line = next;
	});
	if (line) lines.push(line);
	return lines;
};

const linesToTspan = (lines, x, y0, dy) =>
	lines
		.map((ln, i) => `<tspan x="${x}" y="${y0}" dy="${i ? dy : 0}">${esc(ln)}</tspan>`)
		.join('');

/** SVG evidence card as a data URL suitable for Instantly or static hosting. */
function scenarioCardDataUrl({ host, title, evidence, consequence, cta }) {
	const domain = clip(host, 48);
	const hTitle = clip(title, 120);
	const hEvidence = clip(evidence, 220);
	const hConsequence = clip(consequence, 240);
	const hCta = clip(cta, 80);
	const titleLines = wrap(hTitle, 42).slice(0, 2);
	const evidenceLines = wrap(hEvidence, 52).slice(0, 3);
	const consLines = wrap(hConsequence, 52).slice(0, 3);
	const svg =
		`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400" role="img" aria-label="Review evidence for ${esc(domain)}">` +
		'<rect width="600" height="400" fill="#071116"/>' +
		'<rect x="0" y="0" width="600" height="72" fill="#0d2a31"/>' +
		`<text x="32" y="44" fill="#7ef6fb" font-family="Inter,system-ui,sans-serif" font-size="14" font-weight="600" letter-spacing="0.12em">QA-LAB · EVIDENCE</text>` +
		`<text x="568" y="44" text-anchor="end" fill="#9fb3b8" font-family="Fira Code,monospace" font-size="13">${esc(domain)}</text>` +
		`<text fill="#f4fafb" font-family="Source Serif 4,Georgia,serif" font-size="22" font-weight="600">${linesToTspan(titleLines, 32, 108, 26)}</text>` +
		'<text x="32" y="178" fill="#e2c48a" font-family="Inter,system-ui,sans-serif" font-size="11" font-weight="600" letter-spacing="0.14em">WHAT WE SAW</text>' +
		`<text fill="#cfe0e3" font-family="Inter,system-ui,sans-serif" font-size="14">${linesToTspan(evidenceLines, 32, 198, 18)}</text>` +
		'<text x="32" y="272" fill="#e2c48a" font-family="Inter,system-ui,sans-serif" font-size="11" font-weight="600" letter-spacing="0.14em">OPERATIONAL IMPACT</text>' +
		`<text fill="#cfe0e3" font-family="Inter,system-ui,sans-serif" font-size="14">${linesToTspan(consLines, 32, 292, 18)}</text>` +
		'<rect x="32" y="340" width="536" height="44" rx="8" fill="#0c5f67"/>' +
		`<text x="48" y="368" fill="#f4fafb" font-family="Inter,system-ui,sans-serif" font-size="14" font-weight="600">${esc(hCta)}</text>` +
		'</svg>';
	return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

/** Same card as an HTML fragment (debug / future static host). */
function scenarioCardHtml(opts) {
	const dataUrl = scenarioCardDataUrl(opts);
	return (
		'<!DOCTYPE html><html><head><meta charset="utf-8"><title>Evidence · ' +
		esc(clip(opts.host, 80)) +
		'</title></head><body style="margin:0;background:#111"><img src="' +
		dataUrl +
		'" width="600" height="400" alt=""></body></html>'
	);
}

module.exports = { scenarioCardDataUrl, scenarioCardHtml, clip };