'use strict';

/**
 * Surgical fix packs as reviewable Git diffs or CMS drafts (#4364).
 * Pure helpers: no Firestore, no GitHub, no CMS API — never auto-publish.
 */

const CONTEXT = 3;

function linesOf(text) {
	const raw = String(text ?? '');
	if (!raw) return [];
	return raw.split('\n');
}

function relPath(path) {
	const p = String(path || 'file')
		.trim()
		.replace(/\\/g, '/');
	return p.replace(/^\/+/, '') || 'file';
}

function hunkContext(lines, diffStart, diffEnd) {
	const from = Math.max(0, diffStart - CONTEXT);
	const to = Math.min(lines.length, diffEnd + CONTEXT);
	return { from, to, start: from + 1, count: to - from };
}

/** One-file unified diff for a surgical fix; finding id is on the hunk header for desk traceability. */
function buildFixPatch({ findingId, path, before, after }) {
	const file = relPath(path);
	const oldLines = linesOf(before);
	const newLines = linesOf(after);
	const fid = String(findingId || '')
		.trim()
		.replace(/[^\w.-]/g, '')
		.slice(0, 40);

	let i = 0;
	while (i < oldLines.length && i < newLines.length && oldLines[i] === newLines[i]) i++;
	let oEnd = oldLines.length - 1;
	let nEnd = newLines.length - 1;
	while (oEnd >= i && nEnd >= i && oldLines[oEnd] === newLines[nEnd]) {
		oEnd--;
		nEnd--;
	}

	const header = `--- a/${file}\n+++ b/${file}\n`;
	if (i > oEnd && i > nEnd) return header;

	const oldCtx = hunkContext(oldLines, i, oEnd + 1);
	const newCtx = hunkContext(newLines, i, nEnd + 1);
	const oldHunk = oldLines.slice(oldCtx.from, oldCtx.to);
	const newHunk = newLines.slice(newCtx.from, newCtx.to);
	const tag = fid ? ` finding ${fid}` : '';
	const body =
		`@@ -${oldCtx.start},${oldHunk.length} +${newCtx.start},${newHunk.length} @@${tag}\n` +
		oldHunk.map((line) => `-${line}\n`).join('') +
		newHunk.map((line) => `+${line}\n`).join('');

	return header + body;
}

/** CMS-shaped draft payload; status is always draft regardless of input — no live publish. */
function buildCmsDraftPayload({ title, bodyHtml, status }) {
	void status;
	return {
		title: String(title || '').trim(),
		bodyHtml: String(bodyHtml ?? ''),
		status: 'draft',
	};
}

module.exports = { buildFixPatch, buildCmsDraftPayload };